import crypto from 'crypto';
import dotenv from 'dotenv';

// Load .env as early as possible. This module is imported transitively by
// `utils/jwt.ts` (and therefore by every route), which may run before
// `server.ts` reaches its own `dotenv.config()` call. Loading here keeps the
// secret resolution correct regardless of import order. `dotenv` does not
// override variables that are already present in `process.env`.
dotenv.config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';
const isTest = NODE_ENV === 'test';

const MIN_SECRET_LENGTH = 32;

/**
 * Resolve a required secret.
 * - Present: returned as-is (must be >= 32 chars in production).
 * - Missing in production: throws so the process fails fast at startup.
 * - Missing in dev/test: returns a per-process random secret and logs a loud
 *   warning. Tokens issued with it do not survive a restart; developers who
 *   want stable sessions should set the variable in `.env`.
 */
function resolveSecret(name: string, purpose: string): string {
  const value = process.env[name];

  if (value && value.length > 0) {
    if (isProduction && value.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `[env] ${name} must be at least ${MIN_SECRET_LENGTH} characters in production (got ${value.length}).`
      );
    }
    return value;
  }

  if (isProduction) {
    throw new Error(`[env] ${name} is required in production but was not set.`);
  }

  if (!isTest) {
    console.warn(
      `[env] ${name} is not set — using a random per-process ${purpose}. ` +
        `Issued tokens will not survive a restart. Set ${name} in .env for stable sessions.`
    );
  }

  return crypto.randomBytes(MIN_SECRET_LENGTH).toString('hex');
}

/** Parse a positive integer env var, falling back to a default. */
function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const env = {
  nodeEnv: NODE_ENV,
  isProduction,
  isTest,
  jwt: {
    secret: resolveSecret('JWT_SECRET', 'access-token secret'),
    refreshSecret: resolveSecret('JWT_REFRESH_SECRET', 'refresh-token secret'),
    accessExpiry: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  // Redis-backed cache configuration (Story 6.2, AC 13). Env-only — no
  // hardcoded hosts. When `REDIS_URL` is absent the app uses the memory store.
  redis: {
    url: process.env.REDIS_URL || '',
    enabled: Boolean(process.env.REDIS_URL),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'rally:cache:',
    connectTimeoutMs: parseIntEnv('REDIS_CONNECT_TIMEOUT_MS', 5000),
    maxRetries: parseIntEnv('REDIS_MAX_RETRIES', 10),
    // Maximum size (bytes) of a single cache entry; larger values are skipped.
    cacheMaxEntryBytes: parseIntEnv('CACHE_MAX_ENTRY_BYTES', 256 * 1024),
  },
  // Observability configuration (Story 6.3, AC 15). Env-only — no hardcoded
  // endpoints or secrets.
  metrics: {
    enabled: process.env.METRICS_ENABLED === 'true' || isProduction,
    port: parseIntEnv('METRICS_PORT', 9090),
    path: process.env.METRICS_PATH || '/metrics',
    // Auth token for /metrics endpoint. If unset, /metrics returns 401 for all
    // requests — the server does NOT crash. Set in production to enable scraping.
    authToken: process.env.METRICS_AUTH_TOKEN || '',
  },
  // Socket.io real-time configuration (Story 6.4, AC 1 / AC 15 / AC 16).
  // Env-only — no hardcoded adapter endpoints. When `SOCKET_ADAPTER=redis`
  // (or `REDIS_URL` is set) the Redis pub/sub adapter is attached so multiple
  // server instances share socket state. Otherwise the built-in in-memory
  // adapter is used, which is the local-dev / single-instance default.
  socket: {
    adapter: (process.env.SOCKET_ADAPTER ||
      (process.env.REDIS_URL ? 'redis' : 'memory')) as 'redis' | 'memory',
    // Redis URL for the adapter's pub/sub client pair. Falls back to the
    // cache URL so a single REDIS_URL configures both.
    redisUrl: process.env.SOCKET_REDIS_URL || process.env.REDIS_URL || '',
    // Grace period (ms) before a disconnected socket flips presence offline.
    patienceMs: parseIntEnv('SOCKET_PATIENCE_MS', 5000),
    // Reconnect: max events replayed before the client is told to refetch.
    maxReplayEvents: parseIntEnv('SOCKET_MAX_REPLAY_EVENTS', 10),
    // Bounded in-memory event ring used for reconnect replay (per room).
    eventBufferSize: parseIntEnv('SOCKET_EVENT_BUFFER_SIZE', 200),
  },
};

export default env;
