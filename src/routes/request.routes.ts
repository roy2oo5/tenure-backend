import { Router } from 'express';
import { RequestController } from '../controllers/request.controller';
import { SessionController } from '../controllers/session.controller';
import { validate } from '../middlewares/validation.middleware';
import { protect } from '../middlewares/auth.middleware';
import { createRequestSchema, updateRequestStatusSchema } from '../validations/request.validation';

const router = Router();

// All request routes require authentication
router.use(protect);

router.post('/', validate(createRequestSchema), RequestController.create);
router.get('/', RequestController.list);
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



export default router;
