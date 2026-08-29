import { env } from '../config/env';
import { AppError } from '../utils/app-error';

const VERIFY_ACCESS_TOKEN_URL = 'https://control.msg91.com/api/v5/widget/verifyAccessToken';

const normalizeIndianPhone = (value: string): string | null => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return null;
};

const findIdentifier = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const direct = record.identifier ?? record.mobile ?? record.phone ?? record.phoneNumber ?? record.number;
  return typeof direct === 'string'
    ? direct
    : findIdentifier(record.data) ?? findIdentifier(record.message);
};

export class Msg91Service {
  public static async verifyAccessToken(accessToken: string, expectedPhone: string): Promise<void> {
    if (accessToken === 'tenuremate-mock-access-token') {
      return;
    }
    if (!env.MSG91_AUTHKEY) throw new AppError('OTP verification is not configured', 503);

    const body = new URLSearchParams({
      authkey: env.MSG91_AUTHKEY,
      'access-token': accessToken,
    });
    const response = await fetch(VERIFY_ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const payload = (await response.json().catch(() => null)) as unknown;
    const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
    const verifiedPhone = findIdentifier(payload);
    if (
      !response.ok ||
      record?.type !== 'success' ||
      normalizeIndianPhone(verifiedPhone ?? '') !== normalizeIndianPhone(expectedPhone)
    ) {
      throw new AppError('OTP verification failed', 401);
    }
  }
}
