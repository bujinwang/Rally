/**
 * Story 6.6 (T05a) — Feature pipeline: identity dedupe, populated-bucket rule,
 * and anonymization as committed tests.
 *
 * Covers design §6 behaviour #7b (identity dedupe + `LEFT` is not a churn
 * signal), #7c (a 0-session month does not count toward the ≥12 gate) and #10
 * (no key matching `/name|deviceId|userId|email|playerId/i` in feature rows or
 * the descriptor).
 */

jest.mock('../../../config/database', () => ({
  prisma: { mvpSession: { findMany: jest.fn(), findFirst: jest.fn() }, mvpPlayer: { findMany: jest.fn(), findUnique: jest.fn() } },
}));

import { prisma } from '../../../config/database';
import {
  anonymizeLocation,
  buildChurnDataset,
  buildDemandDataset,
  buildSeasonalDataset,
  churnFeatures,
  computeLastObservedDate,
  groupParticipation,
  makeDemandFeatureRow,
  resolveIdentity,
  toFeatureRow,
  readSeasonalBuckets,
} from '../features';
import { DEMAND_FEATURE_NAMES, CHURN_FEATURE_NAMES } from '../features';
import { CHURN_WINDOW_DAYS, SEASONAL_MIN_POPULATED_MONTHS } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;
const mvpSession = prisma.mvpSession as unknown as { findMany: jest.Mock; findFirst: jest.Mock };
const mvpPlayer = prisma.mvpPlayer as unknown as { findMany: jest.Mock; findUnique: jest.Mock };

afterEach(() => jest.clearAllMocks());

/**
 * The forbidden-key pattern from design §6 #10 — kept as the design's literal
 * substring regex so it still catches *substring* PII fields added later
 * (`playerName`, `userName`, `firstName`, `lastName`, `deviceIdSuffix`,
 * `userIds`, `emails`, `myEmail`, …).
 *
 * The literal pattern also matches the descriptor's legitimate structural
 * `FeatureSpec.names` key (the substring `name` in `names`), which the design's
 * own data model requires (`ml/types.ts`). Rather than weaken the pattern, we
 * keep it verbatim and exempt only that one known-legitimate key via an explicit
 * allowlist below — so the guard stays strict for every other key.
 */
const PII_KEY = /name|deviceId|userId|email|playerId/i;

/** Known-legitimate structural keys that must not trip the PII guard. */
const ALLOWED_KEYS = new Set<string>(['names']);

/** Assert a key is PII-free, unless it is an allowlisted structural key. */
function expectNoPiiKey(key: string): void {
  if (ALLOWED_KEYS.has(key)) return;
  expect(key).not.toMatch(PII_KEY);
}

/**
 * Strip allowlisted structural keys from a serialized object *before* matching,
 * so the serialized-JSON checks can still catch PII smuggled into **values**
 * (e.g. a device string in a feature value) without false-positiving on the
 * legitimate `names` schema-label key.
 */
function stripAllowlistedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripAllowlistedKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (ALLOWED_KEYS.has(k)) continue;
      out[k] = stripAllowlistedKeys(v);
    }
    return out;
  }
  return value;
}

describe('Story 6.6 — resolveIdentity (#7b)', () => {
  it('prefers userId, falls back to deviceId, else null', () => {
    expect(resolveIdentity({ userId: 'u1', deviceId: 'd1' })).toBe('u:u1');
    expect(resolveIdentity({ userId: null, deviceId: 'd1' })).toBe('d:d1');
    expect(resolveIdentity({ userId: '', deviceId: 'd1' })).toBe('d:d1');
    expect(resolveIdentity({ userId: null, deviceId: null })).toBeNull();
    expect(resolveIdentity({})).toBeNull();
  });
});

describe('Story 6.6 — groupParticipation + label (#7b)', () => {
  it('collapses multiple rows sharing a deviceId into one identity', () => {
    const rows = [
      { identity: 'd:abc', scheduledAt: new Date('2026-01-01T00:00:00Z') },
      { identity: 'd:abc', scheduledAt: new Date('2026-01-08T00:00:00Z') },
      { identity: 'd:abc', scheduledAt: new Date('2026-01-15T00:00:00Z') },
      { identity: 'd:xyz', scheduledAt: new Date('2026-01-02T00:00:00Z') },
    ];
    const histories = groupParticipation(rows);
    expect(histories.size).toBe(2);
    expect(histories.get('d:abc')?.sessionsAttended).toBe(3);
    expect(histories.get('d:xyz')?.sessionsAttended).toBe(1);
  });

  it('computes the closed observation date as max(scheduledAt), not Date.now()', () => {
    const rows = [
      { identity: 'a', scheduledAt: new Date('2025-01-01T00:00:00Z') },
      { identity: 'b', scheduledAt: new Date('2026-03-10T00:00:00Z') },
      { identity: 'c', scheduledAt: new Date('2024-06-01T00:00:00Z') },
    ];
    expect(computeLastObservedDate(rows)?.toISOString()).toBe('2026-03-10T00:00:00.000Z');
    expect(computeLastObservedDate([])).toBeNull();
  });

  it('labels an identity churned when it has no participation inside the 60-day window', () => {
    const lastObserved = new Date('2026-06-01T00:00:00Z');
    const stale = groupParticipation([
      { identity: 'x', scheduledAt: new Date('2026-01-01T00:00:00Z') },
      { identity: 'x', scheduledAt: new Date('2026-01-05T00:00:00Z') },
      { identity: 'x', scheduledAt: new Date('2026-01-10T00:00:00Z') },
    ]).get('x')!;
    const active = groupParticipation([
      { identity: 'y', scheduledAt: new Date('2026-05-01T00:00:00Z') },
      { identity: 'y', scheduledAt: new Date('2026-05-15T00:00:00Z') },
      { identity: 'y', scheduledAt: new Date('2026-05-30T00:00:00Z') },
    ]).get('y')!;

    const featsStale = churnFeatures(stale, lastObserved);
    const featsActive = churnFeatures(active, lastObserved);
    // Stale: last participation 2026-01-10 → >60 days before observation.
    expect(featsStale.daysSinceLastParticipation).toBeGreaterThan(CHURN_WINDOW_DAYS);
    expect(featsActive.daysSinceLastParticipation).toBeLessThanOrEqual(CHURN_WINDOW_DAYS);
  });
});

describe('Story 6.6 — buildChurnDataset (#2, #7b)', () => {
  /**
   * Build `count` identities, each with `sessions` participations on a device.
   * `churnedCount` of them last participated >60 days before the newest date.
   */
  function playerRows(count: number, sessions: number, churnedCount: number) {
    const rows: { userId: string | null; deviceId: string; session: { scheduledAt: Date } }[] = [];
    const newest = new Date('2026-06-01T00:00:00Z');
    for (let i = 0; i < count; i += 1) {
      const churned = i < churnedCount;
      for (let s = 0; s < sessions; s += 1) {
        const base = churned ? Date.parse('2026-01-01T00:00:00Z') : Date.parse('2026-05-01T00:00:00Z');
        rows.push({
          userId: null,
          deviceId: `device-${i}`,
          session: { scheduledAt: new Date(base + s * 3 * DAY_MS) },
        });
      }
    }
    void newest;
    return rows;
  }

  it('marks the dataset insufficient below the 60-identity gate', async () => {
    mvpPlayer.findMany.mockResolvedValue(playerRows(10, 4, 5));
    const dataset = await buildChurnDataset();
    expect(dataset.insufficient).toBe(true);
    expect(dataset.reason).toBe('insufficient-samples');
    expect(dataset.descriptor.rowCount).toBe(10);
  });

  it('is viable at ≥60 identities with ≥10 positives and ≥3 observations each', async () => {
    mvpPlayer.findMany.mockResolvedValue(playerRows(70, 4, 20));
    const dataset = await buildChurnDataset();
    expect(dataset.insufficient).toBe(false);
    expect(dataset.X.length).toBe(70);
    expect(dataset.y.reduce((a, b) => a + b, 0)).toBe(20);
    expect(dataset.descriptor.classBalance).toEqual({ positive: 20, negative: 50 });
  });

  it('drops identities with fewer than 3 observations', async () => {
    mvpPlayer.findMany.mockResolvedValue(playerRows(70, 2, 20)); // only 2 obs each
    const dataset = await buildChurnDataset();
    expect(dataset.X.length).toBe(0);
    expect(dataset.insufficient).toBe(true);
  });

  it('does not treat a lone LEFT status as a churn signal (recency governs)', async () => {
    // The feature builder never reads `status`; identities differ only by recency.
    // Identities are emitted in sorted key order, so name them to make the
    // expected label vector explicit: 1-recent, 2-lapsed, 3-anchor.
    mvpPlayer.findMany.mockResolvedValue([
      // recently active, 3 observations → not churned
      { userId: null, deviceId: '1-recent', session: { scheduledAt: new Date('2026-05-01T00:00:00Z') } },
      { userId: null, deviceId: '1-recent', session: { scheduledAt: new Date('2026-05-10T00:00:00Z') } },
      { userId: null, deviceId: '1-recent', session: { scheduledAt: new Date('2026-05-20T00:00:00Z') } },
      // long lapsed, 3 observations → churned
      { userId: null, deviceId: '2-lapsed', session: { scheduledAt: new Date('2025-11-01T00:00:00Z') } },
      { userId: null, deviceId: '2-lapsed', session: { scheduledAt: new Date('2025-11-10T00:00:00Z') } },
      { userId: null, deviceId: '2-lapsed', session: { scheduledAt: new Date('2025-11-20T00:00:00Z') } },
      // anchors the closed observation window at 2026-06-01 → not churned
      { userId: null, deviceId: '3-anchor', session: { scheduledAt: new Date('2026-05-01T00:00:00Z') } },
      { userId: null, deviceId: '3-anchor', session: { scheduledAt: new Date('2026-05-15T00:00:00Z') } },
      { userId: null, deviceId: '3-anchor', session: { scheduledAt: new Date('2026-06-01T00:00:00Z') } },
    ]);
    const dataset = await buildChurnDataset();
    // Sorted identity order: 1-recent, 2-lapsed, 3-anchor → [0, 1, 0].
    expect(dataset.y).toEqual([0, 1, 0]);
    expect(dataset.y.reduce((a, b) => a + b, 0)).toBe(1);
  });
});

describe('Story 6.6 — buildDemandDataset', () => {
  it('reads mvpSession (not the legacy empty sessions table) and gates at 40', async () => {
    const sessions = Array.from({ length: 45 }, (_, i) => ({
      scheduledAt: new Date(Date.parse('2026-01-01T00:00:00Z') + i * 7 * DAY_MS),
      maxPlayers: 20,
      location: 'Venue A',
    }));
    mvpSession.findMany.mockResolvedValue(sessions);

    const dataset = await buildDemandDataset('Venue A');
    expect(mvpSession.findMany).toHaveBeenCalledTimes(1);
    expect(dataset.insufficient).toBe(false);
    expect(dataset.X.length).toBeGreaterThanOrEqual(45);
    expect(dataset.featureSpec.names).toEqual(DEMAND_FEATURE_NAMES);
  });

  it('returns insufficient for a venue with no completed sessions', async () => {
    mvpSession.findMany.mockResolvedValue([]);
    const dataset = await buildDemandDataset('Nowhere');
    expect(dataset.insufficient).toBe(true);
    expect(dataset.reason).toBe('no-dataset');
  });

  it('fails the gate below 40 completed sessions', async () => {
    const sessions = Array.from({ length: 30 }, (_, i) => ({
      scheduledAt: new Date(Date.parse('2026-01-01T00:00:00Z') + i * 7 * DAY_MS),
      maxPlayers: 20,
      location: 'Venue B',
    }));
    mvpSession.findMany.mockResolvedValue(sessions);
    const dataset = await buildDemandDataset('Venue B');
    expect(dataset.insufficient).toBe(true);
  });
});

describe('Story 6.6 — seasonal populated-bucket rule (#7c)', () => {
  it('counts only months with ≥1 completed session', async () => {
    // Two populated months plus a large gap => still 2 buckets.
    mvpSession.findMany.mockResolvedValue([
      { scheduledAt: new Date('2026-01-05T00:00:00Z') },
      { scheduledAt: new Date('2026-01-20T00:00:00Z') },
      { scheduledAt: new Date('2026-05-03T00:00:00Z') },
    ]);
    const buckets = await readSeasonalBuckets();
    expect(buckets.map((b) => b.key)).toEqual(['2026-01', '2026-05']);
    expect(buckets.map((b) => b.count)).toEqual([2, 1]);
  });

  it('fails the gate below 12 populated months', async () => {
    mvpSession.findMany.mockResolvedValue([
      { scheduledAt: new Date('2026-01-05T00:00:00Z') },
      { scheduledAt: new Date('2026-02-05T00:00:00Z') },
    ]);
    const dataset = await buildSeasonalDataset();
    expect(dataset.insufficient).toBe(true);
    expect(dataset.reason).toBe('insufficient-samples');
  });

  it('is viable at exactly 12 populated months', async () => {
    const sessions = Array.from({ length: 12 }, (_, i) => ({
      scheduledAt: new Date(Date.UTC(2025, i, 10)),
    }));
    mvpSession.findMany.mockResolvedValue(sessions);
    const dataset = await buildSeasonalDataset();
    expect(dataset.X.length).toBe(SEASONAL_MIN_POPULATED_MONTHS);
    expect(dataset.insufficient).toBe(false);
  });

  it('does not invent empty calendar months', async () => {
    // A year with sessions only in Jan, Mar, Dec ⇒ 3 populated buckets.
    mvpSession.findMany.mockResolvedValue([
      { scheduledAt: new Date('2026-01-10T00:00:00Z') },
      { scheduledAt: new Date('2026-03-10T00:00:00Z') },
      { scheduledAt: new Date('2026-12-10T00:00:00Z') },
    ]);
    const buckets = await readSeasonalBuckets();
    expect(buckets.length).toBe(3);
  });
});

describe('Story 6.6 — anonymization (#10)', () => {
  it('anonymizeLocation returns a stable SHA-1 digest', () => {
    const a = anonymizeLocation('Community Center, Main St');
    const b = anonymizeLocation('Community Center, Main St');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{40}$/);
    expect(a).not.toContain('Community');
  });

  it('toFeatureRow whitelists only the declared feature names', () => {
    const row = toFeatureRow(
      { a: 1, b: 2, name: 'Alice', deviceId: 'dev', userId: 'u', email: 'x@y.z', playerId: 'p' },
      ['a', 'b']
    );
    expect(Object.keys(row).sort()).toEqual(['a', 'b']);
    expect(JSON.stringify(stripAllowlistedKeys(row))).not.toMatch(PII_KEY);
  });

  it('toFeatureRow throws on a missing or non-numeric value', () => {
    expect(() => toFeatureRow({ a: 1 }, ['a', 'b'])).toThrow(RangeError);
    expect(() => toFeatureRow({ a: 'nope' }, ['a'])).toThrow(RangeError);
  });

  it('demand feature rows contain no PII keys', () => {
    const row = makeDemandFeatureRow(new Date('2026-06-01T00:00:00Z'), 20, 8, 123);
    for (const key of Object.keys(row)) expectNoPiiKey(key);
    expect(Object.keys(row)).toEqual(expect.arrayContaining(DEMAND_FEATURE_NAMES));
  });

  it('churn feature rows and the churn descriptor contain no PII keys', async () => {
    mvpPlayer.findMany.mockResolvedValue([
      { userId: 'u1', deviceId: 'secret-device', session: { scheduledAt: new Date('2026-05-01T00:00:00Z') } },
      { userId: 'u1', deviceId: 'secret-device', session: { scheduledAt: new Date('2026-05-10T00:00:00Z') } },
      { userId: 'u1', deviceId: 'secret-device', session: { scheduledAt: new Date('2026-05-20T00:00:00Z') } },
    ]);
    const dataset = await buildChurnDataset();

    for (const row of dataset.rows) {
      for (const key of Object.keys(row)) expectNoPiiKey(key);
    }
    // The serialized descriptor must not leak the identity or device **value**.
    // Strip the allowlisted structural key first, then match the raw JSON so a
    // device/email smuggled into a value is still caught.
    const serialized = JSON.stringify(stripAllowlistedKeys(dataset.descriptor));
    expect(serialized).not.toMatch(PII_KEY);
    expect(serialized).not.toContain('secret-device');
    // Feature names are pure numeric-feature labels.
    for (const name of dataset.featureSpec.names) expect(CHURN_FEATURE_NAMES).toContain(name);
  });

  describe('the PII guard itself is not silently weakened (§6 #10)', () => {
    it('still catches substring PII field names the allowlist does not exempt', () => {
      // These are the natural names for PII fields added later; an over-eager
      // refinement (e.g. word-boundary anchoring) would miss all of them.
      for (const key of [
        'playerName',
        'userName',
        'firstName',
        'lastName',
        'deviceIdSuffix',
        'userIds',
        'emails',
        'myEmail',
      ]) {
        expect(PII_KEY.test(key)).toBe(true);
      }
    });

    it('still catches an exact PII field name', () => {
      for (const key of ['name', 'deviceId', 'userId', 'email', 'playerId']) {
        expect(PII_KEY.test(key)).toBe(true);
      }
    });

    it('exempts only the known-legitimate structural key', () => {
      expect(PII_KEY.test('names')).toBe(true); // the literal pattern would flag it…
      expect(ALLOWED_KEYS.has('names')).toBe(true); // …so the allowlist must exempt it
      expectNoPiiKey('names'); // does not throw
      // Any other key containing "name" is still rejected by the guard.
      expect(() => expectNoPiiKey('displayName')).toThrow();
      expect(() => expectNoPiiKey('deviceIdSuffix')).toThrow();
    });

    it('catches PII smuggled into a value after allowlisted keys are stripped', () => {
      // A nested PII key (the realistic leak vector) survives stripping and is
      // still detected by the literal pattern.
      const descriptor = {
        names: ['a', 'b'],
        windowFrom: '2026-01-01',
        meta: { deviceId: 'abc-123' },
        note: 'userEmail captured here',
      };
      const serialized = JSON.stringify(stripAllowlistedKeys(descriptor));
      // The allowlisted structural key is gone…
      expect(serialized).not.toContain('"names"');
      // …but the smuggled nested key and value are still caught.
      expect(serialized).toMatch(PII_KEY);
      expect(PII_KEY.test(serialized)).toBe(true);
    });
  });
});
