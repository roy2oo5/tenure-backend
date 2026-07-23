// import { env } from '../config/env';
// import { AppError } from '../utils/app-error';

// const VERIFY_ACCESS_TOKEN_URL = 'https://control.msg91.com/api/v5/widget/verifyAccessToken';
// const VERIFY_OTP_URL = 'https://control.msg91.com/api/v5/widget/verifyOtp';

/*
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
*/

export class Msg91Service {
  public static async verifyOtp(_reqId: string, _otp: string): Promise<void> {
    // Disabled for testing
    return;
  }

  public static async verifyAccessToken(_accessToken: string, _expectedPhone: string): Promise<void> {
    // Disabled for testing
    return;
  }
}
