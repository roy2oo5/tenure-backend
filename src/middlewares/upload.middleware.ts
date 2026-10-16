import multer from 'multer';
import { RequestHandler } from 'express';
import { AppError } from '../utils/app-error';

// Memory storage is used to easily redirect streams/buffers to S3 or write to disk if falling back
const storage = multer.memoryStorage();

const imageFileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new AppError('Only image files are allowed!', 400) as any, false);
  }
  cb(null, true);
};

const genericFileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const lowerName = file.originalname.toLowerCase();
  const isAudioFile =
    file.mimetype.startsWith('audio/') ||
    ['.m4a', '.aac', '.mp3', '.wav', '.ogg', '.webm'].some((extension) =>
      lowerName.endsWith(extension),
    );

  if (!file.mimetype.startsWith('image/') && !isAudioFile) {
    return cb(new AppError('Only image and audio files are allowed!', 400) as any, false);
  }
  cb(null, true);
};

export const uploadMiddleware = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // Limit size to 10MB
  },
});

export const MAX_GALLERY_PHOTO_BYTES = 5 * 1024 * 1024;

const galleryMulter = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: {
    // Multer treats a file that reaches its limit as oversized. Allow one
    // additional byte, then enforce the inclusive 5 MB maximum below.
    fileSize: MAX_GALLERY_PHOTO_BYTES + 1,
  },
});

export function galleryUploadFields(
  fields: Array<{ name: string; maxCount?: number }>,
): RequestHandler {
  const upload = galleryMulter.fields(fields);
  return (req, res, next) => {
    upload(req, res, (error: unknown) => {
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        next(new AppError('Each gallery photo must be 5 MB or smaller.', 413));
        return;
      }
      if (!error) {
        const files = req.files as Record<string, Express.Multer.File[]> | undefined;
        const hasOversizedFile = Object.values(files ?? {}).some((entries) =>
          entries.some((file) => file.size > MAX_GALLERY_PHOTO_BYTES),
        );
        if (hasOversizedFile) {
          next(new AppError('Each gallery photo must be 5 MB or smaller.', 413));
          return;
        }
      }
      next(error);
    });
  };
}

export const genericUploadMiddleware = multer({
  storage,
  fileFilter: genericFileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
});

export const aadhaarCredentialUploadMiddleware = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const lowerName = file.originalname.toLowerCase();
    const isZip =
      lowerName.endsWith('.zip') &&
      ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'].includes(
        file.mimetype,
      );
    const isSdJwtText =
      lowerName.endsWith('sdjwt.txt') &&
      [
        'text/plain',
        'application/octet-stream',
        'application/zip',
        'application/x-zip-compressed',
      ].includes(file.mimetype);
    if (!isZip && !isSdJwtText) {
      return cb(
        new AppError('A ZIP or sdjwt.txt file from the Aadhaar app is expected.', 400) as any,
        false,
      );
    }
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const aadhaarQrImageUploadMiddleware = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png'].includes(file.mimetype)) {
      return cb(new AppError('A JPEG or PNG Aadhaar image is expected.', 400) as any, false);
    }
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});
