import { Request, Response, NextFunction } from 'express';
import { RequestService } from '../services/request.service';
import { AppError } from '../utils/app-error';

export class RequestController {
  public static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated.', 401));
      }
      const request = await RequestService.createRequest(req.user.id, req.body);
      res.status(201).json({
        status: 'success',
        data: { request },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated.', 401));
      }
      const { sent, received } = await RequestService.listUserRequests(req.user.id);
      res.status(200).json({
        status: 'success',
        data: { sent, received },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated.', 401));
      }
      const id = parseInt(req.params.id, 10);
      const { status, cancellationReason, hourlyRate } = req.body;
      const request = await RequestService.updateRequestStatus(
        req.user.id,
        id,
        status,
        cancellationReason,
        hourlyRate,
      );
      res.status(200).json({
        status: 'success',
        data: { request },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async listMessages(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated.', 401));
      }
      const id = parseInt(req.params.id, 10);
      const messages = await RequestService.getRequestMessages(req.user.id, id);
      res.status(200).json({
        status: 'success',
        data: { messages },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async deleteMessage(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated.', 401));
      }
      const id = parseInt(req.params.id, 10);
      const messageId = parseInt(req.params.messageId, 10);
      await RequestService.deleteRequestMessage(req.user.id, id, messageId);
      res.status(200).json({
        status: 'success',
        data: { messageId },
      });
    } catch (error) {
      next(error);
    }
  }
}
