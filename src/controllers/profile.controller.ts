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
  public static async getSavedAddresses(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) return next(new AppError('You are not authenticated.', 401));
      const addresses = await prisma.savedAddress.findMany({
        where: { userId: req.user.id },
        orderBy: [{ isSelected: 'desc' }, { updatedAt: 'desc' }],
      });
      res.status(200).json({ status: 'success', data: { addresses } });
    } catch (error) {
      next(error);
    }
  }

  public static async saveAddress(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) return next(new AppError('You are not authenticated.', 401));
      const label = req.body.label?.toString().trim() ?? '';
      const latitude = Number(req.body.latitude);
      const longitude = Number(req.body.longitude);
      if (!label || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return next(new AppError('A valid address and coordinates are required.', 400));
      }
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return next(new AppError('Address coordinates are invalid.', 400));
      }
      const address = await prisma.savedAddress.create({
        data: { userId: req.user.id, label, latitude, longitude },
      });
      res.status(201).json({ status: 'success', data: { address } });
    } catch (error) {
      next(error);
    }
  }

  public static async selectSavedAddress(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) return next(new AppError('You are not authenticated.', 401));
      const addressId = Number(req.params.addressId);
      if (!Number.isInteger(addressId)) {
        return next(new AppError('Saved address id is invalid.', 400));
      }
      const address = await prisma.savedAddress.findFirst({
        where: { id: addressId, userId: req.user.id },
      });
      if (!address) return next(new AppError('Saved address not found.', 404));
      await prisma.$transaction([
        prisma.savedAddress.updateMany({
          where: { userId: req.user.id, isSelected: true },
          data: { isSelected: false },
        }),
        prisma.savedAddress.update({
          where: { id: addressId },
          data: { isSelected: true },
        }),
      ]);
      res.status(200).json({
        status: 'success',
        data: { address: { ...address, isSelected: true } },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async clearSelectedAddress(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) return next(new AppError('You are not authenticated.', 401));
      await prisma.savedAddress.updateMany({
        where: { userId: req.user.id, isSelected: true },
        data: { isSelected: false },
      });
      res.status(200).json({ status: 'success', data: {} });
    } catch (error) {
      next(error);
    }
  }


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
