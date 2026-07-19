import { Router } from 'express';
import { protect } from '../middlewares/auth.middleware';
import { UploadController } from '../controllers/upload.controller';
import { uploadMiddleware } from '../middlewares/upload.middleware';

const router = Router();

// Endpoint: GET /api/upload/media/:key
// Serves uploaded media through the backend, including private S3 objects.
router.get('/media/:key', UploadController.getUploadedFile);

// Endpoint: POST /api/upload
// Requires auth header and multipart file upload under key name "file"
router.post('/', protect, uploadMiddleware.single('file'), UploadController.uploadFile);

export default router;
