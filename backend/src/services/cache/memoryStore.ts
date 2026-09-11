/**
 * In-memory `CacheStore` (Story 6.2, AC 15).
 *
 * Extracted from the original `CacheService` Map implementation. Preserves the
 * original semantics (TTL expiry, LRU eviction under memory pressure, periodic
 * cleanup) and adds a per-entry size cap (`maxEntryBytes`): values larger than
 * the cap are skipped (not cached) and logged at debug level so a single huge
 * response can never dominate memory.
 *
 * Keys are transparently namespaced with the configured prefix so behaviour
 * matches the Redis driver.
 */

import { CacheStore, StoreHealth } from './types';

interface MemoryItem {
  value: any;
  expires: number;
  accessCount: number;
  lastAccessed: number;
}

export interface MemoryStoreOptions {
  /** Maximum total memory usage in MB before LRU eviction kicks in. */
  maxMemoryMB?: number;
  /** Maximum size of a single entry in bytes; larger entries are skipped. */
  maxEntryBytes?: number;
  /** Key namespace. */
  keyPrefix?: string;
  /** Housekeeping interval in ms (default 5 min). */
  cleanupIntervalMs?: number;
  /** Optional debug logger (called when an oversized entry is skipped). */
  logger?: { debug?: (message: string, ...args: unknown[]) => void };
}

export class MemoryStore implements CacheStore {
  readonly driver = 'memory';

  private map = new Map<string, MemoryItem>();
  private totalMemoryUsage = 0;
  private readonly maxMemoryBytes: number;
  private readonly maxMemoryMB: number;
  private readonly maxEntryBytes: number;
  private readonly keyPrefix: string;
  private readonly logger?: MemoryStoreOptions['logger'];

  constructor(options: MemoryStoreOptions = {}) {
    this.maxMemoryMB = options.maxMemoryMB ?? 256;
    this.maxMemoryBytes = this.maxMemoryMB * 1024 * 1024;
    this.maxEntryBytes = options.maxEntryBytes ?? 256 * 1024;
    this.keyPrefix = options.keyPrefix ?? 'rally:cache:';
    this.logger = options.logger;
    this.startCleanupInterval(options.cleanupIntervalMs ?? 5 * 60 * 1000);
  }

  /** Namespaced key used for all Map operations. */
  private p(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  private startCleanupInterval(intervalMs: number): void {
    // `unref()` so this housekeeping timer never keeps the Node process (or a
    // Jest worker) alive on its own.
    const timer = setInterval(() => this.cleanup(), intervalMs);
    if (timer && typeof (timer as any).unref === 'function') {
      (timer as any).unref();
    }
  }

  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, item] of this.map.entries()) {
      if (now > item.expires) {
        keysToDelete.push(key);
        this.totalMemoryUsage -= this.estimateSize(item.value);
      }
    }

    keysToDelete.forEach((key) => this.map.delete(key));

    if (this.totalMemoryUsage > this.maxMemoryBytes) {
      this.evictLRU();
    }
  }

  /** Evict least-recently-used entries until usage drops below 80% of the cap. */
  private evictLRU(): void {
    const entries = Array.from(this.map.entries()).sort(
      (a, b) => a[1].lastAccessed - b[1].lastAccessed
    );

    for (const [key, item] of entries) {
      if (this.totalMemoryUsage <= this.maxMemoryBytes * 0.8) break;
      this.map.delete(key);
      this.totalMemoryUsage -= this.estimateSize(item.value);
    }
  }

  private estimateSize(value: any): number {
    try {
      const str = JSON.stringify(value);
      return str ? Buffer.byteLength(str, 'utf8') : 0;
    } catch {
      return 0;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.p(key);
    const item = this.map.get(fullKey);
    if (!item) return null;

    const now = Date.now();
    if (now > item.expires) {
      this.map.delete(fullKey);
      this.totalMemoryUsage -= this.estimateSize(item.value);
      return null;
    }

    item.accessCount += 1;
    item.lastAccessed = now;
    return item.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const size = this.estimateSize(value);
    if (size > this.maxEntryBytes) {
      this.logger?.debug?.(
        `[cache] skipping oversized entry (${size}B > ${this.maxEntryBytes}B) for key "${key}"`
      );
      return;
    }

    const fullKey = this.p(key);
    const now = Date.now();
    const ttl = Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : 300;

    const oldItem = this.map.get(fullKey);
    if (oldItem) {
      this.totalMemoryUsage -= this.estimateSize(oldItem.value);
    }

    this.map.set(fullKey, {
      value,
      expires: now + ttl * 1000,
      accessCount: 0,
      lastAccessed: now,
    });
    this.totalMemoryUsage += size;

    if (this.totalMemoryUsage > this.maxMemoryBytes) {
      this.evictLRU();
    }
  }

  async delete(key: string): Promise<void> {
    const fullKey = this.p(key);
    const item = this.map.get(fullKey);
    if (item) {
      this.totalMemoryUsage -= this.estimateSize(item.value);
      this.map.delete(fullKey);
    }
  }

  async exists(key: string): Promise<boolean> {
    const fullKey = this.p(key);
    const item = this.map.get(fullKey);
    if (!item) return false;
    if (Date.now() > item.expires) {
      this.map.delete(fullKey);
      this.totalMemoryUsage -= this.estimateSize(item.value);
      return false;
    }
    return true;
  }

  async clear(prefix: string): Promise<void> {
    if (!prefix) {
      this.map.clear();
      this.totalMemoryUsage = 0;
      return;
    }

    const needle = prefix.replace('*', '');
    const keysToDelete: string[] = [];
    for (const key of this.map.keys()) {
      if (key.includes(needle)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => {
      const item = this.map.get(key);
      if (item) {
        this.totalMemoryUsage -= this.estimateSize(item.value);
        this.map.delete(key);
      }
    });
  }

  /**
   * Atomically increment a numeric counter (used for generation counters).
   * The counter never expires.
   */
  async incr(key: string): Promise<number> {
    const fullKey = this.p(key);
    const item = this.map.get(fullKey);
    const current = item && typeof item.value === 'number' ? item.value : 0;
    const next = current + 1;

    if (item) {
      this.totalMemoryUsage -= this.estimateSize(item.value);
    }
    this.map.set(fullKey, {
      value: next,
      expires: Number.POSITIVE_INFINITY,
      accessCount: 0,
      lastAccessed: Date.now(),
    });
    this.totalMemoryUsage += this.estimateSize(next);

    return next;
  }

  async health(): Promise<StoreHealth> {
    return {
      status: 'healthy',
      driver: 'memory',
      details: {
        message: 'In-memory cache operational',
        entries: this.map.size,
        memoryUsageMB: this.memoryUsageMB,
        maxMemoryMB: this.maxMemoryMB,
      },
    };
  }

  async close(): Promise<void> {
    this.map.clear();
    this.totalMemoryUsage = 0;
  }

  /** Number of live entries (metrics convenience). */
  get size(): number {
    return this.map.size;
  }

  /** Approximate memory usage in MB (metrics convenience). */
  get memoryUsageMB(): number {
    return Math.round(this.totalMemoryUsage / 1024 / 1024);
  }

  /** Exposed for tests only. */
  get _map(): Map<string, MemoryItem> {
    return this.map;
  }
}
