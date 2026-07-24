import { prisma } from '../config/database';
import { Notification } from '@prisma/client';
import { AppError } from '../utils/app-error';

export class NotificationService {
  /**
   * Create a new notification for a specific user
   */
  public static async createNotification(
    userId: number,
    kind: string,
    message: string
  ): Promise<Notification> {
    return prisma.notification.create({
      data: {
        userId,
        kind,
        message,
      },
    });
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
