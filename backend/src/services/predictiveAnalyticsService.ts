/**
 * Story 6.6 — Predictive Analytics Service (T03 rewrite).
 *
 * **Why this file was rewritten.** The previous version fabricated four
 * `accuracy` constants (0.78/0.72/0.80/0.85) and its four "models" ignored their
 * inputs (`mockLogisticRegression` returned a literal `0.5`;
 * `mockLinearProgramming` assigned courts with `Math.random()`), while its
 * `explanation` strings claimed methods ("ARIMA", "linear programming") that
 * were never implemented. This story removes that dishonesty.
 *
 * **What it does now.** Every method serves from the *active model artifact*
 * loaded by `PredictionModelRegistry`, or — when the data is below the per-type
 * gate — a **labelled fallback** whose `accuracy` is `null` and whose
 * `fallbackReason` explains why. `modelKind` (`measured` | `fallback` |
 * `heuristic`) is embedded in every `prediction`, together with
 * `featureContributions`, and the `explanation` strings state the *actual*
 * method used. A number is never surfaced for a non-measured model.
 *
 * The four public method names and their return shape (a `PredictionResult`
 * row) are preserved — the frontend depends on them.
 */

import { prisma } from '../config/database';
import { digest } from './cache/cacheKeys';
import { PredictionModelRegistry, modelRegistry } from './ml/modelRegistry';
import { TrainingPipeline, trainingPipeline } from './ml/trainingPipeline';
import {
  CHURN_FEATURE_NAMES,
  DEMAND_FEATURE_NAMES,
  buildChurnRowForPlayer,
  makeDemandFeatureRow,
} from './ml/features';
import { greedyCourtAssignment } from './ml/estimators';
import {
  CHURN_WINDOW_DAYS,
  Contribution,
  ModelArtifact,
  ModelKind,
  SEASONAL_FORECAST_HORIZON,
  TrainingOutcome,
} from './ml/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const SEASONAL_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Nominal confidence carried by a non-measured (fallback/heuristic) result. */
const FALLBACK_CONFIDENCE = 0.5;

/** Churn probability threshold above which we surface retention advice. */
const CHURN_ADVICE_THRESHOLD = 0.5;

/** Deterministic retention recommendations (content only, no PII). */
const CHURN_RECOMMENDATIONS = [
  'Send a re-engagement nudge to recent participants',
  'Offer a discount on the next session',
  'Suggest a recurring weekly slot',
];

/** One forecast point (matches the shape the dashboard renders). */
interface DemandForecastPoint {
  date: string;
  predictedSessions: number;
  confidence: number;
}

/** Inputs needed to build demand features at serving time. */
interface DemandServingContext {
  capacity: number;
  rolling4w: number;
  locationKey: number;
  hasHistory: boolean;
}

/** The honesty-tagged payload embedded in `PredictionResult.prediction`. */
interface PredictionPayload {
  [key: string]: unknown;
  modelKind: ModelKind;
  accuracy: number | null;
  featureContributions: Contribution[];
  fallbackReason: string | null;
}

/**
 * Service façade for the four prediction families.
 *
 * Stateless: it delegates persistence to `PredictionModelRegistry` and training
 * to `TrainingPipeline`, both of which are injectable for testing.
 */
export class PredictiveAnalyticsService {
  private static registry: PredictionModelRegistry = modelRegistry;
  private static pipeline: TrainingPipeline = trainingPipeline;

  /** Test seam: swap the registry (avoids cross-test singleton state). */
  static __setRegistry(registry: PredictionModelRegistry): void {
    PredictiveAnalyticsService.registry = registry;
  }

  /** Test seam: swap the training pipeline. */
  static __setPipeline(pipeline: TrainingPipeline): void {
    PredictiveAnalyticsService.pipeline = pipeline;
  }

  // ── Demand ────────────────────────────────────────────────────────────────

  /**
   * Forecast session demand for a location.
   *
   * Serves a measured ridge-regression model when one is active and adequate;
   * otherwise returns a deterministic recent-average fallback (never a
   * fabricated number).
   *
   * @param location Venue location filter.
   * @param days Forecast horizon in days (default 7).
   * @returns The persisted `PredictionResult` row.
   */
  static async forecastSessionDemand(location: string, days: number = 7): Promise<any> {
    const horizon = Number.isFinite(days) && days > 0 ? Math.floor(days) : 7;
    const artifact = await PredictiveAnalyticsService.registry.getActive('demand');
    const context = await PredictiveAnalyticsService.demandContext(location);

    if (artifact && artifact.modelKind === 'measured') {
      return PredictiveAnalyticsService.serveMeasuredDemand(location, horizon, artifact, context);
    }

    const reason = artifact?.fallbackReason ?? 'insufficient-samples';
    const fallback = await PredictiveAnalyticsService.registry.ensureFallback('demand', reason);
    void fallback;
    return PredictiveAnalyticsService.serveFallbackDemand(location, horizon, context, reason);
  }

  /** Serving path for an active **measured** demand model (AC 11). */
  private static async serveMeasuredDemand(
    location: string,
    horizon: number,
    artifact: ModelArtifact,
    context: DemandServingContext
  ): Promise<any> {
    const startOfToday = PredictiveAnalyticsService.startOfUtcDay(new Date());
    const forecast: DemandForecastPoint[] = [];
    let firstContributions: Contribution[] = [];
    let firstRaw = 0;

    for (let i = 0; i < horizon; i += 1) {
      const date = new Date(startOfToday + i * DAY_MS);
      const row = makeDemandFeatureRow(date, context.capacity, context.rolling4w, context.locationKey);
      const x = DEMAND_FEATURE_NAMES.map((name) => row[name]);
      const { value, contributions } = PredictiveAnalyticsService.linearPredict(artifact, x);
      if (i === 0) {
        firstContributions = contributions;
        firstRaw = value;
      }
      forecast.push({
        date: date.toISOString().split('T')[0],
        predictedSessions: Math.max(0, Math.round(value)),
        confidence: PredictiveAnalyticsService.measuredConfidence(artifact),
      });
    }

    const payload: PredictionPayload = {
      forecast,
      modelKind: 'measured',
      accuracy: artifact.evaluation ? artifact.evaluation.value : null,
      featureContributions: firstContributions,
      intercept: artifact.intercept,
      linearPredictor: Number(firstRaw.toFixed(6)),
      fallbackReason: null,
    };
    const explanation =
      'Ridge (L2) linear regression on day-of-week, month, weekend flag, ' +
      'venue capacity and a rolling 4-week session count; coefficients are ' +
      'loaded from the active measured model (no training at serve time).';

    return PredictiveAnalyticsService.persistResult({
      modelId: artifact.id,
      inputData: {
        locationKey: PredictiveAnalyticsService.anonymizeLocation(location),
        days: horizon,
        modelVersion: artifact.version,
      },
      prediction: payload,
      confidence: PredictiveAnalyticsService.measuredConfidence(artifact),
      explanation,
    });
  }

  /** Serving path for a labelled **fallback** demand forecast. */
  private static async serveFallbackDemand(
    location: string,
    horizon: number,
    context: DemandServingContext,
    reason: string
  ): Promise<any> {
    // Deterministic heuristic: the recent (trailing 28-day) average daily count.
    const baseline = context.hasHistory ? context.rolling4w / 28 : 0;
    const startOfToday = PredictiveAnalyticsService.startOfUtcDay(new Date());
    const forecast: DemandForecastPoint[] = [];
    for (let i = 0; i < horizon; i += 1) {
      const date = new Date(startOfToday + i * DAY_MS);
      forecast.push({
        date: date.toISOString().split('T')[0],
        predictedSessions: Math.max(0, Math.round(baseline * 10) / 10),
        confidence: FALLBACK_CONFIDENCE,
      });
    }

    const model = await PredictiveAnalyticsService.registry.ensureFallback('demand', reason);
    const payload: PredictionPayload = {
      forecast,
      modelKind: 'fallback',
      accuracy: null,
      featureContributions: [],
      fallbackReason: reason,
    };
    const explanation =
      'Fallback (no measured demand model): a deterministic trailing 28-day ' +
      `average daily session count. Reason: ${reason}. No accuracy is reported ` +
      'because no model was evaluated on this data.';

    return PredictiveAnalyticsService.persistResult({
      modelId: model.id,
      inputData: {
        locationKey: PredictiveAnalyticsService.anonymizeLocation(location),
        days: horizon,
        modelVersion: model.version,
      },
      prediction: payload,
      confidence: FALLBACK_CONFIDENCE,
      explanation,
    });
  }

  // ── Churn ─────────────────────────────────────────────────────────────────

  /**
   * Predict churn for a player participation id.
   *
   * The id locates a participation row, but identity — and therefore the whole
   * history — is `COALESCE(userId, deviceId)` (design §12). With insufficient
   * history the result is a labelled fallback.
   *
   * @param playerId An `MvpPlayer` id (participation id).
   * @returns The persisted `PredictionResult` row.
   * @throws Error when the player does not exist (preserved contract).
   */
  static async predictChurn(playerId: string): Promise<any> {
    const player = await prisma.mvpPlayer.findUnique({
      where: { id: playerId },
      select: { id: true },
    });
    if (!player) {
      throw new Error('Player not found');
    }

    const artifact = await PredictiveAnalyticsService.registry.getActive('churn');
    const row = await buildChurnRowForPlayer(playerId);

    if (row && artifact && artifact.modelKind === 'measured') {
      const x = CHURN_FEATURE_NAMES.map((name) => row[name]);
      const { value, contributions } = PredictiveAnalyticsService.linearPredict(artifact, x);
      const churnProbability = 1 / (1 + Math.exp(-value));
      return PredictiveAnalyticsService.persistChurn({
        modelId: artifact.id,
        playerId,
        churnProbability,
        featureContributions: contributions,
        confidence: PredictiveAnalyticsService.measuredConfidence(artifact),
        accuracy: artifact.evaluation ? artifact.evaluation.value : null,
        modelKind: 'measured',
        version: artifact.version,
        fallbackReason: null,
        explanation:
          'Logistic regression (full-batch gradient descent, L2 penalty) on ' +
          'recency and participation-history features, loaded from the active ' +
          'measured model.',
      });
    }

    const reason = artifact?.fallbackReason ?? (row ? 'insufficient-samples' : 'no-dataset');
    const fallback = await PredictiveAnalyticsService.registry.ensureFallback('churn', reason);

    // Deterministic fallback: recency relative to the 60-day churn window.
    const daysInactive = row ? row.daysSinceLastParticipation : 0;
    const churnProbability = PredictiveAnalyticsService.clamp01(daysInactive / (CHURN_WINDOW_DAYS * 2));

    return PredictiveAnalyticsService.persistChurn({
      modelId: fallback.id,
      playerId,
      churnProbability,
      featureContributions: [],
      confidence: FALLBACK_CONFIDENCE,
      accuracy: null,
      modelKind: 'fallback',
      version: fallback.version,
      fallbackReason: reason,
      explanation:
        'Fallback (no measured churn model): a deterministic recency ratio ' +
        `(days since last participation ÷ ${CHURN_WINDOW_DAYS * 2}). Reason: ${reason}. ` +
        'No accuracy is reported because no model was evaluated on this data.',
    });
  }

  /** Persist and return a churn prediction result. */
  private static async persistChurn(args: {
    modelId?: string;
    playerId: string;
    churnProbability: number;
    featureContributions: Contribution[];
    confidence: number;
    accuracy: number | null;
    modelKind: ModelKind;
    version: string;
    fallbackReason: string | null;
    explanation: string;
  }): Promise<any> {
    const recommendations =
      args.churnProbability > CHURN_ADVICE_THRESHOLD ? [...CHURN_RECOMMENDATIONS] : [];

    const payload: PredictionPayload = {
      churnProbability: Number(args.churnProbability.toFixed(6)),
      recommendations,
      modelKind: args.modelKind,
      accuracy: args.accuracy,
      featureContributions: args.featureContributions,
      modelVersion: args.version,
      fallbackReason: args.fallbackReason,
    };

    return PredictiveAnalyticsService.persistResult({
      modelId: args.modelId,
      inputData: {
        // Identity is hashed (design §1 D2 — no PII in stored inputs).
        playerRef: digest(args.playerId),
        churnProbability: payload.churnProbability,
      },
      prediction: payload,
      confidence: args.confidence,
      explanation: args.explanation,
    });
  }

  // ── Seasonal ──────────────────────────────────────────────────────────────

  /**
   * Analyse seasonal session trends and forecast the next 12 months.
   *
   * Uses additive decomposition (linear trend + month-of-year index) when a
   * measured model is active; otherwise a labelled flat-average fallback.
   *
   * @returns The persisted `PredictionResult` row.
   */
  static async analyzeSeasonalTrends(): Promise<any> {
    const artifact = await PredictiveAnalyticsService.registry.getActive('seasonal');
    const monthly = await PredictiveAnalyticsService.readMonthlyCounts();

    if (artifact && artifact.modelKind === 'measured') {
      return PredictiveAnalyticsService.serveMeasuredSeasonal(artifact, monthly.counts);
    }

    const reason = artifact?.fallbackReason ?? 'insufficient-samples';
    const fallback = await PredictiveAnalyticsService.registry.ensureFallback('seasonal', reason);
    return PredictiveAnalyticsService.serveFallbackSeasonal(fallback, monthly.counts, reason);
  }

  /** Serving path for an active **measured** seasonal model. */
  private static async serveMeasuredSeasonal(
    artifact: ModelArtifact,
    counts: number[]
  ): Promise<any> {
    const slope = typeof artifact.hyperparameters.slope === 'number' ? artifact.hyperparameters.slope : 0;
    const seasonalIndex = Array.isArray(artifact.hyperparameters.seasonalIndex)
      ? (artifact.hyperparameters.seasonalIndex as number[])
      : new Array<number>(12).fill(0);

    const last = await PredictiveAnalyticsService.lastBucketIndex();
    const now = new Date();
    const forecast: number[] = [];
    for (let h = 0; h < SEASONAL_FORECAST_HORIZON; h += 1) {
      const month = ((now.getUTCMonth() + h) % 12) + 1;
      const index = last + h + 1;
      const value = artifact.intercept + slope * index + (seasonalIndex[month - 1] ?? 0);
      forecast.push(Math.max(0, Math.round(value * 10) / 10));
    }

    const mean = countMean(counts);
    const growthRate = mean > 0 ? Number(((slope * 12) / mean).toFixed(6)) : 0;

    const payload: PredictionPayload = {
      forecast,
      insights: {
        peakMonths: topMonths(seasonalIndex, 3, 'desc'),
        lowMonths: topMonths(seasonalIndex, 2, 'asc'),
        growthRate,
        historicalMonthly: counts,
      },
      modelKind: 'measured',
      accuracy: artifact.evaluation ? artifact.evaluation.value : null,
      featureContributions: PredictiveAnalyticsService.seasonalContributions(seasonalIndex, slope, last + 1),
      fallbackReason: null,
    };
    const explanation =
      'Additive time-series decomposition: an OLS linear trend plus a ' +
      'month-of-year mean seasonal index, loaded from the active measured model.';

    return PredictiveAnalyticsService.persistResult({
      modelId: artifact.id,
      inputData: { historicalMonths: counts.length, modelVersion: artifact.version },
      prediction: payload,
      confidence: PredictiveAnalyticsService.measuredConfidence(artifact),
      explanation,
    });
  }

  /** Serving path for a labelled **fallback** seasonal analysis. */
  private static async serveFallbackSeasonal(
    artifact: ModelArtifact,
    counts: number[],
    reason: string
  ): Promise<any> {
    const mean = countMean(counts);
    const forecast = new Array<number>(SEASONAL_FORECAST_HORIZON)
      .fill(0)
      .map(() => Math.max(0, Math.round(mean * 10) / 10));

    const payload: PredictionPayload = {
      forecast,
      insights: {
        peakMonths: [],
        lowMonths: [],
        growthRate: 0,
        historicalMonthly: counts,
      },
      modelKind: 'fallback',
      accuracy: null,
      featureContributions: [],
      fallbackReason: reason,
    };
    const explanation =
      'Fallback (no measured seasonal model): a flat projection of the ' +
      `historical monthly mean. Reason: ${reason}. No accuracy is reported ` +
      'because no model was evaluated on this data.';

    return PredictiveAnalyticsService.persistResult({
      modelId: artifact.id,
      inputData: { historicalMonths: counts.length, modelVersion: artifact.version },
      prediction: payload,
      confidence: FALLBACK_CONFIDENCE,
      explanation,
    });
  }

  // ── Optimization (heuristic) ──────────────────────────────────────────────

  /**
   * Deterministically assign bookings to courts for a venue/date.
   *
   * This is an explicitly-labelled **heuristic** (`modelKind: 'heuristic'`,
   * `accuracy: null`) — never a learned model and never "linear programming".
   *
   * @param venueId Venue to optimise.
   * @param date Target date (`YYYY-MM-DD`).
   * @returns The persisted `PredictionResult` row.
   */
  static async optimizeResourceAllocation(venueId: string, date: string): Promise<any> {
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);

    const courts = await prisma.court.findMany({
      where: { venueId, status: 'AVAILABLE' },
      select: { id: true, maxPlayers: true },
      orderBy: { id: 'asc' },
    });

    const bookings = await prisma.courtBooking.findMany({
      where: { startTime: { gte: dayStart, lt: dayEnd } },
      select: { id: true, startTime: true, endTime: true, playerCount: true, totalPrice: true },
      orderBy: { startTime: 'asc' },
    });

    // Deterministic greedy assignment — no `Math.random()` anywhere.
    const assignment = greedyCourtAssignment(
      bookings.map((b) => ({
        id: b.id,
        startTime: b.startTime,
        endTime: b.endTime,
        playerCount: b.playerCount,
        totalPrice: b.totalPrice,
      })),
      courts.map((c) => ({ id: c.id, maxPlayers: c.maxPlayers }))
    );

    // Shape expected by the dashboard: `id`, 0-based `assignedCourt`, times.
    const optimalSchedule = assignment.optimalSchedule.map((row) => ({
      id: row.bookingId,
      assignedCourt: row.assignedCourt,
      courtId: row.courtId,
      startTime: row.startTime,
      endTime: row.endTime,
    }));

    const model = await PredictiveAnalyticsService.registry.ensureFallback(
      'optimization',
      'heuristic-scheduler'
    );

    const unassigned = optimalSchedule.filter((s) => s.assignedCourt < 0).length;
    const payload: PredictionPayload = {
      optimalSchedule,
      totalCost: Number(assignment.totalCost.toFixed(2)),
      unassignedBookings: unassigned,
      subKind: 'heuristic-scheduler',
      modelKind: 'heuristic',
      accuracy: null,
      featureContributions: [],
      fallbackReason: null,
    };
    const explanation =
      'Deterministic greedy court assignment: bookings sorted by start time are ' +
      'placed on the earliest compatible free court. This is a scheduling ' +
      'heuristic, so no accuracy is reported.';

    return PredictiveAnalyticsService.persistResult({
      modelId: model.id,
      inputData: { venueRef: digest(venueId), date, courts: courts.length, bookings: bookings.length },
      prediction: payload,
      confidence: FALLBACK_CONFIDENCE,
      explanation,
    });
  }

  // ── Training delegation (used by routes / scheduler in T04) ───────────────

  /**
   * Trigger a training run for a type (delegates to `TrainingPipeline`).
   *
   * @param type Model family.
   * @param opts `force` retrains even if a model exists.
   */
  static async train(
    type: 'demand' | 'churn' | 'seasonal',
    opts: { force?: boolean } = {}
  ): Promise<TrainingOutcome> {
    return PredictiveAnalyticsService.pipeline.run(type, opts);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** `intercept + Σ βᵢ·xᵢ` plus per-feature additive contributions. */
  private static linearPredict(
    artifact: ModelArtifact,
    x: number[]
  ): { value: number; contributions: Contribution[] } {
    let value = artifact.intercept;
    const contributions: Contribution[] = [];
    for (let j = 0; j < x.length; j += 1) {
      const weight = artifact.coefficients[j] ?? 0;
      const contribution = weight * x[j];
      value += contribution;
      contributions.push({
        feature: artifact.featureSpec.names[j] ?? `f${j}`,
        contribution,
        value: x[j],
      });
    }
    return { value, contributions };
  }

  /** Contribution view for the seasonal model's first forecast point. */
  private static seasonalContributions(
    seasonalIndex: number[],
    slope: number,
    trendIndex: number
  ): Contribution[] {
    const month = ((new Date().getUTCMonth() % 12) + 1);
    const angle = ((month - 1) / 12) * 2 * Math.PI;
    const si = seasonalIndex[month - 1] ?? 0;
    return [
      { feature: 'trendIndex', contribution: slope * trendIndex, value: trendIndex },
      { feature: 'monthSin', contribution: si * Math.sin(angle), value: Math.sin(angle) },
      { feature: 'monthCos', contribution: si * Math.cos(angle), value: Math.cos(angle) },
    ];
  }

  /** Confidence for a measured artifact: its own held-out score (0–1). */
  private static measuredConfidence(artifact: ModelArtifact): number {
    if (artifact.evaluation && Number.isFinite(artifact.evaluation.value)) {
      return PredictiveAnalyticsService.clamp01(artifact.evaluation.value);
    }
    return FALLBACK_CONFIDENCE;
  }

  /** Persist a `PredictionResult` row, tolerating a missing model id. */
  private static async persistResult(args: {
    modelId?: string;
    inputData: Record<string, unknown>;
    prediction: PredictionPayload;
    confidence: number;
    explanation: string;
  }): Promise<any> {
    let modelId = args.modelId;
    if (!modelId) {
      // Defensive: a serving path must always have a model row to attach to.
      const fallback = await PredictiveAnalyticsService.registry.ensureFallback(
        'demand',
        'missing-model-row'
      );
      modelId = fallback.id;
    }
    if (!modelId) {
      throw new Error('PredictiveAnalyticsService: could not resolve a model row to persist against');
    }
    return prisma.predictionResult.create({
      data: {
        modelId,
        inputData: args.inputData as any,
        prediction: args.prediction as any,
        confidence: args.confidence,
        explanation: args.explanation,
      },
    });
  }

  /** Capacity / rolling-window / anonymized-location context for demand. */
  private static async demandContext(location: string): Promise<DemandServingContext> {
    const sessions = (await prisma.mvpSession.findMany({
      where: { location, status: 'COMPLETED' },
      select: { scheduledAt: true, maxPlayers: true },
      orderBy: { scheduledAt: 'desc' },
    })) as unknown as { scheduledAt: Date; maxPlayers: number }[];

    const locationKey = Number.parseInt(digest(location).slice(0, 8), 16) % 1000;
    if (sessions.length === 0) {
      return { capacity: 0, rolling4w: 0, locationKey, hasHistory: false };
    }

    let capacity = 0;
    for (const s of sessions) {
      if (s.maxPlayers > capacity) capacity = s.maxPlayers;
    }
    const newest = sessions[0].scheduledAt.getTime();
    const windowStart = newest - 28 * DAY_MS;
    const rolling4w = sessions.filter((s) => s.scheduledAt.getTime() > windowStart).length;

    return { capacity, rolling4w, locationKey, hasHistory: true };
  }

  /** Historical monthly completed-session counts (ascending by month). */
  private static async readMonthlyCounts(): Promise<{ counts: number[] }> {
    const sessions = (await prisma.mvpSession.findMany({
      where: { status: 'COMPLETED' },
      select: { scheduledAt: true },
      orderBy: { scheduledAt: 'asc' },
    })) as unknown as { scheduledAt: Date }[];

    const byMonth = new Map<string, number>();
    for (const s of sessions) {
      const key = s.scheduledAt.toISOString().slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
    }
    const counts = Array.from(byMonth.keys())
      .sort()
      .map((k) => byMonth.get(k) ?? 0);
    return { counts };
  }

  /** Highest month index (`year*12 + month-1`) among completed sessions. */
  private static async lastBucketIndex(): Promise<number> {
    const latest = await prisma.mvpSession.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { scheduledAt: 'desc' },
      select: { scheduledAt: true },
    });
    const ts = (latest as unknown as { scheduledAt: Date } | null)?.scheduledAt ?? new Date();
    return ts.getUTCFullYear() * 12 + ts.getUTCMonth();
  }

  /** Anonymize a location for storage (SHA-1). */
  private static anonymizeLocation(location: string): string {
    return digest(location ?? '');
  }

  /** UTC midnight of a date. */
  private static startOfUtcDay(date: Date): number {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }

  /** Clamp a number to `[0, 1]`. */
  private static clamp01(n: number): number {
    if (!Number.isFinite(n)) return 0;
    return Math.min(1, Math.max(0, n));
  }
}

/** Mean of a numeric array (`0` for an empty array). */
function countMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Indices (1-based month numbers) of the `n` strongest/weakest seasonal
 * indices, returned in month order for stable rendering.
 */
function topMonths(seasonalIndex: number[], n: number, direction: 'asc' | 'desc'): number[] {
  const indexed = seasonalIndex.map((value, i) => ({ month: i + 1, value }));
  indexed.sort((a, b) => (direction === 'desc' ? b.value - a.value : a.value - b.value));
  return indexed
    .slice(0, n)
    .map((m) => m.month)
    .sort((a, b) => a - b);
}

/** Human labels for the seasonal chart (re-exported for routes/tests). */
export const SEASONAL_MONTH_LABELS = SEASONAL_LABELS;
