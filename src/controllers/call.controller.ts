import { Request, Response, NextFunction } from 'express';
import { CallService } from '../services/call.service';
import { AppError } from '../utils/app-error';
import { env } from '../config/env';
import { createHmac } from 'crypto';

export class CallController {
  public static getTurnCredentials(req: Request, res: Response, next: NextFunction): void {
    try {
      if (!req.user) return next(new AppError('You are not authenticated.', 401));
      if (!env.TURN_HOST || !env.TURN_SHARED_SECRET) {
        return next(new AppError('TURN is not configured.', 503));
      }

      const expiresAt = Math.floor(Date.now() / 1000) + env.TURN_CREDENTIAL_TTL_SECONDS;
      const username = `${expiresAt}:${req.user.id}`;
      const credential = createHmac('sha1', env.TURN_SHARED_SECRET)
        .update(username)
        .digest('base64');
      res.status(200).json({
        status: 'success',
        data: {
          expiresAt,
          iceServers: [
            { urls: [`stun:${env.TURN_HOST}:3478`] },
            {
              urls: [
                `turn:${env.TURN_HOST}:3478?transport=udp`,
                `turn:${env.TURN_HOST}:3478?transport=tcp`,
                `turns:${env.TURN_HOST}:5349?transport=tcp`,
              ],
              username,
              credential,
            },
          ],
        },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated.', 401));
      }

      const mateUserId = Number.parseInt(req.params.mateUserId, 10);
      if (!Number.isInteger(mateUserId) || mateUserId <= 0) {
        return next(new AppError('Invalid mate user ID.', 400));
      }

      const usage = await CallService.getDailyPairUsage(req.user.id, mateUserId);
      res.status(200).json({
        status: 'success',
        data: usage,
      });
    } catch (error) {
      next(error);
    }
  }

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
