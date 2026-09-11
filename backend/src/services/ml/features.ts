/**
 * Story 6.6 — Feature pipeline (T02).
 *
 * Reads the **real** tables, derives anonymized numeric feature rows, and
 * applies the minimum-sample gates from the design. Two correctness rules are
 * load-bearing and must not be relaxed (they come from the architecture review):
 *
 *  1. Demand / seasonal read `mvp_sessions` — **not** `sessions`. The legacy
 *     service queried `prisma.session` (mapped to an empty `sessions` table) and
 *     capped at `take: 365`; both are gone. The gate counts across all time.
 *  2. Churn identity is `COALESCE(userId, deviceId)` — `MvpPlayer.sessionId` is
 *     required, so a row is one *session participation*, not a person. Rows are
 *     deduped to one per identity. `status = LEFT` is NOT a churn signal (it is
 *     set when someone leaves a single session), and `PlayerAnalytics.playerId`
 *     is NOT an identity (it is unique over a participation id).
 *
 * No PII ever enters a feature row, a descriptor, or a cache key: locations are
 * SHA-1 digested and identity columns are dropped at extraction (`toFeatureRow`
 * whitelists the columns that survive).
 */

import { prisma } from '../../config/database';
import { digest } from '../cache/cacheKeys';
import {
  ANONYMIZATION_VERSION,
  CHURN_WINDOW_DAYS,
  ClassBalance,
  Dataset,
  DatasetDescriptor,
  DEMAND_HOLDOUT_RATIO,
  DEMAND_MIN_HOLDOUT_ROWS,
  FeatureRow,
  FeatureSpec,
  MIN_CHURN_POSITIVES,
  MIN_IDENTITY_OBSERVATIONS,
  MIN_SAMPLES,
  ModelType,
  SEASONAL_MIN_POPULATED_MONTHS,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Feature names for the demand model, in coefficient order. */
export const DEMAND_FEATURE_NAMES: string[] = [
  'dowMon',
  'dowTue',
  'dowWed',
  'dowThu',
  'dowFri',
  'dowSat',
  'dowSun',
  'monthJan',
  'monthFeb',
  'monthMar',
  'monthApr',
  'monthMay',
  'monthJun',
  'monthJul',
  'monthAug',
  'monthSep',
  'monthOct',
  'monthNov',
  'monthDec',
  'isWeekend',
  'capacity',
  'rolling4w',
  'locationKey',
];

/** Feature names for the churn model, in coefficient order. */
export const CHURN_FEATURE_NAMES: string[] = [
  'daysSinceLastParticipation',
  'sessionsAttended',
  'tenureDays',
  'sessionsPer30d',
  'meanGapDays',
  'observedSpanDays',
];

/** Feature names for the seasonal model, in coefficient order. */
export const SEASONAL_FEATURE_NAMES: string[] = ['trendIndex', 'monthSin', 'monthCos'];

/** Anonymize a location string to a stable, non-reversible SHA-1 digest. */
export function anonymizeLocation(location: string): string {
  return digest(location ?? '');
}

/**
 * Whitelist a candidate row down to a `FeatureRow` (numeric values only).
 *
 * This is the single choke point that guarantees no identity column
 * (`userId`, `deviceId`, `playerId`, `name`, `email`) can leak into a feature
 * row — callers pass a superset object and only `names` survive.
 *
 * @param candidate Raw key/value pairs (may contain identity fields).
 * @param names The feature names that are permitted through.
 * @throws RangeError when a permitted name is missing or non-numeric.
 */
export function toFeatureRow(
  candidate: Record<string, unknown>,
  names: string[]
): FeatureRow {
  const row: FeatureRow = {};
  for (const name of names) {
    const raw = candidate[name];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      throw new RangeError(`toFeatureRow: feature "${name}" is missing or non-numeric`);
    }
    row[name] = raw;
  }
  return row;
}

/** Assemble a `FeatureSpec` from a matrix + names (mean/std for provenance). */
export function buildFeatureSpec(
  names: string[],
  X: number[][],
  anonymizationVersion = ANONYMIZATION_VERSION
): FeatureSpec {
  const p = names.length;
  const mean = new Array<number>(p).fill(0);
  const std = new Array<number>(p).fill(1);
  if (X.length > 0) {
    for (const row of X) {
      for (let j = 0; j < p; j += 1) mean[j] += row[j];
    }
    for (let j = 0; j < p; j += 1) mean[j] /= X.length;
    const vars = new Array<number>(p).fill(0);
    for (const row of X) {
      for (let j = 0; j < p; j += 1) {
        const d = row[j] - mean[j];
        vars[j] += d * d;
      }
    }
    for (let j = 0; j < p; j += 1) {
      const v = vars[j] / X.length;
      std[j] = v > 0 ? Math.sqrt(v) : 1;
    }
  }
  return { names, mean, std, anonymizationVersion };
}

/** Format a Date as `YYYY-MM-DD` (UTC — deterministic, no timezone drift). */
export function dayKeyUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Format a Date as `YYYY-MM` (UTC). */
export function monthKeyUtc(d: Date): string {
  return d.toISOString().slice(0, 7);
}

/** A location-scoped view of a completed session (no identities). */
interface CompletedSession {
  scheduledAt: Date;
  maxPlayers: number;
  location: string;
}

/** Empty-feature descriptor used by fallback datasets. */
function emptyFeatureSpec(names: string[]): FeatureSpec {
  return {
    names,
    mean: new Array<number>(names.length).fill(0),
    std: new Array<number>(names.length).fill(1),
    anonymizationVersion: ANONYMIZATION_VERSION,
  };
}

/** Build a descriptor (shared by all builders). */
function makeDescriptor(
  type: ModelType,
  featureSpec: FeatureSpec,
  rowCount: number,
  windowFrom: Date | null,
  windowTo: Date | null,
  classBalance: ClassBalance
): DatasetDescriptor {
  return {
    type,
    rowCount,
    minSamples: MIN_SAMPLES[type],
    featureSpec,
    windowFrom: (windowFrom ?? new Date(0)).toISOString(),
    windowTo: (windowTo ?? new Date(0)).toISOString(),
    classBalance,
  };
}

/** Build a dataset shell marked insufficient (never trained on). */
function insufficientDataset(
  type: ModelType,
  names: string[],
  reason: Dataset['reason']
): Dataset {
  const featureSpec = emptyFeatureSpec(names);
  return {
    type,
    X: [],
    y: [],
    order: [],
    rows: [],
    featureSpec,
    descriptor: makeDescriptor(type, featureSpec, 0, null, null, {}),
    insufficient: true,
    reason,
  };
}

/**
 * One-hot day-of-week + month, plus weekend flag, for a given date.
 * Monday is index 0 … Sunday is index 6 (matching `DEMAND_FEATURE_NAMES`).
 */
function calendarFeatures(date: Date): number[] {
  const jsDay = date.getUTCDay(); // 0 = Sunday
  const dowIndex = (jsDay + 6) % 7; // 0 = Monday … 6 = Sunday
  const monthIndex = date.getUTCMonth(); // 0 = January
  const dowOneHot = new Array<number>(7).fill(0);
  dowOneHot[dowIndex] = 1;
  const monthOneHot = new Array<number>(12).fill(0);
  monthOneHot[monthIndex] = 1;
  const isWeekend = dowIndex >= 5 ? 1 : 0;
  return [...dowOneHot, ...monthOneHot, isWeekend];
}

/**
 * Build a single demand feature row for a given day.
 *
 * Exported so the serving path constructs future rows with the exact same
 * transform used at training time (no train/serve skew).
 */
export function makeDemandFeatureRow(
  date: Date,
  capacity: number,
  rolling4w: number,
  locationKey: number
): FeatureRow {
  const f = calendarFeatures(date);
  return toFeatureRow(
    {
      dowMon: f[0],
      dowTue: f[1],
      dowWed: f[2],
      dowThu: f[3],
      dowFri: f[4],
      dowSat: f[5],
      dowSun: f[6],
      monthJan: f[7],
      monthFeb: f[8],
      monthMar: f[9],
      monthApr: f[10],
      monthMay: f[11],
      monthJun: f[12],
      monthJul: f[13],
      monthAug: f[14],
      monthSep: f[15],
      monthOct: f[16],
      monthNov: f[17],
      monthDec: f[18],
      isWeekend: f[19],
      capacity,
      rolling4w,
      locationKey,
    },
    DEMAND_FEATURE_NAMES
  );
}

/**
 * Demand dataset (regression): one row per calendar day across the location's
 * observed window; target = number of completed sessions that day.
 *
 * Gate (design §1 D2.1): ≥ 40 completed sessions for the location **and** a
 * temporal 80/20 split that yields ≥ 8 holdout rows — otherwise `insufficient`.
 *
 * @param location Venue location string (digested before it enters any row).
 */
export async function buildDemandDataset(location: string): Promise<Dataset> {
  const sessions = (await prisma.mvpSession.findMany({
    where: { location, status: 'COMPLETED' },
    select: { scheduledAt: true, maxPlayers: true, location: true },
    orderBy: { scheduledAt: 'asc' },
  })) as unknown as CompletedSession[];

  const completedSessions = sessions.length;
  if (completedSessions === 0) {
    return insufficientDataset('demand', DEMAND_FEATURE_NAMES, 'no-dataset');
  }

  const locationKey = Number.parseInt(anonymizeLocation(location).slice(0, 8), 16) % 1000;

  // Capacity: the largest venue capacity observed (a stable per-location attribute).
  let capacity = 0;
  for (const s of sessions) {
    if (s.maxPlayers > capacity) capacity = s.maxPlayers;
  }

  // Count sessions per UTC day.
  const perDay = new Map<string, number>();
  let first = sessions[0].scheduledAt;
  let last = sessions[0].scheduledAt;
  for (const s of sessions) {
    const key = dayKeyUtc(s.scheduledAt);
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
    if (s.scheduledAt < first) first = s.scheduledAt;
    if (s.scheduledAt > last) last = s.scheduledAt;
  }

  // Dense daily series across the observed window (zero-session days included
  // so the target is a genuine time series, not an inflated per-session series).
  const startMs = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate());
  const endMs = Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate());
  const dayCount = Math.floor((endMs - startMs) / DAY_MS) + 1;

  const dailyCounts: { date: Date; count: number }[] = [];
  for (let i = 0; i < dayCount; i += 1) {
    const d = new Date(startMs + i * DAY_MS);
    dailyCounts.push({ date: d, count: perDay.get(dayKeyUtc(d)) ?? 0 });
  }

  // Rolling 4-week (28-day) session count, inclusive of the current day.
  const rollingWindow = 28;
  const rows: FeatureRow[] = [];
  const X: number[][] = [];
  const y: number[] = [];
  const order: number[] = [];
  let runningSum = 0;
  const rolling: number[] = [];
  for (let i = 0; i < dailyCounts.length; i += 1) {
    runningSum += dailyCounts[i].count;
    if (i - rollingWindow >= 0) runningSum -= dailyCounts[i - rollingWindow].count;
    rolling[i] = runningSum;
  }
  for (let i = 0; i < dailyCounts.length; i += 1) {
    const row = makeDemandFeatureRow(dailyCounts[i].date, capacity, rolling[i], locationKey);
    rows.push(row);
    X.push(DEMAND_FEATURE_NAMES.map((n) => row[n]));
    y.push(dailyCounts[i].count);
    order.push(dailyCounts[i].date.getTime());
  }

  const featureSpec = buildFeatureSpec(DEMAND_FEATURE_NAMES, X);
  const descriptor = makeDescriptor('demand', featureSpec, rows.length, first, last, {});

  const expectedHoldout = Math.round(rows.length * DEMAND_HOLDOUT_RATIO);
  const belowGate =
    completedSessions < MIN_SAMPLES.demand || expectedHoldout < DEMAND_MIN_HOLDOUT_ROWS;

  return {
    type: 'demand',
    X,
    y,
    order,
    rows,
    featureSpec,
    descriptor,
    insufficient: belowGate,
    ...(belowGate ? { reason: 'insufficient-samples' as const } : {}),
  };
}

/** One participation observation used to build churn features. */
interface Participation {
  identity: string;
  scheduledAt: Date;
}

/** Aggregate participation history for a single platform identity. */
interface IdentityHistory {
  /** Weekly-normalized session count. */
  sessionsAttended: number;
  firstDate: Date;
  lastDate: Date;
  /** Consecutive-day gaps between observations (ascending). */
  gaps: number[];
}

/**
 * Resolve the platform identity of a participation row.
 *
 * `sessionId` is required on `MvpPlayer`, so a row is one session's
 * participation — **not** a person. Identity is `userId` when present (it links
 * to a `User`), else `deviceId`. Returns `null` when neither exists (such a row
 * cannot be attributed and is dropped).
 */
export function resolveIdentity(row: { userId?: string | null; deviceId?: string | null }): string | null {
  if (row.userId != null && row.userId !== '') return `u:${row.userId}`;
  if (row.deviceId != null && row.deviceId !== '') return `d:${row.deviceId}`;
  return null;
}

/**
 * Collapse raw participation rows into one history per identity.
 *
 * @param rows Participation rows (identity + date).
 * @returns A map identity → history, sorted by identity key for determinism.
 */
export function groupParticipation(rows: Participation[]): Map<string, IdentityHistory> {
  const byIdentity = new Map<string, Date[]>();
  for (const r of rows) {
    const bucket = byIdentity.get(r.identity);
    if (bucket) bucket.push(r.scheduledAt);
    else byIdentity.set(r.identity, [r.scheduledAt]);
  }

  const out = new Map<string, IdentityHistory>();
  const keys = Array.from(byIdentity.keys()).sort();
  for (const key of keys) {
    const dates = (byIdentity.get(key) ?? []).slice().sort((a, b) => a.getTime() - b.getTime());
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i += 1) {
      gaps.push((dates[i].getTime() - dates[i - 1].getTime()) / DAY_MS);
    }
    out.set(key, {
      sessionsAttended: dates.length,
      firstDate: dates[0],
      lastDate: dates[dates.length - 1],
      gaps,
    });
  }
  return out;
}

/**
 * The closed observation date: `max(scheduledAt)` over the whole filtered
 * dataset. Deliberately **not** `Date.now()`, so labels are reproducible and
 * the evaluation window has no lookahead (design §12).
 */
export function computeLastObservedDate(rows: Participation[]): Date | null {
  let max: Date | null = null;
  for (const r of rows) {
    if (max === null || r.scheduledAt.getTime() > max.getTime()) max = r.scheduledAt;
  }
  return max;
}

/** Build the numeric churn feature row for one identity's history. */
export function churnFeatures(
  history: IdentityHistory,
  lastObserved: Date
): FeatureRow {
  const daysSinceLastParticipation =
    (lastObserved.getTime() - history.lastDate.getTime()) / DAY_MS;
  const observedSpanDays =
    (history.lastDate.getTime() - history.firstDate.getTime()) / DAY_MS;
  const tenureDays = (lastObserved.getTime() - history.firstDate.getTime()) / DAY_MS;
  const sessionsPer30d =
    tenureDays > 0 ? history.sessionsAttended / (tenureDays / 30) : history.sessionsAttended;
  const meanGapDays =
    history.gaps.length > 0
      ? history.gaps.reduce((a, b) => a + b, 0) / history.gaps.length
      : 0;
  return toFeatureRow(
    {
      daysSinceLastParticipation,
      sessionsAttended: history.sessionsAttended,
      tenureDays,
      sessionsPer30d,
      meanGapDays,
      observedSpanDays,
    },
    CHURN_FEATURE_NAMES
  );
}

/** Read non-cancelled participation rows (identity resolved, PII dropped). */
async function loadParticipation(): Promise<Participation[]> {
  const players = (await prisma.mvpPlayer.findMany({
    where: { session: { status: { not: 'CANCELLED' } } },
    select: {
      userId: true,
      deviceId: true,
      session: { select: { scheduledAt: true } },
    },
  })) as unknown as {
    userId: string | null;
    deviceId: string | null;
    session: { scheduledAt: Date } | null;
  }[];

  const out: Participation[] = [];
  for (const p of players) {
    const identity = resolveIdentity(p);
    if (identity === null || p.session == null) continue;
    out.push({ identity, scheduledAt: p.session.scheduledAt });
  }
  return out;
}

/**
 * Churn dataset (classification), one row per platform identity.
 *
 * Gate (design §1 D2.3): ≥ 60 distinct identities, ≥ 10 positives, and ≥ 3
 * observations each — otherwise `insufficient` (the demo collapses to ~1–2
 * identities, so this correctly returns a fallback).
 */
export async function buildChurnDataset(): Promise<Dataset> {
  const participation = await loadParticipation();
  const lastObserved = computeLastObservedDate(participation);
  if (lastObserved === null) {
    return insufficientDataset('churn', CHURN_FEATURE_NAMES, 'no-dataset');
  }

  const histories = groupParticipation(participation);
  const windowMs = CHURN_WINDOW_DAYS * DAY_MS;

  const rows: FeatureRow[] = [];
  const X: number[][] = [];
  const y: number[] = [];
  const order: number[] = [];
  let positives = 0;

  for (const [, history] of histories) {
    // Each identity must have enough observations to be informative.
    if (history.sessionsAttended < MIN_IDENTITY_OBSERVATIONS) continue;

    const gapDays = lastObserved.getTime() - history.lastDate.getTime();
    const label = gapDays > windowMs ? 1 : 0;
    const row = churnFeatures(history, lastObserved);
    rows.push(row);
    X.push(CHURN_FEATURE_NAMES.map((n) => row[n]));
    y.push(label);
    order.push(history.lastDate.getTime());
    if (label === 1) positives += 1;
  }

  const classBalance: ClassBalance = {
    positive: positives,
    negative: rows.length - positives,
  };
  const featureSpec = buildFeatureSpec(CHURN_FEATURE_NAMES, X);
  let windowFrom: Date | null = null;
  let windowTo: Date | null = null;
  for (const r of participation) {
    if (windowFrom === null || r.scheduledAt < windowFrom) windowFrom = r.scheduledAt;
    if (windowTo === null || r.scheduledAt > windowTo) windowTo = r.scheduledAt;
  }
  const descriptor = makeDescriptor('churn', featureSpec, rows.length, windowFrom, windowTo, classBalance);

  const belowGate =
    rows.length < MIN_SAMPLES.churn || positives < MIN_CHURN_POSITIVES;

  return {
    type: 'churn',
    X,
    y,
    order,
    rows,
    featureSpec,
    descriptor,
    insufficient: belowGate,
    ...(belowGate ? { reason: 'insufficient-samples' as const } : {}),
  };
}

/** One populated month bucket (seasonal). */
export interface SeasonalBucket {
  /** `YYYY-MM` (anonymized of any location, kept for the descriptor only). */
  key: string;
  /** 1–12. */
  month: number;
  /** Completed session count. */
  count: number;
  /** Monotonic month index (months since 1970) for the trend regressor. */
  index: number;
}

/**
 * Read populated month buckets from `mvp_sessions` (status = COMPLETED).
 *
 * A bucket is "populated" when it contains ≥ 1 completed session. Empty
 * calendar months are **not** invented (design §1 D2.1) — they do not count
 * toward the ≥ 12 gate.
 */
export async function readSeasonalBuckets(): Promise<SeasonalBucket[]> {
  const sessions = (await prisma.mvpSession.findMany({
    where: { status: 'COMPLETED' },
    select: { scheduledAt: true },
  })) as unknown as { scheduledAt: Date }[];

  const counts = new Map<string, number>();
  for (const s of sessions) {
    const key = monthKeyUtc(s.scheduledAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const keys = Array.from(counts.keys()).sort();
  return keys.map((key) => {
    const [yStr, mStr] = key.split('-');
    const year = Number.parseInt(yStr, 10);
    const month = Number.parseInt(mStr, 10);
    return {
      key,
      month,
      count: counts.get(key) ?? 0,
      index: year * 12 + (month - 1),
    };
  });
}

/**
 * Seasonal dataset (time series), one row per populated month bucket.
 *
 * Gate: ≥ 12 populated buckets (months with ≥ 1 completed session).
 */
export async function buildSeasonalDataset(): Promise<Dataset> {
  const buckets = await readSeasonalBuckets();
  if (buckets.length === 0) {
    return insufficientDataset('seasonal', SEASONAL_FEATURE_NAMES, 'no-dataset');
  }

  const rows: FeatureRow[] = [];
  const X: number[][] = [];
  const y: number[] = [];
  const order: number[] = [];
  for (const b of buckets) {
    const angle = ((b.month - 1) / 12) * 2 * Math.PI;
    const row = toFeatureRow(
      {
        trendIndex: b.index,
        monthSin: Math.sin(angle),
        monthCos: Math.cos(angle),
      },
      SEASONAL_FEATURE_NAMES
    );
    rows.push(row);
    X.push(SEASONAL_FEATURE_NAMES.map((n) => row[n]));
    y.push(b.count);
    order.push(b.index);
  }

  const featureSpec = buildFeatureSpec(SEASONAL_FEATURE_NAMES, X);
  const windowFrom = new Date(buckets[0].index * 30 * DAY_MS);
  const windowTo = new Date(buckets[buckets.length - 1].index * 30 * DAY_MS);
  const descriptor = makeDescriptor(
    'seasonal',
    featureSpec,
    buckets.length,
    windowFrom,
    windowTo,
    {}
  );

  const belowGate = buckets.length < SEASONAL_MIN_POPULATED_MONTHS;
  return {
    type: 'seasonal',
    X,
    y,
    order,
    rows,
    featureSpec,
    descriptor,
    insufficient: belowGate,
    ...(belowGate ? { reason: 'insufficient-samples' as const } : {}),
  };
}

/**
 * Build the churn feature row for one player id.
 *
 * The id is used only to *locate* a participation row; the identity — and hence
 * the whole history — is derived via `COALESCE(userId, deviceId)`. Returns
 * `null` when the player does not exist or has no resolvable identity.
 */
export async function buildChurnRowForPlayer(playerId: string): Promise<FeatureRow | null> {
  const player = (await prisma.mvpPlayer.findUnique({
    where: { id: playerId },
    select: { userId: true, deviceId: true },
  })) as unknown as { userId: string | null; deviceId: string | null } | null;
  if (!player) return null;

  const identity = resolveIdentity(player);
  if (identity === null) return null;

  const participation = await loadParticipation();
  const lastObserved = computeLastObservedDate(participation);
  if (lastObserved === null) return null;

  const histories = groupParticipation(participation);
  const history = histories.get(identity);
  if (!history) return null;
  return churnFeatures(history, lastObserved);
}
