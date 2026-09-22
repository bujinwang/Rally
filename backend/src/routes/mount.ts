import { Router } from 'express';
import { authenticateToken, optionalAuth, requiredAuth } from '../middleware/auth';
import { resolveIdentity } from '../middleware/permissions';

/**
 * Mount wrappers for auth-default inversion (Story 6.9 Phase 2).
 *
 * The default is now: authenticate at the mount point.
 * Genuinely public routes MUST opt out explicitly via one of these wrappers
 * and be listed in PUBLIC_ALLOWLIST.
 *
 * Classification is STRUCTURAL, never name-based:
 *  - a wrapper records the router it wrapped in `MOUNT_EVIDENCE` (a WeakMap), so
 *    the coverage test can ask production what it actually did at mount time;
 *  - middleware identity is compared by reference against the real
 *    `authenticateToken` / `optionalAuth` exports, so a middleware that merely
 *    *looks* like an auth guard by name cannot satisfy the test;
 *  - `publicRoute()` registers its returned function in a WeakSet, so the marker
 *    is unforgeable by naming.
 */

/** How a router was mounted. Recorded by the wrappers themselves. */
export type MountKind = 'requireAuth' | 'optionalIdentity' | 'public';

/**
 * Evidence registry: which mount wrapper was actually applied to a router.
 * Populated as a side effect of `routes/index.ts` / `server.ts` executing their
 * real mounts at import, so the coverage test reads production behaviour rather
 * than a list re-typed in the test.
 */
const MOUNT_EVIDENCE = new WeakMap<Router, MountKind>();

/** The mount wrapper production applied to `router`, or undefined if unwrapped. */
export function mountEvidenceOf(router: Router): MountKind | undefined {
  return MOUNT_EVIDENCE.get(router);
}

/** Functions returned by `publicRoute()`. Membership is the marker. */
const PUBLIC_ROUTE_MARKERS = new WeakSet<Function>();

/**
 * Routers created BY a wrapper (`requireAuth`/`optionalIdentity`), as opposed to
 * the router that was wrapped. A router that merely *contains* other routers
 * (e.g. the aggregation router in routes/index.ts) is NOT a wrapper, so callers
 * must never guess "the inner router" by looking for a nested router.
 */
const WRAPPER_ROUTERS = new WeakSet<Router>();

/** True only for routers returned by `requireAuth()` / `optionalIdentity()`. */
export function isWrapperRouter(router: Router): boolean {
  return WRAPPER_ROUTERS.has(router);
}

/**
 * Default wrapper — REQUIRES authentication (JWT).
 * Applies `authenticateToken` which validates the Bearer token and sets `req.user`.
 * Use this for routes that must have a verified user identity.
 */
export function requireAuth(router: Router): Router {
  const wrapped = Router();
  wrapped.use(authenticateToken);
  wrapped.use(router);
  WRAPPER_ROUTERS.add(wrapped);
  // Record both the inner router and the wrapper: whichever the caller walks.
  MOUNT_EVIDENCE.set(router, 'requireAuth');
  MOUNT_EVIDENCE.set(wrapped, 'requireAuth');
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
  WRAPPER_ROUTERS.add(wrapped);
  MOUNT_EVIDENCE.set(router, 'optionalIdentity');
  MOUNT_EVIDENCE.set(wrapped, 'optionalIdentity');
  return wrapped;
}

/**
 * Public wrapper — NO authentication.
 * The router is mounted as-is. Any router wrapped with this MUST have a
 * corresponding entry in PUBLIC_ALLOWLIST (or be a single public route
 * wrapped via the internal `publicRoute` marker — see below).
 */
export function publicRouter(router: Router): Router {
  MOUNT_EVIDENCE.set(router, 'public');
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
  PUBLIC_ROUTE_MARKERS.add(publicRoute);
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
  // Health checks + app root (server.ts, mounted bare on the app)
  'GET /health',
  'GET /api/v1/health',
  'GET /api/v1/health/cache',
  'GET /',
  // Auth routes (wrapped with publicRouter in index.ts)
  'POST /api/v1/auth/register',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
  // OAuth routes (pre-auth login, wrapped with publicRouter)
  'GET /api/v1/oauth/:provider/url',
  'GET /api/v1/oauth/:provider/callback',
  // OAuth mobile handshake — pre-auth by definition (see the OAuth bypass P0 fix)
  'POST /api/v1/oauth/:provider/mobile',
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
  // rankings.ts — GETs are public leaderboards (router is optionalIdentity)
  'GET /api/v1/rankings/player/:playerId/history',
  'GET /api/v1/rankings/session/:sessionId',
  'GET /api/v1/rankings/global',

  // statistics.ts — all GETs public (router is publicRouter)
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
  // Router is publicRouter, but writes need explicit requireAuth inside
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
  // analytics writes (explicitly requireAuth inside router)
  'POST /api/v1/analytics/refresh/player/:playerId',
  'POST /api/v1/analytics/refresh/session/:sessionId',
  'POST /api/v1/analytics/refresh/tournament/:tournamentId',
  'POST /api/v1/analytics/refresh/system',
  'POST /api/v1/analytics/track-event',
  'POST /api/v1/analytics/export',

  // discovery.ts — reads public; POST /:sessionId/join is share-code-gated
  // Router is optionalIdentity, but routes have publicRoute() marker
  'GET /api/v1/sessions/discovery/',
  'GET /api/v1/sessions/discovery/recommended/:deviceId',
  'GET /api/v1/sessions/discovery/nearby',
  'GET /api/v1/sessions/discovery/:sessionId',
  'GET /api/v1/sessions/discovery/stats/summary',
  'POST /api/v1/sessions/discovery/:sessionId/join',

  // search.ts — all GETs public (router is publicRouter)
  'GET /api/v1/search/',
  'GET /api/v1/search/suggestions',

  // sharing.ts — feed and preview are public (router is optionalIdentity)
  'GET /api/v1/sharing/feed',
  'GET /api/v1/sharing/preview/:type/:entityId',

  // achievements.ts — root GET is public (router is optionalIdentity)
  'GET /api/v1/achievements/',

  // sessionInsights.ts — all GETs public (tentative, per design; router is optionalIdentity)
  'GET /api/v1/session-insights/session/:sessionId',
  'GET /api/v1/session-insights/player/:sessionId/:playerName',
  'GET /api/v1/session-insights/balanced-teams/:sessionId',

  // sessionSuggestions.ts — GETs public (tentative, per design; router is optionalIdentity)
  'GET /api/v1/session-suggestions/suggestions/:deviceId',

  // mvpSessions.ts — share-code-gated public routes (router is publicRouter)
  'GET /api/v1/mvp-sessions/',
  'GET /api/v1/mvp-sessions/:shareCode/recap',
  'GET /api/v1/mvp-sessions/:shareCode',
  'GET /api/v1/mvp-sessions/join/:shareCode',
  'POST /api/v1/mvp-sessions/join/:shareCode',
  'GET /api/v1/mvp-sessions/my-sessions/:deviceId',
  'GET /api/v1/mvp-sessions/:shareCode/rotation',
  // Additional share-code-gated reads: each handler resolves the session by
  // `:shareCode` and 404s when it does not exist (the share code is the secret).
  'GET /api/v1/mvp-sessions/:shareCode/matches/:matchId',
  'GET /api/v1/mvp-sessions/:shareCode/players/:playerName/stats',
  'GET /api/v1/mvp-sessions/:shareCode/players/me/:deviceId',
  'GET /api/v1/mvp-sessions/:shareCode/check-in-summary',
  'GET /api/v1/mvp-sessions/:shareCode/leaderboard',
  'GET /api/v1/mvp-sessions/:shareCode/rest-status',
  'GET /api/v1/mvp-sessions/:shareCode/statistics',
  'GET /api/v1/mvp-sessions/player-stats/:playerName',

  // tournaments.ts — public reads (browsing tournaments is public by design).
  // NOTE: the organizer-guarded routes in this router are guarded INSIDE
  // (optionalAuth + requireTournamentOrganizer()); see the self-guard test.
  'GET /api/v1/tournaments/',
  'GET /api/v1/tournaments/:id',
  'GET /api/v1/tournaments/:id/bracket',
  'GET /api/v1/tournaments/:id/standings',
  'GET /api/v1/tournaments/:id/stats',

  // predictions.ts — public read of one prediction type (admin routes self-guard)
  'GET /api/v1/predictions/:type',
]);

/**
 * Type guard: is this middleware the real authentication guard?
 *
 * Compared by REFERENCE against the real exports — `requiredAuth` is an alias of
 * `authenticateToken`. A look-alike middleware named `authenticateToken` no
 * longer satisfies this check (the earlier name-string comparison could be
 * satisfied by any function with that name).
 */
export function isRequireAuthMiddleware(fn: any): boolean {
  return fn === authenticateToken || fn === requiredAuth;
}

/** Type guard: is this middleware the real optional-identity middleware? */
export function isOptionalAuthMiddleware(fn: any): boolean {
  return fn === optionalAuth;
}

/** Type guard: was this middleware produced by `publicRoute()`? (WeakSet membership) */
export function isPublicRouteMarker(fn: any): boolean {
  return typeof fn === 'function' && PUBLIC_ROUTE_MARKERS.has(fn as Function);
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
