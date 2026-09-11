/**
 * Story 6.6 — Model registry (T03).
 *
 * Owns the **one-active-model-per-type** invariant, version allocation, the
 * activation gate, and rollback. All state mutations go through a single
 * `prisma.$transaction` so a reader can never observe two active rows for a
 * type (design §1 D5 / AC 6).
 *
 * Honesty gate (`canActivate`): a version may be auto-activated by the training
 * pipeline only when `modelKind === 'measured'` **and** `accuracy ≥ 0.75`
 * **and** `trainingDataSize ≥ minSamples[type]`. An explicit operator rollback
 * bypasses the gate (`force`) so a bad deploy is always reversible.
 *
 * The registry talks to the shared Prisma client (`../config/database`) so a
 * single instance is mockable in tests — never `new PrismaClient()`.
 */

import type { PredictionModel } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import {
  ACTIVATION_MIN_ACCURACY,
  ANONYMIZATION_VERSION,
  ARTIFACT_SCHEMA_VERSION,
  MIN_SAMPLES,
  MODEL_CACHE_TTL_MS,
  ModelArtifact,
  ModelHyperparameters,
  ModelKind,
  ModelSummary,
  ModelType,
} from './types';

/** Row shape selected by the registry (subset of `PredictionModel`). */
interface ModelRow {
  id: string;
  type: string;
  version: string;
  accuracy: number | null;
  lastTrained: Date;
  isActive: boolean;
  modelKind: string;
  parameters: unknown;
  hyperparameters: unknown;
  evaluationProtocol: unknown;
  featureNames: unknown;
  metrics: unknown;
  trainingDataSize: number | null;
}

/** Parsed serving artifact as persisted in `parameters`. */
interface PersistedParameters {
  coefficients?: number[];
  intercept?: number;
  featureSpec?: ModelArtifact['featureSpec'];
}

/** Cached artifact with an absolute expiry (ms epoch). */
interface CacheEntry {
  at: number;
  artifact: ModelArtifact | null;
}

/** Does `s` look like a ModelKind? (guards against unknown DB values). */
function asModelKind(s: string | null | undefined, fallback: ModelKind): ModelKind {
  return s === 'measured' || s === 'fallback' || s === 'heuristic' ? s : fallback;
}

/** Coerce a JSON column to an object (Prisma returns `JsonValue`). */
function asObject<T>(value: unknown): T | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as T;
  }
  return null;
}

/** Coerce a JSON column to a string array (feature names), or `[]`. */
function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Cast a plain value to Prisma's JSON input type.
 *
 * Prisma's `InputJsonValue` requires an index signature that our well-typed
 * interfaces intentionally lack; the values written here are always plain
 * JSON-serializable data (coefficients, descriptors, metrics), so this single
 * boundary cast is the only place the compiler is silenced.
 */
function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/** Normalize a raw `accuracy` (may be `null`, `Decimal`, or missing). */
function asNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof (value as { toNumber?: () => number }).toNumber === 'function') {
    const n = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Central registry for prediction-model versions.
 *
 * A short-lived in-process cache keeps warm serving path calls to zero queries
 * (design §1 D4); any mutation invalidates the cache for the affected type.
 */
export class PredictionModelRegistry {
  private readonly cache = new Map<ModelType, CacheEntry>();

  /** Invalidate the in-process artifact cache (all types, or one). */
  invalidateCache(type?: ModelType): void {
    if (type) this.cache.delete(type);
    else this.cache.clear();
  }

  /**
   * Load the single active artifact for a type, or `null` when none is active.
   *
   * @param type The prediction family.
   */
  async getActive(type: ModelType): Promise<ModelArtifact | null> {
    const cached = this.cache.get(type);
    if (cached && cached.at > Date.now()) {
      return cached.artifact;
    }

    const row = (await prisma.predictionModel.findFirst({
      where: { type, isActive: true },
      orderBy: { lastTrained: 'desc' },
    })) as unknown as ModelRow | null;

    const artifact = row ? this.toArtifact(row) : null;
    this.cache.set(type, { at: Date.now() + MODEL_CACHE_TTL_MS, artifact });
    return artifact;
  }

  /**
   * Persist (or refresh) a labelled **fallback** row for a type and return it.
   *
   * A fallback carries `modelKind = 'fallback'` and `accuracy = null` and can
   * never be reported as measured (design §1 D6 / AC 8).
   *
   * @param type The prediction family.
   * @param reason Non-empty machine reason (e.g. `insufficient-samples`).
   */
  async ensureFallback(type: ModelType, reason: string): Promise<ModelArtifact> {
    const version = 'fallback-v1';
    const evaluationProtocol = json({
      split: 'stratified',
      seed: 0,
      trainSize: 0,
      testSize: 0,
      metric: 'accuracy',
      note: 'fallback — no measured model available',
    });
    const hyperparameters = json({
      estimator: type === 'optimization' ? 'greedy-scheduler' : 'ridge',
      fallbackReason: reason,
      schemaVersion: ARTIFACT_SCHEMA_VERSION,
      ...(type === 'optimization' ? { subKind: 'heuristic-scheduler' } : {}),
    });
    let savedId: string | undefined;

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Deactivate any active sibling so the invariant holds even for fallbacks.
      await tx.predictionModel.updateMany({
        where: { type, isActive: true },
        data: { isActive: false },
      });
      const row = await tx.predictionModel.upsert({
        where: { type_version: { type, version } },
        update: {
          isActive: true,
          accuracy: null,
          modelKind: type === 'optimization' ? 'heuristic' : 'fallback',
          lastTrained: new Date(),
          hyperparameters,
          evaluationProtocol,
        },
        create: {
          type,
          version,
          accuracy: null,
          modelKind: type === 'optimization' ? 'heuristic' : 'fallback',
          lastTrained: new Date(),
          isActive: true,
          parameters: json({ coefficients: [], intercept: 0 }),
          hyperparameters,
          evaluationProtocol,
          featureNames: json([]),
          trainingDataSize: 0,
        },
      });
      savedId = (row as unknown as { id: string }).id;
    });

    this.invalidateCache(type);
    return {
      id: savedId,
      type,
      version,
      modelKind: type === 'optimization' ? 'heuristic' : 'fallback',
      coefficients: [],
      intercept: 0,
      featureSpec: { names: [], mean: [], std: [], anonymizationVersion: ANONYMIZATION_VERSION },
      hyperparameters: { estimator: 'ridge', fallbackReason: reason },
      evaluation: null,
      trainingDataSize: 0,
      fallbackReason: reason,
    };
  }

  /**
   * Allocate the next version label for a type: `v1.<maxMinor + 1>`.
   *
   * Only `v1.x` versions participate in the maximum (the major is currently
   * pinned at 1 by the design, §1 D5).
   */
  async nextVersion(type: ModelType): Promise<string> {
    const rows = (await prisma.predictionModel.findMany({
      where: { type },
      select: { version: true },
    })) as unknown as { version: string }[];

    let maxMinor = -1;
    for (const { version } of rows) {
      const match = /^v(\d+)\.(\d+)$/.exec(version);
      if (!match) continue;
      const major = Number.parseInt(match[1], 10);
      const minor = Number.parseInt(match[2], 10);
      if (major === 1 && minor > maxMinor) maxMinor = minor;
    }
    return `v1.${maxMinor + 1}`;
  }

  /**
   * The activation gate (design §1 D5).
   *
   * @returns `true` only for a measured artifact that clears the accuracy and
   *   per-type sample thresholds.
   */
  canActivate(artifact: ModelArtifact): boolean {
    if (artifact.modelKind !== 'measured') return false;
    if (artifact.evaluation === null) return false;
    if (!(artifact.evaluation.value >= ACTIVATION_MIN_ACCURACY)) return false;
    const min = MIN_SAMPLES[artifact.type] ?? 0;
    return artifact.trainingDataSize >= min;
  }

  /**
   * Persist a new model version.
   *
   * @param artifact The fitted artifact (version already allocated).
   * @param opts.activate When `true` (and the gate passes), the new version is
   *   activated and all siblings are deactivated — in one transaction.
   * @returns The new row id and version.
   */
  async saveVersion(
    artifact: ModelArtifact,
    opts: { activate: boolean }
  ): Promise<{ id: string; version: string }> {
    const activate = opts.activate && this.canActivate(artifact);
    const isActive = activate;

    const parameters = json({
      coefficients: artifact.coefficients,
      intercept: artifact.intercept,
      featureSpec: artifact.featureSpec,
    });
    const hyperparameters = json({
      ...artifact.hyperparameters,
      schemaVersion: ARTIFACT_SCHEMA_VERSION,
      descriptor: artifact.hyperparameters.descriptor ?? null,
    });
    // Nullable JSON columns accept explicit `JsonNull` to store a real NULL.
    const metrics: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue = artifact.evaluation
      ? json(artifact.evaluation)
      : Prisma.JsonNull;
    const evaluationProtocol: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue =
      artifact.evaluation ? json(artifact.evaluation.protocol) : Prisma.JsonNull;
    const featureNames = json(artifact.featureSpec.names);

    const saved = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (activate) {
        await tx.predictionModel.updateMany({
          where: { type: artifact.type, isActive: true },
          data: { isActive: false },
        });
      }
      const row = await tx.predictionModel.upsert({
        where: { type_version: { type: artifact.type, version: artifact.version } },
        update: {
          accuracy: artifact.evaluation ? artifact.evaluation.value : null,
          modelKind: artifact.modelKind,
          lastTrained: new Date(),
          isActive,
          parameters,
          hyperparameters,
          metrics,
          evaluationProtocol,
          featureNames,
          trainingDataSize: artifact.trainingDataSize,
        },
        create: {
          type: artifact.type,
          version: artifact.version,
          accuracy: artifact.evaluation ? artifact.evaluation.value : null,
          modelKind: artifact.modelKind,
          lastTrained: new Date(),
          isActive,
          parameters,
          hyperparameters,
          metrics,
          evaluationProtocol,
          featureNames,
          trainingDataSize: artifact.trainingDataSize,
        },
      });
      return row as unknown as { id: string; version: string };
    });

    this.invalidateCache(artifact.type);
    return { id: saved.id, version: saved.version };
  }

  /**
   * Activate a version, deactivating every sibling of the same type in a single
   * transaction (the one-active-per-type invariant).
   *
   * @param type The prediction family.
   * @param version Target version label.
   * @param opts.force Operator rollback: bypass the accuracy/size gate. Only
   *   permitted for a version that already exists.
   * @throws Error when the version does not exist, or (without `force`) fails
   *   the gate.
   */
  async activate(type: ModelType, version: string, opts?: { force?: boolean }): Promise<void> {
    const row = (await prisma.predictionModel.findUnique({
      where: { type_version: { type, version } },
    })) as unknown as ModelRow | null;
    if (!row) {
      throw new Error(`PredictionModel ${type} ${version} not found`);
    }

    if (!opts?.force) {
      const artifact = this.toArtifact(row);
      if (!this.canActivate(artifact)) {
        throw new Error(
          `Refusing to activate ${type} ${version}: fails the activation gate ` +
            `(modelKind=${row.modelKind}, accuracy=${row.accuracy ?? 'null'})`
        );
      }
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.predictionModel.updateMany({
        where: { type, isActive: true, NOT: { version } },
        data: { isActive: false },
      });
      await tx.predictionModel.updateMany({
        where: { type, version },
        data: { isActive: true },
      });
    });

    this.invalidateCache(type);
  }

  /**
   * Roll the type back to its previous activated version.
   *
   * The target is the most recently trained non-active version (any prior
   * existing version is eligible — rollback deliberately bypasses the gate).
   *
   * @returns The version restored.
   * @throws Error when there is no prior version to restore.
   */
  async rollback(type: ModelType): Promise<string> {
    const rows = (await prisma.predictionModel.findMany({
      where: { type, isActive: false },
      orderBy: { lastTrained: 'desc' },
    })) as unknown as ModelRow[];
    if (rows.length === 0) {
      throw new Error(`No prior version to roll back to for type ${type}`);
    }
    const target = rows[0];
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.predictionModel.updateMany({
        where: { type, isActive: true },
        data: { isActive: false },
      });
      await tx.predictionModel.updateMany({
        where: { type, version: target.version },
        data: { isActive: true },
      });
    });
    this.invalidateCache(type);
    return target.version;
  }

  /** Compact listing of a type's versions for the admin surface. */
  async listVersions(type: ModelType): Promise<ModelSummary[]> {
    const rows = (await prisma.predictionModel.findMany({
      where: { type },
      orderBy: [{ isActive: 'desc' }, { lastTrained: 'desc' }],
    })) as unknown as ModelRow[];
    return rows.map((row) => ({
      id: row.id,
      type,
      version: row.version,
      modelKind: asModelKind(row.modelKind, 'measured'),
      accuracy: asNumberOrNull(row.accuracy),
      isActive: row.isActive,
      trainingDataSize: row.trainingDataSize,
      lastTrained: row.lastTrained.toISOString(),
    }));
  }

  /**
   * Convert a persisted row into a serving artifact.
   *
   * A `fallback`/`heuristic` row always yields `accuracy`/`evaluation` of
   * `null` — the honesty rule is enforced at this boundary, not left to callers.
   */
  private toArtifact(row: ModelRow): ModelArtifact {
    const modelKind = asModelKind(row.modelKind, 'measured');
    const params = asObject<PersistedParameters>(row.parameters);
    const hyper = asObject<ModelHyperparameters>(row.hyperparameters);
    const featureNames = asStringArray(row.featureNames);
    const featureSpec = params?.featureSpec ?? {
      names: featureNames,
      mean: [],
      std: [],
      anonymizationVersion: 'sha1-v1',
    };
    const measured = modelKind === 'measured';
    const evaluation = measured ? (asObject<ModelArtifact['evaluation']>(row.metrics) as ModelArtifact['evaluation']) : null;
    const fallbackReason = measured ? undefined : hyper?.fallbackReason ?? 'no-active-model';

    return {
      id: row.id,
      type: row.type as ModelType,
      version: row.version,
      modelKind,
      coefficients: params?.coefficients ?? [],
      intercept: params?.intercept ?? 0,
      featureSpec,
      hyperparameters: hyper ?? { estimator: 'ridge' },
      evaluation,
      trainingDataSize: row.trainingDataSize ?? 0,
      ...(fallbackReason ? { fallbackReason } : {}),
    };
  }
}

/** Shared singleton registry used by the service, routes and scheduler. */
export const modelRegistry = new PredictionModelRegistry();

/** Type guard used by callers that must not report an accuracy for a non-measured row. */
export function isMeasured(artifact: ModelArtifact | null): boolean {
  return artifact !== null && artifact.modelKind === 'measured' && artifact.evaluation !== null;
}

/** Re-export for convenience (typed row access in tests). */
export type { ModelRow };
export type { PredictionModel };
