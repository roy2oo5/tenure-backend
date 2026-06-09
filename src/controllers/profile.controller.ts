import { Request, Response, NextFunction } from 'express';
import { ProfileService } from '../services/profile.service';
import { AppError } from '../utils/app-error';

export class ProfileController {
  /**
   * Upsert the current user's profile
   */
  public static async upsertMyProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated.', 401));
      }

      const profile = await ProfileService.upsertProfile(req.user.id, req.body);

      res.status(200).json({
        status: 'success',
        data: { profile },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get the current user's profile
   */
  public static async getMyProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated.', 401));
      }

      const profile = await ProfileService.getProfile(req.user.id);

      if (!profile) {
        return next(new AppError('Profile not found for this user.', 404));
      }

      res.status(200).json({
        status: 'success',
        data: { profile },
      });
    } catch (error) {
      next(error);
    }
  }
}
