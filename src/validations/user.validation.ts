import { z } from 'zod';
import { Role } from '@prisma/client';

export const phoneAuthSchema = z.object({
  body: z
    .object({
      phone: z.string().min(10, 'Phone number is required').max(15, 'Phone number is too long'),
      accessToken: z.string().optional(),
      reqId: z.string().optional(),
      otp: z.string().optional(),
    })
    .refine((body) => body.accessToken || (body.reqId && body.otp), {
      message: 'Provide either OTP access token or reqId with otp',
      path: ['accessToken'],
    }),
});

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Please provide a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters long'),
    name: z.string().optional(),
    phone: z.string().optional(),
    role: z.nativeEnum(Role).optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Please provide a valid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
});

export const updateUserSchema = z.object({
  body: z.object({
    email: z.string().email('Please provide a valid email address').optional(),
    name: z.string().optional(),
    phone: z.string().optional(),
    role: z.nativeEnum(Role).optional(),
    fcmToken: z.string().optional(),
  }),
});
