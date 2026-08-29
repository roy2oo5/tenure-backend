import { AppError } from './app-error';

export const MIN_ALLOWED_AGE = 18;
export const MAX_ALLOWED_AGE = 65;
export const AGE_RESTRICTION_MESSAGE =
  'Sorry, you are not allowed. Age limitation is applicable.';

export function calculateAgeFromDob(dob: Date, today = new Date()): number {
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const monthDifference = today.getUTCMonth() - dob.getUTCMonth();
  if (
    monthDifference < 0 ||
    (monthDifference === 0 && today.getUTCDate() < dob.getUTCDate())
  ) {
    age -= 1;
  }
  return age;
}

export function isAgeAllowed(dob: Date, today = new Date()): boolean {
  const age = calculateAgeFromDob(dob, today);
  return age >= MIN_ALLOWED_AGE && age <= MAX_ALLOWED_AGE;
}

export function enforceAgeRestriction(dob: Date | null | undefined): void {
  if (!dob || !isAgeAllowed(dob)) {
    throw new AppError(AGE_RESTRICTION_MESSAGE, 403);
  }
}
