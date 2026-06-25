import { prisma } from '../config/database';
import { AppError } from '../utils/app-error';
import { RequestStatus } from '@prisma/client';
import { NotificationService } from './notification.service';

export type CreateRequestInput = {
  receiverId: string;
  categoryId: string;
  categoryLabel: string;
  meetLocation: string;
  fromDateTime: Date;
  toDateTime: Date;
  message?: string | null;
};

export type FrontendRequestStatus = 'pending' | 'confirmed' | 'declined' | 'cancelled' | 'expired';

export type MappedRequest = {
  id: string;
  direction: 'sent' | 'received';
  mateUserId: string;
  mateName: string;
  mateTenureId: string;
  mateAvatar: string;
  categoryId: string;
  categoryLabel: string;
  meetLocation: string;
  fromDateTime: string;
  toDateTime: string;
  message: string;
  status: FrontendRequestStatus;
  sentAt: string;
  otp?: string | null;
};

const mapStatusToFrontend = (status: RequestStatus): FrontendRequestStatus => {
  switch (status) {
    case RequestStatus.PENDING:
      return 'pending';
    case RequestStatus.CONFIRMED:
      return 'confirmed';
    case RequestStatus.DECLINED:
      return 'declined';
    case RequestStatus.CANCELLED:
      return 'cancelled';
    case RequestStatus.EXPIRED:
      return 'expired';
  }
};

const mapStatusToBackend = (status: 'confirmed' | 'declined' | 'cancelled'): RequestStatus => {
  switch (status) {
    case 'confirmed':
      return RequestStatus.CONFIRMED;
    case 'declined':
      return RequestStatus.DECLINED;
    case 'cancelled':
      return RequestStatus.CANCELLED;
  }
};

const formatSentAt = (date: Date): string => {
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export class RequestService {
  public static async createRequest(senderId: string, data: CreateRequestInput): Promise<MappedRequest> {
    if (senderId === data.receiverId) {
      throw new AppError('You cannot send a mate request to yourself', 400);
    }

    const receiver = await prisma.user.findUnique({
      where: { id: data.receiverId },
      include: { profile: true },
    });

    if (!receiver) {
      throw new AppError('The target companion user does not exist', 404);
    }

    const newRequest = await prisma.request.create({
      data: {
        senderId,
        receiverId: data.receiverId,
        categoryId: data.categoryId,
        categoryLabel: data.categoryLabel,
        meetLocation: data.meetLocation,
        fromDateTime: data.fromDateTime,
        toDateTime: data.toDateTime,
        message: data.message ?? '',
        status: RequestStatus.PENDING,
      },
    });

    return {
      id: newRequest.id,
      direction: 'sent',
      mateUserId: receiver.id,
      mateName: receiver.profile?.fullName ?? receiver.name ?? 'Anonymous',
      mateTenureId: receiver.profile?.tenureId ?? 'Not assigned',
      mateAvatar: receiver.profile?.profilePhoto ?? '',
      categoryId: newRequest.categoryId,
      categoryLabel: newRequest.categoryLabel,
      meetLocation: newRequest.meetLocation,
      fromDateTime: newRequest.fromDateTime.toISOString(),
      toDateTime: newRequest.toDateTime.toISOString(),
      message: newRequest.message ?? '',
      status: 'pending',
      sentAt: formatSentAt(newRequest.createdAt),
      otp: null,
    };
  }

  public static async listUserRequests(userId: string): Promise<{ sent: MappedRequest[]; received: MappedRequest[] }> {
    const [sentRequests, receivedRequests] = await Promise.all([
      prisma.request.findMany({
        where: { senderId: userId },
        include: {
          receiver: {
            include: { profile: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.request.findMany({
        where: { receiverId: userId },
        include: {
          sender: {
            include: { profile: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const sent = sentRequests.map((req): MappedRequest => ({
      id: req.id,
      direction: 'sent',
      mateUserId: req.receiver.id,
      mateName: req.receiver.profile?.fullName ?? req.receiver.name ?? 'Anonymous',
      mateTenureId: req.receiver.profile?.tenureId ?? 'Not assigned',
      mateAvatar: req.receiver.profile?.profilePhoto ?? '',
      categoryId: req.categoryId,
      categoryLabel: req.categoryLabel,
      meetLocation: req.meetLocation,
      fromDateTime: req.fromDateTime.toISOString(),
      toDateTime: req.toDateTime.toISOString(),
      message: req.message ?? '',
      status: mapStatusToFrontend(req.status),
      sentAt: formatSentAt(req.createdAt),
      otp: null,
    }));

    const received = receivedRequests.map((req): MappedRequest => ({
      id: req.id,
      direction: 'received',
      mateUserId: req.sender.id,
      mateName: req.sender.profile?.fullName ?? req.sender.name ?? 'Anonymous',
      mateTenureId: req.sender.profile?.tenureId ?? 'Not assigned',
      mateAvatar: req.sender.profile?.profilePhoto ?? '',
      categoryId: req.categoryId,
      categoryLabel: req.categoryLabel,
      meetLocation: req.meetLocation,
      fromDateTime: req.fromDateTime.toISOString(),
      toDateTime: req.toDateTime.toISOString(),
      message: req.message ?? '',
      status: mapStatusToFrontend(req.status),
      sentAt: formatSentAt(req.createdAt),
      otp: req.otp,
    }));

    return { sent, received };
  }

  public static async updateRequestStatus(
    userId: string,
    requestId: string,
    status: 'confirmed' | 'declined' | 'cancelled'
  ): Promise<MappedRequest> {
    const request = await prisma.request.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new AppError('Request not found', 404);
    }

    if (status === 'cancelled') {
      if (request.senderId !== userId) {
        throw new AppError('You are not authorized to cancel this request', 403);
      }
    } else {
      // confirmed or declined
      if (request.receiverId !== userId) {
        throw new AppError('You are not authorized to accept or decline this request', 403);
      }
    }

    const otpVal = status === 'confirmed'
      ? String(Math.floor(1000 + Math.random() * 9000))
      : null;

    const updatedRequest = await prisma.request.update({
      where: { id: requestId },
      data: { 
        status: mapStatusToBackend(status),
        otp: otpVal,
      },
      include: {
        sender: { include: { profile: true } },
        receiver: { include: { profile: true } },
      },
    });

    const isSender = updatedRequest.senderId === userId;
    const partner = isSender ? updatedRequest.receiver : updatedRequest.sender;

    const senderName = updatedRequest.sender.profile?.fullName ?? updatedRequest.sender.name ?? 'Anonymous';
    const receiverName = updatedRequest.receiver.profile?.fullName ?? updatedRequest.receiver.name ?? 'Anonymous';

    // Create notifications based on request actions
    if (status === 'confirmed') {
      await NotificationService.createNotification(
        updatedRequest.senderId,
        'request_accepted',
        `${receiverName} accepted your request`
      );
    } else if (status === 'cancelled') {
      await NotificationService.createNotification(
        updatedRequest.receiverId,
        'meet_canceled',
        `${senderName} cancelled your meet`
      );
    } else if (status === 'declined') {
      await NotificationService.createNotification(
        updatedRequest.senderId,
        'meet_canceled',
        `${receiverName} declined your request`
      );
    }

    return {
      id: updatedRequest.id,
      direction: isSender ? 'sent' : 'received',
      mateUserId: partner.id,
      mateName: partner.profile?.fullName ?? partner.name ?? 'Anonymous',
      mateTenureId: partner.profile?.tenureId ?? 'Not assigned',
      mateAvatar: partner.profile?.profilePhoto ?? '',
      categoryId: updatedRequest.categoryId,
      categoryLabel: updatedRequest.categoryLabel,
      meetLocation: updatedRequest.meetLocation,
      fromDateTime: updatedRequest.fromDateTime.toISOString(),
      toDateTime: updatedRequest.toDateTime.toISOString(),
      message: updatedRequest.message ?? '',
      status: mapStatusToFrontend(updatedRequest.status),
      sentAt: formatSentAt(updatedRequest.createdAt),
      otp: isSender ? null : updatedRequest.otp,
    };
  }

  public static async getRequestMessages(userId: string, requestId: string) {
    const request = await prisma.request.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new AppError('Request not found', 404);
    }

    if (request.senderId !== userId && request.receiverId !== userId) {
      throw new AppError('You are not authorized to view messages for this request', 403);
    }

    const messages = await prisma.message.findMany({
      where: { requestId },
      orderBy: { createdAt: 'asc' },
    });

    return messages.map(msg => ({
      id: msg.id,
      sender: msg.senderId === userId ? 'me' : 'them',
      type: msg.type,
      text: msg.type === 'text' ? msg.content : undefined,
      imageUri: msg.type === 'image' ? (msg.mediaUrl ?? msg.content) : undefined,
      voiceUri: msg.type === 'voice' ? (msg.mediaUrl ?? msg.content) : undefined,
      voiceDurationSec: msg.voiceDuration ?? undefined,
      createdAt: msg.createdAt.getTime(),
    }));
  }
}

