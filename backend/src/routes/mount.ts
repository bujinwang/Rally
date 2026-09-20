import { Router } from 'express';
import { authenticateToken, optionalAuth } from '../middleware/auth';
import { resolveIdentity } from '../middleware/permissions';

/**
 * Mount wrappers for auth-default inversion (Story 6.9 Phase 2).
 *
 * The default is now: authenticate at the mount point.
 * Genuinely public routes MUST opt out explicitly via one of these wrappers
 * and be listed in PUBLIC_ALLOWLIST.
 */

/**
 * Default wrapper — REQUIRES authentication (JWT).
 * Applies `authenticateToken` which validates the Bearer token and sets `req.user`.
 * Use this for routes that must have a verified user identity.
 */
export function requireAuth(router: Router): Router {
  const wrapped = Router();
  wrapped.use(authenticateToken);
  wrapped.use(router);
  return wrapped;
}

/**
 * Compatibility wrapper — OPTIONAL authentication.
 * Applies `optionalAuth`: a valid JWT sets `req.user` and wins via `resolveIdentity`;
 * a request with no JWT but a `deviceId` (body, query, or x-device-id header)
 * still proceeds. This preserves current behaviour for device-keyed routes
 * while making the opt-out explicit.
 *
 * IMPORTANT: `deviceId` is NOT authentication — it is client-asserted and
 * unverified. `optionalIdentity` is a COMPATIBILITY wrapper, not a security
 * control. Routes that mutate state under this wrapper remain spoofable.
 * Deciding whether `deviceId` is an auth factor is P2 (deferred) — this
 * wrapper exists only to preserve current guest/device callers.
 */
export function optionalIdentity(router: Router): Router {
  const wrapped = Router();
  wrapped.use(optionalAuth);
  // Ensure resolveIdentity sees the optionalAuth result (req.user if JWT)
  wrapped.use((req, _res, next) => {
    const identity = resolveIdentity(req);
    (req as any).resolvedIdentity = identity;
    next();
  });
  wrapped.use(router);
  return wrapped;
}

/**
 * Public wrapper — NO authentication.
 * The router is mounted as-is. Any router wrapped with this MUST have a
 * corresponding entry in PUBLIC_ALLOWLIST (or be a single public route
 * wrapped via the internal `publicRoute` marker — see below).
 */
export function publicRouter(router: Router): Router {
  return router;
}

/**
 * Internal marker for a single public route within a mixed router.
 * Usage: `router.get('/public-endpoint', publicRoute(), handler)`.
 * The mount-coverage test checks for this marker on the route's middleware stack.
 */
export function publicRoute() {
  function publicRoute(_req: any, _res: any, next: any) {
    next();
  }
  return publicRoute;
}

/**
 * PUBLIC_ALLOWLIST — the audit artifact.
 *
 * Every router wrapped with `publicRouter()` or route marked with `publicRoute()`
 * MUST have an entry here. The mount-coverage test (mount-auth-coverage.test.ts)
 * walks every mounted router's stack and asserts each registered route is either:
 *  1. Behind `requireAuth` (or `authenticateToken`/`requiredAuth` directly), OR
 *  2. Behind `optionalIdentity` (or `optionalAuth` directly), OR
 *  3. Named in this allow-list.
 *
 * Format: 'METHOD /mount-path/route-path' or 'METHOD /mount-path/*' for whole routers.
 * Paths are the FULL path as mounted in routes/index.ts or server.ts.
 *
 * Derived from architect's §9.4 and QA-3's route classification.
 */
export const PUBLIC_ALLOWLIST: ReadonlySet<string> = new Set([
  // ── Wholly public routers / endpoints ──────────────────────────────────
  // API root (routes/index.ts:50) — extracted as /api/v1/
  'GET /api/v1/',
  // Health endpoints (server.ts) — mounted directly on app, not extracted by test
  // 'GET /health', 'GET /api/v1/health', 'GET /api/v1/health/cache',
  // Auth routes (already self-guarded via their own logic)
  'POST /api/v1/auth/register',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
  // OAuth routes (pre-auth login)
  'GET /api/v1/oauth/:provider/url',
  'GET /api/v1/oauth/:provider/callback',
  // Web session (mounted at /join in server.ts:128) — share-code-gated
  'GET /join/:shareCode',
  'GET /join/:shareCode/player-status',
  'POST /join/:shareCode/join',
  'DELETE /join/:shareCode/leave',
  // Share card (mounted bare in server.ts:129) — share-code-gated
  'GET /s/:shareCode/og-image',
  'GET /s/:shareCode',
  // Metrics (mounted at /metrics in server.ts:141) — self-guards via bearer token
  'GET /metrics/',

  // ── Public routes in mixed routers ─────────────────────────────────────
  // rankings.ts — GETs are public leaderboards
  'GET /api/v1/rankings/player/:playerId/history',
  'GET /api/v1/rankings/session/:sessionId',
  'GET /api/v1/rankings/global',

  // statistics.ts — all GETs public
  'GET /api/v1/statistics/player/:playerId',
  'GET /api/v1/statistics/leaderboard',
  'GET /api/v1/statistics/session/:sessionId',
  'GET /api/v1/statistics/compare',
  'GET /api/v1/statistics/trends/:playerId',
  'GET /api/v1/statistics/player/:playerId/streaks',
  'GET /api/v1/statistics/player/:playerId/percentiles',
  'GET /api/v1/statistics/session/:sessionId/heatmap',
  'GET /api/v1/statistics/head-to-head',

  // analytics.ts — GETs public (writes are inner-wrapped with requireAuth)
  'GET /api/v1/analytics/player/:playerId',
  'GET /api/v1/analytics/leaderboard',
  'GET /api/v1/analytics/player/:playerId/trends',
  'GET /api/v1/analytics/session/:sessionId',
  'GET /api/v1/analytics/tournament/:tournamentId',
  'GET /api/v1/analytics/system',
  'GET /api/v1/analytics/sessions',
  'GET /api/v1/analytics/trends',
  'GET /api/v1/analytics/geography',
  'GET /api/v1/analytics/participation',
  'GET /api/v1/analytics/session-types',
  'GET /api/v1/analytics/peak-usage',

  // discovery.ts — reads public; POST /:sessionId/join is share-code-gated
  'GET /api/v1/sessions/discovery',
  'GET /api/v1/sessions/discovery/recommended/:deviceId',
  'GET /api/v1/sessions/discovery/nearby',
  'GET /api/v1/sessions/discovery/:sessionId',
  'GET /api/v1/sessions/discovery/stats/summary',
  'POST /api/v1/sessions/discovery/:sessionId/join',

  // search.ts — all GETs public
  'GET /api/v1/search',
  'GET /api/v1/search/suggestions',

  // sharing.ts — feed and preview are public
  'GET /api/v1/sharing/feed',
  'GET /api/v1/sharing/preview/:type/:entityId',

  // achievements.ts — root GET is public
  'GET /api/v1/achievements',

  // sessionInsights.ts — all GETs public (tentative, per design)
  'GET /api/v1/session-insights/session/:sessionId',
  'GET /api/v1/session-insights/player/:sessionId/:playerName',
  'GET /api/v1/session-insights/balanced-teams/:sessionId',

  // sessionSuggestions.ts — GETs public (tentative, per design)
  'GET /api/v1/session-suggestions/suggestions/:deviceId',
]);

/**
 * Type guard to check if a middleware function is `authenticateToken`/`requiredAuth`.
 */
function isRequireAuthMiddleware(fn: any): boolean {
  return fn.name === 'authenticateToken' || fn.name === 'requiredAuth';
}

/**
 * Type guard to check if a middleware function is `optionalAuth`.
 */
function isOptionalAuthMiddleware(fn: any): boolean {
  return fn.name === 'optionalAuth';
}

/**
 * Type guard to check if a middleware function is the `publicRoute` marker.
 */
function isPublicRouteMarker(fn: any): boolean {
  return fn.name === 'publicRoute';
}

/**
 * Check if a route (layer) has requireAuth protection (directly or via wrapper).
 */
export function routeHasRequireAuth(layer: any): boolean {
  if (!layer.route) return false;
  const stack = layer.route.stack;
  return stack.some((l: any) => isRequireAuthMiddleware(l.handle));
}

/**
 * Check if a route (layer) has optionalIdentity/optionalAuth protection.
 */
export function routeHasOptionalAuth(layer: any): boolean {
  if (!layer.route) return false;
  const stack = layer.route.stack;
  return stack.some((l: any) => isOptionalAuthMiddleware(l.handle));
}

/**
 * Check if a route (layer) is explicitly marked public via publicRoute().
 */
export function routeIsPublicMarker(layer: any): boolean {
  if (!layer.route) return false;
  const stack = layer.route.stack;
  return stack.some((l: any) => isPublicRouteMarker(l.handle));
}