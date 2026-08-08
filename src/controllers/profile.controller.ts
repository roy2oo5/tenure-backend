import { Request, Response, NextFunction } from 'express';
import { ProfileService } from '../services/profile.service';
import { AppError } from '../utils/app-error';
import { prisma } from '../config/database';
import { processAadhaarCredentialZip } from '../utils/aadhaar-credential';

function parseAadhaarDob(value: string): Date | undefined {
  const parts = value.trim().split(/[-/]/);
  if (parts.length !== 3) return undefined;
  const first = Number(parts[0]);
  const second = Number(parts[1]);
  const third = Number(parts[2]);
  const [year, month, day] = parts[0].length === 4
    ? [first, second, third]
    : [third, second, first];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) return undefined;
  return parsed;
}

function normalizedGender(value: string | null): string {
  const normalized = (value ?? '').trim().toLowerCase();
  if (['m', 'male', 'man'].includes(normalized)) return 'male';
  if (['f', 'female', 'woman'].includes(normalized)) return 'female';
  if (['o', 'other'].includes(normalized)) return 'other';
  return normalized;
}

function normalizedName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

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
    phone: user?.phone ?? null,
    phoneAdded: Boolean(user?.phone?.trim()),
    emailAdded: Boolean(user?.email?.trim()),
    livePhotoAdded,
  };
}

export class ProfileController {
  public static async verifySharedAadhaarCredential(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) return next(new AppError('You are not authenticated.', 401));
      const uploadedFiles = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      const credentialFile = req.file ?? uploadedFiles?.credential?.[0] ?? uploadedFiles?.CREDENTIAL?.[0];
      if (!credentialFile?.buffer) {
        return next(new AppError('A ZIP file from the myAadhaar app is expected.', 400));
      }
      const hasZipSignature = credentialFile.buffer.length >= 4 &&
        credentialFile.buffer[0] === 0x50 && credentialFile.buffer[1] === 0x4b &&
        [0x03, 0x05, 0x07].includes(credentialFile.buffer[2]) &&
        [0x04, 0x06, 0x08].includes(credentialFile.buffer[3]);
      if (!credentialFile.originalname.toLowerCase().endsWith('.zip') || !hasZipSignature) {
        return next(new AppError('A ZIP file from the myAadhaar app is expected.', 400));
      }
      const profile = await prisma.profile.findUnique({ where: { userId: req.user.id } });
      if (!profile) return next(new AppError('Complete your profile before Aadhaar verification.', 404));
      if (profile.aadhaarVerified) {
        res.status(200).json({
          status: 'success',
          data: {
            alreadyVerified: true,
            profile: {
              aadhaarVerified: true,
              aadhaarMasked: profile.aadhaarMasked,
            },
            updatedFields: [],
            nameChoice: null,
            message: 'Aadhaar verification is already completed.',
          },
        });
        return;
      }
      const claims = await processAadhaarCredentialZip(credentialFile.buffer);
      const aadhaarDob = parseAadhaarDob(claims.dob);
      if (!aadhaarDob) return next(new AppError('The Aadhaar credential contains an invalid DOB.', 400));
      const maskedDigits = claims.maskedAadhaar.replace(/\D/g, '');
      const masked = maskedDigits.length >= 4
        ? `XXXX XXXX ${maskedDigits.slice(-4)}`
        : claims.maskedAadhaar.trim();
      const dobChanged = !profile.dob || profile.dob.getTime() !== aadhaarDob.getTime();
      const genderChanged = normalizedGender(profile.gender) !== normalizedGender(claims.gender);
      const nameChoiceRequired = normalizedName(profile.fullName) !== normalizedName(claims.name);
      const [updatedProfile] = await prisma.$transaction([
        prisma.profile.update({
          where: { userId: req.user.id },
          data: {
            aadhaarVerified: true,
            aadhaarMasked: masked,
            aadhaarAddress: claims.address,
            ...(dobChanged ? { dob: aadhaarDob } : {}),
            ...(genderChanged ? { gender: claims.gender.trim() } : {}),
          },
        }),
        prisma.aadhaarCredentialVerification.upsert({
          where: { credentialHash: claims.credentialHash },
          create: {
            userId: req.user.id, credentialHash: claims.credentialHash,
            issuer: claims.issuer, extractedName: claims.name,
            extractedDob: claims.dob, referenceId: claims.referenceId,
          },
          update: {},
        }),
      ]);
      res.status(200).json({
        status: 'success',
        data: {
          profile: {
            aadhaarVerified: updatedProfile.aadhaarVerified,
            aadhaarMasked: updatedProfile.aadhaarMasked,
            aadhaarAddress: updatedProfile.aadhaarAddress,
            dob: updatedProfile.dob,
            gender: updatedProfile.gender,
          },
          updatedFields: [dobChanged ? 'dob' : null, genderChanged ? 'gender' : null]
            .filter((field): field is string => field !== null),
          nameChoice: nameChoiceRequired ? {
            currentName: profile.fullName,
            aadhaarName: claims.name,
          } : null,
          message: 'Aadhaar verified successfully.',
        },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async useVerifiedAadhaarName(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) return next(new AppError('You are not authenticated.', 401));
      const verification = await prisma.aadhaarCredentialVerification.findFirst({
        where: { userId: req.user.id },
        orderBy: { verifiedAt: 'desc' },
        select: { extractedName: true },
      });
      if (!verification) {
        return next(new AppError('Complete Aadhaar verification before updating your name.', 400));
      }
      const profile = await prisma.profile.update({
        where: { userId: req.user.id },
        data: { fullName: verification.extractedName },
        select: { fullName: true },
      });
      res.status(200).json({
        status: 'success',
        data: { fullName: profile.fullName, message: 'Profile name updated to Aadhaar name.' },
      });
    } catch (error) {
      next(error);
    }
  }

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
      const coordinateTolerance = 0.00001;
      const existing = await prisma.savedAddress.findFirst({
        where: {
          userId: req.user.id,
          latitude: { gte: latitude - coordinateTolerance, lte: latitude + coordinateTolerance },
          longitude: { gte: longitude - coordinateTolerance, lte: longitude + coordinateTolerance },
        },
      });
      if (existing) {
        res.status(200).json({ status: 'success', data: { address: existing } });
        return;
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
        prisma.profile.update({
          where: { userId: req.user.id },
          data: {
            latitude: address.latitude,
            longitude: address.longitude,
            location: address.label,
          },
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

  public static async deleteSavedAddress(
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
      if (!address) {
        return next(new AppError('Saved address not found.', 404));
      }
      const coordinateTolerance = 0.00001;
      await prisma.savedAddress.deleteMany({
        where: {
          userId: req.user.id,
          latitude: {
            gte: address.latitude - coordinateTolerance,
            lte: address.latitude + coordinateTolerance,
          },
          longitude: {
            gte: address.longitude - coordinateTolerance,
            lte: address.longitude + coordinateTolerance,
          },
        },
      });
      res.status(200).json({ status: 'success', data: {} });
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
      const { latitude, longitude, location } = req.body;
      if (latitude == null || longitude == null) {
        return next(new AppError('Latitude and longitude are required.', 400));
      }
      const profile = await ProfileService.updateLocation(req.user.id, {
        latitude: Number(latitude),
        longitude: Number(longitude),
        location: typeof location === 'string' ? location : undefined,
      });
      res.status(200).json({
        status: 'success',
        data: { profile },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateReadyNow(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated.', 401));
      }
      if (typeof req.body.instantAvailable !== 'boolean') {
        return next(new AppError('instantAvailable must be a boolean.', 400));
      }
      const latitude = req.body.latitude == null ? undefined : Number(req.body.latitude);
      const longitude = req.body.longitude == null ? undefined : Number(req.body.longitude);
      if ((latitude !== undefined && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) ||
          (longitude !== undefined && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))) {
        return next(new AppError('Invalid latitude or longitude.', 400));
      }
      const profile = await ProfileService.updateReadyNow(req.user.id, {
        instantAvailable: req.body.instantAvailable,
        latitude,
        longitude,
      });
      res.status(200).json({ status: 'success', data: { profile } });
    } catch (error) {
      next(error);
    }
  }
}
