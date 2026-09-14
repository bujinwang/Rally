/**
 * INDEPENDENT QA verification for Story 6.2 (added by QA).
 *
 * These tests are written from the acceptance criteria / design, NOT copied from
 * the engineer's suite. They deliberately probe the failure and boundary paths:
 *  - AC 14 Redis-down never throws / never 5xx (connect failure AND command error)
 *  - AC 2/8/12 no stale read after invalidation (generation counters)
 *  - AC 16 no PII in cache keys
 *  - AC 15 memory bounds (entry cap + LRU)
 *  - AC 5 interface parity + envelope/X-Cache behaviour
 *  - AC 13 env-only config; Redis forced off under test
 *  - driver reporting accuracy
 *
 * Redis is mocked — no socket is ever opened.
 */
jest.mock('redis', () => ({ createClient: jest.fn() }));

import express from 'express';
import request from 'supertest';
import { createClient } from 'redis';
import { CacheService, cacheService } from '../services/cacheService';
import { MemoryStore } from '../services/cache/memoryStore';
import { RedisStore } from '../services/cache/redisStore';
import * as cacheKeys from '../services/cache/cacheKeys';
import { cachingMiddleware, cacheInvalidationMiddleware } from '../middleware/caching';
import { isRedisConfigured } from '../config/redis';

const createClientMock = createClient as unknown as jest.Mock;

function fakeClient(overrides: Record<string, any> = {}): Record<string, any> {
  const data = new Map<string, string>();
  return {
    isOpen: true,
    connect: jest.fn(async () => undefined),
    on: jest.fn(),
    get: jest.fn(async (key: string) => (data.has(key) ? data.get(key)! : null)),
    set: jest.fn(async (key: string, value: string) => {
      data.set(key, value);
      return 'OK';
    }),
    del: jest.fn(async (key: string | string[]) => {
      const keys = Array.isArray(key) ? key : [key];
      let removed = 0;
      for (const k of keys) if (data.delete(k)) removed += 1;
      return removed;
    }),
    exists: jest.fn(async (key: string) => (data.has(key) ? 1 : 0)),
    incr: jest.fn(async (key: string) => {
      const next = Number.parseInt(data.get(key) ?? '0', 10) + 1;
      data.set(key, String(next));
      return next;
    }),
    scan: jest.fn(async () => ({ cursor: '0', keys: [] })),
    ping: jest.fn(async () => 'PONG'),
    quit: jest.fn(async () => 'OK'),
    _data: data,
    ...overrides,
  };
}

describe('QA 6.2 — interface parity (AC 5)', () => {
  const REQUIRED = [
    'get', 'set', 'delete', 'exists', 'clear',
    'getDiscoveryResults', 'setDiscoveryResults', 'invalidateDiscoveryCache',
    'getSession', 'setSession', 'invalidateSession',
    'getPopularSessions', 'setPopularSessions',
    'getNearbySessions', 'setNearbySessions',
    'getStats', 'setStats', 'healthCheck', 'disconnect',
  ];

  it('every original public method still exists as a function', () => {
    for (const m of REQUIRED) {
      expect(typeof (cacheService as any)[m]).toBe('function');
    }
  });

  it('getStats() returns stats-DOMAIN DATA (not metrics)', async () => {
    await cacheService.setStats({ totalSessions: 42, marker: 'stats-domain' });
    const data = await cacheService.getStats();
    expect(data).toEqual({ totalSessions: 42, marker: 'stats-domain' });
    // It must NOT be the metrics object.
    expect(data).not.toHaveProperty('hits');
    expect(data).not.toHaveProperty('hitRate');
  });
});

describe('QA 6.2 — no PII in keys (AC 16)', () => {
  it('discovery digest/key never contains raw email/phone/free text', () => {
    const filters = {
      email: 'alice@example.com',
      phone: '+15551234567',
      q: 'Alice Smith secret free text',
      skillLevel: 'BEGINNER',
    };
    const digest = cacheKeys.discoveryDigest(filters, { latitude: 1.23456, longitude: 7.89012 });
    const key = cacheKeys.domainKey('discovery', 3, digest);

    for (const needle of ['alice', '@', '15551234567', 'Alice Smith', 'secret', 'free text']) {
      expect(key.toLowerCase()).not.toContain(needle.toLowerCase());
    }
    // Variable part is a 40-char SHA-1 hex.
    expect(digest).toMatch(/^[0-9a-f]{40}$/);
  });

  it('the HTTP middleware key contains no raw query values', async () => {
    const app = express();
    app.get(
      '/pii',
      cachingMiddleware({ domain: 'session', ttl: 60, enabled: true }),
      (req, res) => res.json({ success: true, data: 'x' })
    );

    const spy = jest.spyOn(cacheService, 'get');
    try {
      await request(app).get('/pii?email=alice%40example.com&name=Bob%20Smith');
      const usedKey = String(spy.mock.calls[0]?.[0] ?? '');
      expect(usedKey.length).toBeGreaterThan(0);
      expect(usedKey.toLowerCase()).not.toContain('alice');
      expect(usedKey).not.toContain('@');
      expect(usedKey.toLowerCase()).not.toContain('bob');
      expect(usedKey.toLowerCase()).not.toContain('smith');
    } finally {
      spy.mockRestore();
      await cacheService.clear();
    }
  });
});

describe('QA 6.2 — memory bounds (AC 15)', () => {
  it('skips values larger than maxEntryBytes (never cached)', async () => {
    const store = new MemoryStore({ maxEntryBytes: 64 });
    await store.set('big', 'x'.repeat(1000), 60);
    expect(await store.get('big')).toBeNull();
  });

  it('CACHE_MAX_ENTRY_BYTES env override is honoured by CacheService', async () => {
    const prev = process.env.CACHE_MAX_ENTRY_BYTES;
    process.env.CACHE_MAX_ENTRY_BYTES = '64';
    try {
      const svc = new CacheService();
      await svc.set('big', 'y'.repeat(1000), 60);
      expect(await svc.get('big')).toBeNull();
      await svc.set('small', 'ok', 60);
      expect(await svc.get('small')).toBe('ok');
      await svc.disconnect();
    } finally {
      if (prev === undefined) delete process.env.CACHE_MAX_ENTRY_BYTES;
      else process.env.CACHE_MAX_ENTRY_BYTES = prev;
    }
  });

  it('keeps the 256 MB default cap and evicts LRU under pressure', async () => {
    const def = new MemoryStore();
    const health = await def.health();
    expect(health.details.maxMemoryMB).toBe(256);

    const tiny = new MemoryStore({ maxMemoryMB: 0.001 });
    await tiny.set('a', 'x'.repeat(600), 60);
    await tiny.get('a'); // make 'a' most-recently used
    await tiny.set('b', 'y'.repeat(600), 60);
    expect(await tiny.get('b')).not.toBeNull();
    expect(await tiny.get('a')).toBeNull();
  });
});

describe('QA 6.2 — Redis-down never throws / never 5xx (AC 14)', () => {
  const ORIGINAL_URL = process.env.REDIS_URL;

  afterEach(() => {
    if (ORIGINAL_URL === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = ORIGINAL_URL;
    createClientMock.mockReset();
  });

  it('connect() rejecting degrades to memory; reads miss, writes swallowed, no throw', async () => {
    createClientMock.mockReturnValue(
      fakeClient({ connect: jest.fn(async () => { throw new Error('ECONNREFUSED'); }) })
    );
    process.env.REDIS_URL = 'redis://localhost:6379';

    const svc = new CacheService({ redisEnabledOverride: true });
    await svc.init();

    await expect(svc.get('k')).resolves.toBeNull();
    await expect(svc.set('k', 'v', 60)).resolves.toBeUndefined();
    await expect(svc.delete('k')).resolves.toBeUndefined();
    await expect(svc.exists('k')).resolves.toBe(false);
    await expect(svc.invalidateDomain('session')).resolves.toBeUndefined();
    await expect(svc.healthCheck()).resolves.toBeDefined();

    const health = await svc.healthCheck();
    expect(health.status).toBe('degraded');
    await svc.disconnect();
  });

  it('a runtime command error on a CONNECTED redis never throws (read miss, write swallowed)', async () => {
    createClientMock.mockReturnValue(
      fakeClient({
        get: jest.fn(async () => { throw new Error('socket closed'); }),
        set: jest.fn(async () => { throw new Error('socket closed'); }),
      })
    );
    process.env.REDIS_URL = 'redis://localhost:6379';

    const svc = new CacheService({ redisEnabledOverride: true });
    await svc.init();

    await expect(svc.get('k')).resolves.toBeNull(); // miss, no throw
    await expect(svc.set('k', 'v', 60)).resolves.toBeUndefined(); // swallowed
    // Read-after-write must still be served (memory fallback).
    expect(await svc.get('k')).toBe('v');
    await svc.disconnect();
  });

  it('an express route with a broken cache store still returns 200 (no 5xx)', async () => {
    createClientMock.mockReturnValue(
      fakeClient({
        get: jest.fn(async () => { throw new Error('down'); }),
        set: jest.fn(async () => { throw new Error('down'); }),
      })
    );
    process.env.REDIS_URL = 'redis://localhost:6379';

    const svc = new CacheService({ redisEnabledOverride: true });
    await svc.init();

    const app = express();
    // Route that uses the broken service directly through the middleware.
    app.get('/r', async (req, res) => {
      const cached = await svc.get('r'); // must not throw
      if (cached) return res.json(cached);
      const body = { success: true, data: 'from-db' };
      await svc.set('r', body, 60); // must not throw
      res.json(body);
    });

    const resp = await request(app).get('/r');
    expect(resp.status).toBe(200);
    expect(resp.body.data).toBe('from-db');
    await svc.disconnect();
  });

  it('disconnect() resolves promptly when the client is stuck opening (F6 fix)', async () => {
    const ORIGINAL_TIMEOUT = process.env.REDIS_CONNECT_TIMEOUT_MS;
    const quit = jest.fn(() => new Promise<string>(() => undefined)); // never settles
    const disconnect = jest.fn();
    const never = new Promise<void>(() => undefined);
    createClientMock.mockReturnValue(
      fakeClient({
        isOpen: true,
        isReady: false, // stuck opening (unreachable Redis)
        connect: jest.fn(() => never),
        quit,
        disconnect,
      })
    );
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.REDIS_CONNECT_TIMEOUT_MS = '80';

    try {
      const svc = new CacheService({ redisEnabledOverride: true });
      await svc.init(); // degraded: connect timed out, client stuck opening

      const started = Date.now();
      await expect(svc.disconnect()).resolves.toBeUndefined();
      const elapsed = Date.now() - started;

      expect(elapsed).toBeLessThan(500); // must NOT hang on quit()
      expect(disconnect).toHaveBeenCalled(); // sync disconnect used
      expect(quit).not.toHaveBeenCalled(); // hanging quit() avoided

      // Idempotent: a second shutdown is still prompt.
      await expect(svc.disconnect()).resolves.toBeUndefined();
    } finally {
      if (ORIGINAL_TIMEOUT === undefined) delete process.env.REDIS_CONNECT_TIMEOUT_MS;
      else process.env.REDIS_CONNECT_TIMEOUT_MS = ORIGINAL_TIMEOUT;
    }
  });
});

describe('QA 6.2 — circuit breaker (AC 14)', () => {
  it('opens after 5 consecutive failures and fails fast without touching the client', async () => {
    const failingGet = jest.fn(async () => { throw new Error('boom'); });
    const store = new RedisStore(fakeClient({ get: failingGet }) as any, {
      failureThreshold: 5,
      cooldownMs: 50,
    });

    for (let i = 0; i < 5; i++) {
      await expect(store.get('k')).rejects.toThrow();
    }
    const callsAtOpen = failingGet.mock.calls.length;
    expect(callsAtOpen).toBe(5);

    // Breaker open → next call fails fast WITHOUT hitting the client.
    await expect(store.get('k')).rejects.toThrow();
    expect(failingGet.mock.calls.length).toBe(callsAtOpen);
  });

  it('re-probes after the cooldown window expires', async () => {
    const get = jest.fn(async (): Promise<string> => { throw new Error('boom'); });
    const client = fakeClient({ get });
    const store = new RedisStore(client as any, { failureThreshold: 2, cooldownMs: 40 });

    await expect(store.get('k')).rejects.toThrow();
    await expect(store.get('k')).rejects.toThrow(); // opens
    const callsAtOpen = get.mock.calls.length;

    await new Promise((r) => setTimeout(r, 70)); // wait past cooldown

    // Now let the client succeed; the probe must reach it.
    get.mockImplementation(async () => '{"ok":true}');
    await expect(store.get('k')).resolves.toEqual({ ok: true });
    expect(get.mock.calls.length).toBeGreaterThan(callsAtOpen);
  });
});

describe('QA 6.2 — no stale read after invalidation (AC 2/8/12)', () => {
  it('bumping the generation orphans the old key (session domain)', async () => {
    const svc = new CacheService();
    await svc.setSession('s1', { v: 1 });
    expect(await svc.getSession('s1')).toEqual({ v: 1 });

    const before = await svc.getGeneration('session');
    await svc.invalidateSession('s1');
    const after = await svc.getGeneration('session');
    expect(after).toBe(before + 1);
    expect(await svc.getSession('s1')).toBeNull();

    await svc.disconnect();
  });

  it('invalidation is O(1) INCR — no KEYS/SCAN on the hot path', async () => {
    // The generation counter is incremented, not enumerated.
    const svc = new CacheService();
    const incrSpy = jest.spyOn(MemoryStore.prototype, 'incr');
    await svc.invalidateDomain('discovery');
    expect(incrSpy).toHaveBeenCalledWith('gen:discovery');
    incrSpy.mockRestore();
    await svc.disconnect();
  });

  it('middleware: 2xx write invalidates, non-2xx does not', async () => {
    let dbValue = 'v1';
    const app = express();
    app.get('/item', cachingMiddleware({ domain: 'session', ttl: 60, enabled: true }), (req, res) =>
      res.json({ success: true, data: dbValue })
    );
    app.put('/item', cacheInvalidationMiddleware(['session']), (req, res) => {
      dbValue = 'v2';
      res.json({ success: true, data: dbValue });
    });
    app.put('/item-fail', cacheInvalidationMiddleware(['session']), (req, res) =>
      res.status(400).json({ success: false })
    );

    await cacheService.clear();
    await request(app).get('/item');
    expect((await request(app).get('/item')).headers['x-cache']).toBe('HIT');

    await request(app).put('/item');
    const after = await request(app).get('/item');
    expect(after.headers['x-cache']).toBe('MISS');
    expect(after.body.data).toBe('v2');

    // non-2xx must NOT invalidate
    await request(app).get('/item');
    expect((await request(app).get('/item')).headers['x-cache']).toBe('HIT');
    dbValue = 'v3';
    await request(app).put('/item-fail');
    const stillCached = await request(app).get('/item');
    expect(stillCached.headers['x-cache']).toBe('HIT');
    expect(stillCached.body.data).toBe('v2');

    await cacheService.clear();
  });
});

describe('QA 6.2 — X-Cache + sensitive header stripping (AC 5)', () => {
  it('HIT replays the body but strips set-cookie/authorization', async () => {
    const app = express();
    app.get('/hdr', cachingMiddleware({ domain: 'session', ttl: 60, enabled: true }), (req, res) => {
      res.set('set-cookie', 'sid=abc123');
      res.set('authorization', 'Bearer secret');
      res.set('x-custom', 'keep-me');
      res.json({ success: true, data: { v: 'body-v1' } });
    });

    await cacheService.clear();
    const miss = await request(app).get('/hdr');
    expect(miss.headers['x-cache']).toBe('MISS');
    expect(miss.headers['set-cookie']).toBeDefined(); // real response keeps it

    const hit = await request(app).get('/hdr');
    expect(hit.headers['x-cache']).toBe('HIT');
    expect(hit.headers['set-cookie']).toBeUndefined();
    expect(hit.headers['authorization']).toBeUndefined();
    expect(hit.headers['x-custom']).toBe('keep-me');
    expect(hit.body).toEqual(miss.body); // envelope unchanged
    await cacheService.clear();
  });
});

describe('QA 6.2 — caching enabled outside test (dev/prod default)', () => {
  it('with no enabled flag, caching is ON when NODE_ENV != test', async () => {
    let counter = 0;
    const app = express();
    app.get('/prod', cachingMiddleware({ domain: 'session', ttl: 60 }), (req, res) =>
      res.json({ success: true, data: ++counter })
    );

    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await cacheService.clear();
      const first = await request(app).get('/prod');
      expect(first.headers['x-cache']).toBe('MISS');
      const second = await request(app).get('/prod');
      expect(second.headers['x-cache']).toBe('HIT');
      expect(second.body.data).toBe(first.body.data);
    } finally {
      process.env.NODE_ENV = original;
      await cacheService.clear();
    }
  });
});

describe('QA 6.2 — store selection & driver reporting (AC 1/13)', () => {
  const ORIGINAL_URL = process.env.REDIS_URL;

  afterEach(() => {
    if (ORIGINAL_URL === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = ORIGINAL_URL;
    createClientMock.mockReset();
  });

  it('under NODE_ENV=test, Redis is OFF even though REDIS_URL is configured', () => {
    expect(isRedisConfigured()).toBe(true); // .env sets REDIS_URL
    expect(cacheService.getCacheStats().driver).toBe('memory');
    const svc = new CacheService(); // no override
    expect(svc.getCacheStats().driver).toBe('memory');
  });

  it('the redisEnabledOverride path constructs and uses a RedisStore', async () => {
    createClientMock.mockReturnValue(fakeClient());
    process.env.REDIS_URL = 'redis://localhost:6379';

    const svc = new CacheService({ redisEnabledOverride: true });
    await svc.init();
    await svc.set('k', 'v', 60);
    expect(await svc.get('k')).toBe('v');
    expect(svc.getCacheStats().driver).toBe('redis');
    await svc.disconnect();
  });

  it('getCacheStats().driver reports the ACTIVE driver (memory) when degraded (F4 fix)', async () => {
    createClientMock.mockReturnValue(
      fakeClient({ connect: jest.fn(async () => { throw new Error('ECONNREFUSED'); }) })
    );
    process.env.REDIS_URL = 'redis://localhost:6379';

    const svc = new CacheService({ redisEnabledOverride: true });
    await svc.init();

    // Fixed post-QA (F4): metrics and health now AGREE — both report the driver
    // actually serving reads/writes, which is 'memory' while degraded.
    expect(svc.getCacheStats().driver).toBe('memory');
    const health = await svc.healthCheck();
    expect(health.details.driver).toBe('memory');
    expect(health.details.degraded).toBe(true);
    await svc.disconnect();
  });

  it('init() resolves within the connect timeout when Redis hangs (F3 fix)', async () => {
    const ORIGINAL_TIMEOUT = process.env.REDIS_CONNECT_TIMEOUT_MS;
    const never = new Promise<void>(() => {
      /* never settles — simulates an unreachable Redis that keeps retrying */
    });
    createClientMock.mockReturnValue(fakeClient({ connect: jest.fn(() => never) }));
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.REDIS_CONNECT_TIMEOUT_MS = '80';

    try {
      const svc = new CacheService({ redisEnabledOverride: true });
      const started = Date.now();
      await svc.init(); // must NOT hang forever
      const elapsed = Date.now() - started;

      expect(elapsed).toBeLessThan(2000);
      // Degraded, but still serving from memory — never a 5xx.
      expect(svc.getCacheStats().driver).toBe('memory');
      const health = await svc.healthCheck();
      expect(health.status).toBe('degraded');
      expect(health.details.degraded).toBe(true);

      await svc.set('k', 'v', 60);
      expect(await svc.get('k')).toBe('v');

      await svc.disconnect();
    } finally {
      if (ORIGINAL_TIMEOUT === undefined) delete process.env.REDIS_CONNECT_TIMEOUT_MS;
      else process.env.REDIS_CONNECT_TIMEOUT_MS = ORIGINAL_TIMEOUT;
    }
  });
});
