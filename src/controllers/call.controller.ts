import { Request, Response, NextFunction } from 'express';
import { CallService } from '../services/call.service';
import { AppError } from '../utils/app-error';

export class CallController {
  public static async getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated.', 401));
      }
      const history = await CallService.getCallHistory(req.user.id);
      res.status(200).json({
        status: 'success',
        data: { calls: history },
      });
    } catch (error) {
      next(error);
    }
  }
}
