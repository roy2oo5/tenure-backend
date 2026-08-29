import { Router } from 'express';
import { CallController } from '../controllers/call.controller';
import { protect } from '../middlewares/auth.middleware';

const router = Router();

// Protected call routes for mobile / frontend clients
router.use(protect);

router.get('/history', CallController.getHistory);
router.get('/limit/:mateUserId', CallController.getLimit);
router.get('/turn-credentials', CallController.getTurnCredentials);

export default router;
