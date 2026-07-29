import { z } from 'zod';

const optionalNumber = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  });

export const discoverSearchSchema = z.object({
  query: z.object({
    q: z.string().optional(),
    district: z.string().optional(),
    category: z.string().optional(),
    languages: z.string().optional(),
    latitude: optionalNumber,
    longitude: optionalNumber,
    currentLatitude: optionalNumber,
    currentLongitude: optionalNumber,
    gender: z.enum(['all', 'male', 'female']).optional(),
    ageRange: z.enum(['all', 'under30', '30to45', 'over45']).optional(),
    hourlyRateRange: z.enum(['all', 'under70', '70to200', '200to300', 'custom']).optional(),
    customHourlyRateMin: optionalNumber,
    customHourlyRateMax: optionalNumber,
  }),
});

export const mateProfileParamsSchema = z.object({
  params: z.object({
    userId: z.preprocess((val) => Number(val), z.number().int('Invalid user id')),
  }),
});

export const savedMateParamsSchema = z.object({
  params: z.object({
    mateUserId: z.preprocess((val) => Number(val), z.number().int('Invalid mate user id')),
  }),
});
