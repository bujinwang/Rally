/**
 * Story 6.6 — Predictive analytics HTTP surface (T04).
 *
 * Exposes the four prediction families produced by
 * `PredictiveAnalyticsService` plus the operator (ADMIN) controls for the
 * training lifecycle. It is a thin transport layer: all modelling, honesty
 * labelling (`modelKind` / `accuracy` / `fallbackReason`) and persistence
 * happen in the service + `services/ml` layer. This router never invents a
 * number — it only relays the persisted `PredictionResult` row.
 *
 * Mounted at `/predictions` inside the shared `routes/index.ts` router, so
 * every path resolves under `/api/v1/...` **before** the SPA catch-all in
 * `server.ts` (design §10 — route mount order).
 *
 * Routes:
 *   GET  /predictions/models    ADMIN — list stored model versions
 *   GET  /predictions/:type     cached analytics read (public)
 *   POST /predictions/train     ADMIN — run the training pipeline
 *   POST /predictions/rollback  ADMIN — restore a prior version
 *
 * Route ordering matters: the literal `/models` GET is registered **before**
 * the parameterised `/:type` GET, otherwise `/:type` would capture `models`
 * and answer 400. (`/train` and `/rollback` are POSTs, so they never clash
 * with the GET `/:type`.)
 *
 * Cache reuse (design §1 D7): the GET read is wrapped in the existing
 * `cachingMiddleware` (analytics domain, 300 s); the two writes bump the
 * analytics generation via `cacheInvalidationMiddleware`.
 */

import { Router, Request, Response } from 'express';
import { PredictiveAnalyticsService } from '../services/predictiveAnalyticsService';
import { modelRegistry } from '../services/ml/modelRegistry';
import { ModelType } from '../services/ml/types';
import { authenticateToken, requireRole } from '../middleware/auth';
import { cachingMiddleware, cacheInvalidationMiddleware } from '../middleware/caching';
import { TTL } from '../services/cache/cacheKeys';
import {
  predictionAccuracy,
  predictionRetrainTotal,
  predictionServeSeconds,
} from '../services/metricsRegistry';

const router = Router();

/** The four families the service can serve. */
const PREDICTION_TYPES: readonly ModelType[] = ['demand', 'churn', 'seasonal', 'optimization'];

/** Default demand location when the caller does not supply one. */
const DEFAULT_LOCATION = 'Unknown';

/** Default demand forecast horizon (days). */
const DEFAULT_DAYS = 7;

/** Today's date (UTC, `YYYY-MM-DD`) — default optimization date. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Narrow a raw value to a known prediction family, or `null`. */
function asPredictionType(value: unknown): ModelType | null {
  return typeof value === 'string' && (PREDICTION_TYPES as readonly string[]).includes(value)
    ? (value as ModelType)
    : null;
}

/** Envelope-stable error helper (`{ success:false, error }`). */
function fail(res: Response, status: number, message: string): Response {
  return res.status(status).json({ success: false, error: message });
}

/** Read a `modelKind` for metric labelling, defaulting to the honest fallback. */
function modelKindOf(result: any): 'measured' | 'fallback' | 'heuristic' {
  const kind = result?.prediction?.modelKind;
  return kind === 'measured' || kind === 'heuristic' ? kind : 'fallback';
}

// ── ADMIN: list model versions ────────────────────────────────────────────────
// Registered before `/:type` so the literal segment is never captured.
router.get('/models', authenticateToken, requireRole(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const requested = req.query.type;
    const single = requested === undefined ? null : asPredictionType(requested);

    if (requested !== undefined && single === null) {
      return fail(res, 400, `Unknown prediction type: ${String(requested)}`);
    }

    const types: readonly ModelType[] = single ? [single] : PREDICTION_TYPES;
    const versions = await Promise.all(
      types.map(async (type) => ({ type, versions: await modelRegistry.listVersions(type) }))
    );

    return res.json({ success: true, data: versions });
  } catch (error) {
    console.error('Error listing prediction models:', error);
    return fail(res, 500, 'Failed to list prediction models');
  }
});

// ── ADMIN: train ──────────────────────────────────────────────────────────────
router.post(
  '/train',
  authenticateToken,
  requireRole(['ADMIN']),
  cacheInvalidationMiddleware(['analytics']),
  async (req: Request, res: Response) => {
    try {
      const type = asPredictionType(req.body?.type);
      if (!type) {
        return fail(res, 400, `Unknown prediction type: ${String(req.body?.type)}`);
      }
      if (type === 'optimization') {
        return fail(res, 400, 'optimization is a fixed heuristic and is never trained');
      }

      const force = Boolean(req.body?.force);
      const outcome = await PredictiveAnalyticsService.train(type, { force });

      if (outcome.status === 'trained') {
        predictionRetrainTotal.inc({ type, status: 'trained' });
        if (Number.isFinite(outcome.evaluation?.value)) {
          predictionAccuracy.set({ type }, outcome.evaluation.value);
        }
      } else {
        // A skip (e.g. `insufficient-samples`) is the correct, honest result —
        // not an error. Recorded with its reason so the operator can see why.
        predictionRetrainTotal.inc({ type, status: outcome.reason });
      }

      return res.json({ success: true, data: outcome });
    } catch (error) {
      console.error('Error training prediction model:', error);
      return fail(res, 500, 'Failed to train prediction model');
    }
  }
);

// ── ADMIN: rollback ───────────────────────────────────────────────────────────
router.post(
  '/rollback',
  authenticateToken,
  requireRole(['ADMIN']),
  cacheInvalidationMiddleware(['analytics']),
  async (req: Request, res: Response) => {
    try {
      const type = asPredictionType(req.body?.type);
      if (!type) {
        return fail(res, 400, `Unknown prediction type: ${String(req.body?.type)}`);
      }

      const version = req.body?.version;
      let activeVersion: string;

      if (typeof version === 'string' && version.length > 0) {
        // Explicit operator rollback to a named version (bypasses the gate).
        await modelRegistry.activate(type, version, { force: true });
        activeVersion = version;
      } else {
        // No version given: restore the most recently trained sibling.
        activeVersion = await modelRegistry.rollback(type);
      }

      predictionRetrainTotal.inc({ type, status: 'rollback' });
      return res.json({ success: true, data: { activeVersion } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (/not found|no prior version/i.test(message)) {
        return fail(res, 404, message);
      }
      console.error('Error rolling back prediction model:', error);
      return fail(res, 500, 'Failed to roll back prediction model');
    }
  }
);

// ── Public cached read (registered last so it cannot shadow literals) ─────────
async function servePrediction(req: Request, res: Response): Promise<Response | void> {
  const type = asPredictionType(req.params.type);
  if (!type) {
    return fail(res, 400, `Unknown prediction type: ${req.params.type}`);
  }

  const startedAt = process.hrtime.bigint();
  try {
    let result: any;

    switch (type) {
      case 'demand': {
        const location =
          typeof req.query.location === 'string' && req.query.location.length > 0
            ? req.query.location
            : DEFAULT_LOCATION;
        const parsed = Number.parseInt(String(req.query.days ?? ''), 10);
        const horizon = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DAYS;
        result = await PredictiveAnalyticsService.forecastSessionDemand(location, horizon);
        break;
      }
      case 'churn': {
        const playerId = typeof req.query.playerId === 'string' ? req.query.playerId : '';
        if (!playerId) {
          return fail(res, 400, 'playerId query parameter is required for churn predictions');
        }
        result = await PredictiveAnalyticsService.predictChurn(playerId);
        break;
      }
      case 'seasonal': {
        result = await PredictiveAnalyticsService.analyzeSeasonalTrends();
        break;
      }
      case 'optimization': {
        const venueId = typeof req.query.venueId === 'string' ? req.query.venueId : '';
        if (!venueId) {
          return fail(res, 400, 'venueId query parameter is required for optimization predictions');
        }
        const date =
          typeof req.query.date === 'string' && req.query.date.length > 0
            ? req.query.date
            : todayIso();
        result = await PredictiveAnalyticsService.optimizeResourceAllocation(venueId, date);
        break;
      }
      default:
        return fail(res, 400, `Unknown prediction type: ${type}`);
    }

    const modelKind = modelKindOf(result);
    const seconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
    predictionServeSeconds.observe({ type, modelKind }, seconds);

    // A number is only surfaced for a measured model (design §1 D6).
    if (modelKind === 'measured' && typeof result?.prediction?.accuracy === 'number') {
      predictionAccuracy.set({ type }, result.prediction.accuracy);
    }

    return res.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (/not found/i.test(message)) {
      return fail(res, 404, message);
    }
    console.error(`Error serving ${type} prediction:`, error);
    return fail(res, 500, `Failed to generate ${type} prediction`);
  }
}

router.get(
  '/:type',
  // Explicit `enabled: true` keeps the 300 s analytics cache active in every
  // environment — production already defaults to on, and pinning it makes the
  // `X-Cache: MISS → HIT` behaviour observable (and testable) rather than
  // implicitly disabled under `NODE_ENV=test`.
  cachingMiddleware({ domain: 'analytics', ttl: TTL.analytics, enabled: true }),
  servePrediction
);

export { PREDICTION_TYPES };
export default router;
