/**
 * Story 6.6 (T05a) — Estimator maths as committed tests.
 *
 * These were previously only verified by throwaway scripts; they now live in
 * the repo. Covers design §6 behaviours #4 (ridge recovers a planted linear
 * relation), #5 (logistic separates separable data, AUC > 0.9) and #6
 * (seasonal decomposition recovers planted trend + index), plus the
 * deterministic scheduler that replaced `Math.random()`.
 */

import { identity, matmul, matvec, solve, standardize, transpose } from '../linearAlgebra';
import {
  RidgeRegressor,
  LogisticRegressor,
  seasonalDecompose,
  greedyCourtAssignment,
  MonthlyBucket,
} from '../estimators';

/** Deterministic PRNG so synthetic fixtures are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Story 6.6 — linear algebra', () => {
  it('transpose / matmul / matvec are consistent', () => {
    const a = [
      [1, 2],
      [3, 4],
    ];
    expect(transpose(a)).toEqual([
      [1, 3],
      [2, 4],
    ]);
    expect(matmul(a, identity(2))).toEqual(a);
    expect(matvec(a, [1, 1])).toEqual([3, 7]);
  });

  it('solve() solves a well-conditioned system exactly', () => {
    const x = solve(
      [
        [2, 1],
        [1, 3],
      ],
      [5, 10]
    );
    expect(x[0]).toBeCloseTo(1, 9);
    expect(x[1]).toBeCloseTo(3, 9);
  });

  it('solve() regularises a singular system instead of throwing', () => {
    // [[1,2],[2,4]] is rank-1 (row 2 = 2 × row 1).
    const x = solve(
      [
        [1, 2],
        [2, 4],
      ],
      [3, 6]
    );
    expect(x).toHaveLength(2);
    for (const v of x) expect(Number.isFinite(v)).toBe(true);
  });

  it('solve() rejects a non-square matrix and a mismatched RHS', () => {
    expect(() => solve([[1, 2, 3]], [1])).toThrow(RangeError);
    expect(() =>
      solve(
        [
          [1, 0],
          [0, 1],
        ],
        [1]
      )
    ).toThrow(RangeError);
  });

  it('standardize() yields zero-mean unit-variance columns', () => {
    const { Z, mean, std } = standardize([
      [1, 10],
      [2, 20],
      [3, 30],
    ]);
    expect(mean[0]).toBeCloseTo(2, 9);
    expect(mean[1]).toBeCloseTo(20, 9);
    expect(std[0]).toBeGreaterThan(0);
    // Each standardized column has mean 0.
    const col0Mean = Z.reduce((a, r) => a + r[0], 0) / Z.length;
    expect(col0Mean).toBeCloseTo(0, 9);
    // And reproduces the source values under the inverse transform.
    const orig0 = Z[0][0] * std[0] + mean[0];
    expect(orig0).toBeCloseTo(1, 9);
  });
});

describe('Story 6.6 — RidgeRegressor (#4)', () => {
  it('recovers a planted linear relation within tolerance', () => {
    // Planted: y = 3 + 2·x1 − 1·x2
    const rng = mulberry32(42);
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 200; i += 1) {
      const x1 = rng() * 10;
      const x2 = rng() * 10;
      X.push([x1, x2]);
      y.push(3 + 2 * x1 - 1 * x2);
    }

    const model = new RidgeRegressor(1e-6);
    const linear = model.fit(X, y);

    expect(linear.coefficients[0]).toBeCloseTo(2, 3);
    expect(linear.coefficients[1]).toBeCloseTo(-1, 3);
    expect(linear.intercept).toBeCloseTo(3, 3);
    // A held-out-style point predicts correctly.
    expect(model.predict([5, 5])).toBeCloseTo(3 + 2 * 5 - 1 * 5, 2);
  });

  it('honours an alpha override in fit()', () => {
    const X = [
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ];
    const y = [1, 3, 5, 7];
    const smallRidge = new RidgeRegressor(1e-8).fit(X, y, 1e-8);
    const bigRidge = new RidgeRegressor(1e-8).fit(X, y, 1000);
    // Heavy regularisation shrinks the coefficients toward zero.
    expect(Math.abs(bigRidge.coefficients[0])).toBeLessThan(Math.abs(smallRidge.coefficients[0]));
  });

  it('stays finite on a singular (collinear) design', () => {
    const X = [
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
    ];
    const y = [2, 4, 6, 8];
    const linear = new RidgeRegressor(1).fit(X, y);
    for (const c of linear.coefficients) expect(Number.isFinite(c)).toBe(true);
    expect(Number.isFinite(linear.intercept)).toBe(true);
  });

  it('throws on empty input, length mismatch and predict-before-fit', () => {
    expect(() => new RidgeRegressor().fit([], [])).toThrow(RangeError);
    expect(() => new RidgeRegressor().fit([[1], [2]], [1])).toThrow(RangeError);
    expect(() => new RidgeRegressor().predict([1])).toThrow(/before fit/);
  });
});

describe('Story 6.6 — LogisticRegressor (#5)', () => {
  it('separates a linearly-separable set with AUC > 0.9', () => {
    const rng = mulberry32(7);
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 300; i += 1) {
      const a = rng() * 2 - 1;
      const b = rng() * 2 - 1;
      X.push([a, b]);
      y.push(a + b > 0 ? 1 : 0);
    }

    const model = new LogisticRegressor();
    model.fit(X, y, { epochs: 400, lr: 0.5, l2: 0.001 });

    const probs = X.map((row) => model.predictProba(row));
    const auc = rocAucLocal(y, probs);
    expect(auc).toBeGreaterThan(0.9);

    // Fitted coefficients express a genuine separating boundary: both weights
    // share the sign of the planted rule (a + b > 0) and are near-symmetric.
    const linear = model.toLinear();
    expect(linear.coefficients[0]).toBeGreaterThan(0);
    expect(linear.coefficients[1]).toBeGreaterThan(0);
    expect(linear.coefficients[0]).toBeCloseTo(linear.coefficients[1], 0);
  });

  it('is deterministic across identical fits', () => {
    const X = [
      [0, 1],
      [1, 0],
      [2, 2],
      [3, 3],
      [10, 1],
      [1, 10],
    ];
    const y = [0, 0, 0, 0, 1, 1];
    const a = new LogisticRegressor().fit(X, y, { epochs: 100, lr: 0.3, l2: 0.01 });
    const b = new LogisticRegressor().fit(X, y, { epochs: 100, lr: 0.3, l2: 0.01 });
    expect(a).toEqual(b);
  });

  it('rejects non-0/1 labels and predict-before-fit', () => {
    expect(() =>
      new LogisticRegressor().fit([[1], [2]], [0, 2], { epochs: 10, lr: 0.1, l2: 0 })
    ).toThrow(RangeError);
    expect(() => new LogisticRegressor().predictProba([1])).toThrow(/before fit/);
  });
});

/** Local ROC-AUC (rank method) so this file is independent of evaluation.ts. */
function rocAucLocal(labels: number[], scores: number[]): number {
  const pos: number[] = [];
  const neg: number[] = [];
  labels.forEach((l, i) => (l === 1 ? pos : neg).push(i));
  if (pos.length === 0 || neg.length === 0) return 0.5;
  let wins = 0;
  for (const p of pos) {
    for (const n of neg) {
      if (scores[p] > scores[n]) wins += 1;
      else if (scores[p] === scores[n]) wins += 0.5;
    }
  }
  return wins / (pos.length * neg.length);
}

describe('Story 6.6 — seasonalDecompose (#6)', () => {
  it('recovers a planted linear trend and seasonal index', () => {
    const buckets: MonthlyBucket[] = [];
    for (let i = 0; i < 48; i += 1) {
      const month = (i % 12) + 1;
      const seasonal = month === 7 ? 5 : month === 1 ? -4 : 0;
      buckets.push({ month, index: i, count: 10 + 0.5 * i + seasonal });
    }

    const fit = seasonalDecompose(buckets);

    expect(fit.slope).toBeCloseTo(0.5, 1);
    // July (index 6 → month 7) is the strongest month; January the weakest.
    const peak = fit.seasonalIndex.indexOf(Math.max(...fit.seasonalIndex)) + 1;
    const low = fit.seasonalIndex.indexOf(Math.min(...fit.seasonalIndex)) + 1;
    expect(peak).toBe(7);
    expect(low).toBe(1);
    // The seasonal amplitude (peak − low) recovers the planted 5 − (−4) = 9.
    const amplitude = Math.max(...fit.seasonalIndex) - Math.min(...fit.seasonalIndex);
    expect(amplitude).toBeCloseTo(9, 0);
    // Forecast reproduces the planted point within the index's mean-centring bias.
    expect(fit.forecast(7, 6)).toBeCloseTo(10 + 0.5 * 6 + 5, 0);
  });

  it('throws on an empty bucket list', () => {
    expect(() => seasonalDecompose([])).toThrow(RangeError);
  });
});

describe('Story 6.6 — greedyCourtAssignment (determinism)', () => {
  const courts = [
    { id: 'c1', maxPlayers: 4 },
    { id: 'c2', maxPlayers: 4 },
    { id: 'c3', maxPlayers: 8 },
  ];

  it('is deterministic and independent of input order', () => {
    const bookings = [
      { id: 'b', startTime: '2026-06-01T09:30:00Z', endTime: '2026-06-01T10:30:00Z', playerCount: 4, totalPrice: 20 },
      { id: 'a', startTime: '2026-06-01T09:00:00Z', endTime: '2026-06-01T10:00:00Z', playerCount: 4, totalPrice: 15 },
    ];
    const forward = greedyCourtAssignment(bookings, courts);
    const reversed = greedyCourtAssignment([...bookings].reverse(), courts);
    expect(forward).toEqual(reversed);
    // Sorted by start time: 'a' first (court 0), 'b' overlaps → court 1.
    expect(forward.optimalSchedule.map((s) => [s.bookingId, s.assignedCourt])).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
    expect(forward.totalCost).toBeCloseTo(35, 9);
  });

  it('respects court capacity and marks unplaceable bookings', () => {
    const result = greedyCourtAssignment(
      [{ id: 'big', startTime: '2026-06-01T09:00:00Z', endTime: '2026-06-01T10:00:00Z', playerCount: 12 }],
      courts
    );
    expect(result.optimalSchedule[0].assignedCourt).toBe(-1);
    expect(result.optimalSchedule[0].courtId).toBeNull();
  });

  it('places a large booking on a court that fits it', () => {
    const result = greedyCourtAssignment(
      [{ id: 'x', startTime: '2026-06-01T09:00:00Z', endTime: '2026-06-01T10:00:00Z', playerCount: 8 }],
      courts
    );
    expect(result.optimalSchedule[0].assignedCourt).toBe(2);
    expect(result.optimalSchedule[0].courtId).toBe('c3');
  });

  it('uses distinct courts for overlapping bookings', () => {
    const result = greedyCourtAssignment(
      [
        { id: 'b1', startTime: '2026-06-01T09:00:00Z', endTime: '2026-06-01T11:00:00Z', playerCount: 4 },
        { id: 'b2', startTime: '2026-06-01T09:30:00Z', endTime: '2026-06-01T11:30:00Z', playerCount: 4 },
        { id: 'b3', startTime: '2026-06-01T10:00:00Z', endTime: '2026-06-01T12:00:00Z', playerCount: 4 },
      ],
      courts
    );
    const used = result.optimalSchedule.map((s) => s.assignedCourt);
    expect(new Set(used).size).toBe(3);
  });
});
