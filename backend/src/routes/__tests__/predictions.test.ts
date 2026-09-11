/**
 * Story 6.6 T04 — predictions route surface (design §6 behaviour #11).
 *
 * Proves, against `routes/predictions.ts` mounted exactly as `servePrediction`
 * will be in production (router → `/api/v1`):
 *  1. `GET /predictions/:type` returns the shared `{ success, data }` envelope
 *     and is served through the analytics cache — `X-Cache: MISS` then `HIT`.
 *  2. `POST /predictions/train` and `POST /predictions/rollback` reject a
 *     request with no ADMIN credential with 401/403 (never 500).
 *  3. `GET /predictions/models` is ADMIN-gated and lists versions.
 *  4. The router resolves under `/api/v1` and is reachable — it is mounted by
 *     `routes/index.ts` (asserted structurally) and thus sat *before* the SPA
 *     catch-all, which only matches non-`/api` paths (`server.ts`).
 */

import express, { Express } from 'express';
import request from 'supertest';

// ── Mocks (must precede the imports that consume them) ───────────────────────

// `server.ts` is imported by several route modules (`import { io } from
// '../server'`) and, at module load, executes `setupRoutes()` itself — creating
// a load-order cycle when the aggregation router is imported from a test.
// Stubbing it here breaks the cycle without touching production code, and lets
// the final test exercise the *real* `routes/index.ts` composition.
jest.mock('../../server', () => ({
  io: { emit: jest.fn(), to: jest.fn(() => ({ emit: jest.fn() })) },
  default: {},
}));

// Prisma — a single recursive `jest.fn()` behind a Proxy. The Proxy returns the
// *same* mock for every property (`.user`, `.findUnique`, …), so a test can
// configure `prisma.user.findUnique` and the auth middleware's own reference to
// `prisma.user.findUnique` resolves to the identical function. Own properties
// on the underlying `jest.fn` (`.mockResolvedValue`, `.mock`, `.calls`, …) are
// passed through so callers reach the real Jest mock API.
jest.mock('../../config/database', () => {
  const g = globalThis as any;
  if (!g.__predictionPrismaMock) {
    const fn: any = jest.fn();
    fn.mockResolvedValue(null); // default: "not found" — never a truthy []
    g.__predictionPrismaMock = new Proxy(fn, {
      get(target: any, prop: string | symbol) {
        if (prop in target) return target[prop];
        return g.__predictionPrismaMock;
      },
    });
  }
  return { prisma: g.__predictionPrismaMock };
});

// Auth — deterministic token verification, no real JWT/secret needed.
jest.mock('../../utils/jwt', () => ({
  JWTUtils: {
    verifyAccessToken: jest.fn((token: string) => {
      if (token === 'admin-token') return { userId: 'admin-1' };
      if (token === 'player-token') return { userId: 'player-1' };
      return null;
    }),
  },
}));

// The service is the single seam for prediction output (honesty lives here).
jest.mock('../../services/predictiveAnalyticsService', () => ({
  PredictiveAnalyticsService: {
    forecastSessionDemand: jest.fn(),
    predictChurn: jest.fn(),
    analyzeSeasonalTrends: jest.fn(),
    optimizeResourceAllocation: jest.fn(),
    train: jest.fn(),
  },
}));

// The registry is the seam for the ADMIN model surface.
jest.mock('../../services/ml/modelRegistry', () => ({
  modelRegistry: {
    listVersions: jest.fn(),
    activate: jest.fn(),
    rollback: jest.fn(),
  },
}));

import predictionsRouter from '../predictions';
import { setupRoutes } from '../index';
import { PredictiveAnalyticsService } from '../../services/predictiveAnalyticsService';
import { modelRegistry } from '../../services/ml/modelRegistry';
import { prisma } from '../../config/database';
import { cacheService } from '../../services/cacheService';

const service = PredictiveAnalyticsService as jest.Mocked<typeof PredictiveAnalyticsService>;
const registry = modelRegistry as jest.Mocked<typeof modelRegistry>;
const prismaMock = prisma as unknown as { user: { findUnique: jest.Mock } };

/** A realistic persisted `PredictionResult` fallback row. */
function fallbackRow(type: string) {
  return {
    id: 'pr-1',
    modelId: 'pm-1',
    inputData: { locationKey: 'abc' },
    prediction: {
      modelKind: 'fallback',
      accuracy: null,
      fallbackReason: 'insufficient-samples',
      forecast: [],
      featureContributions: [],
    },
    confidence: 0.5,
    explanation: `${type} fallback`,
    timestamp: new Date().toISOString(),
  };
}

/** Build an app that mounts the router the way `server.ts` mounts it. */
function app(): Express {
  const instance = express();
  instance.use(express.json());
  instance.use('/api/v1/predictions', predictionsRouter);
  // The SPA catch-all from server.ts only intercepts non-/api paths; mirror it
  // so a shadowed route would visibly return the HTML sentinel instead of JSON.
  instance.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    return res.status(200).send('SPA_INDEX_HTML');
  });
  return instance;
}

beforeEach(async () => {
  jest.clearAllMocks();
  await cacheService.clear();
  cacheService.resetStats();
  // Default: a valid token belongs to a real ADMIN user.
  prismaMock.user.findUnique.mockResolvedValue({ id: 'admin-1', email: 'a@x.io', role: 'ADMIN' });
});

describe('GET /api/v1/predictions/:type', () => {
  it('returns the { success, data } envelope and is not shadowed by the SPA catch-all', async () => {
    service.forecastSessionDemand.mockResolvedValue(fallbackRow('demand') as any);

    const res = await request(app()).get('/api/v1/predictions/demand?location=Central');

    expect(res.status).toBe(200);
    expect(res.text).not.toBe('SPA_INDEX_HTML');
    expect(res.body.success).toBe(true);
    expect(res.body.data.prediction.modelKind).toBe('fallback');
    expect(service.forecastSessionDemand).toHaveBeenCalledWith('Central', 7);
  });

  it('serves X-Cache MISS then HIT from the analytics cache', async () => {
    service.forecastSessionDemand.mockResolvedValue(fallbackRow('demand') as any);

    const instance = app();
    const first = await request(instance).get('/api/v1/predictions/demand?location=Central');
    expect(first.headers['x-cache']).toBe('MISS');

    const second = await request(instance).get('/api/v1/predictions/demand?location=Central');
    expect(second.headers['x-cache']).toBe('HIT');
    expect(second.body.success).toBe(true);

    // Second call is served from the cache — the service ran exactly once.
    expect(service.forecastSessionDemand).toHaveBeenCalledTimes(1);
  });

  it('returns 400 for an unknown prediction type', async () => {
    const res = await request(app()).get('/api/v1/predictions/bogus');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects churn without a playerId (400)', async () => {
    const res = await request(app()).get('/api/v1/predictions/churn');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('ADMIN gate', () => {
  it('rejects POST /predictions/train with no credential (401)', async () => {
    const res = await request(app()).post('/api/v1/predictions/train').send({ type: 'churn' });
    expect([401, 403]).toContain(res.status);
    expect(res.body.success).toBe(false);
    expect(service.train).not.toHaveBeenCalled();
  });

  it('rejects POST /predictions/rollback with no credential (401)', async () => {
    const res = await request(app()).post('/api/v1/predictions/rollback').send({ type: 'churn' });
    expect([401, 403]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it('rejects GET /predictions/models with no credential (401)', async () => {
    const res = await request(app()).get('/api/v1/predictions/models');
    expect([401, 403]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it('rejects a non-ADMIN token on /train (403)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'player-1', email: 'p@x.io', role: 'PLAYER' });
    const res = await request(app())
      .post('/api/v1/predictions/train')
      .set('Authorization', 'Bearer player-token')
      .send({ type: 'churn' });
    expect(res.status).toBe(403);
    expect(service.train).not.toHaveBeenCalled();
  });

  it('lets ADMIN train and returns the (honest) skipped outcome', async () => {
    service.train.mockResolvedValue({ status: 'skipped', reason: 'insufficient-samples' } as any);
    const res = await request(app())
      .post('/api/v1/predictions/train')
      .set('Authorization', 'Bearer admin-token')
      .send({ type: 'churn' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({ status: 'skipped', reason: 'insufficient-samples' });
  });

  it('lets ADMIN roll back and reports the active version', async () => {
    registry.rollback.mockResolvedValue('v1.3');
    const res = await request(app())
      .post('/api/v1/predictions/rollback')
      .set('Authorization', 'Bearer admin-token')
      .send({ type: 'churn' });
    expect(res.status).toBe(200);
    expect(res.body.data.activeVersion).toBe('v1.3');
  });

  it('lets ADMIN list model versions', async () => {
    registry.listVersions.mockResolvedValue([]);
    const res = await request(app())
      .get('/api/v1/predictions/models')
      .set('Authorization', 'Bearer admin-token');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('mount via the real aggregation router (routes/index.ts)', () => {
  it('is mounted at /api/v1/predictions and precedes the SPA catch-all', async () => {
    service.forecastSessionDemand.mockResolvedValue(fallbackRow('demand') as any);

    // Real composition exactly as server.ts builds it: setupRoutes() under
    // /api/v1, then the SPA catch-all that only matches non-/api paths.
    const instance = express();
    instance.use(express.json());
    instance.use('/api/v1', setupRoutes());
    instance.use((req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      return res.status(200).send('SPA_INDEX_HTML');
    });

    const res = await request(instance).get('/api/v1/predictions/demand?location=Central');

    expect(res.status).toBe(200);
    expect(res.text).not.toBe('SPA_INDEX_HTML');
    expect(res.body.success).toBe(true);
    expect(res.body.data.prediction.modelKind).toBe('fallback');

    // The ADMIN gate is enforced through the aggregated router too.
    const denied = await request(instance).post('/api/v1/predictions/train').send({ type: 'churn' });
    expect([401, 403]).toContain(denied.status);
  });
});
