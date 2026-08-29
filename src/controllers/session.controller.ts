import { Request, Response, NextFunction } from 'express';
import { SessionService } from '../services/session.service';
import { AppError } from '../utils/app-error';

export class SessionController {
  public static async feedback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));
      const requestId = parseInt(req.params.id, 10);
      const rating = Number(req.body.rating);
      const session = await SessionService.submitFeedback(req.user.id, requestId, rating);
      res.status(200).json({ status: 'success', data: { session } });
    } catch (error) {
      next(error);
    }
  }

  public static async completeMockPayment(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));
      const requestId = parseInt(req.params.id, 10);
      const paymentMode = req.body.paymentMode;
      if (paymentMode !== 'cash' && paymentMode !== 'upi' && paymentMode !== 'qr') {
        return next(new AppError('Payment mode must be cash, upi, or qr', 400));
      }
      const session = await SessionService.completeMockPayment(req.user.id, requestId, paymentMode);
      res.status(200).json({ status: 'success', data: { session } });
    } catch (error) {
      next(error);
    }
  }

  public static async start(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));
      const requestId = parseInt(req.params.id, 10);
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
      const requestId = parseInt(req.params.id, 10);
      const session = await SessionService.pauseRequest(req.user.id, requestId);
      res.status(200).json({ status: 'success', data: { session } });
    } catch (error) {
      next(error);
    }
  }

  public static async pauseConfirm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));
      const requestId = parseInt(req.params.id, 10);
      const session = await SessionService.pauseConfirm(req.user.id, requestId);
      res.status(200).json({ status: 'success', data: { session } });
    } catch (error) {
      next(error);
    }
  }

  public static async resumeRequest(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));
      const requestId = parseInt(req.params.id, 10);
      const session = await SessionService.resumeRequest(req.user.id, requestId);
      res.status(200).json({ status: 'success', data: { session } });
    } catch (error) {
      next(error);
    }
  }

  public static async resumeConfirm(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));
      const requestId = parseInt(req.params.id, 10);
      const session = await SessionService.resumeConfirm(req.user.id, requestId);
      res.status(200).json({ status: 'success', data: { session } });
    } catch (error) {
      next(error);
    }
  }

  public static async end(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));
      const requestId = parseInt(req.params.id, 10);
      const { reason } = req.body;
      const session = await SessionService.endSession(req.user.id, requestId, reason);
      res.status(200).json({ status: 'success', data: { session } });
    } catch (error) {
      next(error);
    }
  }

  public static async endConfirm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));
      const requestId = parseInt(req.params.id, 10);
      const session = await SessionService.confirmEndSession(req.user.id, requestId);
      res.status(200).json({ status: 'success', data: { session } });
    } catch (error) {
      next(error);
    }
  }

  public static async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));
      const requestId = parseInt(req.params.id, 10);
      const session = await SessionService.getSession(req.user.id, requestId);
      res.status(200).json({ status: 'success', data: { session } });
    } catch (error) {
      next(error);
    }
  }
}
