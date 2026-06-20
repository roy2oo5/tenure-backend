import { z } from 'zod';

const stringArray = z.array(z.string().min(1)).optional().nullable();

export const createProfileSchema = z.object({
  body: z.object({
    profilePhoto: z.string().optional().nullable(),
    fullName: z.string().min(1, 'Full name is required'),
    dob: z.preprocess(
      (arg) => (typeof arg === 'string' ? new Date(arg) : arg),
      z.date({
        required_error: 'Date of birth is required',
        invalid_type_error: 'Invalid date of birth format',
      })
    ),
    gender: z.string().min(1, 'Gender is required'),
    country: z.string().min(1, 'Country is required'),
    state: z.string().min(1, 'State is required'),
    district: z.string().min(1, 'District is required'),
    pinCode: z.string().min(1, 'PIN Code is required'),
    languages: z.array(z.string().min(1, 'Language cannot be empty')).min(1, 'At least one language is required'),
    categories: z.array(z.string().min(1, 'Category name cannot be empty')).optional().nullable(),
    hourlyRate: z.number().min(0, 'Hourly rate must be a non-negative number').optional().nullable(),
    about: z.string().optional().nullable(),
    vibes: stringArray,
    professions: stringArray,
    vehicles: stringArray,
    interests: stringArray,
    availableDays: stringArray,
    availableTimeRange: z.string().optional().nullable(),
    bestTime: z.string().optional().nullable(),
    comfortPreferredPlaces: z.string().optional().nullable(),
    comfortTravelRange: z.string().optional().nullable(),
    comfortWith: z.string().optional().nullable(),
    comfortNotWith: z.string().optional().nullable(),
    aadhaarVerified: z.boolean().optional(),
    aadhaarMasked: z.string().optional().nullable(),
  }),
});
