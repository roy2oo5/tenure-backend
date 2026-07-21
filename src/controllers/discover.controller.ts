import { Request, Response, NextFunction } from 'express';
import { DiscoverService } from '../services/discover.service';
import { AppError } from '../utils/app-error';

export class DiscoverController {
  private static buildSearchInput(req: Request) {
    return {
      q: req.query.q as string | undefined,
      district: req.query.district as string | undefined,
      category: req.query.category as string | undefined,
      latitude:
        req.query.latitude != null
          ? Number(req.query.latitude)
          : req.query.currentLatitude != null
            ? Number(req.query.currentLatitude)
            : undefined,
      longitude:
        req.query.longitude != null
          ? Number(req.query.longitude)
          : req.query.currentLongitude != null
            ? Number(req.query.currentLongitude)
            : undefined,
      gender: req.query.gender as 'all' | 'male' | 'female' | undefined,
      ageRange: req.query.ageRange as 'all' | 'under30' | '30to45' | 'over45' | undefined,
      hourlyRateRange: req.query.hourlyRateRange as
        | 'all'
        | 'under70'
        | '70to200'
        | '200to300'
        | 'custom'
        | undefined,
      customHourlyRateMin:
        req.query.customHourlyRateMin != null ? Number(req.query.customHourlyRateMin) : undefined,
      customHourlyRateMax:
        req.query.customHourlyRateMax != null ? Number(req.query.customHourlyRateMax) : undefined,
    };
  }

  public static async search(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated.', 401));
      }

      const mates = await DiscoverService.searchMates(
        req.user.id,
        DiscoverController.buildSearchInput(req),
      );

      res.status(200).json({
        status: 'success',
        results: mates.length,
        data: { mates },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async instants(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated.', 401));
      }

      const mates = await DiscoverService.getInstantMates(
        req.user.id,
        DiscoverController.buildSearchInput(req),
      );

      res.status(200).json({
        status: 'success',
        results: mates.length,
        data: { mates },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getMateProfile(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated.', 401));
      }

      const profile = await DiscoverService.getMatePublicProfile(req.user.id, req.params.userId);

      if (!profile) {
        return next(new AppError('Mate profile not found.', 404));
      }

      res.status(200).json({
        status: 'success',
        data: { mate: profile },
      });
    } catch (error) {
      next(error);
    }
  }
}
