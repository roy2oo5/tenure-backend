import { Router } from 'express';
import { protect } from '../middlewares/auth.middleware';
import { NotificationController } from '../controllers/notification.controller';

const router = Router();

// Secure all endpoints below with protect middleware
router.use(protect);

router.get('/', NotificationController.getNotifications);
router.post('/:id/read', NotificationController.markRead);
router.post('/read-all', NotificationController.markAllRead);

export default router;
