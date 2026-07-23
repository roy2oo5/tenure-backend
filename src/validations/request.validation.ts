import { z } from 'zod';

export const createRequestSchema = z.object({
  body: z
    .object({
      receiverId: z.string().uuid('Invalid mate user ID format'),
      categoryId: z.string().min(1, 'Category ID is required'),
      categoryLabel: z.string().min(1, 'Category label is required'),
      meetLocation: z.string().min(1, 'Meeting location is required'),
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
      if (!body.beneficiaryPhone?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['beneficiaryPhone'],
          message: 'Person phone is required',
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
  }),
});
