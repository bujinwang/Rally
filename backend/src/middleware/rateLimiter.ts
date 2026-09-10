import rateLimit from 'express-rate-limit';

/**
 * Rate limiter configurations per endpoint
 * - windowMs: time window for counting requests
 * - max: maximum requests allowed in that window
 * - message: response when rate limit exceeded
 * - standard headers: `RateLimit-*` headers
 * - legacy headers: `x-rate-limit-*` headers (for backward compatibility)
 */

/**
 * General API rate limiter: 100 requests per 15 minutes
 */
export const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    error: 'RATE_LIMITED',
    message: 'Too many requests from this IP, please try again after 15 minutes.',
  },
  standardHeaders: true, // RateLimit-Rate, RateLimit-Period, RateLimit-Remaining, RateLimit-Reset
  legacyHeaders: true, // X-RateLimit-Rate, X-RateLimit-Period, X-RateLimit-Remaining, X-RateLimit-Reset
});

/**
 * Strict rate limiter: 30 requests per 15 minutes
 * Used for session creation and other sensitive operations
 */
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: {
    error: 'RATE_LIMITED',
    message: 'Too many requests from this IP, please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: true,
});

/**
 * Moderate rate limiter: 60 requests per 15 minutes
 * Used for discovery and friend suggestions
 */
export const moderateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60,
  message: {
    error: 'RATE_LIMITED',
    message: 'Too many requests from this IP, please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: true,
});

/**
 * Permissions middleware rate limiter: 10 requests per 15 minutes
 * Used for ownerDeviceId and role-related operations
 */
export const permissionsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: {
    error: 'RATE_LIMITED',
    message: 'Too many permission-related requests, please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: true,
});

/**
 * Helper function to apply rate limiter to a route handler
 * @param limiter - The rate limiter to apply
 * @returns Express middleware function
 */
export const applyRateLimiter = (limiter: typeof generalApiLimiter) => {
  return (req: any, res: any, next: any) => {
    limiter(req, res, next);
  };
};

export default {
  generalApiLimiter,
  strictLimiter,
  moderateLimiter,
  permissionsLimiter,
  applyRateLimiter,
};