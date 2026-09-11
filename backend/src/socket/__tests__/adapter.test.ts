/**
 * Socket adapter tests (Story 6.4, AC 1 / AC 15).
 *
 * Verifies the Redis adapter attaches when configured, falls back to the
 * in-memory adapter otherwise, and never throws when Redis is unreachable.
 * No real Redis is required — the `redis` client is mocked.
 */
import type { Server as SocketServer } from 'socket.io';

const connectMock = jest.fn();
const duplicateMock = jest.fn();
const quitMock = jest.fn();
const onMock = jest.fn();
const createClientMock = jest.fn();
const createAdapterMock = jest.fn();

jest.mock('redis', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

jest.mock('@socket.io/redis-adapter', () => ({
  createAdapter: (...args: unknown[]) => createAdapterMock(...args),
}));

// Deterministic env: the real env reads REDIS_URL from .env, which would
// leak into the "no URL configured" case and mask the fallback.
const mockEnv = {
  socket: { adapter: 'memory', redisUrl: '' },
  // Short connect budget so the bounded-connect test stays fast.
  redis: { connectTimeoutMs: 50 },
};
jest.mock('../../config/env', () => ({ env: mockEnv }));

import { attachAdapter, detachAdapter, hasRedisAdapter } from '../adapter';

interface FakeIo {
  io: SocketServer;
  adapterCalls: number;
}

function makeIo(): FakeIo {
  const state: FakeIo = { io: null as any, adapterCalls: 0 };
  state.io = {
    adapter: () => {
      state.adapterCalls += 1;
    },
  } as unknown as SocketServer;
  return state;
}

describe('attachAdapter (Story 6.4, AC 1 / AC 15)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    duplicateMock.mockReturnValue({ connect: connectMock, quit: quitMock, on: onMock });
    createClientMock.mockReturnValue({
      connect: connectMock,
      duplicate: duplicateMock,
      quit: quitMock,
      disconnect: jest.fn(),
      on: onMock,
    });
    connectMock.mockResolvedValue(undefined);
    quitMock.mockResolvedValue(undefined);
    createAdapterMock.mockReturnValue({ __adapter: true });
  });

  afterEach(async () => {
    await detachAdapter();
  });

  it('uses the in-memory adapter when adapter=memory (AC 15)', async () => {
    const f = makeIo(); const io = f.io;

    const attached = await attachAdapter(io, { adapter: 'memory', redisUrl: 'redis://x' });

    expect(attached).toBe(false);
    expect(createClientMock).not.toHaveBeenCalled();
    expect(f.adapterCalls).toBe(0);
  });

  it('defaults to in-memory when no Redis URL is configured', async () => {
    const f = makeIo(); const io = f.io;

    const attached = await attachAdapter(io, { adapter: 'redis', redisUrl: '' });

    expect(attached).toBe(false);
    expect(f.adapterCalls).toBe(0);
  });

  it('attaches the Redis adapter when adapter=redis and a URL is set (AC 1)', async () => {
    const f = makeIo(); const io = f.io;

    const attached = await attachAdapter(io, {
      adapter: 'redis',
      redisUrl: 'redis://localhost:6379',
    });

    expect(attached).toBe(true);
    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(duplicateMock).toHaveBeenCalledTimes(1);
    expect(createAdapterMock).toHaveBeenCalledTimes(1);
    expect(f.adapterCalls).toBe(1);
    expect(hasRedisAdapter()).toBe(true);
  });

  it('falls back to in-memory when Redis is unreachable (AC 15)', async () => {
    connectMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const f = makeIo(); const io = f.io;

    const attached = await attachAdapter(io, {
      adapter: 'redis',
      redisUrl: 'redis://unreachable:6379',
    });

    expect(attached).toBe(false);
    expect(f.adapterCalls).toBe(0);
    expect(hasRedisAdapter()).toBe(false);
  });

  it('bounds the connect attempt so an unreachable Redis cannot hang forever (Defect-2)', async () => {
    // `connect()` never settles — mirrors node-redis retrying an unreachable
    // host indefinitely. attachAdapter must still resolve (fall back).
    connectMock.mockImplementation(() => new Promise(() => undefined));
    const f = makeIo(); const io = f.io;

    const start = Date.now();
    const attached = await attachAdapter(io, {
      adapter: 'redis',
      redisUrl: 'redis://black-hole:6379',
    });
    const elapsed = Date.now() - start;

    expect(attached).toBe(false);
    expect(hasRedisAdapter()).toBe(false);
    // Resolved promptly via the timeout, not hung.
    expect(elapsed).toBeLessThan(2000);
  });

  it('registers the clients before connecting so detachAdapter can clean up a failed connect (Defect-2)', async () => {
    connectMock.mockImplementation(() => new Promise(() => undefined));
    const f = makeIo(); const io = f.io;

    await attachAdapter(io, {
      adapter: 'redis',
      redisUrl: 'redis://black-hole:6379',
    });

    // The clients were created and closed on the failure path — no leak.
    expect(quitMock).toHaveBeenCalled();
    // Calling detach again is still safe.
    await expect(detachAdapter()).resolves.toBeUndefined();
  });

  it('honours the `force` option regardless of configured adapter', async () => {
    const f = makeIo(); const io = f.io;

    const attached = await attachAdapter(io, {
      adapter: 'memory',
      redisUrl: 'redis://localhost:6379',
      force: true,
    });

    expect(attached).toBe(true);
    expect(f.adapterCalls).toBe(1);
  });

  it('detachAdapter closes the pub/sub clients and resets state', async () => {
    const io = makeIo().io;
    await attachAdapter(io, { adapter: 'redis', redisUrl: 'redis://localhost:6379' });
    expect(hasRedisAdapter()).toBe(true);

    await detachAdapter();

    expect(hasRedisAdapter()).toBe(false);
    expect(quitMock).toHaveBeenCalled();
  });

  it('detachAdapter is safe to call when nothing is attached', async () => {
    await expect(detachAdapter()).resolves.toBeUndefined();
  });
});
