import { z } from 'zod';

export const createRequestSchema = z.object({
  body: z.object({
    receiverId: z.string().uuid('Invalid mate user ID format'),
    categoryId: z.string().min(1, 'Category ID is required'),
    categoryLabel: z.string().min(1, 'Category label is required'),
    meetLocation: z.string().min(1, 'Meeting location is required'),
    fromDateTime: z.preprocess(
      (arg) => (typeof arg === 'string' ? new Date(arg) : arg),
      z.date({
        required_error: 'From date/time is required',
        invalid_type_error: 'Invalid from date/time format',
      })
    ),
    toDateTime: z.preprocess(
      (arg) => (typeof arg === 'string' ? new Date(arg) : arg),
      z.date({
        required_error: 'To date/time is required',
        invalid_type_error: 'Invalid to date/time format',
      })
    ),
    message: z.string().optional().nullable(),
  }),
});

export const updateRequestStatusSchema = z.object({
  body: z.object({
    status: z.enum(['confirmed', 'declined', 'cancelled'], {
      errorMap: () => ({ message: "Status must be 'confirmed', 'declined', or 'cancelled'" }),
    }),
  }),
});
