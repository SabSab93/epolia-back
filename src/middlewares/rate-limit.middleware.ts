import { rateLimit } from 'express-rate-limit';
import { AppError } from '@/errors/app-error';

const oneMinute = 60 * 1000;
const fifteenMinutes = 15 * oneMinute;
const oneHour = 60 * oneMinute;

// Counters are kept in memory, per client IP: enough for a single API
// instance. With several instances, they need a shared store (e.g. Redis).
function limitRequests(
  windowMs: number,
  limit: number,
  skipSuccessfulRequests = false,
) {
  return rateLimit({
    windowMs,
    limit,
    skipSuccessfulRequests,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, _response, next) => {
      next(
        new AppError(429, 'RATE_LIMITED', 'Too many requests, try again later'),
      );
    },
  });
}

/** Every API route: stops a single client from flooding the server. */
export const apiRateLimit = limitRequests(oneMinute, 120);

/** Login: only failed attempts count, to slow down password guessing. */
export const loginRateLimit = limitRequests(fifteenMinutes, 10, true);

/** Registration: limits mass sign-ups and the confirmation e-mails they send. */
export const registerRateLimit = limitRequests(oneHour, 10);
