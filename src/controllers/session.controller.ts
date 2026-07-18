import { Request, Response, NextFunction } from 'express';
import { SessionService } from '../services/session.service';
import { AppError } from '../utils/app-error';

export class SessionController {
  public static async start(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));
      const { id: requestId } = req.params;
      const { otp } = req.body;
      const session = await SessionService.startSession(req.user.id, requestId, otp);
      res.status(200).json({ status: 'success', data: { session } });
    } catch (error) {
      next(error);
    }
  }

  public static async pauseRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));
      const { id: requestId } = req.params;
      const session = await SessionService.pauseRequest(req.user.id, requestId);
      res.status(200).json({ status: 'success', data: { session } });
    } catch (error) {
      next(error);
    }
  }

  public static async pauseConfirm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));
      const { id: requestId } = req.params;
      const session = await SessionService.pauseConfirm(req.user.id, requestId);
      res.status(200).json({ status: 'success', data: { session } });
    } catch (error) {
      next(error);
    }
  }

  public static async resumeRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));
      const { id: requestId } = req.params;
      const session = await SessionService.resumeRequest(req.user.id, requestId);
      res.status(200).json({ status: 'success', data: { session } });
    } catch (error) {
      next(error);
    }
  }

  public static async resumeConfirm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));
      const { id: requestId } = req.params;
      const session = await SessionService.resumeConfirm(req.user.id, requestId);
      res.status(200).json({ status: 'success', data: { session } });
    } catch (error) {
      next(error);
    }
  }

  public static async end(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));
      const { id: requestId } = req.params;
      const { reason } = req.body;
      const session = await SessionService.endSession(req.user.id, requestId, reason);
      res.status(200).json({ status: 'success', data: { session } });
    } catch (error) {
      next(error);
    }
  }

  public static async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));
      const { id: requestId } = req.params;
      const session = await SessionService.getSession(req.user.id, requestId);
      res.status(200).json({ status: 'success', data: { session } });
    } catch (error) {
      next(error);
    }
  }
}
