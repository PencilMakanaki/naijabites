import { z } from 'zod';

export const addCartItemSchema = z.object({
  productId: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/i, 'Choose a valid product.'),
  quantity: z.number().int().min(1).max(50).default(1),
}).strict();

export const cartQuantitySchema = z.object({
  quantity: z.number().int().min(1).max(50),
}).strict();
