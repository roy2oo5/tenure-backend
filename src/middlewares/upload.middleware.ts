import multer from 'multer';
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
    const isZip = file.originalname.toLowerCase().endsWith('.zip') &&
      ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'].includes(file.mimetype);
    if (!isZip) {
      return cb(new AppError('A ZIP file from the myAadhaar app is expected.', 400) as any, false);
    }
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});
