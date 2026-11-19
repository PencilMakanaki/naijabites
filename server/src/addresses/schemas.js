
import { z } from 'zod';

const text = (min, max, label) =>
  z.string().trim().min(min, `${label} is required.`).max(max, `${label} is too long.`);

const optionalText = (max) =>
  z.string().trim().max(max, 'This field is too long.')
    .optional()
    .or(z.literal(''))
    .transform((v) => v || null);

const phone = z.string()
  .trim()
  .regex(/^\+?[0-9][0-9\s().-]{6,18}[0-9]$/, 'Enter a valid phone number.')
  .transform((v) => v.replace(/[\s().-]/g, ''));

const addressObject = z.object({
  recipientName: text(2, 80, 'Recipient name'),
  phone,
  addressLine1: text(5, 200, 'Street address'),
  addressLine2: optionalText(200),
  area: text(2, 80, 'Area'),
  city: text(2, 80, 'City'),
  state: text(2, 80, 'State'),
  landmark: optionalText(160),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  deliveryInstructions: optionalText(500),
  isDefault: z.boolean().optional().default(false),
}).strict();

const validateCoordinates = (value) =>
  (value.latitude == null) === (value.longitude == null);

export const addressSchema = addressObject.refine(
  validateCoordinates,
  {
    message: 'Latitude and longitude must be provided together.',
  },
);

export const addressUpdateSchema = addressObject
  .partial()
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    { message: 'Nothing to update.' },
  )
  .refine(
    validateCoordinates,
    {
      message: 'Latitude and longitude must be provided together.',
    },
  );