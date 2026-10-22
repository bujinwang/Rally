import { Request, Response, NextFunction } from 'express';
import { cacheService } from '../services/cacheService';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string | null;
    role: string;
  };
}

interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (req: AuthRequest) => string;
  skipSuccessfulRequests?: boolean; // Skip rate limiting for successful requests
  skipFailedRequests?: boolean; // Skip rate limiting for failed requests
  message?: string;
  statusCode?: number;
  headers?: boolean; // Include rate limit headers in response
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export const rateLimit = (options: RateLimitOptions) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes default
    maxRequests = 100, // 100 requests default
    keyGenerator,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    message = 'Too many requests, please try again later.',
    statusCode = 429,
    headers = true
  } = options;

  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Generate rate limit key
      const key = keyGenerator
        ? keyGenerator(req)
        : generateDefaultKey(req);

      const rateLimitKey = `ratelimit:${key}`;

      // Get current rate limit data
      const rateLimitData = await cacheService.get<RateLimitEntry>(rateLimitKey);
      const now = Date.now();
      const resetTime = now + windowMs;

      let currentCount = 0;
      let currentResetTime = resetTime;

      if (rateLimitData) {
        // Check if window has expired
        if (now > rateLimitData.resetTime) {
          // Reset the counter
          currentCount = 1;
          currentResetTime = resetTime;
        } else {
          // Increment existing counter
          currentCount = rateLimitData.count + 1;
          currentResetTime = rateLimitData.resetTime;
        }
      } else {
        // First request in window
        currentCount = 1;
        currentResetTime = resetTime;
      }

      // Check if limit exceeded
      if (currentCount > maxRequests) {
        // Add rate limit headers if enabled
        if (headers) {
          res.set({
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': Math.ceil(currentResetTime / 1000).toString(),
            'Retry-After': Math.ceil((currentResetTime - now) / 1000).toString()
          });
        }

        res.status(statusCode).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message,
            retryAfter: Math.ceil((currentResetTime - now) / 1000)
          },
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Store updated rate limit data
      const newRateLimitData: RateLimitEntry = {
        count: currentCount,
        resetTime: currentResetTime
      };

      await cacheService.set(rateLimitKey, newRateLimitData, Math.ceil(windowMs / 1000));

      // Add rate limit headers if enabled
      if (headers) {
        const remaining = Math.max(0, maxRequests - currentCount);
        res.set({
          'X-RateLimit-Limit': maxRequests.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': Math.ceil(currentResetTime / 1000).toString()
        });
      }

      // Store rate limit info on request for later use
      (req as any).rateLimit = {
        limit: maxRequests,
        remaining: Math.max(0, maxRequests - currentCount),
        resetTime: currentResetTime
      };

      // Honour skipSuccessfulRequests / skipFailedRequests.
      //
      // The counter is incremented BEFORE the handler runs (that is what makes
      // the limiter resistant to concurrent bursts), so the outcome is only
      // known once the response is done. Instead of guessing from overridden
      // res.json/res.send (which used to be a no-op), decrement the counter on
      // `finish` when the outcome is meant to be free.
      if (skipSuccessfulRequests || skipFailedRequests) {
        res.on('finish', () => {
          const succeeded = res.statusCode >= 200 && res.statusCode < 300;
          const shouldSkip =
            (skipSuccessfulRequests && succeeded) ||
            (skipFailedRequests && !succeeded);

          if (!shouldSkip) return;

          void (async () => {
            try {
              const stored = await cacheService.get<RateLimitEntry>(rateLimitKey);
              if (!stored) return;

              const remainingTtlSec = Math.ceil((stored.resetTime - Date.now()) / 1000);
              if (remainingTtlSec <= 0) return;

              await cacheService.set(
                rateLimitKey,
                {
                  count: Math.max(0, stored.count - 1),
                  resetTime: stored.resetTime
                },
                remainingTtlSec
              );
            } catch (error) {
              // A missed decrement only makes the limiter slightly stricter.
              console.error('Rate limiting decrement error:', error);
            }
          })();
        });
      }

      next();
    } catch (error) {
      console.error('Rate limiting middleware error:', error);
      // Continue without rate limiting on error
      next();
    }
  };
};

// Extract the client IP, honouring proxy headers.
function extractClientIp(req: AuthRequest): string {
  return (
    req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
    req.headers['x-real-ip']?.toString() ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    req.ip ||
    'unknown'
  );
}

/**
 * Resolve an optional rate-limit ceiling from an env var.
 *
 * Production deliberately ignores these overrides: `backend/.env` is tracked in
 * git, so a value left there for local convenience (e.g. a raised auth ceiling)
 * must never be able to weaken a limiter in production. To make production
 * tunable later, drop the NODE_ENV check.
 *
 * @param name    env var holding the ceiling
 * @param nodeEnv environment to evaluate against (injectable for tests)
 */
export const resolveCeilingOverride = (
  name: string,
  nodeEnv: string | undefined = process.env.NODE_ENV
): number | undefined => {
  if (nodeEnv === 'production') return undefined;

  const raw = process.env[name];
  if (!raw) return undefined;

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

// Default key generator
function generateDefaultKey(req: AuthRequest): string {
  const { user } = req;

  // Use user ID if authenticated, otherwise use IP
  if (user?.id) {
    return `user:${user.id}`;
  }

  return `ip:${extractClientIp(req)}`;
}

// Create rate limiters for different use cases
export const createRateLimiters = (overrides?: {
  authMax?: number;
  sensitiveMax?: number;
  refreshMax?: number;
  enrollMax?: number;
}) => {
  return {
    // Strict rate limiting for authentication endpoints.
    // Counts FAILED attempts only: a successful login proves the caller owns
    // the credentials, so charging it against the brute-force budget locked
    // real users out after 5 sign-ins within 15 minutes.
    auth: rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: overrides?.authMax ?? 5, // 5 failed attempts per 15 minutes
      skipSuccessfulRequests: true,
      message: 'Too many authentication attempts, please try again later.',
      keyGenerator: (req) => `auth:${extractClientIp(req)}`
    }),

    // Token refresh gets its own bucket. The client refreshes automatically on
    // every 401, so sharing the strict `auth` bucket meant ordinary browsing
    // could exhaust the login budget and produce spurious 429s.
    refresh: rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: overrides?.refreshMax ?? 60,
      skipSuccessfulRequests: true,
      message: 'Too many token refresh attempts, please try again later.',
      keyGenerator: (req) => `auth-refresh:${extractClientIp(req)}`
    }),

    // Device enrollment — a CREDENTIAL-MINTING endpoint, so it deliberately does
    // NOT set `skipSuccessfulRequests`. Every success mints a new deviceId plus a
    // token; skipping successes would make enrollment an unbounded id-minting
    // oracle. It cannot reuse `auth` for that reason.
    //
    // The ceiling is per IP and has to tolerate shared venue WiFi: a badminton
    // club where twenty guests join at once all arrive from one address, so a
    // brute-force-sized budget (5) would lock out a legitimate session. 60 per
    // 15 minutes bounds minting while allowing a full session's guests.
    enroll: rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: overrides?.enrollMax ?? 60,
      message: 'Too many device enrollments, please try again later.',
      keyGenerator: (req) => `device-enroll:${extractClientIp(req)}`
    }),

    // Moderate rate limiting for API endpoints
    api: rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 100, // 100 requests per 15 minutes
      message: 'API rate limit exceeded, please try again later.'
    }),

    // Lenient rate limiting for public endpoints
    public: rateLimit({
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 60, // 60 requests per minute
      message: 'Too many requests, please try again later.'
    }),

    // Strict rate limiting for sensitive operations
    sensitive: rateLimit({
      windowMs: 60 * 1000, // 1 minute
      maxRequests: overrides?.sensitiveMax ?? 10, // 10 requests per minute
      message: 'Too many sensitive operations, please try again later.'
    }),

    // Custom rate limiter for specific use cases
    custom: (options: Partial<RateLimitOptions>) => rateLimit({
      windowMs: 15 * 60 * 1000,
      maxRequests: 100,
      ...options
    })
  };
};

// Rate limit status checker
export const getRateLimitStatus = async (req: AuthRequest): Promise<{
  limit: number;
  remaining: number;
  resetTime: number;
  isLimited: boolean;
} | null> => {
  try {
    const key = generateDefaultKey(req);
    const rateLimitKey = `ratelimit:${key}`;
    const rateLimitData = await cacheService.get<RateLimitEntry>(rateLimitKey);

    if (!rateLimitData) {
      return null;
    }

    const now = Date.now();
    const isExpired = now > rateLimitData.resetTime;

    return {
      limit: 100, // Default limit, could be made configurable
      remaining: isExpired ? 100 : Math.max(0, 100 - rateLimitData.count),
      resetTime: rateLimitData.resetTime,
      isLimited: !isExpired && rateLimitData.count >= 100
    };
  } catch (error) {
    console.error('Error getting rate limit status:', error);
    return null;
  }
};

// Health check for rate limiting
export const rateLimitHealthCheck = async (): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  details: any;
}> => {
  try {
    const cacheHealth = await cacheService.healthCheck();
    return {
      status: cacheHealth.status,
      details: {
        ...cacheHealth.details,
        middleware: 'operational',
        rateLimitEnabled: true
      }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      details: {
        middleware: 'error',
        rateLimitEnabled: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
};