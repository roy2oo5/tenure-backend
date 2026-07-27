import { Router } from 'express';
import { CallController } from '../controllers/call.controller';
import { protect } from '../middlewares/auth.middleware';

const router = Router();

// Protect all call routes
router.use(protect);

router.get('/history', CallController.getHistory);

export default router;
