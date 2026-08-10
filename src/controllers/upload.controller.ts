import { Request, Response, NextFunction } from 'express';
import { UploadService } from '../services/upload.service';
import { AppError } from '../utils/app-error';
import {
  validateProfilePicture,
  validateGalleryImage,
  ValidationResult,
} from '../services/image-validator.service';
import { ProfileService } from '../services/profile.service';

const userMediaFolder = (req: Request): string => {
  const userId = req.user?.id ?? 'unknown';
  const safeName = (req.user?.name ?? 'user')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'user';
  return `users/${userId}-${safeName}`;
};

export class UploadController {
  public static async listAvatars(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const avatars = await UploadService.listAvatars(req.get('host'), req.protocol);
      res.status(200).json({ status: 'success', data: { avatars } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Upload a single image file (generic)
   */
  public static async uploadFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        return next(new AppError('No file uploaded.', 400));
      }

      const host = req.get('host');
      const protocol = req.protocol;

      const url = await UploadService.uploadFile(
        req.file,
        `${userMediaFolder(req)}/uploads`,
        host,
        protocol,
      );

      res.status(200).json({
        status: 'success',
        data: {
          url,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getUploadedFile(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { key } = req.params;
      const file = await UploadService.getFile(key);
      res.setHeader('Content-Type', file.contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      file.stream.pipe(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Upload and validate a profile picture with AWS Rekognition.
   * Requires exact 1 human face & no adult/inappropriate content.
   */
  public static async uploadProfilePicture(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.file) {
        return next(new AppError('No file uploaded.', 400));
      }

      // Validate the image using AWS Rekognition
      const validation: ValidationResult = await validateProfilePicture(req.file.buffer);

      if (!validation.valid) {
        return next(new AppError(validation.message, 400));
      }

      const host = req.get('host');
      const protocol = req.protocol;
      const url = await UploadService.uploadFile(
        req.file,
        `${userMediaFolder(req)}/profile`,
        host,
        protocol,
      );

      // If authenticated user is present, update user's profile photo in DB
      let profile = null;
      if (req.user?.id) {
        profile = await ProfileService.updateProfilePhoto(req.user.id, url);
      }

      res.status(200).json({
        message: 'Profile picture updated successfully!',
        data: {
          url,
          profile,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Upload and validate a gallery photo for live gallery with AWS Rekognition.
   * Ensures no adult/inappropriate content is present.
   */
  public static async uploadGalleryPhoto(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.file) {
        return next(new AppError('No file uploaded.', 400));
      }

      // Validate the gallery photo using AWS Rekognition content moderation
      const validation: ValidationResult = await validateGalleryImage(req.file.buffer);

      if (!validation.valid) {
        return next(new AppError(validation.message, 400));
      }

      const host = req.get('host');
      const protocol = req.protocol;
      const uploadRoute = req.route?.path;
      const isLivePhoto = uploadRoute === '/live-gallery';
      const mediaTypeFolder =
        uploadRoute === '/self-gallery'
          ? 'gallery/self'
          : uploadRoute === '/vehicle-gallery'
            ? 'gallery/vehicle'
            : isLivePhoto
              ? 'gallery/live-photo'
              : 'gallery';
      const folder = `${userMediaFolder(req)}/${mediaTypeFolder}`;
      const url = await UploadService.uploadFile(req.file, folder, host, protocol);

      // If authenticated user is present, append photo to user's profile gallery in DB
      let profile = null;
      if (req.user?.id) {
        profile = isLivePhoto
          ? await ProfileService.setLivePhoto(req.user.id, url)
          : await ProfileService.addGalleryPhoto(req.user.id, url);
      }

      res.status(200).json({
        message: 'Gallery photo added successfully!',
        data: {
          url,
          gallery: profile?.gallery,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
