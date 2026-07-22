import { Router } from 'express';
import { DiditWebhookController } from '../controllers/didit-webhook.controller';

const router = Router();

router.post('/', DiditWebhookController.handle);

export default router;
