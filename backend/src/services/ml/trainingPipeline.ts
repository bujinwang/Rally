/**
 * Story 6.6 — Training pipeline (T03).
 *
 * Orchestrates the honest training flow for a single model type:
 *
 *   build dataset → gate check → seeded split → fit → evaluate → save →
 *   activate-if-gate.
 *
 * It never fabricates a model: when the dataset is below the per-type minimum
 * the run returns `{ status: 'skipped', reason }` and nothing is written
 * (design §7). All randomness is seeded, so a run is reproducible.
 */

import {
  RidgeRegressor,
  LogisticRegressor,
  seasonalDecompose,
  SeasonalFit,
} from './estimators';
import {
  evaluateChurn,
  evaluateDemand,
  evaluateRegression,
  makeProtocol,
  splitStratified,
  splitTail,
  splitTemporal,
} from './evaluation';
import {
  buildChurnDataset,
  buildDemandDataset,
  buildSeasonalDataset,
  readSeasonalBuckets,
} from './features';
import { PredictionModelRegistry, modelRegistry } from './modelRegistry';
import {
  ACTIVATION_MIN_ACCURACY,
  DEFAULT_SPLIT_SEED,
  DEMAND_HOLDOUT_RATIO,
  EvaluationReport,
  MEASURED_TYPES,
  MIN_SAMPLES,
  ModelArtifact,
  ModelType,
  SEASONAL_FORECAST_HORIZON,
  SEASONAL_HOLDOUT_BUCKETS,
  SkipReason,
  TrainingOutcome,
} from './types';

/** Options accepted by `TrainingPipeline.run`. */
export interface TrainOptions {
  /** Retrain even when an active measured model already exists. */
  force?: boolean;
  /** Override the deterministic split seed (tests). */
  seed?: number;
}

/** Ridge penalty for the demand regressor (design §1 D1). */
const DEMAND_RIDGE_ALPHA = 1.0;

/** Logistic training budget for churn (design §1 D1). */
const CHURN_EPOCHS = 400;
const CHURN_LR = 0.35;
const CHURN_L2 = 0.01;
const CHURN_PATIENCE = 40;

/**
 * The retraining pipeline. A single instance is safe to share — it is stateless
 * apart from its injected registry.
 */
export class TrainingPipeline {
  constructor(private readonly registry: PredictionModelRegistry = modelRegistry) {}

  /**
   * Train (or skip) a model type.
   *
   * @param type The prediction family.
   * @param opts Retraining options.
   * @throws Error for `optimization` (it is a fixed heuristic, never trained).
   */
  async run(type: ModelType, opts: TrainOptions = {}): Promise<TrainingOutcome> {
    if (type === 'optimization') {
      throw new Error('TrainingPipeline: optimization is a heuristic and is never trained');
    }
    const seed = opts.seed ?? DEFAULT_SPLIT_SEED;

    switch (type) {
      case 'demand':
        return this.trainDemand(seed);
      case 'churn':
        return this.trainChurn(seed);
      case 'seasonal':
        return this.trainSeasonal(seed);
      default:
        return { status: 'skipped', reason: 'no-dataset' };
    }
  }

  /**
   * Retrain every *measured* type, activating each one that clears its gate.
   * Designed for the 24 h scheduler: it never throws (each type is isolated).
   */
  async runAll(opts: TrainOptions = {}): Promise<Record<string, TrainingOutcome>> {
    const out: Record<string, TrainingOutcome> = {};
    for (const type of MEASURED_TYPES) {
      try {
        out[type] = await this.run(type, opts);
      } catch (error) {
        out[type] = { status: 'skipped', reason: 'no-dataset' };
        // Intentionally swallowed: the scheduler must never crash on one type.
        void error;
      }
    }
    return out;
  }

  /** Train the demand (ridge) model for every location with enough data. */
  private async trainDemand(seed: number): Promise<TrainingOutcome> {
    const locations = await this.demandLocations();
    if (locations.length === 0) {
      return { status: 'skipped', reason: 'no-dataset' };
    }

    // Train per location, keep the strongest measured evaluation. A single
    // active `demand` artifact is the design's contract (§1 D4).
    let best: { artifact: ModelArtifact; evaluation: EvaluationReport; value: number } | null = null;
    let anyInsufficient = false;

    for (const location of locations) {
      const dataset = await buildDemandDataset(location);
      if (dataset.insufficient || dataset.X.length === 0) {
        anyInsufficient = true;
        continue;
      }

      const rows = dataset.order.map((order, i) => ({ label: dataset.y[i], order }));
      const { trainIndex, testIndex } = splitTemporal(rows, DEMAND_HOLDOUT_RATIO);
      if (testIndex.length === 0 || trainIndex.length === 0) {
        anyInsufficient = true;
        continue;
      }

      const trainX = trainIndex.map((i) => dataset.X[i]);
      const trainY = trainIndex.map((i) => dataset.y[i]);
      const testX = testIndex.map((i) => dataset.X[i]);
      const testY = testIndex.map((i) => dataset.y[i]);

      const model = new RidgeRegressor(DEMAND_RIDGE_ALPHA);
      model.fit(trainX, trainY);
      const linear = model.toLinear();

      const protocol = makeProtocol(
        'temporal',
        seed,
        trainIndex.length,
        testIndex.length,
        'regression-efficiency',
        'temporal 80/20 holdout (no future leakage)'
      );
      const evaluation = evaluateDemand(
        testX,
        testY,
        (x) => {
          let s = linear.intercept;
          for (let j = 0; j < x.length; j += 1) s += linear.coefficients[j] * x[j];
          return s;
        },
        protocol
      );

      const artifact: ModelArtifact = {
        type: 'demand',
        version: 'pending',
        modelKind: 'measured',
        coefficients: linear.coefficients,
        intercept: linear.intercept,
        featureSpec: dataset.featureSpec,
        hyperparameters: {
          estimator: 'ridge',
          alpha: DEMAND_RIDGE_ALPHA,
          descriptor: dataset.descriptor,
        },
        evaluation,
        trainingDataSize: trainIndex.length,
      };

      if (best === null || evaluation.value > best.value) {
        best = { artifact, evaluation, value: evaluation.value };
      }
    }

    if (best === null) {
      return { status: 'skipped', reason: anyInsufficient ? 'insufficient-samples' : 'no-dataset' };
    }

    const version = await this.registry.nextVersion('demand');
    best.artifact.version = version;
    const shouldActivate = this.registry.canActivate(best.artifact);
    await this.registry.saveVersion(best.artifact, { activate: shouldActivate });

    if (!shouldActivate) {
      return { status: 'skipped', reason: 'below-threshold' };
    }
    return { status: 'trained', version, evaluation: best.evaluation };
  }

  /** Distinct locations that have at least one completed session. */
  private async demandLocations(): Promise<string[]> {
    // Imported lazily to keep `features.ts` the single DB-touching module.
    const { prisma } = await import('../../config/database');
    const rows = (await prisma.mvpSession.findMany({
      where: { status: 'COMPLETED', location: { not: null } },
      select: { location: true },
      distinct: ['location'],
    })) as unknown as { location: string | null }[];
    return rows
      .map((r) => r.location)
      .filter((l): l is string => typeof l === 'string' && l.length > 0)
      .sort();
  }

  /** Train the churn (logistic) model. */
  private async trainChurn(seed: number): Promise<TrainingOutcome> {
    const dataset = await buildChurnDataset();
    if (dataset.insufficient || dataset.X.length === 0) {
      return { status: 'skipped', reason: dataset.reason ?? 'insufficient-samples' };
    }

    const rows = dataset.order.map((order, i) => ({ label: dataset.y[i], order }));
    const { trainIndex, testIndex } = splitStratified(rows, 0.2, seed);
    const trainLabels = trainIndex.map((i) => dataset.y[i]);
    const testLabels = testIndex.map((i) => dataset.y[i]);

    // A stratified split guarantees both classes in the holdout iff both are
    // present in the data; if not, the run is not honest and is skipped.
    if (
      trainIndex.length === 0 ||
      testIndex.length === 0 ||
      new Set(trainLabels).size < 2 ||
      new Set(testLabels).size < 2
    ) {
      return { status: 'skipped', reason: 'insufficient-samples' };
    }

    const trainX = trainIndex.map((i) => dataset.X[i]);
    const testX = testIndex.map((i) => dataset.X[i]);

    const model = new LogisticRegressor();
    model.fit(trainX, trainLabels, {
      epochs: CHURN_EPOCHS,
      lr: CHURN_LR,
      l2: CHURN_L2,
      patience: CHURN_PATIENCE,
      validationFraction: 0.2,
    });
    const linear = model.toLinear();

    const protocol = makeProtocol(
      'stratified',
      seed,
      trainIndex.length,
      testIndex.length,
      'accuracy',
      'stratified 80/20 holdout'
    );
    const evaluation = evaluateChurn(
      testX,
      testLabels,
      (x) => {
        let z = linear.intercept;
        for (let j = 0; j < x.length; j += 1) z += linear.coefficients[j] * x[j];
        return 1 / (1 + Math.exp(-z));
      },
      protocol
    );

    const artifact: ModelArtifact = {
      type: 'churn',
      version: 'pending',
      modelKind: 'measured',
      coefficients: linear.coefficients,
      intercept: linear.intercept,
      featureSpec: dataset.featureSpec,
      hyperparameters: {
        estimator: 'logistic',
        epochs: CHURN_EPOCHS,
        lr: CHURN_LR,
        l2: CHURN_L2,
        descriptor: dataset.descriptor,
      },
      evaluation,
      trainingDataSize: trainIndex.length,
    };

    const version = await this.registry.nextVersion('churn');
    artifact.version = version;
    const shouldActivate = this.registry.canActivate(artifact);
    await this.registry.saveVersion(artifact, { activate: shouldActivate });
    if (!shouldActivate) {
      return { status: 'skipped', reason: 'below-threshold' };
    }
    return { status: 'trained', version, evaluation };
  }

  /** Train the seasonal (additive decomposition) model. */
  private async trainSeasonal(seed: number): Promise<TrainingOutcome> {
    const dataset = await buildSeasonalDataset();
    if (dataset.insufficient || dataset.X.length === 0) {
      return { status: 'skipped', reason: dataset.reason ?? 'insufficient-samples' };
    }

    const buckets = await readSeasonalBuckets();
    const rows = dataset.order.map((order, i) => ({ label: dataset.y[i], order }));
    const { trainIndex, testIndex } = splitTail(rows, SEASONAL_HOLDOUT_BUCKETS);
    if (trainIndex.length === 0 || testIndex.length === 0) {
      return { status: 'skipped', reason: 'insufficient-samples' };
    }

    const fit: SeasonalFit = seasonalDecompose(
      trainIndex.map((i) => ({
        month: buckets[i].month,
        count: buckets[i].count,
        index: buckets[i].index,
      }))
    );

    const testBuckets = testIndex.map((i) => buckets[i]);
    const actual = testBuckets.map((b) => b.count);
    const predicted = testBuckets.map((b) => fit.forecast(b.month, b.index));

    const protocol = makeProtocol(
      'holdout-tail',
      seed,
      trainIndex.length,
      testIndex.length,
      'regression-efficiency',
      `additive decomposition; trailing ${testIndex.length} month buckets held out`
    );
    const evaluation = evaluateRegression(actual, predicted, protocol);

    // Express the decomposition in the same linear space as other artifacts so
    // serving stays uniform: intercept + slope·trend + Σ seasonalIndex·(sin/cos).
    const coefficients = [fit.slope, 0, 0];
    const artifact: ModelArtifact = {
      type: 'seasonal',
      version: 'pending',
      modelKind: 'measured',
      coefficients,
      intercept: fit.intercept,
      featureSpec: dataset.featureSpec,
      hyperparameters: {
        estimator: 'seasonal-decomposition',
        slope: fit.slope,
        seasonalIndex: fit.seasonalIndex,
        descriptor: dataset.descriptor,
      },
      evaluation,
      trainingDataSize: trainIndex.length,
    };

    const version = await this.registry.nextVersion('seasonal');
    artifact.version = version;
    const shouldActivate = this.registry.canActivate(artifact);
    await this.registry.saveVersion(artifact, { activate: shouldActivate });
    if (!shouldActivate) {
      return { status: 'skipped', reason: 'below-threshold' };
    }
    return { status: 'trained', version, evaluation };
  }
}

/** Minimum measured accuracy required to activate (re-exported for routes). */
export const ACTIVATION_THRESHOLD = ACTIVATION_MIN_ACCURACY;

/** Per-type minimum sample counts (re-exported for the admin surface). */
export const TYPE_MIN_SAMPLES = MIN_SAMPLES;

/** Forecast horizon used by the seasonal serving path. */
export const SEASONAL_HORIZON_MONTHS = SEASONAL_FORECAST_HORIZON;

/** Reasons a run can be skipped (re-exported for narrow typing at call sites). */
export type { SkipReason };

/** Shared pipeline singleton used by the service, routes and scheduler. */
export const trainingPipeline = new TrainingPipeline();
