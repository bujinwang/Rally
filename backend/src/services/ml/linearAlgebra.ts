/**
 * Story 6.6 — Pure-TypeScript linear algebra (T02).
 *
 * Deliberately dependency-free (no ml-matrix, no native BLAS — design §1 D1 /
 * AC 15). Everything here is O(features²)–O(features³) on tiny matrices, which
 * is exactly the shape of our models (≤ ~20 features).
 */

/**
 * Return the transpose of a matrix.
 *
 * @throws RangeError when the input is non-rectangular.
 */
export function transpose(m: number[][]): number[][] {
  const rows = m.length;
  const cols = rows === 0 ? 0 : m[0].length;
  for (let i = 0; i < rows; i += 1) {
    if (m[i].length !== cols) {
      throw new RangeError(`transpose: row ${i} has length ${m[i].length}, expected ${cols}`);
    }
  }
  const out: number[][] = Array.from({ length: cols }, () => new Array<number>(rows).fill(0));
  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      out[j][i] = m[i][j];
    }
  }
  return out;
}

/**
 * Matrix product `A · B`.
 *
 * @throws RangeError when the inner dimensions disagree.
 */
export function matmul(a: number[][], b: number[][]): number[][] {
  const n = a.length;
  const inner = n === 0 ? 0 : a[0].length;
  const m = b.length === 0 ? 0 : b[0].length;
  if (inner !== b.length) {
    throw new RangeError(
      `matmul: inner dimension mismatch (${inner} vs ${b.length})`
    );
  }
  const out: number[][] = Array.from({ length: n }, () => new Array<number>(m).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let k = 0; k < inner; k += 1) {
      const aik = a[i][k];
      if (aik === 0) continue;
      for (let j = 0; j < m; j += 1) {
        out[i][j] += aik * b[k][j];
      }
    }
  }
  return out;
}

/** Matrix–vector product `A · v`. */
export function matvec(a: number[][], v: number[]): number[] {
  const out = new Array<number>(a.length).fill(0);
  for (let i = 0; i < a.length; i += 1) {
    let sum = 0;
    const row = a[i];
    for (let j = 0; j < row.length; j += 1) {
      sum += row[j] * v[j];
    }
    out[i] = sum;
  }
  return out;
}

/** Identity matrix of size `n`. */
export function identity(n: number): number[][] {
  const out: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i += 1) out[i][i] = 1;
  return out;
}

/**
 * Solve the square linear system `A · x = b` by Gaussian elimination with
 * **partial pivoting**.
 *
 * Robustness (design §1 D1): a singular or near-singular system does **not**
 * throw. When a pivot falls below `singularTolerance`, an escalating ridge
 * (`+ ε·I`) is added to the diagonal and the system is re-solved, so a
 * collinear design still yields a finite, stable solution.
 *
 * @param a Coefficient matrix (`n × n`), not mutated.
 * @param b Right-hand side (`n`), not mutated.
 * @param singularTolerance Pivot magnitude below which a ridge is applied.
 * @returns The solution vector `x`.
 * @throws RangeError when `a` is not square or `b.length` disagrees.
 */
export function solve(
  a: number[][],
  b: number[],
  singularTolerance = 1e-10
): number[] {
  const n = a.length;
  if (n === 0) return [];
  for (let i = 0; i < n; i += 1) {
    if (a[i].length !== n) {
      throw new RangeError(`solve: matrix is not square (row ${i})`);
    }
  }
  if (b.length !== n) {
    throw new RangeError(`solve: RHS length ${b.length} ≠ matrix size ${n}`);
  }

  // Escalating ridge: 0 → ε → 10ε → 100ε … until a finite solution is reached.
  let ridge = 0;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const x = tryGaussian(a, b, ridge, singularTolerance);
    if (x) return x;
    ridge = ridge === 0 ? singularTolerance : ridge * 10;
  }

  // Final safety net: the ridge is large enough that the system is now
  // strictly diagonally dominant; this branch is effectively unreachable.
  return tryGaussian(a, b, 1e6, singularTolerance) ?? new Array<number>(n).fill(0);
}

/**
 * One Gaussian-elimination attempt with an explicit ridge added to the diagonal.
 *
 * @returns The solution, or `null` when a pivot is (near) singular.
 */
function tryGaussian(
  a: number[][],
  b: number[],
  ridge: number,
  tolerance: number
): number[] | null {
  const n = a.length;
  const m: number[][] = a.map((row, i) =>
    row.map((v, j) => (i === j ? v + ridge : v))
  );
  const rhs = b.slice();

  for (let col = 0; col < n; col += 1) {
    // Partial pivoting: move the largest-magnitude candidate into this row.
    let pivotRow = col;
    let pivotMag = Math.abs(m[col][col]);
    for (let r = col + 1; r < n; r += 1) {
      const mag = Math.abs(m[r][col]);
      if (mag > pivotMag) {
        pivotMag = mag;
        pivotRow = r;
      }
    }
    if (pivotMag < tolerance || !Number.isFinite(pivotMag)) {
      return null; // singular / near-singular → caller adds more ridge
    }
    if (pivotRow !== col) {
      const tmpRow = m[col];
      m[col] = m[pivotRow];
      m[pivotRow] = tmpRow;
      const tmpVal = rhs[col];
      rhs[col] = rhs[pivotRow];
      rhs[pivotRow] = tmpVal;
    }

    // Eliminate below the pivot.
    const pivot = m[col][col];
    for (let r = col + 1; r < n; r += 1) {
      const factor = m[r][col] / pivot;
      if (factor === 0) continue;
      for (let c = col; c < n; c += 1) {
        m[r][c] -= factor * m[col][c];
      }
      rhs[r] -= factor * rhs[col];
    }
  }

  // Back-substitution.
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i -= 1) {
    let sum = rhs[i];
    for (let j = i + 1; j < n; j += 1) {
      sum -= m[i][j] * x[j];
    }
    x[i] = sum / m[i][i];
    if (!Number.isFinite(x[i])) return null;
  }
  return x;
}

/** Per-column mean of a design matrix (empty columns ⇒ 0). */
export function columnMeans(x: number[][]): number[] {
  if (x.length === 0) return [];
  const p = x[0].length;
  const means = new Array<number>(p).fill(0);
  for (const row of x) {
    for (let j = 0; j < p; j += 1) means[j] += row[j];
  }
  for (let j = 0; j < p; j += 1) means[j] /= x.length;
  return means;
}

/** Per-column population standard deviation (zero-variance ⇒ 1, to avoid ÷0). */
export function columnStd(x: number[][], means: number[]): number[] {
  if (x.length === 0) return [];
  const p = means.length;
  const vars = new Array<number>(p).fill(0);
  for (const row of x) {
    for (let j = 0; j < p; j += 1) {
      const d = row[j] - means[j];
      vars[j] += d * d;
    }
  }
  const std = new Array<number>(p).fill(0);
  for (let j = 0; j < p; j += 1) {
    const v = vars[j] / x.length;
    std[j] = v > 0 ? Math.sqrt(v) : 1;
  }
  return std;
}

/**
 * Standardize each column to zero mean / unit variance.
 *
 * @returns The standardized matrix **and** the (mean, std) used, so callers can
 *   apply the identical transform to serving-time rows.
 */
export function standardize(x: number[][]): { Z: number[][]; mean: number[]; std: number[] } {
  const mean = columnMeans(x);
  const std = columnStd(x, mean);
  const Z = x.map((row) => row.map((v, j) => (v - mean[j]) / std[j]));
  return { Z, mean, std };
}

/** Apply a pre-computed standardization to one row. */
export function applyStandardization(row: number[], mean: number[], std: number[]): number[] {
  return row.map((v, j) => (v - mean[j]) / (std[j] === 0 ? 1 : std[j]));
}

/** Squared L2 norm of a vector. */
export function norm2(v: number[]): number {
  let s = 0;
  for (const x of v) s += x * x;
  return s;
}

/** The logistic (sigmoid) function, clamped to avoid overflow. */
export function sigmoid(z: number): number {
  if (z >= 0) {
    return 1 / (1 + Math.exp(-z));
  }
  const e = Math.exp(z);
  return e / (1 + e);
}
