import { Router } from 'express';
import userRoutes from './user.routes';
import requestRoutes from './request.routes';
import uploadRoutes from './upload.routes';

const router = Router();

// Root Health Check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
  });
});

// Register sub-routers
router.use('/users', userRoutes);
router.use('/requests', requestRoutes);
router.use('/upload', uploadRoutes);

export default router;
