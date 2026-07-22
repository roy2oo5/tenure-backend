import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';
import { AppError } from '../utils/app-error';
import { logger } from '../utils/logger';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function webhookSecret(): string | undefined {
  return (env.DIDIT_WEBHOOK_SECRET ?? env.DIDIT_WEBHOOK_KEY)?.trim();
}

function shortenFloats(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(shortenFloats);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, shortenFloats(child)]),
    );
  }
  if (typeof value === 'number' && !Number.isInteger(value) && value % 1 === 0) {
    return Math.trunc(value);
  }
  return value;
}

function sortKeys(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, JsonValue>>((acc, key) => {
        acc[key] = sortKeys(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function secureEqualHex(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(received, 'utf8');
  return (
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

function verifySignatureV2(body: JsonValue, signature: string, timestamp: string, secret: string): boolean {
  const parsedTimestamp = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(parsedTimestamp)) {
    return false;
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parsedTimestamp) > 300) {
    return false;
  }

  const canonical = JSON.stringify(sortKeys(shortenFloats(body)));
  const expected = crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
  return secureEqualHex(expected, signature);
}

export class DiditWebhookController {
  public static async handle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const secret = webhookSecret();
      const signature = req.get('X-Signature-V2');
      const timestamp = req.get('X-Timestamp');

      if (!secret) {
        return next(new AppError('Didit webhook secret is not configured.', 503));
      }
      if (!signature || !timestamp) {
        return next(new AppError('Missing Didit webhook signature headers.', 401));
      }
      if (!Buffer.isBuffer(req.body)) {
        return next(new AppError('Didit webhook requires raw JSON body.', 400));
      }

      const body = JSON.parse(req.body.toString('utf8')) as JsonValue;
      if (!verifySignatureV2(body, signature, timestamp, secret)) {
        return next(new AppError('Invalid Didit webhook signature.', 401));
      }

      if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
        logger.info('Didit webhook received', {
          eventId: body.event_id,
          webhookType: body.webhook_type,
          status: body.status,
          sessionId: body.session_id,
          vendorData: body.vendor_data,
        });
      }

      res.status(200).json({ ok: true });
    } catch (error) {
      if (error instanceof SyntaxError) {
        return next(new AppError('Invalid Didit webhook JSON body.', 400));
      }
      next(error);
    }
  }
}
