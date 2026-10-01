import { Router } from 'express';
import { RequestController } from '../controllers/request.controller';
import { SessionController } from '../controllers/session.controller';
import { validate } from '../middlewares/validation.middleware';
import { protect } from '../middlewares/auth.middleware';
import {
  createQuickPickSchema,
  createRequestSchema,
  updateRequestStatusSchema,
} from '../validations/request.validation';

const router = Router();

// All request routes require authentication
router.use(protect);

router.post('/', validate(createRequestSchema), RequestController.create);
router.post('/quick-pick', validate(createQuickPickSchema), RequestController.createQuickPick);
router.get('/quick-pick/:groupId', RequestController.quickPickStatus);
router.post('/quick-pick/:groupId/cancel', RequestController.cancelQuickPick);
router.get('/', RequestController.list);
router.get('/:id/route-metrics', RequestController.routeMetrics);
router.patch('/:id/status', validate(updateRequestStatusSchema), RequestController.updateStatus);
router.get('/:id/messages', RequestController.listMessages);
router.delete('/:id/messages/:messageId', RequestController.deleteMessage);

router.post('/:id/session/start', SessionController.start);
router.post('/:id/session/pause-request', SessionController.pauseRequest);
router.post('/:id/session/pause-confirm', SessionController.pauseConfirm);
router.post('/:id/session/resume-request', SessionController.resumeRequest);
router.post('/:id/session/resume-confirm', SessionController.resumeConfirm);
router.post('/:id/session/end', SessionController.end);
router.post('/:id/session/end-confirm', SessionController.endConfirm);
router.get('/:id/session', SessionController.get);
router.post('/:id/session/feedback', SessionController.feedback);
router.post('/:id/session/mock-payment', SessionController.completeMockPayment);

export default router;
