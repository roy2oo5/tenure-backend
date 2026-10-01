import { Prisma } from '@prisma/client';
import { WebSocket } from 'ws';
import { prisma } from '../config/database';
import { sendPushNotification, sendSilentDataNotification } from '../config/firebase';
import { AppError } from '../utils/app-error';
import { scheduleMessageExpiration } from './message-retention.service';
import { UploadService } from './upload.service';

export const activeUserConnections = new Map<string, WebSocket>();

export interface SendMessageInput {
  event: 'send_message';
  messageId: string;
  chatRoomId: string;
  recipientId: string;
  type: 'text' | 'image' | 'voice';
  text?: string;
  mediaUrl?: string;
  voiceDurationSec?: number;
  viewOnce?: boolean;
  createdAt: number;
}

export interface MessageAckInput {
  event: 'msg_acknowledged';
  messageId: string;
}

export interface DeleteMessageInput {
  event: 'delete_for_everyone';
  messageId: string;
  chatRoomId: string;
}

export interface OpenViewOnceInput {
  event: 'open_view_once';
  messageId: string;
  chatRoomId: string;
}

export interface RoutedMessage {
  id: string;
  sender: 'me' | 'them';
  type: 'text' | 'image' | 'voice';
  text?: string;
  imageUri?: string;
  voiceUri?: string;
  voiceDurationSec?: number;
  viewOnce?: boolean;
  expiresAt?: number;
  createdAt: number;
  isDeleted: boolean;
}

const sendJson = (socket: WebSocket, value: object): void => {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value));
};

const recipientKey = (userId: number, chatRoomId: string): string => `${userId}:${chatRoomId}`;

const recipientPayload = (message: RoutedMessage): Prisma.InputJsonObject => ({
  event: 'message',
  message: { ...message, sender: 'them' } as unknown as Prisma.InputJsonObject,
});

export class RealtimeMessageService {
  public static register(userId: number, chatRoomId: string, socket: WebSocket): void {
    activeUserConnections.set(recipientKey(userId, chatRoomId), socket);
  }

  public static unregister(userId: number, chatRoomId: string, socket: WebSocket): void {
    const key = recipientKey(userId, chatRoomId);
    if (activeUserConnections.get(key) === socket) activeUserConnections.delete(key);
  }

  public static async deliverPending(userId: number, chatRoomId: string, socket: WebSocket): Promise<void> {
    const pending = await prisma.undeliveredMessage.findMany({
      where: { recipientId: userId, chatRoomId },
      orderBy: { createdAt: 'asc' },
    });
    for (const queued of pending) sendJson(socket, queued.payload as object);
  }

  public static async handleSendMessage(
    senderId: number,
    requestId: number,
    socket: WebSocket,
    input: SendMessageInput,
  ): Promise<void> {
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(input.messageId)) {
      throw new AppError('Invalid message ID', 400);
    }
    if (input.chatRoomId !== String(requestId)) throw new AppError('Chat room mismatch', 403);
    const recipientId = Number(input.recipientId);
    if (!Number.isInteger(recipientId)) throw new AppError('Invalid recipient', 400);
    const text = input.text?.trim() ?? '';
    if (input.type === 'text' && !text) throw new AppError('Message text is required', 400);
    if (input.viewOnce && input.type !== 'image') throw new AppError('Only images can be view-once media', 400);
    if (input.viewOnce && !input.mediaUrl) throw new AppError('View-once image is required', 400);
    const expiresAt = input.viewOnce ? new Date(Date.now() + 60 * 60 * 1000) : undefined;

    const message = await prisma.message.upsert({
      where: { clientMessageId: input.messageId },
      create: {
        clientMessageId: input.messageId,
        requestId,
        senderId,
        receiverId: recipientId,
        content: text || (input.type === 'voice' ? 'Voice note' : 'Image attachment'),
        type: input.type,
        mediaUrl: input.mediaUrl ?? null,
        voiceDuration: input.voiceDurationSec ?? null,
        viewOnce: input.viewOnce === true,
        ...(expiresAt ? { expiresAt } : {}),
      },
      update: {},
    });
    if (message.senderId !== senderId || message.receiverId !== recipientId || message.requestId !== requestId) {
      throw new AppError('Message ID is already in use', 409);
    }
    scheduleMessageExpiration(message.expiresAt);

    const routed: RoutedMessage = {
      id: message.clientMessageId,
      sender: 'them',
      type: message.type as RoutedMessage['type'],
      text: message.type === 'text' ? message.content : undefined,
      imageUri: message.type === 'image' ? (message.mediaUrl ?? message.content) : undefined,
      voiceUri: message.type === 'voice' ? (message.mediaUrl ?? message.content) : undefined,
      voiceDurationSec: message.voiceDuration ?? undefined,
      viewOnce: message.viewOnce,
      expiresAt: message.expiresAt.getTime(),
      createdAt: message.createdAt.getTime(),
      isDeleted: message.isDeleted,
    };
    const payload = recipientPayload(routed);
    await prisma.undeliveredMessage.upsert({
      where: { messageId: message.clientMessageId },
      create: {
        messageId: message.clientMessageId,
        chatRoomId: input.chatRoomId,
        senderId,
        recipientId,
        payload,
      },
      update: { payload },
    });

    const recipientSocket = activeUserConnections.get(recipientKey(recipientId, input.chatRoomId));
    if (recipientSocket?.readyState === WebSocket.OPEN) {
      sendJson(recipientSocket, payload as object);
    } else {
      const recipient = await prisma.user.findUnique({
        where: { id: recipientId },
        select: { fcmToken: true },
      });
      if (recipient?.fcmToken) {
        await sendPushNotification(recipient.fcmToken, 'New message', routed.text ?? 'New attachment', {
          kind: 'chat_message',
          requestId: input.chatRoomId,
          messageId: input.messageId,
        });
      }
    }
    sendJson(socket, { event: 'sent_confirm', message: { ...routed, sender: 'me' } });
  }

  public static async handleMessageAck(recipientId: number, input: MessageAckInput): Promise<void> {
    const queued = await prisma.undeliveredMessage.findUnique({ where: { messageId: input.messageId } });
    if (!queued || queued.recipientId !== recipientId) return;
    const message = await prisma.message.findUnique({ where: { clientMessageId: input.messageId } });
    if (message?.type === 'voice' && message.mediaUrl) {
      await UploadService.deleteUploadedFile(message.mediaUrl);
      await prisma.message.update({
        where: { clientMessageId: input.messageId },
        data: { mediaUrl: null },
      });
    }
    await prisma.undeliveredMessage.delete({ where: { messageId: input.messageId } });
    const senderSocket = activeUserConnections.get(recipientKey(queued.senderId, queued.chatRoomId));
    if (senderSocket) sendJson(senderSocket, { event: 'delivered_confirm', messageId: input.messageId });
  }

  public static async handleOpenViewOnce(recipientId: number, input: OpenViewOnceInput): Promise<void> {
    const message = await prisma.message.findUnique({ where: { clientMessageId: input.messageId } });
    if (!message || String(message.requestId) !== input.chatRoomId) throw new AppError('Photo not found', 404);
    if (!message.viewOnce || message.type !== 'image') throw new AppError('This is not a view-once photo', 400);
    if (message.receiverId !== recipientId) throw new AppError('Only the recipient can open this photo', 403);
    if (message.openedAt || message.isDeleted || message.expiresAt <= new Date()) throw new AppError('This view-once photo has expired', 410);
    const consumed = await prisma.message.updateMany({
      where: { id: message.id, openedAt: null, isDeleted: false, expiresAt: { gt: new Date() } },
      data: { openedAt: new Date(), content: 'View-once photo opened', mediaUrl: null, isDeleted: true, deletedAt: new Date() },
    });
    if (consumed.count !== 1) throw new AppError('This view-once photo has expired', 410);
    if (message.mediaUrl) await UploadService.deleteUploadedFile(message.mediaUrl);
    const control = { event: 'message_control_event', control: { event: 'view_once_opened', messageId: message.clientMessageId } };
    const senderSocket = activeUserConnections.get(recipientKey(message.senderId, input.chatRoomId));
    if (senderSocket) sendJson(senderSocket, control);
  }

  public static async handleDeleteForEveryone(
    requesterId: number,
    input: DeleteMessageInput,
  ): Promise<void> {
    const message = await prisma.message.findUnique({ where: { clientMessageId: input.messageId } });
    if (!message || String(message.requestId) !== input.chatRoomId) throw new AppError('Message not found', 404);
    if (message.senderId !== requesterId) throw new AppError('Only the original sender can delete this message', 403);
    if (Date.now() - message.createdAt.getTime() > 48 * 60 * 60 * 1000) {
      throw new AppError('Messages can only be deleted within 48 hours', 400);
    }

    await prisma.message.update({
      where: { id: message.id },
      data: { content: 'This message was deleted', mediaUrl: null, isDeleted: true, deletedAt: new Date() },
    });
    const control = {
      event: 'message_control_event',
      control: { event: 'delete_message', messageId: message.clientMessageId },
    };
    await prisma.undeliveredMessage.upsert({
      where: { messageId: message.clientMessageId },
      create: {
        messageId: message.clientMessageId,
        chatRoomId: input.chatRoomId,
        senderId: requesterId,
        recipientId: message.receiverId,
        payload: control,
      },
      update: { payload: control },
    });

    const recipientSocket = activeUserConnections.get(recipientKey(message.receiverId, input.chatRoomId));
    if (recipientSocket?.readyState === WebSocket.OPEN) {
      sendJson(recipientSocket, control);
    } else {
      const recipient = await prisma.user.findUnique({
        where: { id: message.receiverId },
        select: { fcmToken: true },
      });
      if (recipient?.fcmToken) {
        await sendSilentDataNotification(
          recipient.fcmToken,
          { kind: 'message_control_event', event: 'delete_message', messageId: message.clientMessageId },
          `delete-${message.clientMessageId}`,
        );
      }
    }
  }
}
