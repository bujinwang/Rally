/**
 * HTTP caching middleware (Story 6.2, AC 2 / 3 / 5 / 8 / 12 / 16).
 *
 * - `cachingMiddleware` caches successful (2xx) GET responses. Keys are built
 *   via `cacheKeys` (namespaced, hashed, generation-stamped) so a domain
 *   invalidation makes stale entries unreachable. Sensitive response headers
 *   are stripped before caching; an `X-Cache: HIT|MISS` header is added for
 *   observability. The response body/envelope is never altered (AC 5).
 * - `cacheInvalidationMiddleware` bumps the generation counters of the given
 *   domains after a 2xx write — fire-and-forget, so a write never depends on
 *   cache success (AC 8).
 */

import { Request, Response, NextFunction } from 'express';
import { cacheService } from '../services/cacheService';
import * as cacheKeys from '../services/cache/cacheKeys';
import { CacheOptions } from '../services/cache/types';

interface CachedResponse {
  body: any;
  statusCode: number;
  headers: Record<string, string>;
  timestamp: number;
}

/** Headers that must never be replayed from cache. */
const SENSITIVE_HEADERS = new Set(['set-cookie', 'authorization', 'x-cache']);

function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (!SENSITIVE_HEADERS.has(key.toLowerCase())) {
      clean[key] = value;
    }
  }
  return clean;
}

/** Build the cache key for a request using the domain generation + hashed query. */
async function buildCacheKey(req: Request, options: CacheOptions): Promise<string> {
  if (options.keyGenerator) {
    return options.keyGenerator(req);
  }
  const domain = options.domain ?? 'http';
  const generation = await cacheService.getGeneration(domain);
  const queryDigest = cacheKeys.digest(cacheKeys.stableStringify(req.query ?? {}));
  const path = `${req.baseUrl || ''}${req.path || ''}`;
  return cacheKeys.httpKey(domain, generation, req.method, path, queryDigest);
}

/**
 * Cache successful GET responses.
 */
export const cachingMiddleware = (options: CacheOptions = {}) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.method !== 'GET') {
        return next();
      }
      // Default off under test so the shared module-level cache does not pollute
      // the integration suites; the dedicated middleware test opts in explicitly.
      const enabled = options.enabled ?? process.env.NODE_ENV !== 'test';
      if (!enabled) {
        return next();
      }
      if (options.skipCache && options.skipCache(req)) {
        return next();
      }

      const cacheKey = await buildCacheKey(req, options);
      const cachedResponse = await cacheService.get<CachedResponse>(cacheKey);

      if (cachedResponse) {
        res.set(sanitizeHeaders(cachedResponse.headers));
        res.setHeader('X-Cache', 'HIT');
        res.status(cachedResponse.statusCode).json(cachedResponse.body);
        return;
      }

      // Miss — capture the response and store it on completion.
      res.setHeader('X-Cache', 'MISS');

      const originalJson = res.json;
      const originalSend = res.send;
      const originalStatus = res.status;
      const originalSet = res.set;
      const originalEnd = res.end;

      let responseData: any = null;
      let captured = false;
      let statusCode = res.statusCode ?? 200;
      const headers: Record<string, string> = {};

      const capture = (data: any) => {
        if (!captured && data !== undefined) {
          responseData = data;
          captured = true;
        }
      };

      res.json = function jsonOverride(data: any) {
        capture(data);
        return originalJson.call(this, data);
      };

      res.send = function sendOverride(data: any) {
        if (typeof data === 'object' && data !== null) {
          capture(data);
        }
        return originalSend.call(this, data);
      };

      res.status = function statusOverride(code: number) {
        statusCode = code;
        return originalStatus.call(this, code);
      };

      res.set = function setOverride(field: any, value?: string) {
        if (typeof field === 'string' && typeof value === 'string') {
          headers[field] = value;
        } else if (field && typeof field === 'object') {
          Object.assign(headers, field);
        }
        return originalSet.call(this, field as any, value as any);
      };

      res.end = function endOverride(chunk?: any, encoding?: any) {
        try {
          const effectiveStatus = statusCode || res.statusCode;
          if (effectiveStatus >= 200 && effectiveStatus < 300 && responseData !== null) {
            const cacheData: CachedResponse = {
              body: responseData,
              statusCode: effectiveStatus,
              headers: sanitizeHeaders(headers),
              timestamp: Date.now(),
            };
            // Fire-and-forget — never block the response on the cache write.
            void cacheService.set(cacheKey, cacheData, options.ttl ?? cacheKeys.TTL.http);
          }
        } catch (error) {
          console.error('Cache write error:', error);
        }
        return originalEnd.call(this, chunk, encoding);
      };

      next();
    } catch (error) {
      // Never let the cache break a request (AC 14).
      console.error('Caching middleware error:', error);
      next();
    }
  };
};

/**
 * Invalidate the given domains (generation bump) after a successful mutation.
 */
export const cacheInvalidationMiddleware = (domains: CacheDomainInput[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const originalJson = res.json;
    const originalSend = res.send;
    let invalidated = false;

    const invalidateIfSuccess = () => {
      if (invalidated) return;
      const statusCode = res.statusCode;
      if (statusCode >= 200 && statusCode < 300) {
        invalidated = true;
        for (const domain of domains) {
          // Fire-and-forget: the write already committed to the DB (AC 8).
          void cacheService.invalidateDomain(domain).catch((error) => {
            console.error('Cache invalidation error:', error);
          });
        }
      }
    };

    res.json = function jsonOverride(data: any) {
      invalidateIfSuccess();
      return originalJson.call(this, data);
    };

    res.send = function sendOverride(data: any) {
      invalidateIfSuccess();
      return originalSend.call(this, data);
    };

    next();
  };
};

type CacheDomainInput = string;

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
        middleware: 'operational',
      },
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      details: {
        middleware: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
};
