import { Request, Response } from 'express';
import { CallController } from '@/controllers/call.controller';

describe('CallController', () => {
  describe('twilioVoiceWebhook', () => {
    it('should return 200 with text/xml content type and valid TwiML client dial when To is present', () => {
      const req = {
        body: { To: 'user_bob' },
        query: {},
      } as unknown as Request;
      const res = {
        type: vi.fn().mockReturnThis(),
        status: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
      } as unknown as Response;

      CallController.twilioVoiceWebhook(req, res);

      expect(res.type).toHaveBeenCalledWith('text/xml');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith(expect.stringContaining('<Response>'));
      expect(res.send).toHaveBeenCalledWith(expect.stringContaining('<Dial>'));
      expect(res.send).toHaveBeenCalledWith(expect.stringContaining('<Client>user_bob</Client>'));
    });

    it('should return 200 with text/xml when To is not present', () => {
      const req = {
        body: {},
        query: {},
      } as unknown as Request;
      const res = {
        type: vi.fn().mockReturnThis(),
        status: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
      } as unknown as Response;

      CallController.twilioVoiceWebhook(req, res);

      expect(res.type).toHaveBeenCalledWith('text/xml');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith(expect.stringContaining('<Response>'));
      expect(res.send).toHaveBeenCalledWith(expect.stringContaining('<Say voice="alice">'));
    });
  });

  describe('getTwilioToken', () => {
    it('should return 500 if Twilio env variables are missing', () => {
      const req = {
        query: {},
      } as unknown as Request;
      const res = {} as Response;
      const next = vi.fn();

      CallController.getTwilioToken(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
        })
      );
    });
  });
});
