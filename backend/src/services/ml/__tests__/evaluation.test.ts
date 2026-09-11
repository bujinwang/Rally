/**
 * Story 6.6 (T05a) — Evaluation module as committed tests.
 *
 * Covers design §6 behaviour #7 (split determinism & viability), #8 (metric
 * maths on hand-computed arrays) and the seeded-PRNG reproducibility contract
 * that makes a stored `accuracy` recomputable (AC 9 honesty model).
 */

import {
  classificationAccuracy,
  evaluateClassification,
  evaluateRegression,
  mae,
  makeProtocol,
  mape,
  mulberry32,
  regressionEfficiency,
  rmse,
  rocAuc,
  splitStratified,
  splitTail,
  splitTemporal,
} from '../evaluation';

describe('Story 6.6 — seeded PRNG', () => {
  it('is reproducible for the same seed and different across seeds', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    const c = mulberry32(124);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    const seqC = Array.from({ length: 5 }, () => c());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('Story 6.6 — splitStratified (#7)', () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({ label: i % 2, order: i }));

  it('is deterministic for the same seed', () => {
    expect(splitStratified(rows, 0.2, 7)).toEqual(splitStratified(rows, 0.2, 7));
  });

  it('preserves both classes in the holdout', () => {
    const { testIndex } = splitStratified(rows, 0.2, 7);
    const classes = new Set(testIndex.map((i) => rows[i].label));
    expect(classes.size).toBe(2);
  });

  it('produces disjoint train/test index sets covering every row', () => {
    const { trainIndex, testIndex } = splitStratified(rows, 0.2, 7);
    const all = [...trainIndex, ...testIndex].sort((a, b) => a - b);
    expect(all).toEqual(rows.map((_, i) => i));
    expect(new Set(all).size).toBe(rows.length);
  });

  it('rejects an out-of-range fraction', () => {
    expect(() => splitStratified(rows, 0, 1)).toThrow(RangeError);
    expect(() => splitStratified(rows, 1, 1)).toThrow(RangeError);
  });
});

describe('Story 6.6 — splitTemporal (#7)', () => {
  it('holds out the newest rows by order (no future leakage)', () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ label: 0, order: i }));
    const { trainIndex, testIndex } = splitTemporal(rows, 0.2);
    const maxTrain = Math.max(...trainIndex.map((i) => rows[i].order));
    const minTest = Math.min(...testIndex.map((i) => rows[i].order));
    expect(minTest).toBeGreaterThan(maxTrain);
    expect(testIndex.length).toBe(10);
  });

  it('guarantees a minimum holdout size', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ label: 0, order: i }));
    const { testIndex } = splitTemporal(rows, 0.01, 5);
    expect(testIndex.length).toBeGreaterThanOrEqual(5);
  });

  it('satisfies the demand gate: ≥40 rows ⇒ ≥8 holdout rows', () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ label: 0, order: i }));
    const { testIndex } = splitTemporal(rows, 0.2);
    expect(testIndex.length).toBeGreaterThanOrEqual(8);
  });
});

describe('Story 6.6 — splitTail', () => {
  it('holds out exactly the requested trailing buckets', () => {
    const rows = Array.from({ length: 16 }, (_, i) => ({ label: 0, order: i }));
    const { trainIndex, testIndex } = splitTail(rows, 4);
    expect(testIndex.length).toBe(4);
    expect(trainIndex.length).toBe(12);
    expect(Math.min(...testIndex.map((i) => rows[i].order))).toBeGreaterThan(
      Math.max(...trainIndex.map((i) => rows[i].order))
    );
  });
});

describe('Story 6.6 — metric maths (#8)', () => {
  it('mape skips zero actuals and averages the rest', () => {
    // |1-1|/1=0, |2-1|/2=0.5, |0-9| skipped  ⇒ (0 + 0.5) / 2 = 0.25
    expect(mape([1, 2, 0], [1, 1, 9])).toBeCloseTo(0.25, 9);
  });

  it('mape of an all-zero target set is 0', () => {
    expect(mape([0, 0], [5, 5])).toBe(0);
  });

  it('regressionEfficiency = clamp(1 − MAPE, 0, 1)', () => {
    expect(regressionEfficiency([10, 10], [10, 10])).toBeCloseTo(1, 9);
    expect(regressionEfficiency([1, 2, 0], [1, 1, 9])).toBeCloseTo(0.75, 9);
    // Terrible prediction clamps to 0, never negative.
    expect(regressionEfficiency([1], [100])).toBe(0);
  });

  it('mae and rmse match hand-computed values', () => {
    expect(mae([1, 2, 3], [1, 2, 2])).toBeCloseTo(1 / 3, 9);
    expect(rmse([0, 0], [3, 4])).toBeCloseTo(Math.sqrt((9 + 16) / 2), 9);
  });

  it('classificationAccuracy respects the threshold', () => {
    expect(classificationAccuracy([1, 0, 1, 0], [0.9, 0.1, 0.4, 0.6])).toBeCloseTo(0.5, 9);
    expect(classificationAccuracy([1, 0, 1, 0], [0.9, 0.1, 0.4, 0.6], 0.3)).toBeCloseTo(0.75, 9);
  });

  it('rocAuc is 1 for perfect separation and 0.5 for one class', () => {
    expect(rocAuc([0, 0, 1, 1], [0.1, 0.2, 0.8, 0.9])).toBeCloseTo(1, 9);
    expect(rocAuc([1, 1], [0.2, 0.9])).toBe(0.5);
  });

  it('rocAuc handles ties with average ranks (0.5 for all-equal scores)', () => {
    expect(rocAuc([0, 1, 0, 1], [0.5, 0.5, 0.5, 0.5])).toBeCloseTo(0.5, 9);
  });

  it('throws on length mismatch', () => {
    expect(() => mape([1, 2], [1])).toThrow(RangeError);
    expect(() => rocAuc([1], [0.1, 0.2])).toThrow(RangeError);
    expect(() => classificationAccuracy([1], [])).toThrow(RangeError);
  });
});

describe('Story 6.6 — EvaluationReport assembly', () => {
  const protocol = makeProtocol('stratified', 42, 80, 20, 'accuracy', 'test');

  it('evaluateClassification stores accuracy + AUC and null regression fields', () => {
    const report = evaluateClassification([0, 0, 1, 1], [0.1, 0.4, 0.6, 0.9], protocol);
    expect(report.metric).toBe('accuracy');
    expect(report.value).toBeCloseTo(1, 9);
    expect(report.auc).toBeCloseTo(1, 9);
    expect(report.mae).toBeNull();
    expect(report.rmse).toBeNull();
    expect(report.mape).toBeNull();
    expect(report.protocol).toEqual(protocol);
  });

  it('evaluateRegression stores efficiency + raw errors and null AUC', () => {
    const report = evaluateRegression([10, 20], [11, 18], protocol);
    expect(report.metric).toBe('regression-efficiency');
    expect(report.auc).toBeNull();
    expect(report.mae).toBeCloseTo(1.5, 9);
    expect(report.rmse).toBeCloseTo(Math.sqrt((1 + 4) / 2), 9);
    expect(report.mape).toBeCloseTo((0.1 + 0.1) / 2, 9);
    expect(report.value).toBeCloseTo(0.9, 9);
  });

  it('stores the evaluated value verbatim in value (never a constant)', () => {
    const report = evaluateClassification([0, 1], [0.2, 0.8], protocol);
    expect(report.value).toBeCloseTo(1, 9);
    expect([0.72, 0.78, 0.8, 0.85]).not.toContain(report.value);
  });
});
