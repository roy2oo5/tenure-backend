import { describe, expect, it } from 'vitest';
import { otpProximityForRequest } from '../../src/utils/otp-proximity';

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
  it('allows OTP generation when both fresh locations are within 20 metres', () => {
    const result = otpProximityForRequest(locations(12.9717), now);
    expect(result.ready).toBe(true);
    expect(result.distanceMeters).toBeLessThanOrEqual(20);
  });

  it('blocks OTP generation when users are farther than 20 metres', () => {
    const result = otpProximityForRequest(locations(12.9720), now);
    expect(result.ready).toBe(false);
    expect(result.distanceMeters).toBeGreaterThan(20);
  });

  it('blocks OTP generation when either live location is stale', () => {
    const stale = new Date(now.getTime() - 61_000);
    const result = otpProximityForRequest(locations(12.9717, stale), now);
    expect(result.ready).toBe(false);
    expect(result.distanceMeters).toBeNull();
  });
});
