import { Request, Response, NextFunction } from 'express';
import { UploadService } from '../services/upload.service';
import { AppError } from '../utils/app-error';
import {
  validateProfilePicture,
  validateGalleryImage,
  ValidationResult,
} from '../services/image-validator.service';
import { ProfileService } from '../services/profile.service';

export class UploadController {
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

      const url = await UploadService.uploadFile(req.file, 'uploads', host, protocol);

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
      const url = await UploadService.uploadFile(req.file, 'profiles', host, protocol);

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
      const url = await UploadService.uploadFile(req.file, 'gallery', host, protocol);

      // If authenticated user is present, append photo to user's profile gallery in DB
      let profile = null;
      if (req.user?.id) {
        profile = await ProfileService.addGalleryPhoto(req.user.id, url);
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
