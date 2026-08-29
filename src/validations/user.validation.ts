import { z } from 'zod';
import { Role } from '@prisma/client';

export const phoneAuthSchema = z.object({
  body: z
    .object({
      phone: z.string().min(10, 'Phone number is required').max(15, 'Phone number is too long'),
      accessToken: z.string().min(20),
      deviceId: z.string().min(16).max(128),
    })
    ,
});

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Please provide a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters long'),
    name: z.string().optional(),
    phone: z.string().optional(),
      role: z.nativeEnum(Role).optional(),
      deviceId: z.string().min(16).max(128),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Please provide a valid email address'),
      password: z.string().min(1, 'Password is required'),
      deviceId: z.string().min(16).max(128),
  }),
});

export const updateUserSchema = z.object({
  body: z.object({
    email: z.string().email('Please provide a valid email address').optional(),
    name: z.string().optional(),
    fcmToken: z.string().optional(),
  }),
});

export const refreshSessionSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(32).max(512),
    deviceId: z.string().min(16).max(128),
  }),
});
