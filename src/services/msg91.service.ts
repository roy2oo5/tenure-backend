import { env } from '../config/env';
import { AppError } from '../utils/app-error';

const VERIFY_ACCESS_TOKEN_URL = 'https://control.msg91.com/api/v5/widget/verifyAccessToken';
const VERIFY_OTP_URL = 'https://control.msg91.com/api/v5/widget/verifyOtp';

type Msg91VerifyAccessTokenResponse = {
  type?: string;
  message?: unknown;
  data?: unknown;
  identifier?: unknown;
};

type Msg91VerifyOtpResponse = {
  type?: string;
  message?: unknown;
};

const normalizeIndianPhone = (value: string): string | null => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return null;
};

const findIdentifier = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return value;
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const direct =
    record.identifier ?? record.mobile ?? record.phone ?? record.phoneNumber ?? record.number;

  if (typeof direct === 'string') {
    return direct;
  }

  return findIdentifier(record.data) ?? findIdentifier(record.message);
};

export class Msg91Service {
  public static async verifyOtp(reqId: string, otp: string): Promise<void> {
    if (!env.MSG91_WIDGET_ID || !env.MSG91_WIDGET_TOKEN_AUTH) {
      throw new AppError('MSG91 widget credentials are not configured', 500);
    }

    const response = await fetch(VERIFY_OTP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        widgetId: env.MSG91_WIDGET_ID,
        tokenAuth: env.MSG91_WIDGET_TOKEN_AUTH,
        reqId,
        otp,
      }),
    });

    let payload: Msg91VerifyOtpResponse;
    try {
      payload = (await response.json()) as Msg91VerifyOtpResponse;
    } catch {
      throw new AppError('MSG91 OTP verification failed', 502);
    }

    if (!response.ok || payload.type !== 'success') {
      const message = typeof payload.message === 'string' ? payload.message : 'Invalid OTP';
      throw new AppError(message, 401);
    }
  }

  public static async verifyAccessToken(accessToken: string, expectedPhone: string): Promise<void> {
    if (!env.MSG91_AUTHKEY) {
      throw new AppError('MSG91 authkey is not configured', 500);
    }

    const response = await fetch(VERIFY_ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        authkey: env.MSG91_AUTHKEY,
        'access-token': accessToken,
      }),
    });

    let payload: Msg91VerifyAccessTokenResponse;
    try {
      payload = (await response.json()) as Msg91VerifyAccessTokenResponse;
    } catch {
      throw new AppError('MSG91 access token verification failed', 502);
    }

    if (!response.ok || payload.type !== 'success') {
      throw new AppError('Invalid or expired OTP access token', 401);
    }

    const identifier = findIdentifier(payload);
    const verifiedPhone = identifier ? normalizeIndianPhone(identifier) : null;
    const requestedPhone = normalizeIndianPhone(expectedPhone);

    if (!verifiedPhone || !requestedPhone || verifiedPhone !== requestedPhone) {
      throw new AppError('OTP access token does not match this phone number', 401);
    }
  }
}
