import { Request, Response, NextFunction } from 'express';
import { ProfileService } from '../services/profile.service';
import { AppError } from '../utils/app-error';
import { prisma } from '../config/database';

async function profileWithTenureId(userId: number, profile: object) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tenureId: true },
  });

  return {
    ...profile,
    tenureId: user?.tenureId ?? null,
  };
}

export class ProfileController {
  /**
   * Upsert the current user's profile
   */
  public static async upsertMyProfile(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated.', 401));
      }

      const profile = await ProfileService.upsertProfile(req.user.id, req.body);
      const responseProfile = await profileWithTenureId(req.user.id, profile);

      res.status(200).json({
        status: 'success',
        data: { profile: responseProfile },
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
      const responseProfile = await profileWithTenureId(req.user.id, profile);

      res.status(200).json({
        status: 'success',
        data: { profile: responseProfile },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async verifyAadhaar(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated.', 401));
      }

      const result = await ProfileService.verifyAadhaar(req.user.id, req.body);

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update current user's profile location coordinates
   */
  public static async updateLocation(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated.', 401));
      }
      const { latitude, longitude } = req.body;
      if (latitude == null || longitude == null) {
        return next(new AppError('Latitude and longitude are required.', 400));
      }
      const profile = await ProfileService.updateLocation(req.user.id, {
        latitude: Number(latitude),
        longitude: Number(longitude),
      });
      res.status(200).json({
        status: 'success',
        data: { profile },
      });
    } catch (error) {
      next(error);
    }
  }
}
