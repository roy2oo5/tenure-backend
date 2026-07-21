import { Router, Request, Response, NextFunction } from 'express';
import { protect } from '../middlewares/auth.middleware';
import { UploadController } from '../controllers/upload.controller';
import { uploadMiddleware } from '../middlewares/upload.middleware';

const router = Router();

const profileUploadMiddleware = uploadMiddleware.fields([
  { name: 'profilePic', maxCount: 1 },
  { name: 'file', maxCount: 1 },
]);

const galleryUploadMiddleware = uploadMiddleware.fields([
  { name: 'galleryPhoto', maxCount: 1 },
  { name: 'file', maxCount: 1 },
]);

// Helper to set req.file from req.files when using fields middleware
const extractSingleFile = (fieldNamePrimary: string, fieldNameSecondary: string) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.file && req.files) {
      const filesObj = req.files as { [fieldname: string]: Express.Multer.File[] };
      req.file = filesObj[fieldNamePrimary]?.[0] || filesObj[fieldNameSecondary]?.[0];
    }
    next();
  };
};

// Generic single file upload: POST /api/upload
router.post('/', protect, uploadMiddleware.single('file'), UploadController.uploadFile);

// Profile Picture Upload with AWS Rekognition validation (1 face + adult content check)
// Routes: POST /api/upload/upload-profile, POST /api/upload/profile-picture
router.post(
  '/upload-profile',
  protect,
  profileUploadMiddleware,
  extractSingleFile('profilePic', 'file'),
  UploadController.uploadProfilePicture
);

router.post(
  '/profile-picture',
  protect,
  profileUploadMiddleware,
  extractSingleFile('profilePic', 'file'),
  UploadController.uploadProfilePicture
);

// Live Gallery Photo Upload with AWS Rekognition validation (adult content check)
// Routes: POST /api/upload/gallery, POST /api/upload/live-gallery
router.post(
  '/gallery',
  protect,
  galleryUploadMiddleware,
  extractSingleFile('galleryPhoto', 'file'),
  UploadController.uploadGalleryPhoto
);

router.post(
  '/live-gallery',
  protect,
  galleryUploadMiddleware,
  extractSingleFile('galleryPhoto', 'file'),
  UploadController.uploadGalleryPhoto
);

export default router;
