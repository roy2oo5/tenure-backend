import { prisma } from '../config/database';

/**
 * Generates a 5-character string containing exactly 2 adjacent uppercase letters
 * at a random starting index, and 3 digits.
 * E.g., "AB123", "1AB23", "12AB3", "123AB"
 */
export function generateRawTenureId(): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';

  // 1. Generate 2 random letters
  const l1 = letters[Math.floor(Math.random() * letters.length)];
  const l2 = letters[Math.floor(Math.random() * letters.length)];
  const pair = l1 + l2;

  // 2. Generate 3 random digits
  const d1 = digits[Math.floor(Math.random() * digits.length)];
  const d2 = digits[Math.floor(Math.random() * digits.length)];
  const d3 = digits[Math.floor(Math.random() * digits.length)];

  // 3. Randomly choose starting index for the 2 consecutive letters (0 or 3)
  // 0 places the letters at the beginning, 3 places them at the end.
  const letterPos = Math.random() < 0.5 ? 0 : 3;

  // 4. Construct the 5-character string
  let result = '';
  let digitIdx = 0;
  const digitsArr = [d1, d2, d3];

  for (let i = 0; i < 4; i++) {
    if (i === letterPos) {
      result += pair;
    } else {
      result += digitsArr[digitIdx++];
    }
  }

  return result;
}

/**
 * Generates a tenure_id and ensures it is unique in the database.
 */
export async function generateUniqueTenureId(): Promise<string> {
  let isUnique = false;
  let tenureId = '';

  while (!isUnique) {
    tenureId = generateRawTenureId();
    const existing = await prisma.profile.findUnique({
      where: { tenureId },
    });
    if (!existing) {
      isUnique = true;
    }
  }

  return tenureId;
}
