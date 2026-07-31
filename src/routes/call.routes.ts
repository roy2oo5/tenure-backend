import { Router } from 'express';
import { CallController } from '../controllers/call.controller';
import { protect } from '../middlewares/auth.middleware';

const router = Router();

// Step B: Public Twilio Voice Webhook HTTP Endpoints (called directly by Twilio servers)
router.all('/twilio-voice', CallController.twilioVoiceWebhook);
router.all('/voice-webhook', CallController.twilioVoiceWebhook);
router.all('/twiml', CallController.twilioVoiceWebhook);

// Protected call routes for mobile / frontend clients
router.use(protect);

// Step A: Access Token Endpoint for clients
router.get('/token', CallController.getTwilioToken);
router.get('/history', CallController.getHistory);
router.get('/limit/:mateUserId', CallController.getLimit);

export default router;
