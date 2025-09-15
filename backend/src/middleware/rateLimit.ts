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

      // Override response methods to potentially skip rate limiting for certain responses
      if (skipSuccessfulRequests || skipFailedRequests) {
        const originalJson = res.json;
        const originalStatus = res.status;
        const originalSend = res.send;

        let responseStatusCode = 200;

        res.status = function(code: number) {
          responseStatusCode = code;
          return originalStatus.call(this, code);
        };

        res.json = function(data: any) {
          // Skip rate limiting for successful requests if configured
          if (skipSuccessfulRequests && responseStatusCode >= 200 && responseStatusCode < 300) {
            // Don't increment counter for successful requests
            return originalJson.call(this, data);
          }
          return originalJson.call(this, data);
        };

        res.send = function(data: any) {
          // Skip rate limiting for failed requests if configured
          if (skipFailedRequests && responseStatusCode >= 400) {
            // Don't increment counter for failed requests
            return originalSend.call(this, data);
          }
          return originalSend.call(this, data);
        };
      }

      next();
    } catch (error) {
      console.error('Rate limiting middleware error:', error);
      // Continue without rate limiting on error
      next();
    }
  };
};

// Default key generator
function generateDefaultKey(req: AuthRequest): string {
  const { ip, user } = req;

  // Use user ID if authenticated, otherwise use IP
  if (user?.id) {
    return `user:${user.id}`;
  }

  // Get client IP (handle proxy headers)
  const clientIP = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
                   req.headers['x-real-ip']?.toString() ||
                   req.connection.remoteAddress ||
                   req.socket.remoteAddress ||
                   ip ||
                   'unknown';

  return `ip:${clientIP}`;
}

// Create rate limiters for different use cases
export const createRateLimiters = () => {
  return {
    // Strict rate limiting for authentication endpoints
    auth: rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 5, // 5 attempts per 15 minutes
      message: 'Too many authentication attempts, please try again later.',
      keyGenerator: (req) => {
        const clientIP = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
                        req.headers['x-real-ip']?.toString() ||
                        req.connection.remoteAddress ||
                        req.socket.remoteAddress ||
                        req.ip ||
                        'unknown';
        return `auth:${clientIP}`;
      }
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
      maxRequests: 10, // 10 requests per minute
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