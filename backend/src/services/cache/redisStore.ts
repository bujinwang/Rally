/**
 * Redis-backed `CacheStore` (Story 6.2, AC 1 / AC 14 / AC 15).
 *
 * Resilience contract:
 *  - Every command is executed through a **circuit breaker**. After
 *    `failureThreshold` consecutive failures the breaker opens for `cooldownMs`
 *    and commands fail fast (no socket I/O) instead of stalling requests.
 *  - Any command error is converted into a `CacheUnavailableError`; the
 *    `CacheService` catches it and serves from the memory fallback. Redis being
 *    down therefore never propagates to a route.
 *  - Values larger than `maxEntryBytes` are skipped (never cached) and logged.
 */

import { CacheStore, CacheUnavailableError, StoreHealth } from './types';
import type { RedisClient } from '../../config/redis';

export interface RedisStoreOptions {
  keyPrefix?: string;
  maxEntryBytes?: number;
  /** Consecutive failures before the breaker opens. */
  failureThreshold?: number;
  /** How long (ms) the breaker stays open before probing again. */
  cooldownMs?: number;
  logger?: {
    debug?: (message: string, ...args: unknown[]) => void;
    warn?: (message: string, ...args: unknown[]) => void;
  };
}

export class RedisStore implements CacheStore {
  readonly driver = 'redis';

  private readonly client: RedisClient;
  private readonly keyPrefix: string;
  private readonly maxEntryBytes: number;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly logger?: RedisStoreOptions['logger'];

  private consecutiveFailures = 0;
  private openUntil = 0;
  private connected = false;

  constructor(client: RedisClient, options: RedisStoreOptions = {}) {
    this.client = client;
    this.keyPrefix = options.keyPrefix ?? 'rally:cache:';
    this.maxEntryBytes = options.maxEntryBytes ?? 256 * 1024;
    this.failureThreshold = Math.max(1, options.failureThreshold ?? 5);
    this.cooldownMs = Math.max(1, options.cooldownMs ?? 30_000);
    this.logger = options.logger;
  }

  /** Namespaced key. */
  private p(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  /**
   * Establish the connection. Attaches a no-op `error` listener so background
   * socket errors do not crash the process.
   */
  async connect(): Promise<void> {
    const anyClient = this.client as any;
    if (typeof anyClient.on === 'function') {
      anyClient.on('error', () => {
        /* swallowed — the circuit breaker tracks failures */
      });
    }
    await this.client.connect();
    this.connected = true;
  }

  private breakerOpen(): boolean {
    return Date.now() < this.openUntil;
  }

  private recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.openUntil = 0;
  }

  private recordFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.openUntil = Date.now() + this.cooldownMs;
      this.consecutiveFailures = 0;
      this.logger?.warn?.(
        `[cache] Redis circuit breaker opened for ${this.cooldownMs}ms after ${this.failureThreshold} failures`
      );
    }
  }

  /** Execute a Redis command through the circuit breaker. */
  private async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.breakerOpen()) {
      throw new CacheUnavailableError('Redis circuit breaker is open');
    }
    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      const message = error instanceof Error ? error.message : String(error);
      throw new CacheUnavailableError(`Redis command failed: ${message}`);
    }
  }

  private serialize(value: unknown): string | null {
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.run(() => this.client.get(this.p(key)));
    if (raw === null || raw === undefined) return null;
    try {
      return JSON.parse(String(raw)) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const json = this.serialize(value);
    if (json === null) {
      this.logger?.debug?.(`[cache] skipping unserializable value for key "${key}"`);
      return;
    }

    const size = Buffer.byteLength(json, 'utf8');
    if (size > this.maxEntryBytes) {
      this.logger?.debug?.(
        `[cache] skipping oversized entry (${size}B > ${this.maxEntryBytes}B) for key "${key}"`
      );
      return;
    }

    const ttl = Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? Math.floor(ttlSeconds) : 300;
    await this.run(() => this.client.set(this.p(key), json, { EX: ttl }));
  }

  async delete(key: string): Promise<void> {
    await this.run(() => this.client.del(this.p(key)));
  }

  async exists(key: string): Promise<boolean> {
    const count = await this.run(() => this.client.exists(this.p(key)));
    return Number(count) > 0;
  }

  /**
   * Delete keys matching a prefix/pattern via a bounded `SCAN` loop.
   *
   * NOTE: `SCAN` is intentionally used only here. Invalidation on hot paths is
   * O(1) via generation counters (`INCR`); `clear` is an administrative escape
   * hatch, never called from a request hot path.
   */
  async clear(prefix: string): Promise<void> {
    const base = prefix && prefix.length > 0 ? `${this.keyPrefix}${prefix}` : `${this.keyPrefix}*`;
    const pattern = base.includes('*') ? base : `${base}*`;

    let cursor = '0';
    do {
      const result = (await this.run(() =>
        (this.client as any).scan(cursor, { MATCH: pattern, COUNT: 200 })
      )) as { cursor: string | number; keys: string[] } | null;
      cursor = String(result?.cursor ?? '0');
      const keys: string[] = Array.isArray(result?.keys) ? result!.keys : [];
      if (keys.length > 0) {
        await this.run(() => this.client.del(keys as any));
      }
    } while (cursor !== '0');
  }

  async incr(key: string): Promise<number> {
    const value = await this.run(() => this.client.incr(this.p(key)));
    return Number(value);
  }

  async health(): Promise<StoreHealth> {
    if (this.breakerOpen()) {
      return {
        status: 'degraded',
        driver: 'redis',
        details: { breaker: 'open', retryInMs: this.openUntil - Date.now() },
      };
    }
    try {
      await this.client.ping();
      this.recordSuccess();
      return { status: 'healthy', driver: 'redis', details: { connected: this.connected } };
    } catch (error) {
      this.recordFailure();
      return {
        status: 'unhealthy',
        driver: 'redis',
        details: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  /**
   * Best-effort, **always-prompt** shutdown.
   *
   * A graceful `QUIT` only settles when the client is fully `ready`. When Redis
   * is unreachable the client can be stuck *opening* (`isOpen === true` but
   * `isReady === false`), and `quit()` then **never settles** — which would hang
   * `cacheService.disconnect()` and block graceful shutdown (SIGTERM/SIGINT).
   *
   * So: `quit()` only when `isReady === true` (and even then bounded by a short
   * timeout as belt-and-braces); otherwise fall back to the synchronous
   * `disconnect()`, which returns immediately. Never throws.
   */
  async close(): Promise<void> {
    const anyClient = this.client as any;
    const hasQuit = typeof anyClient.quit === 'function';
    const hasDisconnect = typeof anyClient.disconnect === 'function';

    try {
      if (hasQuit && anyClient.isReady === true) {
        // Ready → graceful QUIT, bounded so a wedged socket cannot stall us.
        await this.raceWithTimeout(Promise.resolve(anyClient.quit()), 500);
      } else if (hasDisconnect) {
        // Not ready (opening / reconnecting / already closed): `quit()` would
        // never settle, so disconnect synchronously — returns immediately.
        anyClient.disconnect();
      } else if (hasQuit) {
        // No `disconnect()` available — still bound the QUIT.
        await this.raceWithTimeout(Promise.resolve(anyClient.quit()), 500);
      }
    } catch {
      /* best-effort shutdown — never throw, never hang */
    }
  }

  /**
   * Resolve with `promise`'s value, or `undefined` once `ms` elapses — whichever
   * comes first. A late rejection is swallowed so it cannot become an unhandled
   * rejection after the timeout wins.
   */
  private async raceWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
    const settled = Promise.resolve(promise).catch(() => undefined);
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), ms);
    });
    try {
      return await Promise.race([settled, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
