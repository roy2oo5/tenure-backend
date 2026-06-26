import { Request, Response, NextFunction } from 'express';
import { BlockService } from '../services/block.service';
import { AppError } from '../utils/app-error';

export class BlockController {
  public static async block(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated', 401));
      }
      const { blockedId } = req.body;
      if (!blockedId) {
        return next(new AppError('Please provide a blockedId', 400));
      }

      await BlockService.blockUser(req.user.id, blockedId);

      res.status(200).json({
        status: 'success',
        message: 'User successfully blocked',
      });
    } catch (error) {
      next(error);
    }
  }

  public static async unblock(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated', 401));
      }
      const { blockedId } = req.body;
      if (!blockedId) {
        return next(new AppError('Please provide a blockedId', 400));
      }

      await BlockService.unblockUser(req.user.id, blockedId);

      res.status(200).json({
        status: 'success',
        message: 'User successfully unblocked',
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getBlocked(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated', 401));
      }

      const blockedUsers = await BlockService.getBlockedUsers(req.user.id);

      res.status(200).json({
        status: 'success',
        data: {
          blockedUsers,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
