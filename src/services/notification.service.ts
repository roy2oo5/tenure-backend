import { prisma } from '../config/database';
import { Notification, RequestStatus } from '@prisma/client';
import { AppError } from '../utils/app-error';
import { sendPushNotification } from '../config/firebase';
import { logger } from '../utils/logger';
import { sendGlobalToUser } from './websocket.service';

export class NotificationService {
  /**
   * Create a new notification for a specific user
   */
  public static async createNotification(
    userId: number,
    kind: string,
    message: string,
    actorUserId?: number,
  ): Promise<Notification> {
    const actor = actorUserId
      ? await prisma.user.findUnique({
          where: { id: actorUserId },
          select: {
            tenureId: true,
            name: true,
            profile: { select: { fullName: true } },
          },
        })
      : null;
    const notification = await prisma.notification.create({
      data: {
        userId,
        kind,
        message,
        ...(actor
          ? {
              actorName: actor.profile?.fullName ?? actor.name ?? 'TenureMate user',
              actorTenureId: actor.tenureId ?? null,
            }
          : {}),
      },
    });

    // The global socket is the foreground delivery path. Push notifications
    // remain the background/offline path, while connected clients can refresh
    // their alert list and badge immediately from this event.
    sendGlobalToUser(userId, {
      event: 'notification_created',
      notification,
    });

    // Send push notification asynchronously
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { fcmToken: true },
      });
      if (user?.fcmToken) {
        const unreadCount = await prisma.notification.count({
          where: { userId, read: false },
        });
        let title = 'New Notification';
        if (kind.startsWith('payment_')) {
          title = 'Payment Update';
        } else if (kind.startsWith('request_') || kind === 'new_request') {
          title = 'Booking Request';
        } else if (kind.startsWith('call_') || kind === 'missed_call') {
          title = 'Call Notification';
        } else if (kind === 'chat_message' || kind === 'message') {
          title = 'New Message';
        } else if (kind.startsWith('session_')) {
          title = 'Meeting Update';
        }
        sendPushNotification(
          user.fcmToken,
          title,
          message,
          {
            kind,
            notificationId: String(notification.id),
            unreadCount: String(unreadCount),
          },
          unreadCount,
        ).catch((err) => {
          logger.error('Error in sendPushNotification call:', err);
        });
      }
    } catch (error) {
      logger.error('Error fetching user fcmToken for notification:', error);
    }

    return notification;
  }

  /**
   * List all notifications for a user, with optional category filtering
   */
  public static async listNotifications(userId: number, filter?: string): Promise<Notification[]> {
    const whereClause: any = { userId };

    if (filter === 'payments') {
      whereClause.kind = {
        in: ['payment_sent', 'payment_received', 'payment_canceled'],
      };
    }

    const notifications = await prisma.notification.findMany({
      where: whereClause,
      orderBy: {
        createdAt: 'desc',
      },
    });

    const needsActor = notifications.filter(
      (n) => !n.actorName && (n.kind === 'meet_expired' || n.kind === 'meet_canceled'),
    );

    if (needsActor.length > 0) {
      try {
        const userRequests = await prisma.request.findMany({
          where: {
            OR: [{ senderId: userId }, { receiverId: userId }],
            status: { in: [RequestStatus.EXPIRED, RequestStatus.CANCELLED] },
          },
          include: {
            sender: { select: { id: true, name: true, tenureId: true, profile: { select: { fullName: true } } } },
            receiver: { select: { id: true, name: true, tenureId: true, profile: { select: { fullName: true } } } },
          },
          orderBy: { updatedAt: 'desc' },
        });

        if (userRequests.length > 0) {
          for (const n of needsActor) {
            let bestReq = userRequests[0];
            let minDiff = Math.abs(n.createdAt.getTime() - bestReq.updatedAt.getTime());
            for (const req of userRequests) {
              const diff = Math.abs(n.createdAt.getTime() - req.updatedAt.getTime());
              if (diff < minDiff) {
                minDiff = diff;
                bestReq = req;
              }
            }
            const partner = bestReq.senderId === userId ? bestReq.receiver : bestReq.sender;
            if (partner) {
              n.actorName = partner.profile?.fullName ?? partner.name ?? 'TenureMate user';
              n.actorTenureId = partner.tenureId ?? null;
              prisma.notification
                .update({
                  where: { id: n.id },
                  data: { actorName: n.actorName, actorTenureId: n.actorTenureId },
                })
                .catch(() => {});
            }
          }
        }
      } catch (err) {
        logger.error('Error enriching notifications with actor details:', err);
      }
    }

    return notifications;
  }

  /**
   * Mark a specific notification as read
   */
  public static async markAsRead(userId: number, notificationId: number): Promise<Notification> {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new AppError('Notification not found', 404);
    }

    if (notification.userId !== userId) {
      throw new AppError('Unauthorized', 403);
    }

    return prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });
  }

  /**
   * Mark all notifications for a user as read
   */
  public static async markAllAsRead(userId: number): Promise<any> {
    return prisma.notification.updateMany({
      where: {
        userId,
        read: false,
      },
      data: {
        read: true,
      },
    });
  }
}
