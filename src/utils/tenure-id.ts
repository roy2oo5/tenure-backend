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

  // 3. Construct 5-character string: First 2 letters and 3 digits followed
  return pair + d1 + d2 + d3;
}

/**
 * Generates a tenure_id and ensures it is unique in the database.
 */
export async function generateUniqueTenureId(): Promise<string> {
  let isUnique = false;
  let tenureId = '';

  while (!isUnique) {
    tenureId = generateRawTenureId();
    const existing = await prisma.user.findUnique({
      where: { tenureId },
    });
    if (!existing) {
      isUnique = true;
    }
  }

  return tenureId;
}
