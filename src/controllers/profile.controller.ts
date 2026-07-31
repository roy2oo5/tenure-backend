import { Request, Response, NextFunction } from 'express';
import { ProfileService } from '../services/profile.service';
import { AppError } from '../utils/app-error';
import { prisma } from '../config/database';

async function profileWithTenureId(userId: number, profile: object) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tenureId: true, email: true, phone: true },
  });
  const profileData = profile as { gallery?: unknown };
  const gallery = Array.isArray(profileData.gallery) ? profileData.gallery : [];
  const explicitLivePhoto = (profileData as { livePhotoUrl?: unknown }).livePhotoUrl;
  const livePhotoAdded =
    (typeof explicitLivePhoto === 'string' && explicitLivePhoto.trim().length > 0) ||
    gallery.some((item) => item?.toString().toLowerCase().includes('live-photo'));

  return {
    ...profile,
    tenureId: user?.tenureId ?? null,
    phoneAdded: Boolean(user?.phone?.trim()),
    emailAdded: Boolean(user?.email?.trim()),
    livePhotoAdded,
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

  public static async verifyAadhaarQR(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated.', 401));
      }

      let qrBuffer: Buffer;
      if (req.file?.buffer) {
        qrBuffer = req.file.buffer;
      } else if (req.body.qrBase64) {
        qrBuffer = Buffer.from(req.body.qrBase64, 'base64');
      } else if (Buffer.isBuffer(req.body)) {
        qrBuffer = req.body;
      } else {
        return next(new AppError('Please provide a valid Aadhaar QR buffer or base64 string (qrBase64).', 400));
      }

      const uidaiPublicKeyPem = req.body.publicKeyPem || process.env.UIDAI_PUBLIC_KEY_PEM;
      const result = await ProfileService.verifyAadhaarQR(req.user.id, qrBuffer, uidaiPublicKeyPem);

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
