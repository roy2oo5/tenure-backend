import { Request, Response, NextFunction } from 'express';
import { MuteService } from '../services/mute.service';
import { AppError } from '../utils/app-error';

function targetId(req: Request): number {
  return Number(req.body.mutedUserId);
}

export class MuteController {
  public static async mute(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) return next(new AppError('You are not authenticated', 401));
      const id = targetId(req);
      if (!Number.isInteger(id) || id <= 0) return next(new AppError('Invalid muted user ID', 400));
      await MuteService.muteUser(req.user.id, id);
      res.status(200).json({ status: 'success', message: 'User muted' });
    } catch (error) {
      next(error);
    }
  }

  public static async unmute(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) return next(new AppError('You are not authenticated', 401));
      const id = targetId(req);
      if (!Number.isInteger(id) || id <= 0) return next(new AppError('Invalid muted user ID', 400));
      await MuteService.unmuteUser(req.user.id, id);
      res.status(200).json({ status: 'success', message: 'User unmuted' });
    } catch (error) {
      next(error);
    }
  }

  public static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) return next(new AppError('You are not authenticated', 401));
      const mutes = await MuteService.getMutedUsers(req.user.id);
      res.status(200).json({
        status: 'success',
        data: { mutedUserIds: mutes.map((mute) => mute.mutedUserId) },
      });
    } catch (error) {
      next(error);
    }
  }
}
