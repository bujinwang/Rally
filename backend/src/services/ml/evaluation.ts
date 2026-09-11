/**
 * Story 6.6 — Evaluation (T02).
 *
 * Everything here is **seeded and reproducible** (design §1 D3). There is no
 * wall-clock input and no unseeded randomness, so the same rows + seed always
 * yield the same split and the same metrics — a requirement of AC 9's honesty
 * model (an "accuracy" that cannot be recomputed is not a measurement).
 */

import {
  DEFAULT_SPLIT_SEED,
  EvaluationProtocol,
  EvaluationReport,
} from './types';

/**
 * Deterministic PRNG (mulberry32). Fast, no dependencies, and — crucially —
 * reproducible: identical `seed` ⇒ identical stream.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A labelled row usable by a splitter; `order` is the temporal sort key. */
export interface SplittableRow {
  /** Regression target or classification label. */
  label: number;
  /** Sort key (epoch ms / bucket index). */
  order: number;
}

/** Result of a split: indices into the original array. */
export interface SplitResult {
  trainIndex: number[];
  testIndex: number[];
}

/**
 * Deterministic **stratified** split (by class label), preserving class ratios
 * in both partitions.
 *
 * @param rows Rows to split (labels read from `.label`).
 * @param testFraction Fraction held out (0–1).
 * @param seed PRNG seed.
 * @throws RangeError when `testFraction` is outside `(0, 1)`.
 */
export function splitStratified(
  rows: SplittableRow[],
  testFraction: number,
  seed: number = DEFAULT_SPLIT_SEED
): SplitResult {
  if (!(testFraction > 0 && testFraction < 1)) {
    throw new RangeError(`splitStratified: testFraction ${testFraction} must be in (0,1)`);
  }
  const rng = mulberry32(seed);
  const byClass = new Map<number, number[]>();
  rows.forEach((row, i) => {
    const bucket = byClass.get(row.label);
    if (bucket) bucket.push(i);
    else byClass.set(row.label, [i]);
  });

  const trainIndex: number[] = [];
  const testIndex: number[] = [];
  // Sort class keys for a deterministic iteration order.
  const classKeys = Array.from(byClass.keys()).sort((a, b) => a - b);
  for (const key of classKeys) {
    const bucket = (byClass.get(key) ?? []).slice();
    // Deterministic in-place Fisher–Yates using the seeded stream.
    for (let i = bucket.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = bucket[i];
      bucket[i] = bucket[j];
      bucket[j] = tmp;
    }
    const nTest = Math.max(1, Math.round(bucket.length * testFraction));
    for (let i = 0; i < bucket.length; i += 1) {
      if (i < nTest) testIndex.push(bucket[i]);
      else trainIndex.push(bucket[i]);
    }
  }
  trainIndex.sort((a, b) => a - b);
  testIndex.sort((a, b) => a - b);
  return { trainIndex, testIndex };
}

/**
 * Deterministic **temporal** split: the last `testFraction` of rows *by order*
 * are held out. Used for forecasting, where a random split would leak the
 * future into training (design §1 D3).
 *
 * @param rows Rows to split (sorted key read from `.order`).
 * @param testFraction Fraction held out (0–1).
 * @param minTestSize Guarantee at least this many holdout rows when possible.
 * @throws RangeError when `testFraction` is outside `(0, 1)`.
 */
export function splitTemporal(
  rows: SplittableRow[],
  testFraction: number,
  minTestSize = 1
): SplitResult {
  if (!(testFraction > 0 && testFraction < 1)) {
    throw new RangeError(`splitTemporal: testFraction ${testFraction} must be in (0,1)`);
  }
  const indexed = rows.map((row, i) => ({ i, order: row.order }));
  // Stable sort by order, tie-broken by original index for total determinism.
  indexed.sort((a, b) => (a.order !== b.order ? a.order - b.order : a.i - b.i));
  const total = indexed.length;
  let nTest = Math.max(minTestSize, Math.round(total * testFraction));
  if (nTest >= total) nTest = Math.max(1, total - 1);
  const cut = total - nTest;
  const trainIndex = indexed.slice(0, cut).map((r) => r.i).sort((a, b) => a - b);
  const testIndex = indexed.slice(cut).map((r) => r.i).sort((a, b) => a - b);
  return { trainIndex, testIndex };
}

/**
 * Hold out the last `k` rows by order (seasonal: the trailing month buckets).
 */
export function splitTail(rows: SplittableRow[], k: number): SplitResult {
  const indexed = rows.map((row, i) => ({ i, order: row.order }));
  indexed.sort((a, b) => (a.order !== b.order ? a.order - b.order : a.i - b.i));
  const hold = Math.max(1, Math.min(k, indexed.length - 1));
  const cut = indexed.length - hold;
  const trainIndex = indexed.slice(0, cut).map((r) => r.i).sort((a, b) => a - b);
  const testIndex = indexed.slice(cut).map((r) => r.i).sort((a, b) => a - b);
  return { trainIndex, testIndex };
}

/**
 * Mean absolute percentage error. Zero actuals are skipped (undefined ratio);
 * an all-zero target set yields `0` (perfect prediction of "no sessions").
 *
 * @returns MAPE as a ratio (0.1 ⇒ 10 %).
 */
export function mape(actual: number[], predicted: number[]): number {
  if (actual.length !== predicted.length) {
    throw new RangeError(`mape: length mismatch (${actual.length} vs ${predicted.length})`);
  }
  let sum = 0;
  let used = 0;
  for (let i = 0; i < actual.length; i += 1) {
    if (actual[i] === 0) continue;
    sum += Math.abs((actual[i] - predicted[i]) / actual[i]);
    used += 1;
  }
  return used === 0 ? 0 : sum / used;
}

/** Mean absolute error. */
export function mae(actual: number[], predicted: number[]): number {
  if (actual.length !== predicted.length) {
    throw new RangeError(`mae: length mismatch (${actual.length} vs ${predicted.length})`);
  }
  if (actual.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < actual.length; i += 1) sum += Math.abs(actual[i] - predicted[i]);
  return sum / actual.length;
}

/** Root mean squared error. */
export function rmse(actual: number[], predicted: number[]): number {
  if (actual.length !== predicted.length) {
    throw new RangeError(`rmse: length mismatch (${actual.length} vs ${predicted.length})`);
  }
  if (actual.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < actual.length; i += 1) {
    const d = actual[i] - predicted[i];
    sum += d * d;
  }
  return Math.sqrt(sum / actual.length);
}

/**
 * Regression efficiency score in `[0, 1]`, defined as `clamp(1 − MAPE, 0, 1)`.
 *
 * Documented (design §1 D3) as a *regression efficiency*, not a classification
 * accuracy: MAPE is scale-free, so a small-venue and a large-venue forecast are
 * comparable.
 */
export function regressionEfficiency(actual: number[], predicted: number[]): number {
  const m = mape(actual, predicted);
  return Math.min(1, Math.max(0, 1 - m));
}

/**
 * Classification accuracy at an explicit decision threshold.
 *
 * @param threshold Probability cut for class 1 (default 0.5).
 */
export function classificationAccuracy(
  labels: number[],
  probabilities: number[],
  threshold = 0.5
): number {
  if (labels.length !== probabilities.length) {
    throw new RangeError('classificationAccuracy: length mismatch');
  }
  if (labels.length === 0) return 0;
  let correct = 0;
  for (let i = 0; i < labels.length; i += 1) {
    const predicted = probabilities[i] >= threshold ? 1 : 0;
    if (predicted === labels[i]) correct += 1;
  }
  return correct / labels.length;
}

/**
 * ROC-AUC computed by the rank (Mann–Whitney U) method, with average ranks for
 * ties so it is deterministic and exact on hand-computed arrays.
 *
 * @returns AUC in `[0, 1]`; `0.5` when only one class is present (undefined,
 *   reported as chance rather than fabricating a number).
 */
export function rocAuc(labels: number[], scores: number[]): number {
  if (labels.length !== scores.length) {
    throw new RangeError('rocAuc: length mismatch');
  }
  const positives: number[] = [];
  const negatives: number[] = [];
  for (let i = 0; i < labels.length; i += 1) {
    if (labels[i] === 1) positives.push(i);
    else negatives.push(i);
  }
  if (positives.length === 0 || negatives.length === 0) return 0.5;

  // Rank all scores (1-based, average ranks for ties).
  const order = scores.map((s, i) => ({ s, i }));
  order.sort((a, b) => (a.s !== b.s ? a.s - b.s : a.i - b.i));
  const ranks = new Array<number>(scores.length).fill(0);
  let pos = 0;
  while (pos < order.length) {
    let end = pos;
    while (end + 1 < order.length && order[end + 1].s === order[pos].s) end += 1;
    const avgRank = (pos + end) / 2 + 1; // ranks are 1-based
    for (let k = pos; k <= end; k += 1) ranks[order[k].i] = avgRank;
    pos = end + 1;
  }

  let rankSumPos = 0;
  for (const i of positives) rankSumPos += ranks[i];
  const nP = positives.length;
  const nN = negatives.length;
  const u = rankSumPos - (nP * (nP + 1)) / 2;
  return u / (nP * nN);
}

/** Build an `EvaluationProtocol` with consistent bookkeeping. */
export function makeProtocol(
  split: EvaluationProtocol['split'],
  seed: number,
  trainSize: number,
  testSize: number,
  metric: EvaluationProtocol['metric'],
  note?: string
): EvaluationProtocol {
  return { split, seed, trainSize, testSize, metric, ...(note ? { note } : {}) };
}

/**
 * Evaluate a regression model's **held-out** predictions.
 *
 * @param actual Held-out ground truth.
 * @param predicted Held-out model output.
 * @param protocol How the split was produced.
 */
export function evaluateRegression(
  actual: number[],
  predicted: number[],
  protocol: EvaluationProtocol
): EvaluationReport {
  return {
    metric: 'regression-efficiency',
    value: regressionEfficiency(actual, predicted),
    auc: null,
    mae: mae(actual, predicted),
    rmse: rmse(actual, predicted),
    mape: mape(actual, predicted),
    protocol,
  };
}

/**
 * Evaluate a classifier's **held-out** probabilities.
 *
 * @param labels Held-out 0/1 ground truth.
 * @param probabilities Held-out predicted P(class = 1).
 * @param protocol How the split was produced.
 * @param threshold Decision threshold for the headline accuracy (default 0.5).
 */
export function evaluateClassification(
  labels: number[],
  probabilities: number[],
  protocol: EvaluationProtocol,
  threshold = 0.5
): EvaluationReport {
  return {
    metric: 'accuracy',
    value: classificationAccuracy(labels, probabilities, threshold),
    auc: rocAuc(labels, probabilities),
    mae: null,
    rmse: null,
    mape: null,
    protocol,
  };
}

/** Convenience: evaluate a *fitted* regression's coefficients on held-out rows. */
export function evaluateDemand(
  testX: number[][],
  testY: number[],
  predict: (x: number[]) => number,
  protocol: EvaluationProtocol
): EvaluationReport {
  const predicted = testX.map((x) => predict(x));
  return evaluateRegression(testY, predicted, protocol);
}

/** Convenience: evaluate a *fitted* classifier's probabilities on held-out rows. */
export function evaluateChurn(
  testX: number[][],
  testY: number[],
  predictProba: (x: number[]) => number,
  protocol: EvaluationProtocol
): EvaluationReport {
  const probabilities = testX.map((x) => predictProba(x));
  return evaluateClassification(testY, probabilities, protocol);
}
