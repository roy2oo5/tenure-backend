import { Router } from 'express';
import userRoutes from './user.routes';
import requestRoutes from './request.routes';
import uploadRoutes from './upload.routes';
import notificationRoutes from './notification.routes';
import reportRoutes from './report.routes';
import categoryRoutes from './category.routes';
import callRoutes from './call.routes';
import { getAppStatus } from '../services/maintenance.service';

const router = Router();

// Root Health Check endpoint
router.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
  });
});

router.get('/app-status', async (_req, res, next) => {
  try {
    res.status(200).json({ status: 'success', data: await getAppStatus() });
  } catch (error) {
    next(error);
  }
});

// Register sub-routers
router.use('/users', userRoutes);
router.use('/requests', requestRoutes);
router.use('/upload', uploadRoutes);
router.use('/notifications', notificationRoutes);
router.use('/reports', reportRoutes);
router.use('/categories', categoryRoutes);
router.use('/calls', callRoutes);

export default router;
