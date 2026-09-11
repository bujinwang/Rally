/**
 * Story 6.6 (T05a) — PredictiveAnalyticsService rewrite tests.
 *
 * The legacy version of this file asserted mock echoes (a `<30 sessions` throw,
 * hardcoded 0.78/0.72/0.80/0.85 confidences) that directly contradict Story 6.6.
 * It is replaced here with tests of the *honesty* contract (design §6 #1, #2,
 * #3, #10): a measured artifact reports its evaluated score; insufficient data
 * reports a labelled fallback with `accuracy: null`; every served prediction
 * carries feature contributions; and no fabricated constant is ever surfaced.
 *
 * `// @ts-nocheck` has been removed (design §6) — the mocks are fully typed.
 */

jest.mock('../../config/database', () => ({
  prisma: {},
}));

import { prisma } from '../../config/database';
import { PredictiveAnalyticsService } from '../predictiveAnalyticsService';
import { PredictionModelRegistry } from '../ml/modelRegistry';
import { TrainingPipeline } from '../ml/trainingPipeline';
import { DEMAND_FEATURE_NAMES } from '../ml/features';
import { ModelArtifact, ModelType, TrainingOutcome } from '../ml/types';

// ── In-memory Prisma fake (typed) ────────────────────────────────────────────

interface ModelRow {
  id: string;
  type: string;
  version: string;
  accuracy: number | null;
  modelKind: string;
  lastTrained: Date;
  isActive: boolean;
  parameters: unknown;
  hyperparameters: unknown;
  metrics: unknown;
  evaluationProtocol: unknown;
  featureNames: unknown;
  trainingDataSize: number | null;
}

interface FakeResultRow {
  id: string;
  modelId?: string;
  prediction?: unknown;
  confidence?: number;
  explanation?: string;
}

function makeFakePrisma() {
  const models: ModelRow[] = [];
  const results: FakeResultRow[] = [];
  let seq = 0;
  const mvpSessions: unknown[] = [];
  const mvpPlayers: unknown[] = [];
  let latestSession: unknown = null;

  const matchModel = (row: ModelRow, where: any): boolean => {
    if (!where) return true;
    if (where.type !== undefined && row.type !== where.type) return false;
    if (where.version !== undefined && row.version !== where.version) return false;
    if (where.isActive !== undefined && row.isActive !== where.isActive) return false;
    if (where.type_version) {
      return row.type === where.type_version.type && row.version === where.type_version.version;
    }
    if (where.NOT?.version !== undefined && row.version === where.NOT.version) return false;
    return true;
  };

  const model = {
    findFirst: jest.fn(async (args: any) => models.find((r) => matchModel(r, args.where)) ?? null),
    findUnique: jest.fn(async (args: any) => models.find((r) => matchModel(r, args.where)) ?? null),
    findMany: jest.fn(async (args: any) => models.filter((r) => matchModel(r, args.where))),
    updateMany: jest.fn(async (args: any) => {
      let count = 0;
      for (const r of models) {
        if (matchModel(r, args.where)) {
          Object.assign(r, args.data);
          count += 1;
        }
      }
      return { count };
    }),
    upsert: jest.fn(async (args: any) => {
      const existing = models.find((r) => matchModel(r, args.where));
      if (existing) {
        Object.assign(existing, args.update);
        return existing;
      }
      const created: ModelRow = {
        id: `pm_${++seq}`,
        parameters: null,
        hyperparameters: null,
        metrics: null,
        evaluationProtocol: null,
        featureNames: null,
        trainingDataSize: null,
        ...args.create,
      };
      models.push(created);
      return created;
    }),
  };

  const tx = { predictionModel: model };

  const fakePrisma = {
    predictionModel: model,
    mvpSession: {
      findMany: jest.fn(async () => mvpSessions),
      findFirst: jest.fn(async () => latestSession),
    },
    mvpPlayer: {
      findUnique: jest.fn(async (args: any) =>
        (mvpPlayers as any[]).find((p) => p.id === args?.where?.id) ?? null
      ),
      findMany: jest.fn(async () => mvpPlayers),
    },
    court: { findMany: jest.fn(async () => []) },
    courtBooking: { findMany: jest.fn(async () => []) },
    predictionResult: {
      create: jest.fn(async (args: any) => {
        const row: FakeResultRow = { id: `pr_${++seq}`, ...args.data };
        results.push(row);
        return row;
      }),
    },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };

  return { models, results, mvpSessions, mvpPlayers, fakePrisma, setLatest: (v: unknown) => { latestSession = v; } };
}

type Fake = ReturnType<typeof makeFakePrisma>;
let fake: Fake;
let registry: PredictionModelRegistry;

beforeEach(() => {
  fake = makeFakePrisma();
  Object.assign(prisma as unknown as Record<string, unknown>, fake.fakePrisma);
  registry = new PredictionModelRegistry();
  PredictiveAnalyticsService.__setRegistry(registry);
});

afterEach(() => jest.clearAllMocks());

/** Build a measured artifact with an explicit evaluated score. */
function artifact(type: ModelType, version: string, value: number, size: number, coefs?: number[]): ModelArtifact {
  const names = type === 'demand' ? DEMAND_FEATURE_NAMES : ['f1', 'f2'];
  return {
    type,
    version,
    modelKind: 'measured',
    coefficients: coefs ?? names.map((_, i) => (i === 0 ? 0.5 : 0)),
    intercept: 2,
    featureSpec: { names, mean: names.map(() => 0), std: names.map(() => 1), anonymizationVersion: 'sha1-v1' },
    hyperparameters: { estimator: 'ridge' },
    evaluation: {
      metric: type === 'churn' ? 'accuracy' : 'regression-efficiency',
      value,
      auc: type === 'churn' ? value : null,
      mae: null,
      rmse: null,
      mape: null,
      protocol: { split: 'temporal', seed: 1, trainSize: size, testSize: 10, metric: 'regression-efficiency' },
    },
    trainingDataSize: size,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Story 6.6 — PredictiveAnalyticsService honesty contract', () => {
  describe('#1 persisted accuracy = the computed evaluation (never a constant)', () => {
    it('writes 0.81 and none of the old fabricated constants', async () => {
      const artifact081 = artifact('demand', 'v1.0', 0.81, 50);

      // A stub pipeline that persists via the real registry (mirrors production).
      const stub = {
        run: jest.fn(async (): Promise<TrainingOutcome> => {
          await registry.saveVersion(artifact081, { activate: true });
          return { status: 'trained', version: 'v1.0', evaluation: artifact081.evaluation! };
        }),
      } as unknown as TrainingPipeline;
      PredictiveAnalyticsService.__setPipeline(stub);

      const outcome = await PredictiveAnalyticsService.train('demand');
      expect(outcome.status).toBe('trained');

      const upsertArgs = (fake.fakePrisma.predictionModel.upsert as jest.Mock).mock.calls[0][0];
      const persisted = upsertArgs.create ?? upsertArgs.update;
      expect(persisted.accuracy).toBe(0.81);
      for (const fabricated of [0.72, 0.78, 0.8, 0.85]) {
        expect(persisted.accuracy).not.toBe(fabricated);
      }
      // And the stored row agrees.
      expect(fake.models.find((r) => r.version === 'v1.0')?.accuracy).toBe(0.81);
    });
  });

  describe('#2 insufficient data ⇒ labelled fallback, never a fabricated number', () => {
    it('predictChurn with <60 identities returns a labelled fallback and writes no measured row', async () => {
      // Only two participation rows for one identity — far below the 60 gate.
      fake.fakePrisma.mvpPlayer.findUnique.mockResolvedValue({ id: 'p1', userId: null, deviceId: 'dev-1' });
      (fake.fakePrisma.mvpPlayer.findMany as jest.Mock).mockResolvedValue([
        { userId: null, deviceId: 'dev-1', session: { scheduledAt: new Date('2026-05-01T00:00:00Z') } },
        { userId: null, deviceId: 'dev-1', session: { scheduledAt: new Date('2026-05-10T00:00:00Z') } },
      ]);

      const result = await PredictiveAnalyticsService.predictChurn('p1');

      expect(result.prediction.modelKind).toBe('fallback');
      expect(result.prediction.accuracy).toBeNull();
      expect(typeof result.prediction.fallbackReason).toBe('string');
      expect(result.prediction.fallbackReason.length).toBeGreaterThan(0);
      expect(result.prediction.churnProbability).toBeGreaterThanOrEqual(0);
      expect(result.prediction.churnProbability).toBeLessThanOrEqual(1);
      // No measured model may have been written.
      expect(fake.models.every((r) => r.modelKind !== 'measured')).toBe(true);
    });

    it('forecastSessionDemand with no active model returns a labelled fallback', async () => {
      fake.fakePrisma.mvpSession.findMany.mockResolvedValue([]);
      const result = await PredictiveAnalyticsService.forecastSessionDemand('Empty Venue', 3);
      expect(result.prediction.modelKind).toBe('fallback');
      expect(result.prediction.accuracy).toBeNull();
      expect(result.prediction.fallbackReason).toBeTruthy();
      expect(result.prediction.forecast).toHaveLength(3);
      for (const pt of result.prediction.forecast) {
        expect(pt.predictedSessions).toBeGreaterThanOrEqual(0);
      }
    });

    it('analyzeSeasonalTrends with no active model returns a labelled fallback', async () => {
      fake.fakePrisma.mvpSession.findMany.mockResolvedValue([]);
      const result = await PredictiveAnalyticsService.analyzeSeasonalTrends();
      expect(result.prediction.modelKind).toBe('fallback');
      expect(result.prediction.accuracy).toBeNull();
      expect(result.prediction.fallbackReason).toBeTruthy();
    });

    it('never surfaces any fabricated constant in a served payload', async () => {
      fake.fakePrisma.mvpSession.findMany.mockResolvedValue([]);
      const demand = await PredictiveAnalyticsService.forecastSessionDemand('X', 2);
      const seasonal = await PredictiveAnalyticsService.analyzeSeasonalTrends();
      const optimization = await PredictiveAnalyticsService.optimizeResourceAllocation('v1', '2026-06-01');
      const serialized = JSON.stringify([demand.prediction, seasonal.prediction, optimization.prediction]);
      expect(serialized).not.toMatch(/0\.(78|72|80|85)/);
    });
  });

  describe('#3 feature contributions present and reconciling', () => {
    it('a measured demand model serves contributions that sum with the intercept', async () => {
      // Seed a real measured artifact + the session history used to build context.
      const a = artifact('demand', 'v1.0', 0.8, 60);
      // Give the first feature a non-trivial coefficient so contributions differ.
      a.coefficients = DEMAND_FEATURE_NAMES.map((_, i) => (i === 20 ? 3 : 0)); // capacity
      await registry.saveVersion(a, { activate: true });

      fake.fakePrisma.mvpSession.findMany.mockResolvedValue([
        { scheduledAt: new Date('2026-05-30T00:00:00Z'), maxPlayers: 20 },
        { scheduledAt: new Date('2026-05-31T00:00:00Z'), maxPlayers: 20 },
      ]);

      const result = await PredictiveAnalyticsService.forecastSessionDemand('Venue A', 2);

      expect(result.prediction.modelKind).toBe('measured');
      expect(result.prediction.accuracy).toBe(0.8);
      expect(Array.isArray(result.prediction.featureContributions)).toBe(true);
      expect(result.prediction.featureContributions.length).toBe(DEMAND_FEATURE_NAMES.length);
      for (const c of result.prediction.featureContributions) {
        expect(typeof c.feature).toBe('string');
        expect(Number.isFinite(c.contribution)).toBe(true);
        expect(Number.isFinite(c.value)).toBe(true);
      }

      // Σ contributions + intercept === the stored linear predictor (reconciles).
      const sum = result.prediction.featureContributions.reduce(
        (acc: number, c: { contribution: number }) => acc + c.contribution,
        0
      );
      const reconciled = sum + result.prediction.intercept;
      expect(reconciled).toBeCloseTo(result.prediction.linearPredictor, 6);
    });

    it('a measured churn model serves contributions and a calibrated probability', async () => {
      const a = artifact('churn', 'v1.0', 0.9, 80);
      a.featureSpec = {
        names: ['daysSinceLastParticipation', 'sessionsAttended', 'tenureDays', 'sessionsPer30d', 'meanGapDays', 'observedSpanDays'],
        mean: [0, 0, 0, 0, 0, 0],
        std: [1, 1, 1, 1, 1, 1],
        anonymizationVersion: 'sha1-v1',
      };
      a.coefficients = [0.1, 0, 0, 0, 0, 0];
      a.intercept = -2;
      await registry.saveVersion(a, { activate: true });

      fake.fakePrisma.mvpPlayer.findUnique.mockResolvedValue({ id: 'p1', userId: null, deviceId: 'dev-1' });
      (fake.fakePrisma.mvpPlayer.findMany as jest.Mock).mockResolvedValue([
        { userId: null, deviceId: 'dev-1', session: { scheduledAt: new Date('2026-05-01T00:00:00Z') } },
        { userId: null, deviceId: 'dev-1', session: { scheduledAt: new Date('2026-05-10T00:00:00Z') } },
        { userId: null, deviceId: 'dev-1', session: { scheduledAt: new Date('2026-05-20T00:00:00Z') } },
      ]);

      const result = await PredictiveAnalyticsService.predictChurn('p1');
      expect(result.prediction.modelKind).toBe('measured');
      expect(result.prediction.accuracy).toBe(0.9);
      expect(result.prediction.featureContributions.length).toBe(6);
      expect(result.prediction.churnProbability).toBeGreaterThan(0);
      expect(result.prediction.churnProbability).toBeLessThan(1);
    });
  });

  describe('preserved public contract', () => {
    it('predictChurn still throws "Player not found" for an unknown id', async () => {
      fake.fakePrisma.mvpPlayer.findUnique.mockResolvedValue(null);
      await expect(PredictiveAnalyticsService.predictChurn('missing')).rejects.toThrow('Player not found');
    });

    it('optimizeResourceAllocation is a heuristic with null accuracy and the dashboard shape', async () => {
      const result = await PredictiveAnalyticsService.optimizeResourceAllocation('venue-1', '2026-06-01');
      expect(result.prediction.modelKind).toBe('heuristic');
      expect(result.prediction.accuracy).toBeNull();
      expect(result.prediction.subKind).toBe('heuristic-scheduler');
      expect(Array.isArray(result.prediction.optimalSchedule)).toBe(true);
      expect(typeof result.prediction.totalCost).toBe('number');
    });

    it('every method returns a persisted PredictionResult row', async () => {
      fake.fakePrisma.mvpSession.findMany.mockResolvedValue([]);
      const demand = await PredictiveAnalyticsService.forecastSessionDemand('V', 1);
      const seasonal = await PredictiveAnalyticsService.analyzeSeasonalTrends();
      const optimization = await PredictiveAnalyticsService.optimizeResourceAllocation('v', '2026-06-01');
      for (const r of [demand, seasonal, optimization]) {
        expect(r.id).toBeTruthy();
        expect(r.modelId).toBeTruthy();
        expect(r.explanation).toEqual(expect.any(String));
        expect(r.explanation.length).toBeGreaterThan(0);
      }
      expect(fake.results.length).toBe(3);
    });

    it('explanation strings never claim unimplemented methods', async () => {
      fake.fakePrisma.mvpSession.findMany.mockResolvedValue([]);
      const demand = await PredictiveAnalyticsService.forecastSessionDemand('V', 1);
      const optimization = await PredictiveAnalyticsService.optimizeResourceAllocation('v', '2026-06-01');
      expect(demand.explanation).not.toMatch(/ARIMA/i);
      expect(optimization.explanation).not.toMatch(/linear programming/i);
    });
  });
});
