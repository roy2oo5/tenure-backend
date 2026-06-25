import { Router } from 'express';
import { protect } from '../middlewares/auth.middleware';
import { UploadController } from '../controllers/upload.controller';
import { uploadMiddleware } from '../middlewares/upload.middleware';

const router = Router();

// Endpoint: POST /api/upload
// Requires auth header and multipart file upload under key name "file"
router.post('/', protect, uploadMiddleware.single('file'), UploadController.uploadFile);

export default router;
