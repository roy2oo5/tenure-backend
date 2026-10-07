import { describe, expect, it } from 'vitest';
import { createQuickPickSchema, createRequestSchema } from '../../src/validations/request.validation';

const requestBody = {
  receiverId: 1,
  categoryId: 'travel',
  categoryLabel: 'Travel Companion',
  meetLocation: 'Meeting point',
  fromDateTime: '2026-10-02T10:00:00.000Z',
  toDateTime: '2026-10-02T11:00:00.000Z',
  readyToPayTip: true,
};

const quickPickBody = {
  category: 'Travel Companion',
  meetLocation: 'Meeting point',
  latitude: 12.9716,
  longitude: 77.5946,
  hourlyRate: 500,
  durationMinutes: 60,
  responseTime: 5,
  timezoneOffsetMinutes: 330,
  readyToPayTip: true,
};

describe('extra amount payment preference', () => {
  it('allows a standard request with the preference selected and no amount', () => {
    expect(createRequestSchema.safeParse({ body: requestBody }).success).toBe(true);
  });

  it('allows a Quick Pick request with the preference selected and no amount', () => {
    expect(createQuickPickSchema.safeParse({ body: quickPickBody }).success).toBe(true);
  });

  it('still rejects an invalid amount when one is entered', () => {
    expect(
      createQuickPickSchema.safeParse({
        body: { ...quickPickBody, extraSupportAmount: -1 },
      }).success,
    ).toBe(false);
  });
});

describe('Quick Pick radius', () => {
  it('defaults to 50 km for clients that omit the radius', () => {
    const parsed = createQuickPickSchema.parse({ body: quickPickBody });
    expect(parsed.body.radiusKm).toBe(50);
  });

  it.each([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])(
    'accepts %i km',
    (radiusKm) => {
      expect(createQuickPickSchema.safeParse({ body: { ...quickPickBody, radiusKm } }).success).toBe(
        true,
      );
    },
  );

  it.each([0, 15, 101, 50.5])('rejects %s km', (radiusKm) => {
    expect(createQuickPickSchema.safeParse({ body: { ...quickPickBody, radiusKm } }).success).toBe(
      false,
    );
  });
});
