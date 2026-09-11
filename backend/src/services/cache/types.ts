/**
 * Shared types for the cache storage abstraction (Story 6.2).
 *
 * The cache is a best-effort performance layer: a store error must never be
 * allowed to fail a request. Reads that error are treated as a cache miss and
 * writes that error are logged and swallowed. See `CacheService` for the
 * fallback orchestration.
 */

/** The concrete storage backend currently serving cache operations. */
export type CacheDriver = 'redis' | 'memory';

/** Logical cache domains. Each domain owns an independent generation counter. */
export type CacheDomain =
  | 'discovery'
  | 'nearby'
  | 'session'
  | 'popular'
  | 'location'
  | 'stats'
  | 'analytics'
  | 'http';

/** Health snapshot returned by a store or the service. */
export interface StoreHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  driver: CacheDriver;
  details: Record<string, unknown>;
}

/** Runtime cache metrics (surfaced by `CacheService.getCacheStats()`). */
export interface CacheStats {
  hits: number;
  misses: number;
  /** hits / (hits + misses); 0 when there has been no traffic. */
  hitRate: number;
  driver: CacheDriver;
  /** Entry count — memory store only. */
  entries: number;
  /** Approximate memory usage in MB — memory store only. */
  memoryUsageMB: number;
}

/** Options accepted by the HTTP caching middleware. */
export interface CacheOptions {
  /** Time-to-live in seconds for cached responses. */
  ttl?: number;
  /** Cache domain whose generation is embedded in the key (enables invalidation). */
  domain?: CacheDomain;
  /** Fully custom key generator (overrides the default domain+path+query key). */
  keyGenerator?: (req: any) => string;
  /** Predicate: return true to bypass the cache for this request. */
  skipCache?: (req: any) => boolean;
  /**
   * Enable/disable caching for this middleware. Defaults to disabled under
   * `NODE_ENV=test` (so the shared module-level cache does not pollute the
   * integration suites) and enabled otherwise.
   */
  enabled?: boolean;
}

/**
 * Storage abstraction implemented by `MemoryStore` and `RedisStore`.
 *
 * Every method is async so the two drivers are interchangeable. Implementations
 * may throw `CacheUnavailableError` when the backend is unreachable; the
 * `CacheService` translates that into a memory fallback (reads) or a swallowed
 * write (writes).
 */
export interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  clear(prefix: string): Promise<void>;
  incr(key: string): Promise<number>;
  health(): Promise<StoreHealth>;
  close(): Promise<void>;
}

/**
 * Raised by a store when it cannot service an operation (connection down,
 * circuit breaker open, command error). Never surfaced to a caller of
 * `CacheService` — it is caught internally.
 */
export class CacheUnavailableError extends Error {
  constructor(message = 'Cache store unavailable') {
    super(message);
    this.name = 'CacheUnavailableError';
    // Restore prototype chain when targeting ES5-ish runtimes.
    Object.setPrototypeOf(this, CacheUnavailableError.prototype);
  }
}

/** Minimal logger contract so the cache modules stay dependency-free. */
export interface CacheLogger {
  debug?(message: string, ...args: unknown[]): void;
  warn?(message: string, ...args: unknown[]): void;
  error?(message: string, ...args: unknown[]): void;
}
