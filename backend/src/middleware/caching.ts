import { Request, Response, NextFunction } from 'express';
import { cacheService } from '../services/cacheService';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string | null;
    role: string;
  };
}

interface CachedResponse {
  body: any;
  statusCode: number;
  headers: Record<string, string>;
  timestamp: number;
}

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  keyGenerator?: (req: AuthRequest) => string;
  skipCache?: (req: AuthRequest) => boolean;
}

export const cachingMiddleware = (options: CacheOptions = {}) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Skip caching for non-GET requests
      if (req.method !== 'GET') {
        return next();
      }

      // Check if caching should be skipped for this request
      if (options.skipCache && options.skipCache(req)) {
        return next();
      }

      // Generate cache key
      const cacheKey = options.keyGenerator
        ? options.keyGenerator(req)
        : generateDefaultCacheKey(req);

      // Try to get cached response
      const cachedResponse = await cacheService.get<CachedResponse>(cacheKey);
      if (cachedResponse) {
        // Return cached response
        res.set(cachedResponse.headers);
        res.status(cachedResponse.statusCode).json(cachedResponse.body);
        return;
      }

      // Store original response methods
      const originalJson = res.json;
      const originalStatus = res.status;
      const originalSet = res.set;
      const originalSend = res.send;

      let responseData: any = null;
      let statusCode = 200;
      const headers: Record<string, string> = {};

      // Override response methods to capture the response
      res.json = function(data: any) {
        responseData = data;
        return originalJson.call(this, data);
      };

      res.status = function(code: number) {
        statusCode = code;
        return originalStatus.call(this, code);
      };

      res.set = function(field: any, value?: string) {
        if (typeof field === 'string' && value) {
          headers[field] = value;
        } else if (typeof field === 'object') {
          Object.assign(headers, field);
        }
        return originalSet.call(this, field, value);
      };

      res.send = function(data: any) {
        if (typeof data === 'object') {
          responseData = data;
        }
        return originalSend.call(this, data);
      };

      // Override end method to cache the response
      const originalEnd = res.end;
      res.end = function(chunk?: any, encoding?: any) {
        // Cache successful responses only
        if (statusCode >= 200 && statusCode < 300 && responseData) {
          const cacheData = {
            body: responseData,
            statusCode,
            headers,
            timestamp: Date.now()
          };

          // Cache asynchronously (don't wait for it)
          cacheService.set(cacheKey, cacheData, options.ttl || 300)
            .catch(error => console.error('Cache write error:', error));
        }

        return originalEnd.call(this, chunk, encoding);
      };

      next();
    } catch (error) {
      console.error('Caching middleware error:', error);
      // Continue without caching on error
      next();
    }
  };
};

// Default cache key generator
function generateDefaultCacheKey(req: AuthRequest): string {
  const { method, originalUrl, user } = req;
  const userId = user?.id || 'anonymous';
  const queryString = Object.keys(req.query).length > 0
    ? `?${new URLSearchParams(req.query as any).toString()}`
    : '';

  return `http:${method}:${originalUrl}${queryString}:user:${userId}`;
}

// Cache invalidation middleware
export const cacheInvalidationMiddleware = (patterns: string[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Store original response methods
    const originalJson = res.json;
    const originalStatus = res.status;
    const originalSend = res.send;

    res.json = function(data: any) {
      // Invalidate cache patterns on successful mutations
      if (res.statusCode >= 200 && res.statusCode < 300) {
        patterns.forEach(pattern => {
          cacheService.clear(pattern).catch(error =>
            console.error('Cache invalidation error:', error)
          );
        });
      }
      return originalJson.call(this, data);
    };

    res.status = function(code: number) {
      // Store status for later use
      (res as any)._statusCode = code;
      return originalStatus.call(this, code);
    };

    res.send = function(data: any) {
      // Invalidate cache patterns on successful mutations
      const statusCode = (res as any)._statusCode || 200;
      if (statusCode >= 200 && statusCode < 300) {
        patterns.forEach(pattern => {
          cacheService.clear(pattern).catch(error =>
            console.error('Cache invalidation error:', error)
          );
        });
      }
      return originalSend.call(this, data);
    };

    next();
  };
};

// Cache warming middleware for frequently accessed endpoints
export const cacheWarmingMiddleware = (endpoints: Array<{
  path: string;
  method: string;
  warmOnStart?: boolean;
}>) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // This middleware can be extended to warm caches based on usage patterns
    // For now, it just passes through
    next();
  };
};

// Health check for cache middleware
export const cacheHealthCheck = async (): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  details: any;
}> => {
  try {
    const cacheHealth = await cacheService.healthCheck();
    return {
      status: cacheHealth.status,
      details: {
        ...cacheHealth.details,
        middleware: 'operational'
      }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      details: {
        middleware: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
};