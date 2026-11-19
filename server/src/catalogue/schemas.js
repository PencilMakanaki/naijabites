import { z } from 'zod';

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/, 'Not a valid name');
const search = z.string().trim().max(80).transform((v) => v || undefined);

export const productsQuery = z.object({
  market: z.string().regex(/^[a-z_]{2,30}$/).optional(),
  category: slug.optional(),
  vendor: slug.optional(),
  q: search.optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(200).optional(),
}).strict();

export const vendorsQuery = z.object({
  q: search.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

export const suggestQuery = z.object({ q: z.string().trim().min(2).max(60) }).strict();
export const productIdParam = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
export const vendorSlugParam = slug;
