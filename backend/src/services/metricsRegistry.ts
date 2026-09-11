/**
 * Prometheus metric registry (Story 6.3, AC 1).
 *
 * Defines all metric families used by the Rally backend. The registry is
 * exported as a singleton so that metric state is consistent across the
 * process lifetime.
 *
 * Label cardinality discipline (AC 8):
 *  - `route` labels use canonical Express patterns (e.g. `/:shareCode`),
 *    never raw URLs, so cardinality is bounded to the number of declared
 *    routes.
 *  - No userId, deviceId, email, or free-text ever appears as a label.
 */

import { Registry, Counter, Histogram, Gauge } from 'prom-client';

export const register = new Registry();

/** Total HTTP requests. Labels: method, route (canonical), status. */
export const httpRequestsTotal = new Counter({
  name: 'rally_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

/** HTTP request duration in seconds. Labels: method, route (canonical). */
export const httpRequestDuration = new Histogram({
  name: 'rally_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

/** Total application errors. Labels: type, endpoint (canonical). */
export const errorsTotal = new Counter({
  name: 'rally_errors_total',
  help: 'Total application errors',
  labelNames: ['type', 'endpoint'],
  registers: [register],
});

/** Number of active users (business KPI). */
export const businessActiveUsers = new Gauge({
  name: 'rally_business_active_users',
  help: 'Number of active users',
  registers: [register],
});

/** Number of total sessions (business KPI). */
export const businessTotalSessions = new Gauge({
  name: 'rally_business_total_sessions',
  help: 'Number of total sessions',
  registers: [register],
});

/** Process memory usage in MB. */
export const systemMemoryUsage = new Gauge({
  name: 'rally_system_memory_usage_mb',
  help: 'Process memory usage in MB',
  registers: [register],
});

/** Process CPU usage percentage. */
export const systemCpuUsage = new Gauge({
  name: 'rally_system_cpu_usage_percent',
  help: 'Process CPU usage percentage',
  registers: [register],
});

/** Active database connections. */
export const dbConnectionsActive = new Gauge({
  name: 'rally_db_connections_active',
  help: 'Active database connections',
  registers: [register],
});

/** Cache hit rate (0-1). Story 6.2 source. */
export const cacheHitRate = new Gauge({
  name: 'rally_cache_hit_rate',
  help: 'Cache hit rate (0-1)',
  registers: [register],
});

/**
 * Derive a canonical route pattern from an Express request.
 *
 * Express stores the matched route on `req.route`. If available, we use
 * `req.route.path` (which contains the pattern, e.g. `/:shareCode`).
 * If `req.route` is not set (e.g. static files or unmatched routes), we
 * fall back to `req.path` with any UUID/CUID-like segments replaced by
 * `:id` to keep cardinality bounded.
 */
export function canonicalRoute(req: { route?: { path?: string }; path?: string }): string {
  if (req.route?.path) {
    return req.route.path;
  }
  const path = req.path ?? 'unknown';
  // Replace CUID/UUID-like segments with :id to bound cardinality
  return path
    .replace(/\/[a-z0-9]{20,}/gi, '/:id')
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id');
}
