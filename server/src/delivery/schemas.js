import { z } from 'zod';

const text = (min, max, label) =>
  z.string()
    .trim()
    .min(min, `${label} is required.`)
    .max(max, `${label} is too long.`);

export const deliveryZoneSchema = z.object({
  zoneName: text(2, 100, 'Zone name'),
  state: text(2, 80, 'State'),
  city: text(2, 80, 'City'),
  area: z.string()
    .trim()
    .max(80, 'Area is too long.')
    .optional()
    .default(''),
  feeKobo: z.number()
    .int('Delivery fee must be a whole number of kobo.')
    .min(0, 'Delivery fee cannot be negative.')
    .max(Number.MAX_SAFE_INTEGER, 'Delivery fee is too large.'),
}).strict();

export const deliveryZoneUpdateSchema = deliveryZoneSchema
  .partial()
  .strict()
  .refine(
    (values) => Object.keys(values).length > 0,
    { message: 'Nothing to update.' },
  );

export const deliveryZoneStatusSchema = z.object({
  status: z.enum(['active', 'inactive']),
}).strict();