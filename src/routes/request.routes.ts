import { Router } from 'express';
import { RequestController } from '../controllers/request.controller';
import { validate } from '../middlewares/validation.middleware';
import { protect } from '../middlewares/auth.middleware';
import { createRequestSchema, updateRequestStatusSchema } from '../validations/request.validation';

const router = Router();

// All request routes require authentication
router.use(protect);

router.post('/', validate(createRequestSchema), RequestController.create);
router.get('/', RequestController.list);
router.patch('/:id/status', validate(updateRequestStatusSchema), RequestController.updateStatus);

export default router;
