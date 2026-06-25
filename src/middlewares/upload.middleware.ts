import multer from 'multer';
import { AppError } from '../utils/app-error';

// Memory storage is used to easily redirect streams/buffers to S3 or write to disk if falling back
const storage = multer.memoryStorage();

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Validate file type is an image
  if (!file.mimetype.startsWith('image/')) {
    return cb(new AppError('Only image files are allowed!', 400) as any, false);
  }
  cb(null, true);
};

export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // Limit size to 10MB
  },
});
