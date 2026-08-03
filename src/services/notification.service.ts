import { prisma } from '../config/database';
import { Notification } from '@prisma/client';
import { AppError } from '../utils/app-error';
import { sendPushNotification } from '../config/firebase';
import { logger } from '../utils/logger';

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

    // Send push notification asynchronously
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { fcmToken: true },
      });
      if (user?.fcmToken) {
        let title = 'New Notification';
        if (kind.startsWith('payment_')) {
          title = 'Payment Update';
        } else if (kind.startsWith('request_') || kind === 'new_request') {
          title = 'Booking Request';
        } else if (kind.startsWith('call_') || kind === 'missed_call') {
          title = 'Call Notification';
        } else if (kind === 'chat_message' || kind === 'message') {
          title = 'New Message';
        }
        sendPushNotification(user.fcmToken, title, message, {
          kind,
          notificationId: String(notification.id),
        }).catch((err) => {
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
  public static async listNotifications(
    userId: number,
    filter?: string
  ): Promise<Notification[]> {
    const whereClause: any = { userId };

    if (filter === 'payments') {
      whereClause.kind = {
        in: ['payment_sent', 'payment_received', 'payment_canceled'],
      };
    }

    return prisma.notification.findMany({
      where: whereClause,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Mark a specific notification as read
   */
  public static async markAsRead(
    userId: number,
    notificationId: number
  ): Promise<Notification> {
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
