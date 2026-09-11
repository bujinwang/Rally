/**
 * Story 6.6 — Real Predictive Intelligence: shared ML type surface (T01).
 *
 * This module is the single source of truth for every type that crosses a
 * module boundary inside `services/ml`. It is deliberately dependency-free
 * (types + constants only) so it can be imported from anywhere without risk of
 * a circular import.
 *
 * Honesty model (design §1 D6): `modelKind` is the *source of truth* for
 * whether a served result carries a real measured accuracy. Code that reports a
 * number MUST first check `modelKind === 'measured'`; a `fallback` or
 * `heuristic` artifact never carries an `accuracy`.
 */

/** The four prediction families the product exposes. */
export type ModelType = 'demand' | 'churn' | 'seasonal' | 'optimization';

/**
 * How a served artifact came to exist.
 *  - `measured`   → a real, held-out-evaluated model (has an `EvaluationReport`).
 *  - `fallback`   → a deterministic heuristic used when data is insufficient;
 *                   `accuracy` is always `null` and a `fallbackReason` explains why.
 *  - `heuristic`  → the deterministic court scheduler; never a learned model,
 *                   `accuracy` is always `null`.
 */
export type ModelKind = 'measured' | 'fallback' | 'heuristic';

/** Why a training run was skipped (never fabricated into a model). */
export type SkipReason = 'insufficient-samples' | 'below-threshold' | 'no-dataset';

/** Metric family reported in an `EvaluationReport`. */
export type EvaluationMetric = 'accuracy' | 'regression-efficiency';

/** Split protocol used to produce a held-out evaluation. */
export type SplitKind = 'stratified' | 'temporal' | 'holdout-tail';

export const MODEL_TYPES: readonly ModelType[] = [
  'demand',
  'churn',
  'seasonal',
  'optimization',
] as const;

/** Types that are actually *learned* (optimization is a fixed heuristic). */
export const MEASURED_TYPES: readonly ModelType[] = ['demand', 'churn', 'seasonal'] as const;

/**
 * Minimum *training* sample counts per type (design §1 D2.1 / §12). Below
 * threshold a type serves a labelled fallback rather than a fabricated model.
 */
export const MIN_SAMPLES: Record<ModelType, number> = {
  demand: 40,
  churn: 60,
  seasonal: 12,
  optimization: 0,
};

/** A measured model may only be auto-activated at/above this held-out score. */
export const ACTIVATION_MIN_ACCURACY = 0.75;

/** Anonymization scheme version embedded in every `FeatureSpec`. */
export const ANONYMIZATION_VERSION = 'sha1-v1';

/** Recency window (days) that defines a churned identity (design §12). */
export const CHURN_WINDOW_DAYS = 60;

/** Minimum participation observations required of each churn identity. */
export const MIN_IDENTITY_OBSERVATIONS = 3;

/** Minimum number of positive (churned) labels required to train churn. */
export const MIN_CHURN_POSITIVES = 10;

/** Minimum demand holdout rows for a viable temporal validation. */
export const DEMAND_MIN_HOLDOUT_ROWS = 8;

/** Fraction of demand rows held out (temporal) for evaluation. */
export const DEMAND_HOLDOUT_RATIO = 0.2;

/** Minimum populated month buckets required to train a seasonal model. */
export const SEASONAL_MIN_POPULATED_MONTHS = 12;

/** Number of trailing month buckets held out for seasonal evaluation. */
export const SEASONAL_HOLDOUT_BUCKETS = 4;

/** Default deterministic RNG seed (no wall-clock, so splits are reproducible). */
export const DEFAULT_SPLIT_SEED = 20260914;

/** In-process artifact cache TTL (ms) for the model registry. */
export const MODEL_CACHE_TTL_MS = 30_000;

/** Number of months the seasonal forecast projects forward. */
export const SEASONAL_FORECAST_HORIZON = 12;

/** Schema version of the persisted artifact JSON (forward-compat guard). */
export const ARTIFACT_SCHEMA_VERSION = 1;

// ── Feature / dataset structures ────────────────────────────────────────────

/**
 * Column standardization carried with every artifact for provenance. Feature
 * *values* are never stored here — only per-column aggregates (no PII).
 */
export interface FeatureSpec {
  /** Ordered feature names, matching `coefficients` index-for-index. */
  names: string[];
  /** Per-column training mean (same order as `names`). */
  mean: number[];
  /** Per-column training standard deviation (same order as `names`). */
  std: number[];
  /** Anonymization scheme version (e.g. `sha1-v1`). */
  anonymizationVersion: string;
}

/** A single anonymized, all-numeric feature row. */
export interface FeatureRow {
  [feature: string]: number;
}

/** Class counts for a classification dataset (labels are enums, not identities). */
export type ClassBalance = Record<string, number>;

/** Machine-readable description of a dataset — never raw rows. */
export interface DatasetDescriptor {
  type: ModelType;
  rowCount: number;
  minSamples: number;
  featureSpec: FeatureSpec;
  /** ISO-8601 inclusive start of the training window. */
  windowFrom: string;
  /** ISO-8601 inclusive end of the training window (the closed observation date). */
  windowTo: string;
  classBalance: ClassBalance;
}

/** A prepared dataset ready for split → fit → evaluate. */
export interface Dataset {
  type: ModelType;
  /** Design matrix (rows × features). */
  X: number[][];
  /** Target vector (regression value, or 0/1 label). */
  y: number[];
  /** Sort key per row (epoch ms / bucket index) for temporal splits. */
  order: number[];
  /** Human-readable rows (whitelisted, non-PII) — for tests & debugging. */
  rows: FeatureRow[];
  featureSpec: FeatureSpec;
  descriptor: DatasetDescriptor;
  /** True when the data volume is below the gate for this type. */
  insufficient: boolean;
  reason?: SkipReason;
}

// ── Evaluation structures ───────────────────────────────────────────────────

/** How a held-out evaluation was produced. */
export interface EvaluationProtocol {
  split: SplitKind;
  seed: number;
  trainSize: number;
  testSize: number;
  metric: EvaluationMetric;
  note?: string;
}

/** The full held-out evaluation of a single model. */
export interface EvaluationReport {
  metric: EvaluationMetric;
  /** Headline score (accuracy, or 1 − MAPE regression efficiency). */
  value: number;
  /** ROC-AUC for classifiers; `null` for regressors. */
  auc: number | null;
  mae: number | null;
  rmse: number | null;
  mape: number | null;
  protocol: EvaluationProtocol;
}

// ── Artifacts & predictions ─────────────────────────────────────────────────

/** Training hyperparameters + provenance persisted alongside a model. */
export interface ModelHyperparameters {
  estimator: 'ridge' | 'logistic' | 'seasonal-decomposition' | 'greedy-scheduler';
  alpha?: number;
  epochs?: number;
  lr?: number;
  l2?: number;
  /** Seasonal-only: fitted linear trend. */
  slope?: number;
  /** Seasonal-only: 12 month-of-year additive indices. */
  seasonalIndex?: number[];
  /** Optimization-only honesty tag. */
  subKind?: string;
  /** Fallback-only: why no measured model was available. */
  fallbackReason?: string;
  /** Dataset provenance (counts + schema + window) — never raw rows. */
  descriptor?: DatasetDescriptor;
  /** Artifact schema version. */
  schemaVersion?: number;
  [key: string]: unknown;
}

/** A loadable model artifact: everything needed to serve + explain a prediction. */
export interface ModelArtifact {
  /** Persisted row id (present once saved/loaded from the registry). */
  id?: string;
  type: ModelType;
  version: string;
  modelKind: ModelKind;
  coefficients: number[];
  intercept: number;
  featureSpec: FeatureSpec;
  hyperparameters: ModelHyperparameters;
  evaluation: EvaluationReport | null;
  trainingDataSize: number;
  /** Present iff `modelKind === 'fallback'`. */
  fallbackReason?: string;
}

/** A single feature's additive contribution to a linear prediction. */
export interface Contribution {
  feature: string;
  /** βᵢ · xᵢ (in the model's linear-predictor space). */
  contribution: number;
  /** The (anonymized) input value xᵢ. */
  value: number;
}

/** The honesty-tagged payload returned by the service (embedded in `prediction`). */
export interface TrainedPrediction {
  prediction: unknown;
  featureContributions: Contribution[];
  confidence: number;
  modelKind: ModelKind;
  version: string;
  accuracy: number | null;
  explanation: string;
  fallbackReason: string | null;
}

/** Result of a training run — either a real model, or an honest skip. */
export type TrainingOutcome =
  | { status: 'trained'; version: string; evaluation: EvaluationReport }
  | { status: 'skipped'; reason: SkipReason };

/** Compact, admin-facing view of a stored model version. */
export interface ModelSummary {
  id: string;
  type: ModelType;
  version: string;
  modelKind: ModelKind;
  accuracy: number | null;
  isActive: boolean;
  trainingDataSize: number | null;
  lastTrained: string;
}

/** A minimal linear fit in the *original* feature space. */
export interface FittedLinear {
  coefficients: number[];
  intercept: number;
}

// ── Optimization (heuristic scheduler) ──────────────────────────────────────

/** A court booking to be assigned (no identities, only scheduling fields). */
export interface SchedulingBooking {
  id: string;
  startTime: string | Date;
  endTime: string | Date;
  playerCount?: number;
  totalPrice?: number;
}

/** A court available for assignment. */
export interface SchedulingCourt {
  id: string;
  maxPlayers: number;
}

/** One row of a deterministic greedy assignment. */
export interface CourtAssignment {
  bookingId: string;
  /** 0-based court index (frontend renders `assignedCourt + 1`); -1 if unassignable. */
  assignedCourt: number;
  courtId: string | null;
  startTime: string;
  endTime: string;
}

/** Result of the deterministic greedy court scheduler. */
export interface CourtAssignmentResult {
  optimalSchedule: CourtAssignment[];
  totalCost: number;
}
