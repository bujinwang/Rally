/**
 * Mount-auth-coverage test (Story 6.9 Phase 2).
 *
 * Walks the Express app the way PRODUCTION builds it (`server.ts` mounting
 * `setupRoutes()`) and asserts every registered route is classified as one of:
 *   1. behind `requireAuth` / `authenticateToken` / `requiredAuth`, OR
 *   2. behind `optionalIdentity` / `optionalAuth`, OR
 *   3. explicitly marked with `publicRoute()`, OR
 *   4. listed in `PUBLIC_ALLOWLIST` (a conscious public declaration), OR
 *   5. pinned in `KNOWN_GAPS` (see below).
 *
 * Classification is STRUCTURAL, never name-based:
 *   - mount protection comes from `mountEvidenceOf(router)`, a WeakMap the mount
 *     wrappers populate when index.ts/server.ts execute their real mounts, so the
 *     test reads production behaviour instead of a list re-typed in the test;
 *   - route-level protection is compared BY REFERENCE against the real
 *     `authenticateToken`/`optionalAuth` exports, so a middleware that merely has
 *     an auth-sounding `name` cannot satisfy it;
 *   - `publicRoute()` membership is a WeakSet, so its marker is unforgeable.
 *
 * Adding a route without classifying it fails. Mounting a router that is not
 * registered in MOUNT_LABELS fails. Adding an UNGUARDED state-changing route
 * fails (KNOWN_GAPS is exact, and goes stale the moment a gap is fixed).
 */

// ── Isolation from the database (must precede the imports that consume it) ────
// `server.ts` calls `connectDB()` at import and several route services build
// `new PrismaClient()` at module scope. Neither is exercised by this suite, but
// without these mocks the process dies with PrismaClientInitializationError
// (engine-path mismatch in this environment) before jest can report anything.
jest.mock('@prisma/client', () => {
  class PrismaClient {
    $connect = jest.fn().mockResolvedValue(undefined);
    $disconnect = jest.fn().mockResolvedValue(undefined);
    $queryRaw = jest.fn().mockResolvedValue([]);
    $executeRaw = jest.fn().mockResolvedValue(0);
    $transaction = jest.fn().mockResolvedValue([]);
    $on = jest.fn();
    $use = jest.fn();
  }
  return {
    PrismaClient,
    Prisma: { sql: (v: unknown) => v, raw: (v: unknown) => v, join: () => '', empty: {} },
  };
});

jest.mock('../../config/database', () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
  prisma: {},
}));

import express from 'express';
import request from 'supertest';

import app from '../../server';
import { setupRoutes } from '../index';
import {
  PUBLIC_ALLOWLIST,
  isPublicRouteMarker,
  isWrapperRouter,
  mountEvidenceOf,
  optionalIdentity,
  publicRoute,
  publicRouter,
  requireAuth,
  routeHasOptionalAuth,
  routeHasRequireAuth,
  routeIsPublicMarker,
} from '../mount';
import { authenticateToken, optionalAuth } from '../../middleware/auth';

// Route modules — imported only to LABEL mount paths. Protection is never read
// from here; it comes from the wrappers' own mount evidence.
import authRoutes from '../auth';
import userRoutes from '../users';
import mvpSessionRoutes from '../mvpSessions';
import sessionTemplateRoutes from '../sessionTemplates';
import sessionSuggestionRoutes from '../sessionSuggestions';
import playerStatusRoutes from '../playerStatus';
import scoringRoutes from '../scoring';
import notificationRoutes from '../notifications';
import pairingRoutes from '../pairings';
import discoveryRoutes from '../discovery';
import sessionConfigRoutes from '../sessionConfig';
import tournamentAnalyticsRoutes from '../tournament-analytics';
import tournamentRoutes from '../tournaments';
import sessionHistoryRoutes from '../sessionHistory';
import searchRoutes from '../search';
import matchesRoutes from '../matches';
import statisticsRoutes from '../statistics';
import rankingsRoutes from '../rankings';
import achievementsRoutes from '../achievements';
import analyticsRoutes from '../analytics';
import friendsRoutes from '../friends';
import messagingRoutes from '../messaging';
import challengesRoutes from '../challenges';
import matchSchedulingRoutes from '../matchScheduling';
import sessionInsightsRoutes from '../sessionInsights';
import sessionCostRoutes from '../sessionCosts';
import clubRoutes from '../clubs';
import golfRoutes from '../golf';
import equipmentRoutes from '../equipment';
import sharingRoutes from '../sharing';
import communityRoutes from '../community';
import oauthRoutes from '../oauth';
import predictionRoutes from '../predictions';
import webSessionRoutes from '../webSession';
import shareCardRoutes from '../shareCard';
import adminRoutes from '../admin';
import metricsRouter from '../metrics';

/**
 * Mount paths, keyed by router identity.
 *
 * Express 5 does not expose the mount path on the layer (`layer.path` and
 * `layer.regexp` are undefined for `router.use(path, subRouter)`), so the prefix
 * must be declared here. This map is ONLY a path label, and it is checked against
 * the real mount tree in both directions: a mounted-but-unlabelled router fails,
 * and a label with no matching mount fails.
 */
const MOUNT_LABELS: Array<{ router: express.Router; mountPath: string }> = [
  { router: authRoutes, mountPath: '/api/v1/auth' },
  { router: userRoutes, mountPath: '/api/v1/users' },
  { router: mvpSessionRoutes, mountPath: '/api/v1/mvp-sessions' },
  { router: sessionTemplateRoutes, mountPath: '/api/v1/session-templates' },
  { router: sessionSuggestionRoutes, mountPath: '/api/v1/session-suggestions' },
  { router: playerStatusRoutes, mountPath: '/api/v1/player-status' },
  { router: scoringRoutes, mountPath: '/api/v1/scoring' },
  { router: notificationRoutes, mountPath: '/api/v1/notifications' },
  { router: pairingRoutes, mountPath: '/api/v1/pairings' },
  { router: discoveryRoutes, mountPath: '/api/v1/sessions/discovery' },
  { router: sessionConfigRoutes, mountPath: '/api/v1/sessions/config' },
  { router: tournamentAnalyticsRoutes, mountPath: '/api/v1/tournaments' },
  { router: tournamentRoutes, mountPath: '/api/v1/tournaments' },
  { router: sessionHistoryRoutes, mountPath: '/api/v1/session-history' },
  { router: searchRoutes, mountPath: '/api/v1/search' },
  { router: matchesRoutes, mountPath: '/api/v1/matches' },
  { router: statisticsRoutes, mountPath: '/api/v1/statistics' },
  { router: rankingsRoutes, mountPath: '/api/v1/rankings' },
  { router: achievementsRoutes, mountPath: '/api/v1/achievements' },
  { router: analyticsRoutes, mountPath: '/api/v1/analytics' },
  { router: friendsRoutes, mountPath: '/api/v1/friends' },
  { router: messagingRoutes, mountPath: '/api/v1/messaging' },
  { router: challengesRoutes, mountPath: '/api/v1/challenges' },
  { router: matchSchedulingRoutes, mountPath: '/api/v1/match-scheduling' },
  { router: sessionInsightsRoutes, mountPath: '/api/v1/session-insights' },
  { router: sessionCostRoutes, mountPath: '/api/v1/session-costs' },
  { router: clubRoutes, mountPath: '/api/v1/clubs' },
  { router: golfRoutes, mountPath: '/api/v1/golf' },
  { router: equipmentRoutes, mountPath: '/api/v1/equipment' },
  { router: sharingRoutes, mountPath: '/api/v1/sharing' },
  { router: communityRoutes, mountPath: '/api/v1/community' },
  { router: oauthRoutes, mountPath: '/api/v1/oauth' },
  { router: predictionRoutes, mountPath: '/api/v1/predictions' },
  // Direct mounts from server.ts (not under /api/v1)
  { router: webSessionRoutes, mountPath: '/join' },
  { router: shareCardRoutes, mountPath: '' },
  { router: adminRoutes, mountPath: '/admin' },
  { router: metricsRouter, mountPath: '/metrics' },
];

/** Routers whose mount comment claims internal auth ("has its own auth inside"). */
const CLAIMS_INTERNAL_GUARDS: Array<{ router: express.Router; claim: string }> = [
  { router: mvpSessionRoutes, claim: 'index.ts: has internal auth (optionalAuth, requireOrganizer)' },
  { router: tournamentRoutes, claim: 'index.ts: has its own auth inside' },
  { router: tournamentAnalyticsRoutes, claim: 'index.ts: has its own auth inside' },
  { router: predictionRoutes, claim: 'index.ts: has internal auth on admin routes' },
];

/**
 * KNOWN_GAPS — state-changing routes that are currently reachable WITHOUT a
 * verified identity: mounted `publicRouter`, no auth middleware on the route and
 * no allowlist entry. These are real holes, not declarations of intent — the
 * `tournaments.ts` handler docstring for `PUT /:id` says so itself
 * ("@access Public (should be restricted to organizers)").
 *
 * This list is EXACT: a new unguarded state-changing route fails the suite, and
 * an entry that becomes guarded fails as stale (delete it when you fix the route).
 * Fixing them = adding `optionalAuth, requireTournamentOrganizer()` to the route
 * (the pattern 4 sibling routes already use), or moving the route to
 * PUBLIC_ALLOWLIST with a written justification for public mutation.
 */
const KNOWN_GAPS: string[] = [
  'PUT /api/v1/tournaments/:id',
  'DELETE /api/v1/tournaments/:id',
  'DELETE /api/v1/tournaments/:tournamentId/players/:playerId',
  // Public player self-registration (name/email/deviceId, no account) — plausibly
  // intended public, but it mutates state, so it needs an explicit decision.
  'POST /api/v1/tournaments/:id/register',
];

type Kind = 'requireAuth' | 'optionalIdentity' | 'public' | undefined;

interface RouteRecord {
  key: string;
  method: string;
  fullPath: string;
  layer: any;
  kind: Kind;
  router: express.Router;
}

const labelFor = (router: any): string | undefined =>
  MOUNT_LABELS.find((e) => e.router === router)?.mountPath;

/** The inner router of a wrapper (`requireAuth(r)` → layers [middleware, r]). */
function innerRouterOf(wrapper: any): any {
  if (!wrapper?.stack) return undefined;
  for (let i = wrapper.stack.length - 1; i >= 0; i -= 1) {
    const handle = wrapper.stack[i].handle;
    if (handle && handle.stack) return handle;
  }
  return undefined;
}

const normalizePath = (p: string): string => p.replace(/\/+/g, '/');

/** Collect every route reachable from the real production app. */
function collectProductionRoutes(): { routes: RouteRecord[]; problems: string[] } {
  const routes: RouteRecord[] = [];
  const problems: string[] = [];
  const usedLabels = new Set<string>();
  const aggregationRouter = setupRoutes();

  function visit(router: any, prefix: string, kind: Kind, suppressLabelFor?: any, depth = 0) {
    if (depth > 10) {
      problems.push(`route walk exceeded depth at ${prefix}`);
      return;
    }
    // Express 5: a Router exposes `.stack`; the application object exposes its
    // own layers as `app.router.stack` (there is no `app.stack`).
    const layers: any[] = router.stack ?? router.router?.stack ?? [];
    layers.forEach((layer: any) => {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]);
        methods.forEach((method) => {
          const fullPath = normalizePath(prefix + layer.route.path);
          routes.push({
            key: `${method.toUpperCase()} ${fullPath}`,
            method: method.toUpperCase(),
            fullPath,
            layer: { route: layer.route },
            kind,
            router,
          });
        });
        return;
      }
      const handle = layer.handle;
      if (!handle || !handle.stack) return; // plain middleware

      const evidence = mountEvidenceOf(handle) as Kind;
      // Only a router CREATED by a wrapper has an "inner router". A router that
      // merely contains other routers (the aggregation router) does not — guessing
      // by "last nested router" mislabels the whole subtree.
      const inner = isWrapperRouter(handle) ? innerRouterOf(handle) : undefined;
      const label = labelFor(handle) ?? (inner ? labelFor(inner) : undefined);
      const isAggregation = handle === aggregationRouter;

      let childPrefix = prefix;
      let childSuppress = suppressLabelFor;

      if (handle === suppressLabelFor) {
        // The wrapper's inner router was already labelled one level up.
        childPrefix = prefix;
      } else if (label !== undefined) {
        usedLabels.add(label);
        childPrefix = normalizePath(prefix + label);
        if (inner && labelFor(inner) === label && inner !== handle) childSuppress = inner;
      } else if (!isAggregation) {
        problems.push(
          `mounted router is not registered in MOUNT_LABELS (prefix "${prefix}") — add it to the label map`
        );
      }

      visit(handle, childPrefix, evidence ?? kind, childSuppress, depth + 1);
    });
  }

  visit(app, '', undefined);

  // Reverse drift: every declared label must have been used by a real mount.
  MOUNT_LABELS.forEach((e) => {
    if (!usedLabels.has(e.mountPath)) {
      problems.push(`MOUNT_LABELS declares "${e.mountPath}" but no such mount exists in production`);
    }
  });

  return { routes, problems };
}

const { routes: productionRoutes, problems: walkProblems } = collectProductionRoutes();

/** The real middleware, captured before the lookalike test shadows the name. */
const authenticateTokenReal = authenticateToken;

const isGuardedRoute = (route: RouteRecord): boolean =>
  routeHasRequireAuth(route.layer) || routeHasOptionalAuth(route.layer) || routeIsPublicMarker(route.layer);

const isDeclaredPublic = (route: RouteRecord): boolean => PUBLIC_ALLOWLIST.has(route.key);
const isPinnedGap = (route: RouteRecord): boolean => KNOWN_GAPS.includes(route.key);

/** Distinct routes, keyed by method+path (two routers share /api/v1/tournaments). */
const uniqueRoutes = (): RouteRecord[] => {
  const byKey = new Map<string, RouteRecord>();
  productionRoutes.forEach((r) => {
    const existing = byKey.get(r.key);
    // Prefer the record whose mount provides protection (worst case is kept for
    // failures, best case for satisfiability) — here: keep the first.
    if (!existing) byKey.set(r.key, r);
  });
  return Array.from(byKey.values());
};

describe('Mount-auth-coverage (Story 6.9 Phase 2)', () => {
  it('the production mount tree is fully labelled (drift detector)', () => {
    if (walkProblems.length) console.error(walkProblems.join('\n'));
    // Sanity floor: a walk that found (almost) nothing must fail loudly rather
    // than let the coverage assertions below pass vacuously.
    expect(productionRoutes.length).toBeGreaterThan(50);
    expect(walkProblems).toEqual([]);
  });

  it('every route is authenticated, optional-auth, public-marked, or allow-listed', () => {
    const failures: string[] = [];

    uniqueRoutes().forEach((route) => {
      const mountProvidesAuth = route.kind === 'requireAuth';
      const mountProvidesOptional = route.kind === 'optionalIdentity';
      const classified =
        isGuardedRoute(route) ||
        isDeclaredPublic(route) ||
        mountProvidesAuth ||
        mountProvidesOptional ||
        isPinnedGap(route);

      if (!classified) {
        failures.push(
          `UNCLASSIFIED: ${route.key} — requireAuth=${routeHasRequireAuth(route.layer)}, ` +
            `optionalAuth=${routeHasOptionalAuth(route.layer)}, publicMarker=${routeIsPublicMarker(route.layer)}, ` +
            `allowListed=${isDeclaredPublic(route)}, mount=${route.kind ?? 'UNWRAPPED'}`
        );
      }
    });

    if (failures.length > 0) console.error('\n=== MOUNT-AUTH-COVERAGE FAILURES ===\n' + failures.join('\n'));
    expect(failures).toEqual([]);
  });

  it('routers mounted "public" with an internal-auth claim account for every route', () => {
    const failures: string[] = [];

    CLAIMS_INTERNAL_GUARDS.forEach(({ router, claim }) => {
      const declared = mountEvidenceOf(router);
      if (declared !== 'public') {
        failures.push(
          `CLAIM UNSOUND: ${claim} — router is not mounted as public (evidence: ${declared ?? 'NONE'})`
        );
        return;
      }

      const own = uniqueRoutes().filter((r) => r.router === router);
      if (own.length === 0) {
        failures.push(`CLAIM UNVERIFIABLE: ${claim} — router contributes no routes to the app`);
      }

      own.forEach((route) => {
        const accounted = isGuardedRoute(route) || isDeclaredPublic(route) || isPinnedGap(route);
        if (!accounted) {
          failures.push(
            `SELF-GUARD MISSING: ${route.key} — ${claim}, but this route has no auth middleware, ` +
              `no publicRoute() marker and no allowlist entry`
          );
        }
      });
    });

    if (failures.length > 0) console.error('\n=== SELF-GUARD CLAIM FAILURES ===\n' + failures.join('\n'));
    expect(failures).toEqual([]);
  });

  it('KNOWN_GAPS is exact: no new unguarded state-changing route, no stale entry', () => {
    const mutating = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
    const found = uniqueRoutes()
      .filter((r) => mutating.has(r.method))
      .filter((r) => !isGuardedRoute(r))
      .filter((r) => r.kind !== 'requireAuth' && r.kind !== 'optionalIdentity')
      .filter((r) => !isDeclaredPublic(r))
      .map((r) => r.key)
      .sort();

    const pinned = [...KNOWN_GAPS].sort();
    const newGaps = found.filter((k) => !pinned.includes(k));
    const stale = pinned.filter((k) => !found.includes(k));

    if (newGaps.length || stale.length) {
      console.error(
        '\n=== KNOWN_GAPS DRIFT ===\n' +
          (newGaps.length ? `NEW unguarded state-changing routes:\n  ${newGaps.join('\n  ')}\n` : '') +
          (stale.length ? `Pinned gaps that are now guarded (delete from KNOWN_GAPS):\n  ${stale.join('\n  ')}\n` : '')
      );
    }

    expect({ newGaps, stale }).toEqual({ newGaps: [], stale: [] });
  });

  it('PUBLIC_ALLOWLIST entries all correspond to actual routes', () => {
    const routeKeys = new Set(productionRoutes.map((r) => r.key));
    const missing: string[] = [];
    PUBLIC_ALLOWLIST.forEach((key) => {
      if (!routeKeys.has(key)) missing.push(key);
    });
    if (missing.length > 0) {
      console.error('\n=== ALLOW-LIST ENTRIES WITH NO MATCHING ROUTE ===\n' + missing.join('\n'));
    }
    expect(missing).toEqual([]);
  });

  it('the metrics endpoint never serves metrics without a valid bearer token', async () => {
    // The mount comment claims /metrics "self-guards via bearer token". Exercise it
    // instead of trusting the comment. In the jest environment metrics are disabled
    // (METRICS_ENABLED unset, not production) and no token is configured, so the
    // fail-closed answer is 401/404 — never 200.
    const noToken = await request(app).get('/metrics');
    expect(noToken.status).not.toBe(200);

    const badToken = await request(app).get('/metrics').set('Authorization', 'Bearer not-the-token');
    expect(badToken.status).not.toBe(200);
  });
});

describe('Mount wrappers — unit behaviour', () => {
  it('requireAuth applies the real authenticateToken middleware', () => {
    const inner = express.Router();
    inner.get('/test', (_req, res) => res.send('ok'));

    const wrapped = requireAuth(inner);
    expect(wrapped.stack.some((l: any) => l.handle === authenticateToken)).toBe(true);
    expect(mountEvidenceOf(inner)).toBe('requireAuth');
    expect(isWrapperRouter(wrapped)).toBe(true);
  });

  it('optionalIdentity applies the real optionalAuth middleware', () => {
    const inner = express.Router();
    inner.get('/test', (_req, res) => res.send('ok'));

    const wrapped = optionalIdentity(inner);
    expect(wrapped.stack.some((l: any) => l.handle === optionalAuth)).toBe(true);
    expect(mountEvidenceOf(inner)).toBe('optionalIdentity');
  });

  it('publicRouter returns the router unchanged and records public evidence', () => {
    const inner = express.Router();
    inner.get('/test', (_req, res) => res.send('ok'));

    const wrapped = publicRouter(inner);
    expect(wrapped).toBe(inner);
    expect(mountEvidenceOf(inner)).toBe('public');
    // A public router is NOT a wrapper — nothing may assume an "inner router".
    expect(isWrapperRouter(inner)).toBe(false);
  });

  it('publicRoute returns an unforgeable no-op marker', () => {
    const mw = publicRoute();
    expect(typeof mw).toBe('function');
    expect(isPublicRouteMarker(mw)).toBe(true);

    // A different function that merely shares the name must NOT be a marker.
    function publicRouteLookalike(_req: any, _res: any, next: any) {
      next();
    }
    expect(isPublicRouteMarker(publicRouteLookalike)).toBe(false);
    expect(routeIsPublicMarker({ route: { stack: [{ handle: publicRouteLookalike }] } })).toBe(false);
  });

  it('an auth-lookalike middleware cannot satisfy the guards (name matching is gone)', () => {
    function authenticateToken(_req: any, _res: any, next: any) {
      next();
    }
    const lookalike = { route: { stack: [{ handle: authenticateToken }] } };
    expect(routeHasRequireAuth(lookalike)).toBe(false);
    expect(routeHasOptionalAuth(lookalike)).toBe(false);

    // ...while the real middleware does satisfy them.
    expect(routeHasRequireAuth({ route: { stack: [{ handle: authenticateTokenReal }] } })).toBe(true);
    expect(routeHasOptionalAuth({ route: { stack: [{ handle: optionalAuth }] } })).toBe(true);
  });
});
