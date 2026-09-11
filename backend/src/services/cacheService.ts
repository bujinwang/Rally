/**
 * CacheService (Story 6.2).
 *
 * A Redis-backed cache with a transparent in-memory fallback, behind the
 * **unchanged** public surface that existing callers depend on
 * (`discoveryService`, `middleware/rateLimit`, `middleware/caching`,
 * `config/socket`, `pairingService`, `aiPairingService`).
 *
 * Design principles:
 *  - **Best-effort**: the cache may improve latency but is never required for
 *    correctness and never fails a request. A read error ⇒ cache miss; a write
 *    error ⇒ logged + swallowed (AC 14).
 *  - **Generation-based invalidation**: each domain owns a counter
 *    (`rally:cache:gen:<domain>`). Keys embed `g<gen>`; invalidating a domain is
 *    an O(1) `INCR`. No `KEYS`/`SCAN` on hot paths (AC 2, 8, 12).
 *  - **No PII in keys**: variable parts are SHA-1 hashed (AC 16).
 *  - **Memory bounds**: the memory store enforces the 256 MB cap + LRU and a
 *    per-entry size cap (AC 15).
 *
 * Naming note: the original `getStats()` returns the *stats-domain data*
 * (`stats:general`). To avoid a collision, the metrics accessor is exposed as
 * `getCacheStats()` (aliased as `getMetrics()`), leaving `getStats()` untouched.
 */

import { CacheStore, CacheStats, CacheDomain, StoreHealth } from './cache/types';
import { MemoryStore } from './cache/memoryStore';
import { RedisStore } from './cache/redisStore';
import * as cacheKeys from './cache/cacheKeys';
import { createRedisClient, isRedisConfigured } from '../config/redis';
import { env } from '../config/env';

interface CacheConfig {
  ttl: {
    discovery: number;
    session: number;
    popular: number;
    location: number;
    nearby: number;
    stats: number;
  };
  /** Maximum memory usage in MB (memory store only). */
  maxMemory: number;
  /** Maximum size of a single cache entry in bytes. */
  maxEntryBytes: number;
  /** Key namespace. */
  keyPrefix: string;
  /** Consecutive Redis failures before the circuit breaker opens. */
  redisFailureThreshold: number;
  /** Redis breaker cooldown window in ms. */
  redisCooldownMs: number;
  /**
   * Force Redis on/off regardless of env. When omitted, Redis is used iff
   * `REDIS_URL` is set and we are NOT running under `NODE_ENV=test` (tests are
   * kept Redis-free by default; see design D10).
   */
  redisEnabledOverride?: boolean;
}

const DEFAULT_CONFIG: CacheConfig = {
  ttl: {
    discovery: cacheKeys.TTL.discovery,
    session: cacheKeys.TTL.session,
    popular: cacheKeys.TTL.popular,
    location: cacheKeys.TTL.location,
    nearby: cacheKeys.TTL.nearby,
    stats: cacheKeys.TTL.stats,
  },
  maxMemory: 256,
  maxEntryBytes: 256 * 1024,
  keyPrefix: cacheKeys.CACHE_KEY_PREFIX,
  redisFailureThreshold: 5,
  redisCooldownMs: 30_000,
};

class CacheService {
  private readonly config: CacheConfig;
  private readonly memoryStore: MemoryStore;
  private readonly redisStore?: RedisStore;
  private store: CacheStore;
  private readonly readyPromise: Promise<void>;

  private stats = { hits: 0, misses: 0 };
  private degraded = false;

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      ttl: { ...DEFAULT_CONFIG.ttl, ...(config?.ttl ?? {}) },
    };

    // Env-only config (AC 13): the key prefix / entry cap may be overridden
    // via env vars, but never hardcoded hosts.
    const envPrefix = process.env.REDIS_KEY_PREFIX;
    if (envPrefix) this.config.keyPrefix = envPrefix;
    const envMaxEntry = process.env.CACHE_MAX_ENTRY_BYTES;
    if (envMaxEntry) {
      const parsed = Number.parseInt(envMaxEntry, 10);
      if (Number.isFinite(parsed) && parsed > 0) this.config.maxEntryBytes = parsed;
    }

    this.memoryStore = new MemoryStore({
      maxMemoryMB: this.config.maxMemory,
      maxEntryBytes: this.config.maxEntryBytes,
      keyPrefix: this.config.keyPrefix,
      logger: { debug: (msg) => console.debug(msg) },
    });

    this.store = this.memoryStore;
    this.readyPromise = Promise.resolve();

    const useRedis =
      this.config.redisEnabledOverride ?? (isRedisConfigured() && !env.isTest);
    if (useRedis) {
      try {
        const client = createRedisClient();
        this.redisStore = new RedisStore(client, {
          keyPrefix: this.config.keyPrefix,
          maxEntryBytes: this.config.maxEntryBytes,
          failureThreshold: this.config.redisFailureThreshold,
          cooldownMs: this.config.redisCooldownMs,
          logger: {
            debug: (msg) => console.debug(msg),
            warn: (msg) => console.warn(msg),
          },
        });
        // Fire-and-forget connect; until it resolves we serve from memory.
        this.readyPromise = this.initRedis();
      } catch (error) {
        this.degraded = true;
        console.warn(
          '[cache] Redis client could not be created — using in-memory cache:',
          error instanceof Error ? error.message : error
        );
      }
    } else {
      console.log('✅ In-memory cache service initialized (Redis disabled or REDIS_URL not set)');
    }
  }

  /** Await Redis connection (if configured). Safe to call multiple times. */
  async init(): Promise<void> {
    await this.readyPromise;
  }

  private async initRedis(): Promise<void> {
    const redisStore = this.redisStore;
    if (!redisStore) return;

    // Bound the initial connect: the `redis` client retries with a bounded
    // backoff (reconnectStrategy returns numbers, never an Error), so when the
    // server is unreachable `client.connect()` would otherwise hang forever.
    // We race it against the connect timeout so `init()` always resolves.
    // The env var is read at call time so tests can use a short timeout.
    const envTimeout = Number.parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS ?? '', 10);
    const timeoutMs = Math.max(1, Number.isFinite(envTimeout) ? envTimeout : env.redis.connectTimeoutMs);
    const connectPromise = redisStore.connect();

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Redis connect timed out after ${timeoutMs}ms`)),
        timeoutMs
      );
    });

    try {
      await Promise.race([connectPromise, timeout]);
      this.store = redisStore;
      this.degraded = false;
      console.log('✅ Redis cache connected');
    } catch (error) {
      this.store = this.memoryStore;
      this.degraded = true;
      console.warn(
        '⚠️ Redis unavailable — falling back to in-memory cache:',
        error instanceof Error ? error.message : error
      );
      // Auto-recovery WITHOUT making `reconnectStrategy` return an Error: the
      // background client keeps retrying with bounded backoff. If it eventually
      // connects, promote back to Redis transparently. The rejection handler
      // also prevents an unhandled promise rejection.
      void connectPromise.then(
        () => {
          this.store = redisStore;
          this.degraded = false;
          console.log('✅ Redis cache connected (recovered after initial timeout)');
        },
        () => {
          /* still unavailable — remain on the in-memory fallback */
        }
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // ── Store access with graceful degradation ────────────────────────────────

  private onStoreError(error: unknown): void {
    if (!this.degraded) {
      console.warn(
        '[cache] store error — degrading to in-memory fallback:',
        error instanceof Error ? error.message : error
      );
    }
    this.degraded = true;
  }

  private usingRedis(): boolean {
    return this.store !== this.memoryStore;
  }

  private async rawGet<T>(key: string): Promise<T | null> {
    try {
      const value = await this.store.get<T>(key);
      if (this.usingRedis()) this.degraded = false;
      return value;
    } catch (error) {
      this.onStoreError(error);
      if (this.usingRedis()) {
        try {
          return await this.memoryStore.get<T>(key);
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  private async readCached<T>(key: string): Promise<T | null> {
    const value = await this.rawGet<T>(key);
    if (value === null || value === undefined) {
      this.stats.misses += 1;
      return null;
    }
    this.stats.hits += 1;
    return value;
  }

  private async storeSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await this.store.set<T>(key, value, ttlSeconds);
      if (this.usingRedis()) this.degraded = false;
    } catch (error) {
      this.onStoreError(error);
      if (this.usingRedis()) {
        try {
          await this.memoryStore.set<T>(key, value, ttlSeconds);
        } catch {
          /* best-effort */
        }
      }
    }
  }

  private async storeDelete(key: string): Promise<void> {
    try {
      await this.store.delete(key);
    } catch (error) {
      this.onStoreError(error);
      if (this.usingRedis()) {
        try {
          await this.memoryStore.delete(key);
        } catch {
          /* best-effort */
        }
      }
    }
  }

  private async storeExists(key: string): Promise<boolean> {
    try {
      return await this.store.exists(key);
    } catch (error) {
      this.onStoreError(error);
      if (this.usingRedis()) {
        try {
          return await this.memoryStore.exists(key);
        } catch {
          return false;
        }
      }
      return false;
    }
  }

  private async storeClear(pattern?: string): Promise<void> {
    try {
      await this.store.clear(pattern ?? '');
    } catch (error) {
      this.onStoreError(error);
      if (this.usingRedis()) {
        try {
          await this.memoryStore.clear(pattern ?? '');
        } catch {
          /* best-effort */
        }
      }
    }
  }

  // ── Generation counters (AC 2, 8, 12) ─────────────────────────────────────

  /** Read the current generation for a domain (0 when never invalidated). */
  async getGeneration(domain: string): Promise<number> {
    const value = await this.rawGet<number | string>(cacheKeys.generationKey(domain));
    if (value === null || value === undefined) return 0;
    const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  /**
   * Invalidate a whole domain by bumping its generation counter. O(1); the
   * previous keys become unreachable and age out via their TTL.
   */
  async invalidateDomain(domain: string): Promise<void> {
    const genKey = cacheKeys.generationKey(domain);
    const tasks: Array<Promise<void>> = [this.safeIncr(this.memoryStore, genKey)];
    if (this.redisStore) {
      tasks.push(this.safeIncr(this.redisStore, genKey));
    }
    await Promise.allSettled(tasks);
  }

  private async safeIncr(store: CacheStore, key: string): Promise<void> {
    try {
      await store.incr(key);
    } catch {
      /* best-effort — a missed bump only risks a stale read until TTL */
    }
  }

  // ── Generic cache methods (public interface — unchanged) ──────────────────

  async get<T>(key: string): Promise<T | null> {
    return this.readCached<T>(key);
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    await this.storeSet<T>(key, value, ttl ?? cacheKeys.TTL.http);
  }

  async delete(key: string): Promise<void> {
    await this.storeDelete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.storeExists(key);
  }

  async clear(pattern?: string): Promise<void> {
    await this.storeClear(pattern);
  }

  // ── Discovery-specific cache methods (public interface — unchanged) ───────

  async getDiscoveryResults(
    filters: Record<string, any>,
    userLocation?: { latitude: number; longitude: number }
  ): Promise<any> {
    const gen = await this.getGeneration('discovery');
    const key = cacheKeys.domainKey('discovery', gen, cacheKeys.discoveryDigest(filters, userLocation));
    return this.readCached(key);
  }

  async setDiscoveryResults(
    filters: Record<string, any>,
    userLocation: { latitude: number; longitude: number } | undefined,
    results: any
  ): Promise<void> {
    const gen = await this.getGeneration('discovery');
    const key = cacheKeys.domainKey('discovery', gen, cacheKeys.discoveryDigest(filters, userLocation));
    await this.storeSet(key, results, this.config.ttl.discovery);
  }

  async invalidateDiscoveryCache(): Promise<void> {
    await this.invalidateDomain('discovery');
  }

  // ── Session-specific cache methods (public interface — unchanged) ─────────

  async getSession(sessionId: string): Promise<any> {
    const gen = await this.getGeneration('session');
    return this.readCached(cacheKeys.domainKey('session', gen, sessionId));
  }

  async setSession(sessionId: string, sessionData: any): Promise<void> {
    const gen = await this.getGeneration('session');
    await this.storeSet(cacheKeys.domainKey('session', gen, sessionId), sessionData, this.config.ttl.session);
  }

  async invalidateSession(_sessionId: string): Promise<void> {
    // Domain-level invalidation: bumping the session generation orphans every
    // cached session detail at once (O(1)), which is broader but always safe.
    await this.invalidateDomain('session');
  }

  // ── Popular sessions cache (public interface — unchanged) ─────────────────

  async getPopularSessions(): Promise<any> {
    const gen = await this.getGeneration('popular');
    return this.readCached(cacheKeys.domainKey('popular', gen, 'sessions'));
  }

  async setPopularSessions(sessions: any): Promise<void> {
    const gen = await this.getGeneration('popular');
    await this.storeSet(cacheKeys.domainKey('popular', gen, 'sessions'), sessions, this.config.ttl.popular);
  }

  // ── Location-based cache (public interface — unchanged) ───────────────────

  async getNearbySessions(latitude: number, longitude: number, radius: number): Promise<any> {
    const gen = await this.getGeneration('nearby');
    return this.readCached(
      cacheKeys.domainKey('nearby', gen, cacheKeys.nearbyDigest(latitude, longitude, radius))
    );
  }

  async setNearbySessions(
    latitude: number,
    longitude: number,
    radius: number,
    sessions: any
  ): Promise<void> {
    const gen = await this.getGeneration('nearby');
    await this.storeSet(
      cacheKeys.domainKey('nearby', gen, cacheKeys.nearbyDigest(latitude, longitude, radius)),
      sessions,
      this.config.ttl.nearby
    );
  }

  // ── Statistics cache (public interface — unchanged) ───────────────────────
  // NOTE: this returns the *stats-domain data*, not cache metrics.

  async getStats(): Promise<any> {
    const gen = await this.getGeneration('stats');
    return this.readCached(cacheKeys.domainKey('stats', gen, 'general'));
  }

  async setStats(stats: any): Promise<void> {
    const gen = await this.getGeneration('stats');
    await this.storeSet(cacheKeys.domainKey('stats', gen, 'general'), stats, this.config.ttl.stats);
  }

  // ── Metrics (Story 6.2, AC 10 / Story 6.3 readiness) ──────────────────────

  /** Cache hit/miss metrics. Named to avoid colliding with the stats-domain getter. */
  getCacheStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      // Report the ACTIVE driver (the store currently serving reads/writes),
      // not merely whether a RedisStore was constructed. When Redis is
      // configured but degraded we serve from memory, so the driver is 'memory'.
      driver: this.store === this.redisStore ? 'redis' : 'memory',
      entries: this.memoryStore.size,
      memoryUsageMB: this.memoryStore.memoryUsageMB,
    };
  }

  /** Alias for `getCacheStats()`. */
  getMetrics(): CacheStats {
    return this.getCacheStats();
  }

  /** Reset hit/miss counters (tests / maintenance). */
  resetStats(): void {
    this.stats = { hits: 0, misses: 0 };
  }

  // ── Health check (public interface — unchanged) ───────────────────────────

  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; details: any }> {
    let storeHealth: StoreHealth;
    try {
      storeHealth = await this.store.health();
    } catch (error) {
      storeHealth = {
        status: 'unhealthy',
        driver: this.store === this.redisStore ? 'redis' : 'memory',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      };
    }

    const metrics = this.getCacheStats();
    const status: 'healthy' | 'degraded' | 'unhealthy' = this.degraded
      ? 'degraded'
      : storeHealth.status;

    return {
      status,
      details: {
        ...storeHealth.details,
        driver: storeHealth.driver,
        entries: this.memoryStore.size,
        memoryUsage: `${this.memoryStore.memoryUsageMB}MB`,
        maxMemory: `${this.config.maxMemory}MB`,
        hits: metrics.hits,
        misses: metrics.misses,
        hitRate: metrics.hitRate,
        degraded: this.degraded,
      },
    };
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  async disconnect(): Promise<void> {
    await this.memoryStore.close();
    if (this.redisStore) {
      await this.redisStore.close();
    }
    this.store = this.memoryStore;
    this.stats = { hits: 0, misses: 0 };
  }
}

// Export singleton instance
export const cacheService = new CacheService();
export default cacheService;
export { CacheService };
