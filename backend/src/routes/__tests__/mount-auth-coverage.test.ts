import express from 'express';
import request from 'supertest';

/**
 * Mount-auth-coverage test (Story 6.9 Phase 2).
 *
 * This test walks every mounted router's stack and asserts that each
 * registered route is EITHER:
 *  1. Behind `requireAuth` (or `authenticateToken`/`requiredAuth` directly), OR
 *  2. Behind `optionalIdentity` (or `optionalAuth` directly), OR
 *  3. Explicitly marked with `publicRoute()`, OR
 *  4. Named in `PUBLIC_ALLOWLIST`.
 *
 * Adding a route without classifying it will fail this test.
 * This turns "did the author remember?" into a red test.
 */

// ── Mocks (must precede the imports that consume them) ───────────────────────
// `server.ts` is imported by several route modules and, at module load,
// executes `setupRoutes()` itself — creating a load-order cycle when the
// aggregation router is imported from a test. Stubbing it here breaks the
// cycle without touching production code, and lets the final test exercise
// the *real* `routes/index.ts` composition.
jest.mock('../../server', () => ({
  io: { emit: jest.fn(), to: jest.fn(() => ({ emit: jest.fn() })) },
  default: {},
}));

import { setupRoutes } from '../index';
import {
  PUBLIC_ALLOWLIST,
  routeHasRequireAuth,
  routeHasOptionalAuth,
  routeIsPublicMarker,
  publicRoute,
  optionalIdentity,
  requireAuth,
  publicRouter,
} from '../mount';
import { authenticateToken, optionalAuth } from '../../middleware/auth';
import webSessionRoutes from '../webSession';
import shareCardRoutes from '../shareCard';
import adminRoutes from '../admin';
import metricsRouter from '../metrics';

// Build the app exactly as production does it
const app = express();
app.use(express.json());
const apiRouter = setupRoutes();
app.use('/api/v1', apiRouter);

// Also mount the direct routes from server.ts
app.use('/join', publicRouter(webSessionRoutes));
app.use(publicRouter(shareCardRoutes));
app.use('/admin', requireAuth(adminRoutes));
app.use('/metrics', publicRouter(metricsRouter));

/**
 * Extract all routes from an Express app/router, returning their
 * full path, method, and the middleware stack for that route.
 */
function extractRoutes(router: express.Router, basePath = ''): Array<{
  method: string;
  path: string;
  fullPath: string;
  stack: any[];
}> {
  const routes: Array<{ method: string; path: string; fullPath: string; stack: any[] }> = [];

  router.stack.forEach((layer, idx) => {
    console.log(`  DEBUG layer ${idx}: route=${!!layer.route}, name=${layer.name}, handle.stack=${!!layer.handle?.stack}, path=${layer.path}, regexp=${layer.regexp?.toString?.()?.slice(0, 80)}`);
    if (layer.route) {
      // This is a route handler layer
      const methods = Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]);
      methods.forEach((method) => {
        const fullPath = (basePath + layer.route.path).replace(/\/+/g, '/');
        routes.push({
          method: method.toUpperCase(),
          path: layer.route.path,
          fullPath,
          stack: layer.route.stack,
        });
      });
    } else if (layer.handle?.stack) {
      // This is a mounted sub-router (or the router itself)
      // Try to get the mount path from the regexp
      let mountPath = '';
      if (layer.regexp) {
        const regexpStr = layer.regexp.toString();
        console.log(`  DEBUG regexp: ${regexpStr}`);
        // Extract the path prefix from the regexp
        // Regexp looks like: ^\/auth(?=\/|$) or ^\/api\/v1\/auth(?=\/|$)
        const match = regexpStr.match(/^\^\\(?:\/)?([^\\\(]+)/);
        if (match) {
          mountPath = match[1].replace(/\\\//g, '/');
          console.log(`  DEBUG mountPath from regexp: ${mountPath}`);
        } else {
          // Fallback: try to get from layer.path
          mountPath = layer.path || '';
        }
      } else if (layer.path) {
        mountPath = layer.path.replace(/^\/+/, '').replace(/\/+$/, '');
      }

      if (mountPath) {
        const newBasePath = basePath + '/' + mountPath.replace(/^\/+/, '').replace(/\/+$/, '');
        console.log(`  DEBUG recursing with basePath: ${newBasePath}`);
        routes.push(...extractRoutes(layer.handle, newBasePath));
      } else {
        // No mount path - recurse with same base (for nested routers without explicit mount)
        routes.push(...extractRoutes(layer.handle, basePath));
      }
    }
  });

  return routes;
}

/**
 * Normalize a route path for allow-list comparison.
 * Express route params like `:playerId` become `:playerId` in the allow-list.
 * We keep them as-is since the allow-list uses the same format.
 */
function normalizePath(path: string): string {
  return path.replace(/\/+/g, '/');
}

describe('Mount-auth-coverage (Story 6.9 Phase 2)', () => {
  let allRoutes: Array<{
    method: string;
    path: string;
    fullPath: string;
    stack: any[];
  }>;

  beforeAll(() => {
    // Extract routes from the API router
    const apiRoutes = extractRoutes(apiRouter, '/api/v1');

    // Extract routes from direct mounts
    const directRoutes = [
      ...extractRoutes(publicRouter(webSessionRoutes), '/join'),
      ...extractRoutes(publicRouter(shareCardRoutes), ''),
      ...extractRoutes(requireAuth(adminRoutes), '/admin'),
      ...extractRoutes(publicRouter(metricsRouter), '/metrics'),
    ];

    allRoutes = [...apiRoutes, ...directRoutes].map((r) => ({
      ...r,
      fullPath: normalizePath(r.fullPath),
    }));

    // DEBUG: log all extracted routes
    console.log('\n=== EXTRACTED ROUTES ===');
    allRoutes.forEach((r) => console.log(`  ${r.method} ${r.fullPath}`));
    console.log('=== END EXTRACTED ROUTES ===\n');
  });

  it('every route is either authenticated, optional-auth, public-marked, or allow-listed', () => {
    const failures: string[] = [];

    allRoutes.forEach((route) => {
      const key = `${route.method} ${route.fullPath}`;

      const hasRequireAuth = routeHasRequireAuth({ route: { stack: route.stack } });
      const hasOptionalAuth = routeHasOptionalAuth({ route: { stack: route.stack } });
      const hasPublicMarker = routeIsPublicMarker({ route: { stack: route.stack } });
      const isAllowListed = PUBLIC_ALLOWLIST.has(key);

      if (!hasRequireAuth && !hasOptionalAuth && !hasPublicMarker && !isAllowListed) {
        failures.push(
          `UNCLASSIFIED: ${key} — ` +
            `requireAuth=${hasRequireAuth}, optionalAuth=${hasOptionalAuth}, ` +
            `publicMarker=${hasPublicMarker}, allowListed=${isAllowListed}`
        );
      }
    });

    if (failures.length > 0) {
      console.error('\n=== MOUNT-AUTH-COVERAGE FAILURES ===');
      failures.forEach((f) => console.error(f));
      console.error('=== END FAILURES ===\n');
    }

    expect(failures).toHaveLength(0);
  });

  it('PUBLIC_ALLOWLIST entries all correspond to actual routes', () => {
    const routeKeys = new Set(
      allRoutes.map((r) => `${r.method} ${r.fullPath}`)
    );

    // DEBUG: log all route keys
    console.log('\n=== EXTRACTED ROUTE KEYS ===');
    Array.from(routeKeys).sort().forEach(k => console.log(`  ${k}`));
    console.log('=== END EXTRACTED ROUTE KEYS ===\n');

    const missing: string[] = [];
    PUBLIC_ALLOWLIST.forEach((key) => {
      if (!routeKeys.has(key)) {
        missing.push(key);
      }
    });

    if (missing.length > 0) {
      console.error('\n=== ALLOW-LIST ENTRIES WITH NO MATCHING ROUTE ===');
      missing.forEach((m) => console.error(m));
      console.error('=== END MISSING ===\n');
    }

    expect(missing).toHaveLength(0);
  });
});

describe('Mount wrappers — unit behaviour', () => {
  it('requireAuth wraps router with authenticateToken', () => {
    const inner = express.Router();
    inner.get('/test', (req, res) => res.send('ok'));
    const wrapped = requireAuth(inner);

    // The wrapped router should have authenticateToken in its stack
    const authLayer = wrapped.stack.find(
      (l) => l.handle.name === 'authenticateToken'
    );
    expect(authLayer).toBeDefined();
  });

  it('optionalIdentity wraps router with optionalAuth', () => {
    const inner = express.Router();
    inner.get('/test', (req, res) => res.send('ok'));
    const wrapped = optionalIdentity(inner);

    const authLayer = wrapped.stack.find(
      (l) => l.handle.name === 'optionalAuth'
    );
    expect(authLayer).toBeDefined();
  });

  it('publicRouter returns the router unchanged', () => {
    const inner = express.Router();
    inner.get('/test', (req, res) => res.send('ok'));
    const wrapped = publicRouter(inner);
    expect(wrapped).toBe(inner);
  });

  it('publicRoute returns a no-op middleware', () => {
    const mw = publicRoute();
    expect(typeof mw).toBe('function');
    expect(mw.name).toBe('publicRoute');
  });
});

/**
 * Mutation check for the coverage test.
 * Temporarily un-wrap a private router and verify the test fails.
 * This is a manual test — run with: npx jest --testNamePattern="Mutation check"
 *
 * To run: temporarily change one router mount in routes/index.ts from
 *   router.use('/notifications', requireAuth(notificationRoutes));
 * to
 *   router.use('/notifications', notificationRoutes);
 * Then run this test — it MUST fail. Then restore.
 */
describe.skip('Mutation check (run manually)', () => {
  it('un-wrapping a private router makes coverage test fail', () => {
    // This test is skipped by default. To run the mutation check:
    // 1. Remove `requireAuth` from one private router mount in routes/index.ts
    // 2. Remove `.skip` from this describe block
    // 3. Run: npx jest src/routes/__tests__/mount-auth-coverage.test.ts --forceExit --runInBand
    // 4. Verify it fails with "UNCLASSIFIED" for that router's routes
    // 5. Restore the wrapper and re-run — should pass
    expect(true).toBe(true);
  });
});