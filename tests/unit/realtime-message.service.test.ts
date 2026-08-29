import { WebSocket } from 'ws';
import { prisma } from '@/config/database';
import {
  activeUserConnections,
  RealtimeMessageService,
} from '@/services/realtime-message.service';

vi.mock('@/config/database', () => ({
  prisma: {
    message: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    undeliveredMessage: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock('@/config/firebase', () => ({
  sendPushNotification: vi.fn(),
  sendSilentDataNotification: vi.fn(),
}));

vi.mock('@/services/message-retention.service', () => ({
  scheduleMessageExpiration: vi.fn(),
}));

const socket = (): WebSocket => ({
  readyState: WebSocket.OPEN,
  send: vi.fn(),
}) as unknown as WebSocket;

describe('RealtimeMessageService', () => {
  afterEach(() => {
    activeUserConnections.clear();
    vi.clearAllMocks();
  });

  it('mirrors, queues, routes and confirms an online message', async () => {
    const sender = socket();
    const recipient = socket();
    const createdAt = new Date();
    (prisma.message.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1,
      clientMessageId: '11111111-1111-4111-8111-111111111111',
      requestId: 7,
      senderId: 10,
      receiverId: 20,
      content: 'hello',
      type: 'text',
      mediaUrl: null,
      voiceDuration: null,
      createdAt,
      expiresAt: new Date(Date.now() + 1000),
      isDeleted: false,
    });
    (prisma.undeliveredMessage.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});
    RealtimeMessageService.register(20, '7', recipient);

    await RealtimeMessageService.handleSendMessage(10, 7, sender, {
      event: 'send_message',
      messageId: '11111111-1111-4111-8111-111111111111',
      chatRoomId: '7',
      recipientId: '20',
      type: 'text',
      text: 'hello',
      createdAt: createdAt.getTime(),
    });

    expect(prisma.undeliveredMessage.upsert).toHaveBeenCalled();
    expect(recipient.send).toHaveBeenCalledWith(expect.stringContaining('"event":"message"'));
    expect(sender.send).toHaveBeenCalledWith(expect.stringContaining('"event":"sent_confirm"'));
  });

  it('purges the queue only when the intended recipient acknowledges it', async () => {
    (prisma.undeliveredMessage.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      messageId: 'message-1',
      recipientId: 20,
      senderId: 10,
      chatRoomId: '7',
    });
    (prisma.undeliveredMessage.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await RealtimeMessageService.handleMessageAck(20, {
      event: 'msg_acknowledged',
      messageId: 'message-1',
    });

    expect(prisma.undeliveredMessage.delete).toHaveBeenCalledWith({
      where: { messageId: 'message-1' },
    });
  });

  it('rejects delete-for-everyone after 48 hours', async () => {
    (prisma.message.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1,
      clientMessageId: 'message-1',
      requestId: 7,
      senderId: 10,
      receiverId: 20,
      createdAt: new Date(Date.now() - 49 * 60 * 60 * 1000),
    });

    await expect(RealtimeMessageService.handleDeleteForEveryone(10, {
      event: 'delete_for_everyone',
      messageId: 'message-1',
      chatRoomId: '7',
    })).rejects.toThrow('Messages can only be deleted within 48 hours');
  });
});
