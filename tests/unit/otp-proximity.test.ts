import { describe, expect, it } from 'vitest';
import {
  OTP_PROXIMITY_VALIDATION_ENABLED,
  otpProximityForRequest,
} from '../../src/utils/otp-proximity';

const now = new Date('2026-08-07T12:00:00.000Z');

function locations(receiverLatitude: number, updatedAt = now) {
  return {
    senderCurrentLatitude: 12.9716,
    senderCurrentLongitude: 77.5946,
    senderLocationUpdatedAt: updatedAt,
    receiverCurrentLatitude: receiverLatitude,
    receiverCurrentLongitude: 77.5946,
    receiverLocationUpdatedAt: updatedAt,
  };
}

describe('OTP proximity validation', () => {
  it('allows OTP generation while proximity validation is intentionally disabled', () => {
    const result = otpProximityForRequest(locations(12.9717), now);
    expect(OTP_PROXIMITY_VALIDATION_ENABLED).toBe(false);
    expect(result.ready).toBe(true);
    expect(result.distanceMeters).toBeNull();
    expect(result.message).toContain('temporarily disabled');
  });
});
