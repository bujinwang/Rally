// Unit tests for RedisStore against a MOCKED redis client (Story 6.2, AC 1/15).
// No real socket is ever opened.
import { RedisStore } from '../redisStore';
import { CacheUnavailableError } from '../types';

interface MockClient {
  [key: string]: any;
}

/** Build an in-memory fake of the subset of the redis client we use. */
function createMockClient(overrides: Record<string, any> = {}): MockClient {
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

describe('RedisStore', () => {
  it('get / set round-trips JSON values', async () => {
    const client = createMockClient();
    const store = new RedisStore(client as any, { keyPrefix: 'rally:cache:' });

    await store.set('k', { a: 1 }, 60);
    expect(await store.get('k')).toEqual({ a: 1 });

    // Keys are namespaced.
    expect(client._data.has('rally:cache:k')).toBe(true);
    // TTL is passed through.
    expect(client.set).toHaveBeenCalledWith('rally:cache:k', expect.any(String), { EX: 60 });
  });

  it('returns null for a missing key', async () => {
    const store = new RedisStore(createMockClient() as any, {});
    expect(await store.get('nope')).toBeNull();
  });

  it('delete / exists', async () => {
    const store = new RedisStore(createMockClient() as any, {});
    await store.set('k', 'v', 60);
    expect(await store.exists('k')).toBe(true);
    await store.delete('k');
    expect(await store.exists('k')).toBe(false);
  });

  it('incr returns the new counter value', async () => {
    const store = new RedisStore(createMockClient() as any, {});
    expect(await store.incr('gen:session')).toBe(1);
    expect(await store.incr('gen:session')).toBe(2);
  });

  it('skips values larger than maxEntryBytes', async () => {
    const client = createMockClient();
    const store = new RedisStore(client as any, { maxEntryBytes: 16 });

    await store.set('big', 'x'.repeat(500), 60);
    expect(client.set).not.toHaveBeenCalled();
    expect(await store.get('big')).toBeNull();
  });

  it('throws CacheUnavailableError when the client errors', async () => {
    const client = createMockClient({ get: jest.fn(async () => { throw new Error('boom'); }) });
    const store = new RedisStore(client as any, {});

    await expect(store.get('k')).rejects.toBeInstanceOf(CacheUnavailableError);
  });

  it('opens the circuit breaker after repeated failures and fails fast', async () => {
    const failingGet = jest.fn(async () => { throw new Error('boom'); });
    const client = createMockClient({ get: failingGet });
    const store = new RedisStore(client as any, { failureThreshold: 2, cooldownMs: 10_000 });

    await expect(store.get('k')).rejects.toBeInstanceOf(CacheUnavailableError);
    await expect(store.get('k')).rejects.toBeInstanceOf(CacheUnavailableError);
    const callsBeforeOpen = failingGet.mock.calls.length;
    // Breaker is now open → the next call must NOT hit the client.
    await expect(store.get('k')).rejects.toBeInstanceOf(CacheUnavailableError);
    expect(failingGet.mock.calls.length).toBe(callsBeforeOpen);
  });

  it('reports healthy when ping succeeds', async () => {
    const store = new RedisStore(createMockClient() as any, {});
    const health = await store.health();
    expect(health.status).toBe('healthy');
    expect(health.driver).toBe('redis');
  });

  it('close() resolves promptly when the client is NOT ready (F6 — no hang)', async () => {
    // Stuck opening: isOpen true, isReady false, and quit() never settles.
    const quit = jest.fn(() => new Promise<string>(() => undefined));
    const disconnect = jest.fn();
    const client = createMockClient({ isOpen: true, isReady: false, quit, disconnect });
    const store = new RedisStore(client as any, {});

    const started = Date.now();
    await expect(store.close()).resolves.toBeUndefined();
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(300);
    expect(disconnect).toHaveBeenCalledTimes(1); // sync disconnect used
    expect(quit).not.toHaveBeenCalled(); // quit() avoided while not ready
  });

  it('close() quits gracefully when the client IS ready', async () => {
    const quit = jest.fn(async () => 'OK');
    const disconnect = jest.fn();
    const client = createMockClient({ isOpen: true, isReady: true, quit, disconnect });
    const store = new RedisStore(client as any, {});

    await expect(store.close()).resolves.toBeUndefined();
    expect(quit).toHaveBeenCalledTimes(1);
  });

  it('close() is bounded even if a ready client quit() hangs', async () => {
    const quit = jest.fn(() => new Promise<string>(() => undefined)); // never settles
    const client = createMockClient({ isOpen: true, isReady: true, quit });
    const store = new RedisStore(client as any, {});

    const started = Date.now();
    await expect(store.close()).resolves.toBeUndefined();
    expect(Date.now() - started).toBeLessThan(1500);
  });
});
