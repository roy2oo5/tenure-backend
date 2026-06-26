import { Router } from 'express';
import { ReportController } from '../controllers/report.controller';
import { protect } from '../middlewares/auth.middleware';

const router = Router();

router.post('/', protect, ReportController.create);

export default router;
