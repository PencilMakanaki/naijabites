// Request schemas shared by the browser forms and the API. Unknown fields are rejected.
import { z } from 'zod';
import { ROLES } from './constants.js';
import {
  MESSAGES, isValidEmail, isValidFullName, normalizeEmail, normalizeName, normalizePhone, passwordProblem,
} from './rules.js';

export const emailField = z
  .string({ required_error: MESSAGES.email, invalid_type_error: MESSAGES.email })
  .transform(normalizeEmail)
  .refine(isValidEmail, MESSAGES.email);

const nameField = z
  .string({ required_error: MESSAGES.name, invalid_type_error: MESSAGES.name })
  .transform(normalizeName)
  .refine(isValidFullName, MESSAGES.name);

export const passwordField = z
  .string({ required_error: MESSAGES.password, invalid_type_error: MESSAGES.password })
  .superRefine((value, ctx) => {
    const problem = passwordProblem(value);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  });

// An empty string means "no phone number" and becomes null.
const phoneField = z.string({ invalid_type_error: MESSAGES.phone }).transform((value, ctx) => {
  const result = normalizePhone(value);
  if (!result.ok) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.message });
    return z.NEVER;
  }
  return result.value;
});

const tokenField = z.string({ required_error: 'This link is not valid.' }).min(20, 'This link is not valid.').max(100, 'This link is not valid.');
const currentPasswordField = z.string({ required_error: 'Enter your password.' }).min(1, 'Enter your password.').max(256);

export const loginSchema = z
  .object({ email: emailField, password: currentPasswordField, area: z.enum(ROLES).default('customer') })
  .strict();

export const registerSchema = z
  .object({ name: nameField, email: emailField, phone: phoneField.optional(), password: passwordField })
  .strict();

export const forgotPasswordSchema = z.object({ email: emailField }).strict();
export const resetPasswordSchema = z.object({ token: tokenField, password: passwordField }).strict();
export const tokenSchema = z.object({ token: tokenField }).strict();
export const changePasswordSchema = z.object({ currentPassword: currentPasswordField, newPassword: passwordField }).strict();
export const profileSchema = z
  .object({ name: nameField.optional(), phone: phoneField.optional() })
  .strict()
  .refine((v) => v.name !== undefined || v.phone !== undefined, { message: 'Nothing to update.' });
export const emailChangeSchema = z.object({ newEmail: emailField, password: currentPasswordField }).strict();
