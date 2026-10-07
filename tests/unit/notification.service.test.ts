import { describe, it, expect, vi, afterEach } from 'vitest';
import { NotificationService } from '@/services/notification.service';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import { sendGlobalToUser } from '@/services/websocket.service';

vi.mock('@/services/websocket.service', () => ({
  sendGlobalToUser: vi.fn(),
}));

vi.mock('@/config/database', () => ({
  prisma: {
    notification: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

describe('NotificationService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createNotification', () => {
    it('should create a notification successfully', async () => {
      const mockNotif = {
        id: 1001,
        userId: 123,
        kind: 'request_accepted',
        message: 'Jane Doe accepted your request',
        read: false,
        createdAt: new Date(),
      };

      (prisma.notification.create as any).mockResolvedValue(mockNotif);

      const result = await NotificationService.createNotification(
        123,
        'request_accepted',
        'Jane Doe accepted your request',
      );

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: 123,
          kind: 'request_accepted',
          message: 'Jane Doe accepted your request',
        },
      });
      expect(result).toEqual(mockNotif);
      expect(sendGlobalToUser).toHaveBeenCalledWith(123, {
        event: 'notification_created',
        notification: mockNotif,
      });
    });

    it('should store the acting user name and Tenure ID', async () => {
      (prisma.user.findUnique as any)
        .mockResolvedValueOnce({
          tenureId: 'TM12345',
          name: 'Account Name',
          profile: { fullName: 'Asha Rao' },
        })
        .mockResolvedValueOnce({ fcmToken: null });
      (prisma.notification.create as any).mockResolvedValue({ id: 1002 });

      await NotificationService.createNotification(
        123,
        'new_request',
        'Asha Rao sent you a new booking request.',
        456,
      );

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: 123,
          kind: 'new_request',
          message: 'Asha Rao sent you a new booking request.',
          actorName: 'Asha Rao',
          actorTenureId: 'TM12345',
        },
      });
    });
  });

  describe('listNotifications', () => {
    it('should list all notifications for a user', async () => {
      const mockList = [
        { id: 1002, userId: 123, kind: 'request_accepted', message: 'Accepted' },
        { id: 1003, userId: 123, kind: 'payment_sent', message: 'Sent' },
      ];

      (prisma.notification.findMany as any).mockResolvedValue(mockList);

      const result = await NotificationService.listNotifications(123);

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 123 },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(mockList);
    });

    it('should filter notifications by payments', async () => {
      const mockList = [{ id: 1003, userId: 123, kind: 'payment_sent', message: 'Sent' }];

      (prisma.notification.findMany as any).mockResolvedValue(mockList);

      const result = await NotificationService.listNotifications(123, 'payments');

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: {
          userId: 123,
          kind: {
            in: ['payment_sent', 'payment_received', 'payment_canceled'],
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(mockList);
    });
  });

  describe('markAsRead', () => {
    it('should mark a notification as read successfully', async () => {
      const mockNotif = { id: 1001, userId: 123, read: false };
      const updatedNotif = { id: 1001, userId: 123, read: true };

      (prisma.notification.findUnique as any).mockResolvedValue(mockNotif);
      (prisma.notification.update as any).mockResolvedValue(updatedNotif);

      const result = await NotificationService.markAsRead(123, 1001);

      expect(prisma.notification.findUnique).toHaveBeenCalledWith({
        where: { id: 1001 },
      });
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 1001 },
        data: { read: true },
      });
      expect(result).toEqual(updatedNotif);
    });

    it('should throw 404 error if notification is not found', async () => {
      (prisma.notification.findUnique as any).mockResolvedValue(null);

      await expect(NotificationService.markAsRead(123, 1001)).rejects.toThrow(
        new AppError('Notification not found', 404),
      );
    });

    it('should throw 403 error if user does not own notification', async () => {
      const mockNotif = { id: 1001, userId: 999, read: false };
      (prisma.notification.findUnique as any).mockResolvedValue(mockNotif);

      await expect(NotificationService.markAsRead(123, 1001)).rejects.toThrow(
        new AppError('Unauthorized', 403),
      );
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read', async () => {
      const mockResponse = { count: 3 };
      (prisma.notification.updateMany as any).mockResolvedValue(mockResponse);

      const result = await NotificationService.markAllAsRead(123);

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 123,
          read: false,
        },
        data: {
          read: true,
        },
      });
      expect(result).toEqual(mockResponse);
    });
  });
});
