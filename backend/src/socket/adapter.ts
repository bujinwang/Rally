/**
 * Socket.io adapter factory (Story 6.4, AC 1 / AC 15).
 *
 * Creates a Redis pub/sub adapter when configured, otherwise falls back to
 * the built-in in-memory adapter (the local-dev / single-instance default).
 *
 * The adapter is what allows multiple server instances to share socket
 * state — required for horizontal scaling (AC 1).
 *
 * Configuration is env-only (AC 15): `SOCKET_ADAPTER=redis|memory` and
 * `SOCKET_REDIS_URL` (falling back to `REDIS_URL`). Nothing is hardcoded.
 */

import { Server as SocketServer } from 'socket.io';
import { createClient } from 'redis';
import { env } from '../config/env';

export interface AdapterOptions {
  /** 'redis' attaches the pub/sub adapter; 'memory' keeps the default. */
  adapter?: 'redis' | 'memory';
  /** Redis URL for the pub/sub client pair. */
  redisUrl?: string;
  /** Force the redis path even when the configured adapter is 'memory'. */
  force?: boolean;
}

let redisClients: { pubClient: any; subClient: any } | null = null;

/**
 * Whether a Redis adapter is currently **attached to `io`** (Story 6.4, AC 1).
 *
 * Distinct from "clients were created": on a failed connect the clients exist
 * briefly (so `detachAdapter()` can close them) but no adapter is attached.
 * `hasRedisAdapter()` must only report a real attachment.
 */
let redisAdapterAttached = false;

/** Best-effort close of a redis client, tolerating partial mocks/clients. */
async function closeClient(client: any): Promise<void> {
  if (!client) return;
  try {
    if (typeof client.quit === 'function') {
      await client.quit();
      return;
    }
  } catch {
    /* fall through to a hard disconnect */
  }
  try {
    if (typeof client.disconnect === 'function') {
      client.disconnect();
    }
  } catch {
    /* nothing further we can do — the handle may already be gone */
  }
}

/**
 * Attach the configured Socket.io adapter.
 *
 * Returns `true` when a Redis adapter was attached, `false` when the
 * in-memory adapter is in use (either by config or because Redis was
 * unreachable — the fallback is always graceful, AC 15).
 */
export async function attachAdapter(
  io: SocketServer,
  options: AdapterOptions = {}
): Promise<boolean> {
  const adapter = options.adapter || env.socket.adapter;
  const redisUrl = options.redisUrl || env.socket.redisUrl;

  const wantRedis = options.force || adapter === 'redis';

  if (!wantRedis || !redisUrl) {
    if (wantRedis && !redisUrl) {
      console.warn(
        '[socket] SOCKET_ADAPTER=redis but no Redis URL is configured — ' +
          'using the in-memory adapter (single instance).'
      );
    } else {
      console.log('🔌 Socket.io using in-memory adapter (single instance)');
    }
    return false;
  }

  // Bound the connect attempt so an unreachable Redis fails fast instead of
  // retrying forever (a node-redis client retries indefinitely by default,
  // which would hang `attachAdapter` and leak its handle).
  const connectTimeoutMs = env.redis?.connectTimeoutMs ?? 5000;

  let pubClient: any;
  let subClient: any;
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    // Lazily require the Redis adapter so the in-memory path — and this module's
    // documented fallback — never depend on the package being installed. A
    // missing package is caught below and degrades to in-memory, instead of
    // crashing the process at import time (Story 6.4, AC 15).
    const { createAdapter } = require('@socket.io/redis-adapter') as typeof import('@socket.io/redis-adapter');

    pubClient = createClient({
      url: redisUrl,
      disableOfflineQueue: true,
      // Fail fast on an unreachable host rather than queuing/retrying forever.
      socket: { reconnectStrategy: false },
    });
    subClient = pubClient.duplicate();

    // A silent error handler keeps an unreachable Redis from crashing the
    // process — the adapter degrades to in-memory (AC 15).
    pubClient.on('error', () => undefined);
    subClient.on('error', () => undefined);

    // Assign BEFORE connecting so `detachAdapter()` can always close whatever
    // was created — even if the connect below times out or rejects.
    redisClients = { pubClient, subClient };

    const connectPromise = Promise.all([pubClient.connect(), subClient.connect()]);
    // If the timeout wins the race the connect promise may still settle later
    // (reject/resolve); swallow it so it never becomes an unhandled rejection.
    connectPromise.catch(() => undefined);

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Redis connect timed out after ${connectTimeoutMs}ms`)),
        connectTimeoutMs
      );
      // Do not let the timer itself hold the event loop open.
      (timer as any)?.unref?.();
    });

    await Promise.race([connectPromise, timeoutPromise]);

    if (timer) clearTimeout(timer);
    timer = undefined;

    io.adapter(createAdapter(pubClient, subClient) as any);
    redisAdapterAttached = true;
    console.log('🔌 Socket.io Redis adapter attached (multi-instance)');
    return true;
  } catch (error) {
    if (timer) clearTimeout(timer);
    timer = undefined;

    // The clients were created (and are registered in `redisClients`) but the
    // adapter was never attached — close them so no handle leaks.
    redisAdapterAttached = false;
    if (pubClient || subClient) {
      await Promise.allSettled([closeClient(pubClient), closeClient(subClient)]);
      redisClients = null;
    }

    console.warn(
      '⚠️ Failed to attach Redis adapter — falling back to in-memory:',
      error instanceof Error ? error.message : error
    );
    return false;
  }
}

/**
 * Close the adapter's Redis clients (called from the shutdown handler so the
 * process can exit cleanly instead of hanging on an open socket).
 *
 * Safe to call at any time, including when the connect attempt failed — in
 * that case the clients are still registered and are closed here.
 */
export async function detachAdapter(): Promise<void> {
  redisAdapterAttached = false;
  if (!redisClients) return;
  const { pubClient, subClient } = redisClients;
  redisClients = null;
  await Promise.allSettled([closeClient(pubClient), closeClient(subClient)]);
}

/**
 * Test/recon helper — whether a Redis adapter is currently **attached** to a
 * Socket.io server (not merely whether clients were created).
 */
export function hasRedisAdapter(): boolean {
  return redisAdapterAttached;
}
