import { generateRawTenureId } from '@/utils/tenure-id';

describe('generateRawTenureId', () => {
  it('should generate an ID of length 5 with exactly 2 adjacent letters and 3 digits', () => {
    for (let i = 0; i < 100; i++) {
      const id = generateRawTenureId();
      expect(id).toHaveLength(5);

      // Check for exactly 2 uppercase letters and 3 digits
      const letters = id.replace(/[^A-Z]/g, '');
      const digits = id.replace(/[^0-9]/g, '');

      expect(letters).toHaveLength(2);
      expect(digits).toHaveLength(3);

      // Check that the format is strictly 2 letters followed by 3 digits.
      // Valid patterns: LLNNN (letters at the beginning)
      const matchesStrictPattern = /^[A-Z]{2}[0-9]{3}$/.test(id);
      expect(matchesStrictPattern).toBe(true);
    }
  });
});
