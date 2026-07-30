import { generateRawTenureId } from '@/utils/tenure-id';

describe('generateRawTenureId', () => {
  it('should generate an ID of length 5 starting with T followed by 4 random uppercase letters or numbers', () => {
    for (let i = 0; i < 100; i++) {
      const id = generateRawTenureId();
      expect(id).toHaveLength(5);
      expect(id[0]).toBe('T');

      const matchesPattern = /^T[A-Z0-9]{4}$/.test(id);
      expect(matchesPattern).toBe(true);
    }
  });
});
