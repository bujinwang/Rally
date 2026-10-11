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
 *
 * IMPORTANT — per-caller responses. The default key is
 * `domain+generation+method+path+query`: it embeds NO caller identity, so a
 * route whose body contains per-caller fields (e.g. the session `viewer` /
 * `players[].isYou` signals) MUST pass
 * `keyGenerator: identityCacheKeyGenerator(domain)`. Otherwise the first
 * caller's identity view is served to every other caller until the TTL expires.
 */

import { Request, Response, NextFunction } from 'express';
import { cacheService } from '../services/cacheService';
import * as cacheKeys from '../services/cache/cacheKeys';
import { CacheOptions, CacheDomain } from '../services/cache/types';

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
    return await options.keyGenerator(req);
  }
  const domain = options.domain ?? 'http';
  const generation = await cacheService.getGeneration(domain);
  const queryDigest = cacheKeys.digest(cacheKeys.stableStringify(req.query ?? {}));
  const path = `${req.baseUrl || ''}${req.path || ''}`;
  return cacheKeys.httpKey(domain, generation, req.method, path, queryDigest);
}

/**
 * Digest of the caller-identity headers, used to make a cached response
 * caller-specific.
 *
 * The identity component is PREFIX-based: the `authorization` header plus every
 * header whose name starts with `x-device-`. This is deliberate — the
 * device-identity channel is migrating to a server-issued `x-device-token`
 * (Phase 1), and a prefix rule keeps the key identity-aware across that change
 * with no code edit. An enumerated list (`x-device-id` only) would silently stop
 * varying the key the moment a new `x-device-*` header shipped, and the symptom
 * ("the organizer occasionally loses their controls") is exactly the class of
 * failure nobody notices.
 */
export function callerIdentityDigest(req: Request): string {
  const headers = (req.headers ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  const authorization = headers['authorization'];
  if (typeof authorization === 'string' && authorization.length > 0) {
    parts.push(`authorization=${authorization}`);
  }
  for (const name of Object.keys(headers).sort()) {
    const lower = name.toLowerCase();
    if (!lower.startsWith('x-device-')) continue;
    const value = headers[name];
    if (typeof value === 'string' && value.length > 0) {
      parts.push(`${lower}=${value}`);
    }
  }
  return cacheKeys.digest(parts.join('\n'));
}

/**
 * Cache-key generator for routes whose response varies PER CALLER (e.g. the
 * session `viewer` / `players[].isYou` signals). It reproduces the default
 * `domain+generation+method+path+query` key and appends `callerIdentityDigest`,
 * so:
 *   - two callers never share one entry (the wrong-identity-view defect), and
 *   - domain invalidation still works (the generation is embedded).
 *
 * Use via `cachingMiddleware({ domain, ttl, keyGenerator: identityCacheKeyGenerator(domain) })`.
 */
export function identityCacheKeyGenerator(domain: CacheDomain): (req: Request) => Promise<string> {
  return async (req: Request): Promise<string> => {
    const generation = await cacheService.getGeneration(domain);
    const queryDigest = cacheKeys.digest(cacheKeys.stableStringify(req.query ?? {}));
    const path = `${req.baseUrl || ''}${req.path || ''}`;
    return cacheKeys.httpKey(
      domain,
      generation,
      req.method,
      path,
      queryDigest,
      callerIdentityDigest(req),
    );
  };
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
