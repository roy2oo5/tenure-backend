import { describe, expect, it } from 'vitest';
import { profileMatchesCategory } from '../../src/constants/mate-categories';

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
});
