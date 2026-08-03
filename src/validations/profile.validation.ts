import { z } from 'zod';

const stringArray = z.array(z.string().min(1)).optional().nullable();
const MAX_HOURLY_RATE = 1199;
const MIN_PROFILE_AGE = 16;
const MAX_ABOUT_WORDS = 50;

const wordCount = (value: string): number => {
  const normalized = value.trim();
  return normalized ? normalized.split(/\s+/).length : 0;
};
const nullableNumber = (schema: z.ZodNumber) =>
  z.preprocess((arg) => {
    if (arg === null || arg === undefined || arg === '') {
      return null;
    }
    return typeof arg === 'string' ? Number(arg) : arg;
  }, schema.optional().nullable());

function ageFromDob(dob: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

export const createProfileSchema = z.object({
  body: z.object({
    profilePhoto: z.string().optional().nullable(),
    fullName: z.string().min(1, 'Full name is required'),
    dob: z.preprocess(
      (arg) => (typeof arg === 'string' ? new Date(arg) : arg),
      z.date({
        required_error: 'Date of birth is required',
        invalid_type_error: 'Invalid date of birth format',
      }).refine(
        (dob) => ageFromDob(dob) >= MIN_PROFILE_AGE,
        `You must be at least ${MIN_PROFILE_AGE} years old to use TenureMate`,
      ),
    ),
    gender: z.string().min(1, 'Gender is required'),
    location: z.string().optional().nullable(),
    country: z.string().min(1, 'Country is required'),
    state: z.string().min(1, 'State is required'),
    district: z.string().min(1, 'District is required'),
    pinCode: z.string().min(1, 'PIN Code is required'),
    latitude: nullableNumber(z.number().min(-90).max(90)),
    longitude: nullableNumber(z.number().min(-180).max(180)),
    languages: z
      .array(z.string().min(1, 'Language cannot be empty'))
      .min(1, 'At least one language is required'),
    categories: z.array(z.string().min(1, 'Category name cannot be empty')).optional().nullable(),
    hourlyRate: z.preprocess(
      (arg) => {
        if (arg === null || arg === undefined || arg === '') {
          return null;
        }
        return typeof arg === 'string' ? Number(arg) : arg;
      },
      z
        .number()
        .min(0, 'Hourly rate must be a non-negative number')
        .max(MAX_HOURLY_RATE, `Hourly rate must be ${MAX_HOURLY_RATE} or less`)
        .optional()
        .nullable(),
    ),
    categoryRates: z
      .record(
        z.coerce
          .number()
          .positive('Category rate must be greater than zero')
          .max(MAX_HOURLY_RATE, `Category rate must be ${MAX_HOURLY_RATE} or less`),
      )
      .optional()
      .nullable(),
    about: z
      .string()
      .refine(
        (value) => wordCount(value) <= MAX_ABOUT_WORDS,
        `About must be ${MAX_ABOUT_WORDS} words or fewer`,
      )
      .optional()
      .nullable(),
    vibes: stringArray,
    professions: stringArray,
    qualification: z.string().optional().nullable(),
    bloodGroup: z.string().optional().nullable(),
    vehicles: stringArray,
    canRideBike: z.boolean().optional().nullable(),
    willingRequesterBike: z.boolean().optional().nullable(),
    canDriveCar: z.boolean().optional().nullable(),
    willingRequesterCar: z.boolean().optional().nullable(),
    interests: stringArray,
    availableDays: stringArray,
    availableTimeRange: z.string().optional().nullable(),
    bestTime: z.string().optional().nullable(),
    comfortPreferredPlaces: z.string().optional().nullable(),
    comfortTravelRange: z.string().optional().nullable(),
    comfortWith: z.string().optional().nullable(),
    comfortNotWith: z.string().optional().nullable(),
    gallery: stringArray,
    livePhotoUrl: z.string().optional().nullable(),
    instagram: z.string().optional().nullable(),
    facebook: z.string().optional().nullable(),
    youtube: z.string().optional().nullable(),
    website: z.string().optional().nullable(),
    instantAvailable: z.boolean().optional(),
    instantAvailableUntil: z.preprocess((arg) => {
      if (arg === null || arg === undefined || arg === '') {
        return null;
      }
      return typeof arg === 'string' ? new Date(arg) : arg;
    }, z.date().optional().nullable()),
    instantCategories: stringArray,
    instantNote: z.string().optional().nullable(),
    profileVisibility: z.boolean().optional(),
    notifyRequests: z.boolean().optional(),
    notifyChat: z.boolean().optional(),
    notifyReminders: z.boolean().optional(),
    emergencyName: z.string().optional().nullable(),
    emergencyPhone: z.string().optional().nullable(),
    emergencyRelation: z.string().optional().nullable(),
  }),
});

export const verifyAadhaarSchema = z.object({
  body: z.object({
    aadhaarNumber: z
      .string()
      .transform((value) => value.replace(/\s+/g, ''))
      .pipe(z.string().regex(/^\d{12}$/, 'Enter a valid 12-digit Aadhaar number')),
    fullName: z.string().min(1, 'Full name is required'),
    dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format'),
  }),
});
