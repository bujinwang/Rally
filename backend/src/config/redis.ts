/**
 * Redis client factory (Story 6.2, AC 13).
 *
 * Configuration is env-only (`REDIS_URL`); there are no hardcoded hosts. The
 * client is created with:
 *  - `disableOfflineQueue: true` — commands issued while disconnected fail
 *    immediately instead of queuing, so a down Redis never stalls a request.
 *  - a bounded `reconnectStrategy` (exponential backoff capped at ~5s).
 *
 * `getRedisUrl()` reads `process.env` at call time so tests can toggle the
 * connection without re-importing the module; `env.redis.*` supplies the
 * non-secret defaults (prefix, timeouts).
 */

import { createClient } from 'redis';
import { env } from './env';

/** The concrete client type returned by the `redis` package factory. */
export type RedisClient = ReturnType<typeof createClient>;

/** Resolve the configured Redis URL, or `undefined` when unset/blank. */
export function getRedisUrl(): string | undefined {
  const raw = (process.env.REDIS_URL ?? env.redis.url ?? '').trim();
  return raw.length > 0 ? raw : undefined;
}

/** True when a Redis URL is configured (drives store selection). */
export function isRedisConfigured(): boolean {
  return getRedisUrl() !== undefined;
}

/**
 * Create a Redis client from `REDIS_URL`.
 *
 * @throws Error when `REDIS_URL` is not configured.
 */
export function createRedisClient(): RedisClient {
  const url = getRedisUrl();
  if (!url) {
    throw new Error('[redis] REDIS_URL is not configured');
  }

  const maxRetries = Math.max(1, env.redis.maxRetries);
  const client = createClient({
    url,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: env.redis.connectTimeoutMs,
      // Bounded exponential backoff: 50ms, 100ms, 200ms ... capped at 5s.
      reconnectStrategy: (retries: number) => Math.min(50 * 2 ** Math.min(retries, maxRetries), 5000),
    },
  });

  return client;
}

/**
 * Probe a Redis client with `PING`. Never throws — returns `false` on failure.
 */
export async function probeRedis(client: RedisClient): Promise<boolean> {
  try {
    await client.ping();
    return true;
  } catch {
    return false;
  }
}

export default createRedisClient;
