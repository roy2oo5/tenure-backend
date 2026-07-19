import { Request, Response, NextFunction } from 'express';
import { UploadService } from '../services/upload.service';
import { AppError } from '../utils/app-error';

export class UploadController {
  /**
   * Upload a single image file
   */
  public static async uploadFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        return next(new AppError('No file uploaded', 400));
      }

      // Extract host details to generate absolute URLs for local uploads
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

  public static async getUploadedFile(req: Request, res: Response, next: NextFunction): Promise<void> {
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
}
