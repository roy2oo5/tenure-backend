import { Request, Response, NextFunction } from 'express';
import twilio from 'twilio';
import { CallService } from '../services/call.service';
import { AppError } from '../utils/app-error';
import { env } from '../config/env';

export class CallController {
  public static async getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated.', 401));
      }
      const history = await CallService.getCallHistory(req.user.id);
      res.status(200).json({
        status: 'success',
        data: { calls: history },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Step A: Access Token Endpoint
   * Issues a Twilio Voice AccessToken JWT to frontend/mobile clients to register with Twilio.
   */
  public static getTwilioToken(req: Request, res: Response, next: NextFunction): void {
    try {
      const accountSid = env.TWILIO_ACCOUNT_SID;
      const apiKey = env.TWILIO_API_KEY;
      const apiSecret = env.TWILIO_API_SECRET;
      const twimlAppSid = env.TWILIO_TWIML_APP_SID;

      if (!accountSid || !apiKey || !apiSecret || !twimlAppSid) {
        return next(
          new AppError(
            'Twilio Voice credentials (TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET, TWILIO_TWIML_APP_SID) are not fully configured in environment variables.',
            500
          )
        );
      }

      const identity =
        (req.query.identity as string) ||
        (req.user ? `user_${req.user.id}` : 'user_anonymous');

      const AccessToken = twilio.jwt.AccessToken;
      const VoiceGrant = AccessToken.VoiceGrant;

      const voiceGrant = new VoiceGrant({
        outgoingApplicationSid: twimlAppSid,
        incomingAllow: true,
      });

      const token = new AccessToken(accountSid, apiKey, apiSecret, { identity });
      token.addGrant(voiceGrant);

      res.status(200).json({
        status: 'success',
        data: {
          token: token.toJwt(),
          identity,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Step B: TwiML Webhook Endpoint
   * Twilio hits this HTTP endpoint when Client A dials Client B to get TwiML instructions.
   */
  public static twilioVoiceWebhook(req: Request, res: Response): void {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const twiml = new VoiceResponse();

    const targetUser = req.body?.To || req.query?.To;

    if (targetUser) {
      const dial = twiml.dial();
      dial.client(targetUser);
    } else {
      twiml.say({ voice: 'alice' }, 'Thank you for calling TenureMate.');
    }

    res.type('text/xml');
    res.status(200).send(twiml.toString());
  }
}
