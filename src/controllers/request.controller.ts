import { Request, Response, NextFunction } from 'express';
import { RequestService } from '../services/request.service';
import { AppError } from '../utils/app-error';
import { MeetRouteMetricsService } from '../services/meet-route-metrics.service';

export class RequestController {
  public static async createQuickPick(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) return next(new AppError('You are not authenticated.', 401));
      const result = await RequestService.createQuickPick(req.user.id, req.body);
      res.status(201).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  }

  public static async quickPickStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) return next(new AppError('You are not authenticated.', 401));
      const result = await RequestService.getQuickPickStatus(req.user.id, req.params.groupId);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  }

  public static async cancelQuickPick(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) return next(new AppError('You are not authenticated.', 401));
      await RequestService.cancelQuickPick(req.user.id, req.params.groupId);
      res.status(200).json({ status: 'success' });
    } catch (error) {
      next(error);
    }
  }

  public static async routeMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) return next(new AppError('You are not authenticated.', 401));
      const requestId = Number.parseInt(req.params.id, 10);
      if (!Number.isSafeInteger(requestId)) return next(new AppError('Invalid request ID.', 400));
      const metrics = await MeetRouteMetricsService.getForRequest(req.user.id, requestId);
      res.status(200).json({ status: 'success', data: { metrics } });
    } catch (error) {
      next(error);
    }
  }

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
      const { status, cancellationReason, hourlyRate, supporterTravelMode } = req.body;
      const request = await RequestService.updateRequestStatus(
        req.user.id,
        id,
        status,
        cancellationReason,
        hourlyRate,
        supporterTravelMode,
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
      const rawLimit = Number.parseInt(req.query.limit?.toString() ?? '', 10);
      const limit = Number.isFinite(rawLimit) ? rawLimit : undefined;
      const before = req.query.before?.toString();
      const messages = await RequestService.getRequestMessages(req.user.id, id, {
        limit,
        before,
      });
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
      const messageId = req.params.messageId;
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
