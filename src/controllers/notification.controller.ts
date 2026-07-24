import { Request, Response, NextFunction } from 'express';
import { NotificationService } from '../services/notification.service';
import { AppError } from '../utils/app-error';

export class NotificationController {
  /**
   * Get notifications for the authenticated user
   */
  public static async getNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated', 401));
      }

      const filter = req.query.filter as string;
      const notifications = await NotificationService.listNotifications(req.user.id, filter);

      res.status(200).json({
        status: 'success',
        results: notifications.length,
        data: {
          notifications,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark a specific notification as read
   */
  public static async markRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated', 401));
      }

      const id = parseInt(req.params.id, 10);
      const notification = await NotificationService.markAsRead(req.user.id, id);

      res.status(200).json({
        status: 'success',
        data: {
          notification,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark all notifications as read
   */
  public static async markAllRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated', 401));
      }

      await NotificationService.markAllAsRead(req.user.id);

      res.status(200).json({
        status: 'success',
        message: 'All notifications marked as read',
      });
    } catch (error) {
      next(error);
    }
  }
}
