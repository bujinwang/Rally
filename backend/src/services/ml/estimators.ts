/**
 * Story 6.6 — Estimators (T02).
 *
 * Real, measured models in plain TypeScript (design §1 D1). No fabricated
 * constants, no `Math.random()` in any decision path:
 *
 *  - `RidgeRegressor`    — L2 linear regression via the closed-form normal
 *                          equations `(XᵀX + αI)β = Xᵀy`, solved with the
 *                          numerically-stable `solve()` above.
 *  - `LogisticRegressor` — binary logistic regression by full-batch gradient
 *                          descent with an L2 penalty and early stopping.
 *  - `seasonalDecompose` — additive decomposition: OLS linear trend + a
 *                          month-of-year mean seasonal index. Honest wording
 *                          ("linear trend + seasonal index"), never "ARIMA".
 *  - `greedyCourtAssignment` — deterministic greedy scheduler (replaces the
 *                          previous `Math.random()` court assignment).
 */

import {
  applyStandardization,
  identity,
  matmul,
  matvec,
  sigmoid,
  solve,
  standardize,
  transpose,
} from './linearAlgebra';
import {
  CourtAssignment,
  CourtAssignmentResult,
  FittedLinear,
  SchedulingBooking,
  SchedulingCourt,
} from './types';

/** One month bucket for seasonal decomposition. */
export interface MonthlyBucket {
  /** 1–12 (month of year). */
  month: number;
  /** Session count for that bucket (regression target). */
  count: number;
  /** Monotonic index (e.g. months since epoch) used as the trend regressor. */
  index: number;
}

/** A fitted additive time-series decomposition. */
export interface SeasonalFit {
  slope: number;
  intercept: number;
  /** 12 elements, index 0 = January; mean-centred by construction. */
  seasonalIndex: number[];
  /** Forecast the raw count for a given month-of-year at a trend index. */
  forecast(month: number, index: number): number;
}

/**
 * L2 (ridge) linear regressor fitted by normal equations.
 *
 * Features are standardized internally so a single `alpha` is meaningful across
 * columns with wildly different scales (e.g. `sessionsAttended` vs a one-hot).
 * Coefficients are converted back to the **original** feature space so the
 * artifact is directly explainable (`intercept + Σ βᵢ·xᵢ`).
 */
export class RidgeRegressor {
  private mean: number[] = [];
  private std: number[] = [];
  private betaStd: number[] = [];
  private interceptStd = 0;
  private fitted = false;
  private readonly alpha: number;

  /**
   * @param alpha L2 penalty. Must be > 0 for numerical stability (a tiny ridge
   *   is always applied even when a caller passes 0).
   */
  constructor(alpha = 1.0) {
    this.alpha = alpha > 0 ? alpha : 1e-8;
  }

  /**
   * Fit the model to `X` (rows × features) and `y` (targets).
   *
   * @param alpha Optional L2 penalty override (matches the design's
   *   `fit(X, y, alpha)` signature); defaults to the constructor value.
   * @returns The fit in the original feature space (`coefficients`, `intercept`).
   * @throws RangeError when `X` and `y` disagree in length, or either is empty.
   */
  fit(X: number[][], y: number[], alpha?: number): FittedLinear {
    if (X.length === 0) {
      throw new RangeError('RidgeRegressor.fit: empty design matrix');
    }
    if (X.length !== y.length) {
      throw new RangeError(
        `RidgeRegressor.fit: X has ${X.length} rows but y has ${y.length}`
      );
    }
    const penalty = alpha !== undefined && alpha > 0 ? alpha : this.alpha;
    const { Z, mean, std } = standardize(X);
    this.mean = mean;
    this.std = std;

    const Zt = transpose(Z);
    const ZtZ = matmul(Zt, Z); // p × p

    // (ZᵀZ + αI)
    const A = ZtZ.map((row, i) => row.map((v, j) => (i === j ? v + penalty : v)));
    // Xᵀy  ==  Zᵀy  because Z is only mean-shifted (column sums are 0 … except
    // the intercept handling below; we fit an explicit intercept instead).
    const Zty = matvec(Zt, y);

    this.betaStd = solve(A, Zty);
    // Explicit intercept in the standardized space.
    const yMean = y.reduce((a, b) => a + b, 0) / y.length;
    this.interceptStd = yMean; // Z-columns are mean 0 ⇒ intercept = mean(y)
    this.fitted = true;
    return this.toLinear();
  }

  /** Predict a single (original-space) feature row. */
  predict(x: number[]): number {
    this.assertFitted();
    const z = applyStandardization(x, this.mean, this.std);
    let s = this.interceptStd;
    for (let j = 0; j < z.length; j += 1) s += this.betaStd[j] * z[j];
    return s;
  }

  /**
   * Return the fit expressed in the **original** feature space:
   * `coefficients[j] = betaStd[j] / std[j]`,
   * `intercept = interceptStd − Σ coefficients[j]·mean[j]`.
   */
  toLinear(): FittedLinear {
    this.assertFitted();
    const p = this.betaStd.length;
    const coefficients = new Array<number>(p).fill(0);
    let intercept = this.interceptStd;
    for (let j = 0; j < p; j += 1) {
      const c = this.betaStd[j] / (this.std[j] === 0 ? 1 : this.std[j]);
      coefficients[j] = c;
      intercept -= c * this.mean[j];
    }
    return { coefficients, intercept };
  }

  /** Feature means used for standardization (provenance). */
  featureMean(): number[] {
    return this.mean.slice();
  }

  /** Feature stds used for standardization (provenance). */
  featureStd(): number[] {
    return this.std.slice();
  }

  private assertFitted(): void {
    if (!this.fitted) {
      throw new Error('RidgeRegressor: predict() called before fit()');
    }
  }
}

/** Options for `LogisticRegressor.fit`. */
export interface LogisticOptions {
  epochs: number;
  /** Learning rate for full-batch gradient descent. */
  lr: number;
  /** L2 penalty coefficient (excludes the intercept). */
  l2: number;
  /** Optional patience (epochs without improvement before early stop). */
  patience?: number;
  /** Optional seed-friendly deterministic validation split (0 disables). */
  validationFraction?: number;
}

/**
 * Binary logistic regressor trained by full-batch gradient descent.
 *
 * A linear model, so its coefficients are directly usable for explainability
 * (AC 12). Deterministic: no randomness in training (the caller controls any
 * split), so identical inputs give identical coefficients.
 */
export class LogisticRegressor {
  private mean: number[] = [];
  private std: number[] = [];
  private weights: number[] = []; // standardized-space weights
  private bias = 0;
  private fitted = false;

  /**
   * Fit to `X` (rows × features, 0/1 labels in `y`).
   *
   * @throws RangeError on empty input or a `y` that is not 0/1.
   */
  fit(X: number[][], y: number[], opts: LogisticOptions): void {
    if (X.length === 0) {
      throw new RangeError('LogisticRegressor.fit: empty design matrix');
    }
    if (X.length !== y.length) {
      throw new RangeError(
        `LogisticRegressor.fit: X has ${X.length} rows but y has ${y.length}`
      );
    }
    for (const label of y) {
      if (label !== 0 && label !== 1) {
        throw new RangeError(`LogisticRegressor.fit: label ${label} is not 0/1`);
      }
    }

    const { Z, mean, std } = standardize(X);
    this.mean = mean;
    this.std = std;
    const n = Z.length;
    const p = Z[0].length;

    this.weights = new Array<number>(p).fill(0);
    this.bias = 0;

    const epochs = Math.max(1, Math.floor(opts.epochs));
    const lr = opts.lr > 0 ? opts.lr : 0.1;
    const l2 = opts.l2 >= 0 ? opts.l2 : 0;
    const patience = opts.patience && opts.patience > 0 ? opts.patience : epochs;

    // Deterministic validation split (tail fraction) for early stopping. With
    // `validationFraction = 0` the full set is used for both, so training stays
    // deterministic and identical for identical inputs.
    const vf = opts.validationFraction && opts.validationFraction > 0 ? opts.validationFraction : 0;
    const valStart = vf > 0 ? Math.max(1, Math.floor(n * (1 - vf))) : n;

    let bestLoss = Number.POSITIVE_INFINITY;
    let bestWeights = this.weights.slice();
    let bestBias = this.bias;
    let stale = 0;

    for (let epoch = 0; epoch < epochs; epoch += 1) {
      const gradW = new Array<number>(p).fill(0);
      let gradB = 0;

      for (let i = 0; i < valStart; i += 1) {
        const z = Z[i];
        let logit = this.bias;
        for (let j = 0; j < p; j += 1) logit += this.weights[j] * z[j];
        const err = sigmoid(logit) - y[i];
        for (let j = 0; j < p; j += 1) gradW[j] += err * z[j];
        gradB += err;
      }

      const inv = 1 / Math.max(1, valStart);
      for (let j = 0; j < p; j += 1) {
        this.weights[j] -= lr * (gradW[j] * inv + l2 * this.weights[j]);
      }
      this.bias -= lr * gradB * inv;

      if (vf > 0) {
        const loss = this.logLoss(Z.slice(valStart), y.slice(valStart));
        if (loss < bestLoss - 1e-9) {
          bestLoss = loss;
          bestWeights = this.weights.slice();
          bestBias = this.bias;
          stale = 0;
        } else {
          stale += 1;
          if (stale >= patience) break;
        }
      }
    }

    if (vf > 0) {
      this.weights = bestWeights;
      this.bias = bestBias;
    }
    this.fitted = true;
  }

  /** Probability that the row belongs to class 1. */
  predictProba(x: number[]): number {
    this.assertFitted();
    const z = applyStandardization(x, this.mean, this.std);
    let logit = this.bias;
    for (let j = 0; j < z.length; j += 1) logit += this.weights[j] * z[j];
    return sigmoid(logit);
  }

  /**
   * Return the fit in the **original** feature space so predictions are
   * `sigmoid(intercept + Σ βᵢ·xᵢ)`.
   */
  toLinear(): FittedLinear {
    this.assertFitted();
    const p = this.weights.length;
    const coefficients = new Array<number>(p).fill(0);
    let intercept = this.bias;
    for (let j = 0; j < p; j += 1) {
      const c = this.weights[j] / (this.std[j] === 0 ? 1 : this.std[j]);
      coefficients[j] = c;
      intercept -= c * this.mean[j];
    }
    return { coefficients, intercept };
  }

  private logLoss(Z: number[][], y: number[]): number {
    if (Z.length === 0) return Number.POSITIVE_INFINITY;
    const eps = 1e-12;
    let loss = 0;
    for (let i = 0; i < Z.length; i += 1) {
      let logit = this.bias;
      for (let j = 0; j < this.weights.length; j += 1) logit += this.weights[j] * Z[i][j];
      const prob = Math.min(1 - eps, Math.max(eps, sigmoid(logit)));
      loss += -(y[i] * Math.log(prob) + (1 - y[i]) * Math.log(1 - prob));
    }
    return loss / Z.length;
  }

  private assertFitted(): void {
    if (!this.fitted) {
      throw new Error('LogisticRegressor: predictProba() called before fit()');
    }
  }
}

/**
 * Additive seasonal decomposition: OLS linear trend + month-of-year index.
 *
 * This is *honest* time-series modelling ("linear trend + seasonal index"),
 * replacing the previous flat 2 %/month ramp mislabelled as "ARIMA".
 *
 * @param buckets Monthly buckets (each `{ month, count, index }`).
 * @throws RangeError when `buckets` is empty.
 */
export function seasonalDecompose(buckets: MonthlyBucket[]): SeasonalFit {
  if (buckets.length === 0) {
    throw new RangeError('seasonalDecompose: no monthly buckets supplied');
  }

  const n = buckets.length;
  let sumI = 0;
  let sumC = 0;
  let sumII = 0;
  let sumIC = 0;
  for (const b of buckets) {
    sumI += b.index;
    sumC += b.count;
    sumII += b.index * b.index;
    sumIC += b.index * b.count;
  }
  const denom = n * sumII - sumI * sumI;
  const slope = denom === 0 ? 0 : (n * sumIC - sumI * sumC) / denom;
  const intercept = (sumC - slope * sumI) / n;

  // Season (month 1–12) sees: sum over buckets of (count − trend). Accumulate
  // per-month totals/counts so empty months contribute nothing (they are not
  // invented from 0).
  const monthTotal = new Array<number>(12).fill(0);
  const monthCount = new Array<number>(12).fill(0);
  for (const b of buckets) {
    const m = ((b.month - 1) % 12 + 12) % 12;
    const detrended = b.count - (intercept + slope * b.index);
    monthTotal[m] += detrended;
    monthCount[m] += 1;
  }
  const rawIndex = new Array<number>(12).fill(0);
  for (let m = 0; m < 12; m += 1) {
    rawIndex[m] = monthCount[m] > 0 ? monthTotal[m] / monthCount[m] : 0;
  }
  // Re-centre the seasonal index to mean 0 so it is a pure additive seasonality.
  const idxMean = rawIndex.reduce((a, b) => a + b, 0) / 12;
  const seasonalIndex = rawIndex.map((v) => v - idxMean);

  const fit: SeasonalFit = {
    slope,
    intercept,
    seasonalIndex,
    forecast(month: number, index: number): number {
      const m = ((month - 1) % 12 + 12) % 12;
      return fit.intercept + fit.slope * index + fit.seasonalIndex[m];
    },
  };
  return fit;
}

/** A booking augmented with the half-open time interval used for overlap tests. */
interface Interval {
  booking: SchedulingBooking;
  start: number;
  end: number;
}

/** Parse a `Date | string` to epoch ms. */
function toEpoch(value: string | Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/**
 * Deterministic greedy court assignment.
 *
 * Bookings are sorted by `(startTime, endTime, id)` — a total order, so the
 * result is identical across runs. Each booking is assigned to the lowest-index
 * court (a) that is large enough for `playerCount` and (b) has no overlapping
 * assignment. No randomness anywhere: the old implementation picked courts with
 * `Math.floor(Math.random() * n)`, which this replaces (design §12).
 *
 * @param bookings Bookings to schedule.
 * @param courts Available courts.
 * @returns The assignment (one row per booking) plus the summed price.
 */
export function greedyCourtAssignment(
  bookings: SchedulingBooking[],
  courts: SchedulingCourt[]
): CourtAssignmentResult {
  const sorted: Interval[] = bookings
    .map((booking) => ({
      booking,
      start: toEpoch(booking.startTime),
      end: toEpoch(booking.endTime),
    }))
    .sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      if (a.end !== b.end) return a.end - b.end;
      return a.booking.id.localeCompare(b.booking.id);
    });

  // Per-court occupied intervals (kept sorted by start for clarity; the arrays
  // are tiny so a linear scan is fine and fully deterministic).
  const occupied: number[][][] = courts.map(() => []);

  const optimalSchedule: CourtAssignment[] = [];
  let totalCost = 0;

  for (const item of sorted) {
    const need = item.booking.playerCount ?? 0;
    let assigned = -1;

    for (let c = 0; c < courts.length; c += 1) {
      if (courts[c].maxPlayers < need) continue;
      const overlaps = occupied[c].some(([s, e]) => item.start < e && s < item.end);
      if (!overlaps) {
        assigned = c;
        break;
      }
    }

    if (assigned >= 0) {
      occupied[assigned].push([item.start, item.end]);
    }

    totalCost += item.booking.totalPrice ?? 0;
    optimalSchedule.push({
      bookingId: item.booking.id,
      assignedCourt: assigned,
      courtId: assigned >= 0 ? courts[assigned].id : null,
      startTime: new Date(item.start).toISOString(),
      endTime: new Date(item.end).toISOString(),
    });
  }

  return { optimalSchedule, totalCost };
}
