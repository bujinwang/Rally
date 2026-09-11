/**
 * Story 6.6 (T05a) — Model registry as committed tests.
 *
 * Covers design §6 behaviour #9: the one-active-per-type invariant, the
 * activation gate, rollback, version allocation, and the schema fix that lets
 * `demand v1.0` and `churn v1.0` coexist (the `type_version` compound key).
 *
 * A small in-memory Prisma fake backs the registry so the transactional
 * invariant is exercised for real (not stubbed away).
 */

jest.mock('../../../config/database', () => ({
  prisma: {},
}));

import { prisma } from '../../../config/database';
import { PredictionModelRegistry } from '../modelRegistry';
import { ModelArtifact, ModelKind, ModelType } from '../types';

/** A stored row in the fake table. */
interface Row {
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

/** In-memory Prisma fake covering exactly the surface the registry uses. */
function makeFakePrisma() {
  const rows: Row[] = [];
  let seq = 0;

  const matches = (row: Row, where: any): boolean => {
    if (!where) return true;
    if (where.type !== undefined && row.type !== where.type) return false;
    if (where.version !== undefined && row.version !== where.version) return false;
    if (where.isActive !== undefined && row.isActive !== where.isActive) return false;
    if (where.type_version) {
      return row.type === where.type_version.type && row.version === where.type_version.version;
    }
    if (where.NOT && where.NOT.version !== undefined && row.version === where.NOT.version) {
      return false;
    }
    return true;
  };

  const sortRows = (list: Row[], orderBy: any): Row[] => {
    const out = [...list];
    const orders = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
    out.sort((a, b) => {
      for (const ord of orders) {
        for (const [key, dir] of Object.entries(ord)) {
          const av = (a as any)[key];
          const bv = (b as any)[key];
          let cmp = 0;
          if (av instanceof Date && bv instanceof Date) cmp = av.getTime() - bv.getTime();
          else if (typeof av === 'boolean') cmp = Number(av) - Number(bv);
          else cmp = av < bv ? -1 : av > bv ? 1 : 0;
          if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
        }
      }
      return 0;
    });
    return out;
  };

  const model = {
    findFirst: jest.fn(async (args: any) => {
      const found = rows.filter((r) => matches(r, args.where));
      const ordered = sortRows(found, args.orderBy);
      return ordered[0] ?? null;
    }),
    findUnique: jest.fn(async (args: any) => rows.find((r) => matches(r, args.where)) ?? null),
    findMany: jest.fn(async (args: any) =>
      sortRows(
        rows.filter((r) => matches(r, args.where)),
        args.orderBy
      )
    ),
    updateMany: jest.fn(async (args: any) => {
      let count = 0;
      for (const r of rows) {
        if (matches(r, args.where)) {
          Object.assign(r, args.data);
          count += 1;
        }
      }
      return { count };
    }),
    upsert: jest.fn(async (args: any) => {
      const existing = rows.find((r) => matches(r, args.where));
      if (existing) {
        Object.assign(existing, args.update);
        return existing;
      }
      const created: Row = {
        id: `pm_${++seq}`,
        trainingDataSize: null,
        parameters: null,
        hyperparameters: null,
        metrics: null,
        evaluationProtocol: null,
        featureNames: null,
        ...args.create,
      };
      rows.push(created);
      return created;
    }),
  };

  const tx = {
    predictionModel: model,
  };

  return {
    rows,
    model,
    /** The surface assigned onto the shared `prisma` singleton. */
    client: {
      predictionModel: model,
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
}

/**
 * A minimal fake Prisma client typed as the shared `prisma` singleton.
 * `$transaction` runs the callback synchronously with the same store, so the
 * deactivate-then-activate ordering is genuinely exercised.
 */
function installFake(): ReturnType<typeof makeFakePrisma> {
  const fake = makeFakePrisma();
  Object.assign(prisma as unknown as Record<string, unknown>, fake.client);
  return fake;
}

/** Build a measured artifact with a controllable score and sample size. */
function measuredArtifact(
  type: ModelType,
  version: string,
  value: number,
  size: number
): ModelArtifact {
  return {
    type,
    version,
    modelKind: 'measured' as ModelKind,
    coefficients: [1, 2],
    intercept: 0.5,
    featureSpec: { names: ['a', 'b'], mean: [0, 0], std: [1, 1], anonymizationVersion: 'sha1-v1' },
    hyperparameters: { estimator: 'ridge' },
    evaluation: {
      metric: type === 'churn' ? 'accuracy' : 'regression-efficiency',
      value,
      auc: type === 'churn' ? value : null,
      mae: null,
      rmse: null,
      mape: null,
      protocol: { split: 'stratified', seed: 1, trainSize: size, testSize: 10, metric: 'accuracy' },
    },
    trainingDataSize: size,
  };
}

describe('Story 6.6 — PredictionModelRegistry (#9)', () => {
  let fake: ReturnType<typeof makeFakePrisma>;
  let registry: PredictionModelRegistry;

  beforeEach(() => {
    fake = installFake();
    registry = new PredictionModelRegistry();
  });

  describe('nextVersion', () => {
    it('allocates v1.0 for an empty type and increments the minor', async () => {
      expect(await registry.nextVersion('demand')).toBe('v1.0');
    });

    it('returns v1.<maxMinor+1> and is per-type', async () => {
      await fake.model.upsert({
        where: { type_version: { type: 'demand', version: 'v1.0' } },
        update: {},
        create: { type: 'demand', version: 'v1.0', accuracy: 0.9, modelKind: 'measured', lastTrained: new Date(), isActive: true },
      });
      await fake.model.upsert({
        where: { type_version: { type: 'demand', version: 'v1.3' } },
        update: {},
        create: { type: 'demand', version: 'v1.3', accuracy: 0.9, modelKind: 'measured', lastTrained: new Date(), isActive: false },
      });
      expect(await registry.nextVersion('demand')).toBe('v1.4');
      // A different type is unaffected.
      expect(await registry.nextVersion('churn')).toBe('v1.0');
    });
  });

  describe('canActivate gate', () => {
    it('accepts a measured artifact at/above 0.75 with enough samples', () => {
      expect(registry.canActivate(measuredArtifact('demand', 'v1.0', 0.75, 40))).toBe(true);
    });

    it('rejects below-accuracy, below-size, and non-measured artifacts', () => {
      expect(registry.canActivate(measuredArtifact('demand', 'v1.0', 0.74, 40))).toBe(false);
      expect(registry.canActivate(measuredArtifact('demand', 'v1.0', 0.9, 39))).toBe(false);
      const fallback = measuredArtifact('demand', 'fallback-v1', 0.99, 100);
      fallback.modelKind = 'fallback';
      fallback.evaluation = null;
      expect(registry.canActivate(fallback)).toBe(false);
    });
  });

  describe('activate — one active per type', () => {
    it('deactivates siblings so exactly one row is active', async () => {
      await fake.model.upsert({
        where: { type_version: { type: 'demand', version: 'v1.0' } },
        update: {},
        create: { type: 'demand', version: 'v1.0', accuracy: 0.9, modelKind: 'measured', lastTrained: new Date(1), isActive: true },
      });
      await fake.model.upsert({
        where: { type_version: { type: 'demand', version: 'v1.1' } },
        update: {},
        create: { type: 'demand', version: 'v1.1', accuracy: 0.85, modelKind: 'measured', lastTrained: new Date(2), isActive: false },
      });

      await registry.activate('demand', 'v1.1', { force: true });

      const active = fake.rows.filter((r) => r.type === 'demand' && r.isActive);
      expect(active).toHaveLength(1);
      expect(active[0].version).toBe('v1.1');
    });

    it('blocks a sub-threshold measured artifact without force', async () => {
      await fake.model.upsert({
        where: { type_version: { type: 'churn', version: 'v1.0' } },
        update: {},
        create: { type: 'churn', version: 'v1.0', accuracy: 0.5, modelKind: 'measured', lastTrained: new Date(), isActive: false, trainingDataSize: 100 },
      });
      await expect(registry.activate('churn', 'v1.0')).rejects.toThrow(/activation gate/);
    });

    it('force rollback bypasses the gate for an existing prior version', async () => {
      await fake.model.upsert({
        where: { type_version: { type: 'demand', version: 'v1.2' } },
        update: {},
        create: { type: 'demand', version: 'v1.2', accuracy: 0.4, modelKind: 'measured', lastTrained: new Date(), isActive: true, trainingDataSize: 10 },
      });
      await fake.model.upsert({
        where: { type_version: { type: 'demand', version: 'v1.0' } },
        update: {},
        create: { type: 'demand', version: 'v1.0', accuracy: 0.6, modelKind: 'measured', lastTrained: new Date(1), isActive: false, trainingDataSize: 10 },
      });

      await registry.activate('demand', 'v1.0', { force: true });
      const active = fake.rows.filter((r) => r.type === 'demand' && r.isActive);
      expect(active).toHaveLength(1);
      expect(active[0].version).toBe('v1.0');
    });

    it('throws for an unknown version', async () => {
      await expect(registry.activate('demand', 'v9.9')).rejects.toThrow(/not found/);
    });
  });

  describe('saveVersion', () => {
    it('persists a gate-passing model as active', async () => {
      const artifact = measuredArtifact('demand', 'v1.0', 0.81, 50);
      const saved = await registry.saveVersion(artifact, { activate: true });
      expect(saved.version).toBe('v1.0');
      const row = fake.rows.find((r) => r.version === 'v1.0');
      expect(row?.isActive).toBe(true);
      expect(row?.accuracy).toBe(0.81);
      expect(row?.modelKind).toBe('measured');
      expect(row?.metrics).toEqual(artifact.evaluation);
      expect(row?.featureNames).toEqual(['a', 'b']);
    });

    it('stores a sub-threshold model as inactive even when asked to activate', async () => {
      const artifact = measuredArtifact('demand', 'v1.0', 0.70, 50);
      await registry.saveVersion(artifact, { activate: true });
      expect(fake.rows.find((r) => r.version === 'v1.0')?.isActive).toBe(false);
    });
  });

  describe('rollback', () => {
    it('reactivates the most recently trained inactive version', async () => {
      await fake.model.upsert({
        where: { type_version: { type: 'churn', version: 'v1.1' } },
        update: {},
        create: { type: 'churn', version: 'v1.1', accuracy: 0.8, modelKind: 'measured', lastTrained: new Date(3), isActive: true },
      });
      await fake.model.upsert({
        where: { type_version: { type: 'churn', version: 'v1.0' } },
        update: {},
        create: { type: 'churn', version: 'v1.0', accuracy: 0.7, modelKind: 'measured', lastTrained: new Date(1), isActive: false },
      });
      await fake.model.upsert({
        where: { type_version: { type: 'churn', version: 'v1.2' } },
        update: {},
        create: { type: 'churn', version: 'v1.2', accuracy: 0.65, modelKind: 'measured', lastTrained: new Date(2), isActive: false },
      });

      const restored = await registry.rollback('churn');
      expect(restored).toBe('v1.2'); // most recent inactive
      expect(fake.rows.filter((r) => r.type === 'churn' && r.isActive)).toHaveLength(1);
    });

    it('throws when there is no prior version', async () => {
      await expect(registry.rollback('seasonal')).rejects.toThrow(/No prior version/);
    });
  });

  describe('per-type version coexistence (schema fix)', () => {
    it('lets demand v1.0 and churn v1.0 coexist via the compound key', async () => {
      await fake.model.upsert({
        where: { type_version: { type: 'demand', version: 'v1.0' } },
        update: {},
        create: { type: 'demand', version: 'v1.0', accuracy: 0.9, modelKind: 'measured', lastTrained: new Date(), isActive: true },
      });
      await fake.model.upsert({
        where: { type_version: { type: 'churn', version: 'v1.0' } },
        update: {},
        create: { type: 'churn', version: 'v1.0', accuracy: 0.8, modelKind: 'measured', lastTrained: new Date(), isActive: true },
      });

      expect(fake.rows.filter((r) => r.version === 'v1.0')).toHaveLength(2);
      const demand = fake.rows.find((r) => r.type === 'demand' && r.version === 'v1.0');
      const churn = fake.rows.find((r) => r.type === 'churn' && r.version === 'v1.0');
      expect(demand?.id).not.toBe(churn?.id);
    });
  });

  describe('getActive', () => {
    it('never surfaces a fallback as measured', async () => {
      await registry.ensureFallback('churn', 'insufficient-samples');
      const active = await registry.getActive('churn');
      expect(active?.modelKind).toBe('fallback');
      expect(active?.evaluation).toBeNull();
      expect(active?.fallbackReason).toBe('insufficient-samples');
    });

    it('labels optimization as heuristic with no accuracy', async () => {
      await registry.ensureFallback('optimization', 'heuristic-scheduler');
      const active = await registry.getActive('optimization');
      expect(active?.modelKind).toBe('heuristic');
      expect(active?.evaluation).toBeNull();
    });

    it('returns null when nothing is active', async () => {
      expect(await registry.getActive('demand')).toBeNull();
    });
  });

  describe('listVersions', () => {
    it('reports modelKind and null accuracy for a fallback', async () => {
      await registry.ensureFallback('demand', 'no-dataset');
      const list = await registry.listVersions('demand');
      expect(list).toHaveLength(1);
      expect(list[0].modelKind).toBe('fallback');
      expect(list[0].accuracy).toBeNull();
      expect(list[0].isActive).toBe(true);
    });
  });
});
