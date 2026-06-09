import { z } from 'zod';
import { Role } from '@prisma/client';

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Please provide a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters long'),
    name: z.string().optional(),
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
    role: z.nativeEnum(Role).optional(),
  }),
});
