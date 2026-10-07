import { z } from 'zod';

const nullableNumber = (schema: z.ZodNumber) =>
  z.preprocess((arg) => {
    if (arg === null || arg === undefined || arg === '') {
      return null;
    }
    return typeof arg === 'string' ? Number(arg) : arg;
  }, schema.optional().nullable());

export const createRequestSchema = z.object({
  body: z
    .object({
      receiverId: z.coerce
        .number()
        .int('Invalid mate user ID format')
        .positive('Invalid mate user ID format'),
      categoryId: z.string().min(1, 'Category ID is required'),
      categoryLabel: z.string().min(1, 'Category label is required'),
      meetLocation: z.string().min(1, 'Meeting location is required'),
      meetLocationLatitude: nullableNumber(z.number().min(-90).max(90)),
      meetLocationLongitude: nullableNumber(z.number().min(-180).max(180)),
      fromDateTime: z.preprocess(
        (arg) => (typeof arg === 'string' ? new Date(arg) : arg),
        z.date({
          required_error: 'From date/time is required',
          invalid_type_error: 'Invalid from date/time format',
        }),
      ),
      toDateTime: z.preprocess(
        (arg) => (typeof arg === 'string' ? (arg.trim() ? new Date(arg) : null) : arg),
        z
          .date({
            invalid_type_error: 'Invalid to date/time format',
          })
          .optional()
          .nullable(),
      ),
      timezoneOffsetMinutes: z
        .number()
        .int('Timezone offset must be a whole number of minutes')
        .min(-840)
        .max(840)
        .optional()
        .default(0),
      instantBooking: z.boolean().optional().default(false),
      responseTime: z.number().int('Invalid response time').optional(),
      responseDeadlineAt: z.preprocess(
        (arg) => (typeof arg === 'string' ? (arg.trim() ? new Date(arg) : null) : arg),
        z
          .date({
            invalid_type_error: 'Invalid response deadline format',
          })
          .optional()
          .nullable(),
      ),
      message: z.string().optional().nullable(),
      bookingFor: z.enum(['self', 'someone_else']).default('self'),
      beneficiaryName: z.string().trim().optional().nullable(),
      beneficiaryPhone: z.string().trim().optional().nullable(),
      beneficiaryRelation: z.string().trim().optional().nullable(),
      beneficiaryNote: z
        .string()
        .trim()
        .max(240, 'Note must be 240 characters or less')
        .optional()
        .nullable(),
      readyToPayTravelCharges: z.boolean().optional().default(false),
      readyToPayTip: z.boolean().optional().default(false),
      extraSupportAmount: z.number().positive().max(100000).optional().nullable(),
      needsMateVehicle: z.boolean().optional().default(false),
      offersRequesterVehicle: z.boolean().optional().default(false),
      neededMateVehicleTypes: z
        .array(z.enum(['two_wheeler', 'four_wheeler']))
        .max(2)
        .optional()
        .default([]),
      offeredRequesterVehicleType: z.enum(['two_wheeler', 'four_wheeler']).optional().nullable(),
    })
    .superRefine((body, ctx) => {
      if (body.toDateTime && body.toDateTime <= body.fromDateTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['toDateTime'],
          message: 'End date/time must be after start date/time',
        });
      }
      if (!body.toDateTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['toDateTime'],
          message: 'Support duration is required',
        });
      } else {
        const durationMinutes = (body.toDateTime.getTime() - body.fromDateTime.getTime()) / 60000;
        const isValidDuration = body.instantBooking
          ? durationMinutes >= 30 && durationMinutes <= 12 * 60 && durationMinutes % 30 === 0
          : [30, 45, 60, 75, 90, 105, 120].includes(durationMinutes);
        if (!isValidDuration) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['toDateTime'],
            message: body.instantBooking
              ? 'Ready Now support duration must be in 30-minute intervals from 30 minutes to 12 hours'
              : 'Support duration must be between 30 minutes and 2 hours',
          });
        }
      }
      if (
        body.instantBooking &&
        (body.responseTime === undefined || ![5, 8, 10, 12, 15, 20].includes(body.responseTime))
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['responseTime'],
          message: 'Response time must be 5, 8, 10, 12, 15, or 20 minutes',
        });
      }
      if (body.bookingFor !== 'someone_else') {
        return;
      }
      if (!body.beneficiaryName?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['beneficiaryName'],
          message: 'Person name is required',
        });
      }
    }),
});

export const createQuickPickSchema = z.object({
  body: z.object({
    bookingFor: z.enum(['self', 'someone_else']).default('self'),
    beneficiaryName: z.string().trim().optional().nullable(),
    beneficiaryPhone: z.string().trim().max(30).optional().nullable(),
    beneficiaryRelation: z.string().trim().max(100).optional().nullable(),
    beneficiaryNote: z.string().trim().max(240).optional().nullable(),
    message: z.string().trim().max(240).optional().nullable(),
    readyToPayTravelCharges: z.boolean().optional().default(false),
    readyToPayTip: z.boolean().optional().default(false),
    extraSupportAmount: z.number().positive().max(100000).optional().nullable(),
    neededMateVehicleTypes: z.array(z.enum(['two_wheeler', 'four_wheeler'])).max(2).optional().default([]),
    offeredRequesterVehicleType: z.enum(['two_wheeler', 'four_wheeler']).optional().nullable(),
    category: z.string().trim().min(1).max(100),
    meetLocation: z.string().trim().min(1).max(300),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    hourlyRate: z.number().positive().max(100000),
    durationMinutes: z
      .number()
      .int()
      .min(30)
      .max(720)
      .refine((value) => value % 30 === 0),
    responseTime: z
      .number()
      .int()
      .refine((value) => [5, 8, 10, 12, 15, 20].includes(value)),
    radiusKm: z
      .number()
      .int()
      .refine((value) => value >= 10 && value <= 100 && value % 10 === 0)
      .default(50),
    timezoneOffsetMinutes: z.number().int().min(-840).max(840),
  }),
});

export const updateRequestStatusSchema = z.object({
  body: z.object({
    status: z.enum(['confirmed', 'declined', 'cancelled'], {
      errorMap: () => ({ message: "Status must be 'confirmed', 'declined', or 'cancelled'" }),
    }),
    cancellationReason: z
      .string()
      .trim()
      .max(240, 'Cancellation reason must be 240 characters or less')
      .optional(),
    hourlyRate: z.number().positive().max(100000).optional(),
  }),
});
