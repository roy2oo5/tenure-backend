import { prisma } from '../config/database';

/**
 * Generates a 5-character string where the first letter is 'T'
 * and the remaining 4 characters are random uppercase letters or numbers (A-Z, 0-9).
 * E.g., "T1SA2", "T9U37"
 */
export function generateRawTenureId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'T';
  for (let i = 0; i < 4; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
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
    const existing = await prisma.user.findUnique({
      where: { tenureId },
    });
    if (!existing) {
      isUnique = true;
    }
  }

  return tenureId;
}
