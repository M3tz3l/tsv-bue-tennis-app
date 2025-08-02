// Runtime validation schemas (alternative to TypeScript)
// npm install zod

import { z } from 'zod';

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const LoginResponseSchema = z.object({
  success: z.boolean(),
  token: z.string(),
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email()
  })
});

export const CreateWorkHourRequestSchema = z.object({
  date: z.string(),
  description: z.string().min(1),
  hours: z.number().positive()
});

export const WorkHourResponseSchema = z.object({
  id: z.string(),
  date: z.string(),
  description: z.string(),
  duration_seconds: z.number()
});

// Usage in service:
export const validateLoginResponse = (data) => {
  try {
    return LoginResponseSchema.parse(data);
  } catch (error) {
    console.error('Invalid API response format:', error);
    throw new Error('API response format mismatch');
  }
};
