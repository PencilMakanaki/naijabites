import { rateLimit } from 'express-rate-limit';
import { AppError } from './errors.js';

// In-memory counters: correct for one server. Move to a shared store if we ever run several.
export function limiter({ windowMs, limit, message = 'Too many requests. Please try again later.' }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res, next) => next(new AppError(429, 'rate_limited', message)),
  });
}
