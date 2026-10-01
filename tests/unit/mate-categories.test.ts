import { describe, expect, it } from 'vitest';
import {
  canonicalCategoryLabel,
  MATE_CATEGORIES,
  profileMatchesCategory,
} from '../../src/constants/mate-categories';

describe('mate category matching', () => {
  it('treats Support Based on Request as matching every specific support type', () => {
    expect(profileMatchesCategory(['Support Based on Request'], 'Shopping Support')).toBe(true);
    expect(profileMatchesCategory(['Support Based on Request'], 'Hospital Support')).toBe(true);
  });

  it('keeps specific support profiles scoped to their selected categories', () => {
    expect(profileMatchesCategory(['Shopping Support'], 'Shopping Support')).toBe(true);
    expect(profileMatchesCategory(['Shopping Support'], 'Hospital Support')).toBe(false);
  });

  it('recognizes Tech & Education Support and its common aliases', () => {
    expect(profileMatchesCategory(['Tech & Education Support'], 'tech-education')).toBe(true);
    expect(profileMatchesCategory(['Tech & Education Support'], 'technology support')).toBe(true);
    expect(profileMatchesCategory(['Shopping Support'], 'Tech & Education Support')).toBe(false);
  });

  it('keeps the product-defined category order', () => {
    expect(MATE_CATEGORIES.map((category) => category.label)).toEqual([
      'Support Based on Request',
      'Hospital Support',
      'Shopping Support',
      'Day Activity Support',
      'Gym, Yoga & Jogging Support',
      'Pub, Party & Event Support',
      'Friendly & Emotional Support',
      'Tourist Guide Support',
      'Tech & Education Support',
      'Driving Support',
      'Sports Support',
      'Travel Support',
      'Clean-up Support',
    ]);
  });

  it('maps legacy category labels to their renamed categories', () => {
    expect(profileMatchesCategory(['Holiday & Travel Support'], 'Travel Support')).toBe(true);
    expect(profileMatchesCategory(['Home Clean-up Support'], 'Clean-up Support')).toBe(true);
    expect(
      profileMatchesCategory(['Newcomer & Consultant Support'], 'Tourist Guide Support'),
    ).toBe(true);
  });

  it('returns canonical labels for API responses', () => {
    expect(canonicalCategoryLabel('Newcomer & Consultant Support')).toBe(
      'Tourist Guide Support',
    );
    expect(canonicalCategoryLabel('Holiday & Travel Support')).toBe('Travel Support');
    expect(canonicalCategoryLabel('Home Clean-up Support')).toBe('Clean-up Support');
  });
});
