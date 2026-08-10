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
      responseTime: z.number().int('Response time must be 10, 20, or 30 minutes').optional(),
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
        const durationMinutes =
          (body.toDateTime.getTime() - body.fromDateTime.getTime()) / 60000;
        if (![30, 45, 60, 75, 90, 105, 120].includes(durationMinutes)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['toDateTime'],
            message: 'Support duration must be between 30 minutes and 2 hours',
          });
        }
      }
      if (
        body.instantBooking &&
        (body.responseTime === undefined || ![10, 20, 30].includes(body.responseTime))
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['responseTime'],
          message: 'Response time must be 10, 20, or 30 minutes',
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
