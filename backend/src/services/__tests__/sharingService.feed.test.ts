/**
 * Story 6.8 — T01: community feed hardening.
 *
 * These are **real** behavioural assertions (unlike the legacy
 * `social-components.test.tsx` / `sharing.test.ts` "spec objects", which assert
 * nothing). The mocked Prisma client is not a rubber stamp: it *evaluates the
 * exact `where` the service builds* against an in-memory dataset, so a wrong
 * privacy predicate or a wrong `total` produces a failing assertion rather than
 * a passing mock.
 *
 * The load-bearing test is:
 *   `getCommunityFeed › per-type privacy (P0) › excludes a 'match' share whose
 *    sharer set stats_share='private' (and session_share='public')`
 * — that is the single proof that the P0 privacy leak is fixed.
 */

type JsonRecord = Record<string, any>;

interface FixtureShare {
  id: string;
  type: 'session' | 'match' | 'achievement';
  entityId: string;
  sharerId: string;
  platform: string;
  url: string;
  message: string | null;
  createdAt: Date;
  sharer: { id: string; name: string; privacySettings: JsonRecord | null };
}

// ── In-memory "database" ─────────────────────────────────────────────────────

function makeShare(
  id: string,
  type: FixtureShare['type'],
  createdAtIso: string,
  privacySettings: JsonRecord | null,
): FixtureShare {
  return {
    id,
    type,
    entityId: `entity-${id}`,
    sharerId: `sharer-${id}`,
    platform: 'copy_link',
    url: `https://badminton-group.com/share/${type}/${id}`,
    message: null,
    createdAt: new Date(createdAtIso),
    sharer: { id: `sharer-${id}`, name: `Sharer ${id}`, privacySettings },
  };
}

/**
 * 5 visible shares (newest → oldest) + 3 shares that MUST be hidden.
 *
 * Note the hidden rows deliberately carry a *public* value for the privacy key
 * the old single-key filter consulted (`session_share`) — that is precisely the
 * leak: the old query would have returned them.
 */
const DATASET: FixtureShare[] = [
  // ── must be HIDDEN ──
  makeShare('h-session', 'session', '2026-01-10T00:00:00Z', {
    session_share: 'private',
  }),
  makeShare('h-match', 'match', '2026-01-09T00:00:00Z', {
    session_share: 'public', // ← old filter key; would have leaked this row
    stats_share: 'private',
  }),
  makeShare('h-achievement', 'achievement', '2026-01-08T00:00:00Z', {
    session_share: 'public',
    stats_share: 'public',
    achievements_share: 'private',
  }),

  // ── must be VISIBLE ──
  makeShare('v-session-1', 'session', '2026-01-06T00:00:00Z', { session_share: 'public' }),
  makeShare('v-match-1', 'match', '2026-01-05T00:00:00Z', { stats_share: 'public' }),
  makeShare('v-achievement-1', 'achievement', '2026-01-04T00:00:00Z', { achievements_share: 'public' }),
  makeShare('v-session-2', 'session', '2026-01-03T00:00:00Z', { session_share: 'friends' }),
  makeShare('v-match-2', 'match', '2026-01-02T00:00:00Z', { stats_share: 'friends' }),
];

const VISIBLE_IDS = DATASET.filter((s) => s.id.startsWith('v-')).map((s) => s.id);
const HIDDEN_IDS = DATASET.filter((s) => s.id.startsWith('h-')).map((s) => s.id);
const TOTAL_VISIBLE = VISIBLE_IDS.length; // 5

// ── A tiny evaluator for the Prisma `where` shapes the service emits ──────────

/** Prisma's JSON-null sentinels, as exported by the mocked `@prisma/client`. */
const mockDbNull = { __prismaNullKind: 'DbNull' };
const mockJsonNull = { __prismaNullKind: 'JsonNull' };
const mockAnyNull = { __prismaNullKind: 'AnyNull' };

function isPrismaNull(value: any): boolean {
  return !!value && typeof value === 'object' && typeof value.__prismaNullKind === 'string';
}

function matchScalar(value: any, condition: any): boolean {
  if (condition === null || typeof condition !== 'object' || condition instanceof Date) {
    return value === condition;
  }
  if ('lt' in condition) return value < condition.lt;
  if ('lte' in condition) return value <= condition.lte;
  if ('gt' in condition) return value > condition.gt;
  if ('gte' in condition) return value >= condition.gte;
  if ('not' in condition) return value !== condition.not;
  if ('equals' in condition) return value === condition.equals;
  return true;
}

/**
 * Evaluate a `sharer` relation filter the way PostgreSQL would.
 *
 * The crucial detail: Prisma compiles `{ path:[key], not: value }` to
 * `<key> <> value` (true only when the key is PRESENT and differs), and
 * `{ path:[key], equals: Prisma.DbNull }` to `<key> IS NULL` (true when the key
 * — or the whole object — is absent). Modelling both faithfully is what lets a
 * wrong predicate fail these tests.
 */
function matchesSharer(sharer: FixtureShare['sharer'], condition: JsonRecord): boolean {
  if (Array.isArray(condition.OR)) {
    return (condition.OR as JsonRecord[]).some((sub) => matchesSharer(sharer, sub));
  }
  if (Array.isArray(condition.AND)) {
    return (condition.AND as JsonRecord[]).every((sub) => matchesSharer(sharer, sub));
  }

  const ps = condition.privacySettings;
  if (ps && Array.isArray(ps.path)) {
    const settings = sharer.privacySettings;
    const key = ps.path[0];
    const present =
      settings != null && Object.prototype.hasOwnProperty.call(settings, key);
    const actual = present ? (settings as JsonRecord)[key] : undefined;

    if ('not' in ps) return present && actual !== ps.not; // `<key> <> value`
    if ('equals' in ps) {
      if (isPrismaNull(ps.equals)) return !present; // `<key> IS NULL`
      return present && actual === ps.equals;
    }
  }
  return true;
}

function matchesWhere(row: FixtureShare, where: JsonRecord): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') {
      return (condition as JsonRecord[]).some((branch) => matchesWhere(row, branch));
    }
    if (key === 'AND') {
      return (condition as JsonRecord[]).every((branch) => matchesWhere(row, branch));
    }
    if (key === 'type') return row.type === condition;
    if (key === 'id') return matchScalar(row.id, condition);
    if (key === 'createdAt') return matchScalar(row.createdAt, condition);
    if (key === 'sharer') return matchesSharer(row.sharer, condition as JsonRecord);
    return true;
  });
}

function applyWhere(rows: FixtureShare[], where?: JsonRecord): FixtureShare[] {
  if (!where) return rows.slice();
  return rows.filter((row) => matchesWhere(row, where));
}

function orderAndWindow(rows: FixtureShare[], args: JsonRecord): FixtureShare[] {
  const ordered = rows.slice().sort((a, b) => {
    const byDate = b.createdAt.getTime() - a.createdAt.getTime();
    if (byDate !== 0) return byDate;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0; // id DESC
  });

  let windowed = ordered;
  if (typeof args.skip === 'number' && args.skip > 0) {
    windowed = windowed.slice(args.skip);
  }
  if (typeof args.take === 'number') {
    windowed = windowed.slice(0, args.take);
  }
  return windowed;
}

// ── Mock the Prisma client the service constructs at import time ──────────────
// (Same proven pattern as `achievementService.test.ts`: the `mock*`-prefixed
// consts are in scope when the `@prisma/client` factory runs.)

const mockShareFindMany = jest.fn();
const mockShareCount = jest.fn();
const mockSessionFindMany = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    share: { findMany: mockShareFindMany, count: mockShareCount },
    mvpSession: { findMany: mockSessionFindMany },
  })),
  // The service builds its JSON-null predicate with `Prisma.DbNull`; the mock
  // must expose the sentinels or `Prisma.DbNull` would be `undefined`.
  Prisma: { DbNull: mockDbNull, JsonNull: mockJsonNull, AnyNull: mockAnyNull },
}));

import { sharingService } from '../sharingService';
import { decodeCursor } from '../../utils/feedCursor';

const feedPage = (limit: number, cursor?: string, offset = 0) =>
  sharingService.getCommunityFeed(undefined, limit, offset, cursor);

const idsOf = (page: { shares: Array<{ id: string }> }) => page.shares.map((s) => s.id);

/** Dataset the mock "DB" is evaluated against; tests may swap it. */
let activeDataset: FixtureShare[] = DATASET;

describe('SharingService.getCommunityFeed (Story 6.8 T01)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    activeDataset = DATASET;

    // The mock "DB": filter by the service's own `where`, order by the service's
    // own `orderBy`, then apply the service's own `take`/`skip`.
    mockShareFindMany.mockImplementation(async (args: JsonRecord) =>
      orderAndWindow(applyWhere(activeDataset, args.where), args).map((s) => ({
        id: s.id,
        type: s.type,
        entityId: s.entityId,
        sharerId: s.sharerId,
        platform: s.platform,
        url: s.url,
        message: s.message,
        createdAt: s.createdAt,
        sharer: { id: s.sharer.id, name: s.sharer.name },
      })),
    );
    mockShareCount.mockImplementation(
      async (args: JsonRecord) => applyWhere(activeDataset, args.where).length,
    );
    mockSessionFindMany.mockResolvedValue([]);
  });

  // ── P0: per-type privacy ───────────────────────────────────────────────────

  describe('per-type privacy (P0)', () => {
    it("excludes a 'match' share whose sharer set stats_share='private' (and session_share='public')", async () => {
      // This is THE proof the P0 leak is fixed. `h-match` has
      // session_share='public' — the *only* key the old filter consulted — so the
      // old implementation returned it. The per-type filter must drop it.
      const feed = await feedPage(50);
      const ids = idsOf(feed);

      expect(ids).not.toContain('h-match');
      // ...while legitimate match shares remain visible.
      expect(ids).toContain('v-match-1');
      expect(ids).toContain('v-match-2');
    });

    it("excludes an 'achievement' share whose sharer set achievements_share='private'", async () => {
      const feed = await feedPage(50);
      const ids = idsOf(feed);

      expect(ids).not.toContain('h-achievement');
      expect(ids).toContain('v-achievement-1');
    });

    it("excludes a 'session' share whose sharer set session_share='private' (regression guard)", async () => {
      const feed = await feedPage(50);
      const ids = idsOf(feed);

      expect(ids).not.toContain('h-session');
      expect(ids).toContain('v-session-1');
      expect(ids).toContain('v-session-2');
    });

    it('returns exactly the visible set and no hidden rows', async () => {
      const feed = await feedPage(50);
      const ids = idsOf(feed);

      expect(new Set(ids)).toEqual(new Set(VISIBLE_IDS));
      for (const hidden of HIDDEN_IDS) {
        expect(ids).not.toContain(hidden);
      }
    });

    it('builds one branch per type; each is visible when its key is not "private" OR absent', async () => {
      await feedPage(20);
      const where = mockShareFindMany.mock.calls[0][0].where;

      expect(where.OR).toHaveLength(3);

      const branchFor = (type: string) => where.OR.find((b: JsonRecord) => b.type === type);

      for (const [type, key] of [
        ['session', 'session_share'],
        ['match', 'stats_share'],
        ['achievement', 'achievements_share'],
      ] as const) {
        expect(branchFor(type).sharer).toEqual({
          OR: [
            { privacySettings: { path: [key], not: 'private' } },
            // `<key> IS NULL` — restores rows whose sharer never set the key.
            { privacySettings: { path: [key], equals: mockDbNull } },
          ],
        });
      }
    });
  });

  // ── Read/write parity: an ABSENT governing key means public (visible) ───────
  // The write path (`privacyMiddleware.ts:23`, `shareEntity`) defaults a missing
  // key to `public`, so the feed must surface those shares instead of silently
  // dropping them.

  describe('absent governing key / null settings (read/write parity)', () => {
    const PARITY_DATASET: FixtureShare[] = [
      // No `stats_share` key at all — the write path allowed this share.
      makeShare('p-match-absent', 'match', '2026-02-10T00:00:00Z', {
        session_share: 'public',
      }),
      // No `achievements_share` key at all.
      makeShare('p-achievement-absent', 'achievement', '2026-02-09T00:00:00Z', {
        session_share: 'public',
      }),
      // Completely empty settings object.
      makeShare('p-session-absent', 'session', '2026-02-08T00:00:00Z', {}),
      // NULL privacySettings column.
      makeShare('p-match-null', 'match', '2026-02-07T00:00:00Z', null),
      // Explicit `private` — MUST stay hidden (the P0 guard).
      makeShare('p-match-private', 'match', '2026-02-06T00:00:00Z', {
        stats_share: 'private',
      }),
      makeShare('p-achievement-private', 'achievement', '2026-02-05T00:00:00Z', {
        achievements_share: 'private',
      }),
    ];

    beforeEach(() => {
      activeDataset = PARITY_DATASET;
    });

    it("a 'match' share whose sharer has {session_share:'public'} (no stats_share key) is VISIBLE", async () => {
      const ids = idsOf(await feedPage(50));

      expect(ids).toContain('p-match-absent');
    });

    it("an 'achievement' share whose sharer has no achievements_share key is VISIBLE", async () => {
      const ids = idsOf(await feedPage(50));

      expect(ids).toContain('p-achievement-absent');
    });

    it('a share whose sharer has empty settings is VISIBLE', async () => {
      const ids = idsOf(await feedPage(50));

      expect(ids).toContain('p-session-absent');
    });

    it('a share whose sharer has NULL privacySettings is VISIBLE (matches the write path)', async () => {
      // Resolved direction: NULL privacySettings ⇒ public ⇒ VISIBLE, because
      // `shareEntity` reads `privacySettings?.[key] || 'public'` and
      // `getPrivacySettings` returns a full default object when the column is
      // NULL. The read path agrees via the `<key> IS NULL` branch.
      const ids = idsOf(await feedPage(50));

      expect(ids).toContain('p-match-null');
    });

    it('a match share with explicit stats_share="private" is STILL HIDDEN (P0 guard)', async () => {
      const ids = idsOf(await feedPage(50));

      expect(ids).not.toContain('p-match-private');
    });

    it('an achievement share with explicit achievements_share="private" is STILL HIDDEN', async () => {
      const ids = idsOf(await feedPage(50));

      expect(ids).not.toContain('p-achievement-private');
    });

    it('returns exactly the parity-visible set (total counts the same way)', async () => {
      const feed = await feedPage(50);
      const ids = idsOf(feed);

      expect(new Set(ids)).toEqual(
        new Set(['p-match-absent', 'p-achievement-absent', 'p-session-absent', 'p-match-null']),
      );
      expect(feed.total).toBe(4);
    });
  });

  // ── P1: real, page-independent `total` ─────────────────────────────────────

  describe('total', () => {
    it('is the true collection size, not the page length', async () => {
      const feed = await feedPage(2);

      expect(feed.shares).toHaveLength(2); // the page
      expect(feed.total).toBe(TOTAL_VISIBLE); // the collection
      expect(feed.total).not.toBe(feed.shares.length);
    });

    it('counts with the same privacy filter (no cursor window, no offset)', async () => {
      await feedPage(2);
      const countWhere = mockShareCount.mock.calls[0][0].where;

      expect(countWhere.OR).toHaveLength(3);
      expect(countWhere.AND).toBeUndefined();
    });

    it('is stable across cursor pages', async () => {
      const p1 = await feedPage(2);
      const p2 = await feedPage(2, p1.nextCursor!);
      const p3 = await feedPage(2, p2.nextCursor!);

      expect(p1.total).toBe(TOTAL_VISIBLE);
      expect(p2.total).toBe(TOTAL_VISIBLE);
      expect(p3.total).toBe(TOTAL_VISIBLE);
    });
  });

  // ── D3: additive keyset pagination ─────────────────────────────────────────

  describe('cursor pagination', () => {
    it('returns three disjoint pages whose union is the full visible set, with nextCursor=null last', async () => {
      const p1 = await feedPage(2);
      const p2 = await feedPage(2, p1.nextCursor!);
      const p3 = await feedPage(2, p2.nextCursor!);

      const ids1 = idsOf(p1);
      const ids2 = idsOf(p2);
      const ids3 = idsOf(p3);

      // Disjoint across pages.
      expect(new Set([...ids1, ...ids2, ...ids3]).size).toBe(
        ids1.length + ids2.length + ids3.length,
      );
      // Union is exactly the visible set (no skip, no double-serve).
      expect(new Set([...ids1, ...ids2, ...ids3])).toEqual(new Set(VISIBLE_IDS));

      // Middle pages advertise a cursor; the last page does not.
      expect(p1.nextCursor).not.toBeNull();
      expect(p2.nextCursor).not.toBeNull();
      expect(p3.nextCursor).toBeNull();
    });

    it('emits an opaque cursor that decodes to the last row on the page', async () => {
      const p1 = await feedPage(2);
      const last = p1.shares[p1.shares.length - 1];

      const decoded = decodeCursor(p1.nextCursor);
      expect(decoded).not.toBeNull();
      expect(decoded!.id).toBe(last.id);
      expect(decoded!.createdAt.getTime()).toBe(new Date(last.createdAt).getTime());
    });

    it('ignores offset when a cursor is supplied', async () => {
      const p1 = await feedPage(2);
      const withOffset = await feedPage(2, p1.nextCursor!, 999);
      const withoutOffset = await feedPage(2, p1.nextCursor!, 0);

      expect(idsOf(withOffset)).toEqual(idsOf(withoutOffset));

      // Calls[0] is the uncursored first page; the two cursor calls must not
      // carry a `skip` at all (the keyset predicate replaces offset).
      const cursorCalls = mockShareFindMany.mock.calls.slice(1);
      expect(cursorCalls).toHaveLength(2);
      for (const call of cursorCalls) {
        expect(call[0].skip).toBeUndefined();
        expect(call[0].where.AND).toBeDefined();
      }
    });

    it('degrades gracefully on a malformed cursor (falls back to offset)', async () => {
      const feed = await feedPage(2, 'not-a-real-cursor');

      expect(feed.shares).toHaveLength(2);
      expect(feed.total).toBe(TOTAL_VISIBLE);
    });
  });

  // ── Back-compat: limit/offset unchanged ────────────────────────────────────

  describe('offset pagination (back-compat)', () => {
    it('still pages by offset and reports a nextCursor for full pages', async () => {
      const p1 = await feedPage(2, undefined, 0);
      const p2 = await feedPage(2, undefined, 2);

      expect(idsOf(p1)).toEqual(['v-session-1', 'v-match-1']);
      expect(idsOf(p2)).toEqual(['v-achievement-1', 'v-session-2']);
      expect(p1.nextCursor).not.toBeNull();
      expect(mockShareFindMany.mock.calls[0][0].skip).toBe(0);
      expect(mockShareFindMany.mock.calls[1][0].skip).toBe(2);
    });

    it('orders newest-first by (createdAt DESC, id DESC)', async () => {
      const feed = await feedPage(50);
      const timestamps = feed.shares.map((s) => new Date(s.createdAt).getTime());

      for (let i = 1; i < timestamps.length; i += 1) {
        expect(timestamps[i - 1]).toBeGreaterThanOrEqual(timestamps[i]);
      }
    });
  });

  // ── Shape / contract ───────────────────────────────────────────────────────

  describe('response shape', () => {
    it('exposes shares, sessions, total and nextCursor', async () => {
      const feed = await feedPage(2);

      expect(Array.isArray(feed.shares)).toBe(true);
      expect(Array.isArray(feed.sessions)).toBe(true);
      expect(typeof feed.total).toBe('number');
      expect(feed).toHaveProperty('nextCursor');
    });

    it('projects only the documented share fields plus sharer id/name', async () => {
      const feed = await feedPage(2);
      const share = feed.shares[0];

      expect(Object.keys(share).sort()).toEqual(
        ['createdAt', 'entityId', 'id', 'message', 'platform', 'sharer', 'sharerId', 'type', 'url'].sort(),
      );
      expect(Object.keys(share.sharer).sort()).toEqual(['id', 'name']);
    });
  });
});
