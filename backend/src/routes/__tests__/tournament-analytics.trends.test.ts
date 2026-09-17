/**
 * Story 6.11 follow-up — `GET /tournaments/analytics/trends`.
 *
 * This route became reachable for the first time when the router was mounted
 * (Story 6.11). Two things needed pinning:
 *
 * 1. Its response contract. It was still emitting the *old* shape — a bare
 *    `{ trends, filters, timestamp }` on success and `{ error: '...' }` on
 *    failure. It now speaks the standard envelope like its sibling.
 * 2. Its access model, which does not do what it says. See the `requireRole`
 *    block below: `'ORGANIZER'` is not a member of `UserRole`, so the guard is
 *    unsatisfiable for that string and the route is **ADMIN-only**.
 *
 * Everything runs against the real router and the real Postgres schema, driven
 * through real headers. `authenticateToken` re-reads `User.role` from the
 * database (`middleware/auth.ts:47-50`), so the fixtures set the DB role and the
 * token merely carries the id — asserting on a token claim would prove nothing.
 */

import request from 'supertest';
import express, { Express } from 'express';
import { prisma } from '../../config/database';
import { JWTUtils } from '../../utils/jwt';
import tournamentAnalyticsRouter from '../tournament-analytics';

jest.setTimeout(60000);

const app: Express = express();
app.use(express.json());
app.use('/tournaments', tournamentAnalyticsRouter);

// ---------------------------------------------------------------------------
// Fixtures / teardown
// ---------------------------------------------------------------------------

const createdTournamentIds: string[] = [];
const createdUserIds: string[] = [];
let sequence = 0;

function uniqueSuffix(): string {
  sequence += 1;
  return `${Date.now()}-${process.pid}-${sequence}`;
}

/**
 * `UserRole` is exactly `OWNER | PLAYER | ADMIN` (`schema.prisma:831-835`).
 * Typing the parameter as that union rather than `string` makes the compiler
 * enforce the very fact this file is about: **there is no `ORGANIZER` role to
 * pass here.**
 */
type AccountRole = 'OWNER' | 'PLAYER' | 'ADMIN';

async function createUser(label: string, role: AccountRole): Promise<{ id: string; token: string }> {
  const suffix = uniqueSuffix();
  const user = await prisma.user.create({
    data: {
      name: `6.11-trends-${label}-${suffix}`,
      email: `s611-trends-${label}-${suffix}@example.test`,
      role,
    },
  });
  createdUserIds.push(user.id);
  const { accessToken } = JWTUtils.generateTokens({
    userId: user.id,
    email: user.email ?? '',
    role: user.role,
  });
  return { id: user.id, token: accessToken };
}

/**
 * Dates are pinned far in the future so the `orderBy: startDate desc` +
 * `take: limit` window is deterministic. The route returns **aggregates keyed by
 * `tournamentType`**, not ids, so the only way to observe inclusion/exclusion is
 * to control which tournaments fall inside the window and read the resulting
 * keys.
 */
const PRIVATE_DATE = new Date('2099-12-31T00:00:00.000Z');
const PUBLIC_DATE = new Date('2099-12-30T00:00:00.000Z');

async function createTournament(opts: {
  visibility: string;
  tournamentType: string;
  startDate: Date;
  organizerUserId?: string | null;
}): Promise<string> {
  const suffix = uniqueSuffix();
  const tournament = await prisma.tournament.create({
    data: {
      name: `6.11 Trends ${suffix}`,
      organizer: `6.11 Trends Organizer ${suffix}`,
      startDate: opts.startDate,
      registrationDeadline: new Date(opts.startDate.getTime() - 86400000),
      visibility: opts.visibility,
      tournamentType: opts.tournamentType as never,
      organizerUserId: opts.organizerUserId ?? null,
    },
  });
  createdTournamentIds.push(tournament.id);
  return tournament.id;
}

let admin: { id: string; token: string };
let otherAdmin: { id: string; token: string };
let player: { id: string; token: string };
let owner: { id: string; token: string };

beforeAll(async () => {
  admin = await createUser('admin', 'ADMIN');
  otherAdmin = await createUser('admin2', 'ADMIN');
  player = await createUser('player', 'PLAYER');
  owner = await createUser('owner', 'OWNER');

  // admin's own PRIVATE tournament — the most recent row in the database.
  await createTournament({
    visibility: 'PRIVATE',
    tournamentType: 'SWISS',
    startDate: PRIVATE_DATE,
    organizerUserId: admin.id,
  });

  // A PUBLIC tournament — the next most recent. This is what `otherAdmin`
  // should see at `limit=1` once the PRIVATE one is correctly excluded.
  await createTournament({
    visibility: 'PUBLIC',
    tournamentType: 'ROUND_ROBIN',
    startDate: PUBLIC_DATE,
    organizerUserId: null,
  });
});

afterAll(async () => {
  for (const id of createdTournamentIds) {
    await prisma.tournamentAnalytics.deleteMany({ where: { tournamentId: id } }).catch(() => undefined);
    await prisma.tournamentFeedback.deleteMany({ where: { tournamentId: id } }).catch(() => undefined);
    await prisma.tournamentPlayer.deleteMany({ where: { tournamentId: id } }).catch(() => undefined);
    await prisma.tournament.delete({ where: { id } }).catch(() => undefined);
  }
  for (const id of createdUserIds) {
    await prisma.user.delete({ where: { id } }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

describe('authentication', () => {
  it('401 without a token', async () => {
    const res = await request(app).get('/tournaments/analytics/trends');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('401 on a malformed token', async () => {
    const res = await request(app)
      .get('/tournaments/analytics/trends')
      .set('Authorization', 'Bearer not-a-real-token');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

// ---------------------------------------------------------------------------
// Authorization — and a guard that cannot be satisfied
// ---------------------------------------------------------------------------

describe('authorization: the ORGANIZER role does not exist', () => {
  /**
   * `requireRole` from `middleware/auth.ts` compares against `req.user.role`,
   * which is a `UserRole` — and `UserRole` is exactly `OWNER | PLAYER | ADMIN`
   * (`schema.prisma:831-835`). There is no `ORGANIZER` member.
   *
   * So `requireRole(['ORGANIZER', 'ADMIN'])` on this route degrades to
   * **ADMIN-only**, and the handler's `organizerUserId: user.id` clause — the
   * whole point of which is "let an organizer see their own tournaments" — is
   * unreachable for every non-admin. `'ORGANIZER'` is a real identifier, but of
   * a *different* role system: `PlayerRole` (`middleware/permissions.ts:30`),
   * which is session-scoped and resolved from `MvpPlayer.role`, not from the
   * account. `permissions.ts` has its own `requireRole(requiredRole, action)`
   * that takes a `PlayerRole`; the five `pairings.ts` routes and this one pass
   * the string to the *account-level* one by mistake.
   *
   * These tests pin the behaviour as it actually is. They are a bug report, not
   * an endorsement — changing an authorization guard is a product decision.
   */
  it('every non-ADMIN UserRole is refused (PLAYER → 403)', async () => {
    const res = await request(app)
      .get('/tournaments/analytics/trends')
      .set('Authorization', `Bearer ${player.token}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('every non-ADMIN UserRole is refused (OWNER → 403)', async () => {
    // The sharpest form of the finding: OWNER is the role a tournament owner
    // actually has, and it is refused. If `'ORGANIZER'` were satisfiable, this
    // is the case it was meant to cover.
    const res = await request(app)
      .get('/tournaments/analytics/trends')
      .set('Authorization', `Bearer ${owner.token}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('ADMIN is allowed', async () => {
    const res = await request(app)
      .get('/tournaments/analytics/trends')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Response contract
// ---------------------------------------------------------------------------

describe('response contract — standard envelope', () => {
  it('200 with { success, data: { trends, filters }, timestamp }', async () => {
    const res = await request(app)
      .get('/tournaments/analytics/trends')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('data');
    // Pre-fix the body was the bare `{ trends, filters, timestamp }` — `success`
    // did not exist, and the frontend's `error.code` handling could not read it.
    expect(res.body).toHaveProperty('data.trends');
    expect(res.body).toHaveProperty('data.filters');
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('echoes `format` through to filters', async () => {
    const res = await request(app)
      .get('/tournaments/analytics/trends?format=SWISS')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.filters.format).toBe('SWISS');
  });

  it('reports a null format when none was supplied', async () => {
    const res = await request(app)
      .get('/tournaments/analytics/trends')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.body.data.filters.format).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Visibility — the Story 6.11 `organizerUserId` fix
// ---------------------------------------------------------------------------

describe('visibility filter (Story 6.11 fix)', () => {
  /**
   * Reads the trends map from either response shape on purpose. The visibility
   * rule is a *different* concern from the envelope, and it is already fixed in
   * `HEAD`; coupling these two assertions to the envelope would make them fail
   * for the envelope's reason and prove nothing about visibility. Keeping them
   * decoupled means each test fails for exactly one reason.
   */
  const trendsOf = (body: Record<string, unknown>): Record<string, { count: number }> =>
    ((body.data as Record<string, unknown>)?.trends ?? body.trends) as Record<string, { count: number }>;

  it("includes the caller's own PRIVATE tournament", async () => {
    // `limit=1` selects the single most recent accessible tournament. admin's
    // PRIVATE SWISS is the most recent row in the database, so it can only
    // appear if the `organizerUserId: user.id` clause works. Pre-fix the clause
    // was `organizer: req.user.name || ''`, which matched nothing — so an
    // organizer's own private tournaments were silently dropped.
    const res = await request(app)
      .get('/tournaments/analytics/trends?limit=1')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    const trends = trendsOf(res.body);
    expect(trends).toHaveProperty('SWISS');
    expect(trends.SWISS.count).toBe(1);
  });

  it("excludes another user's PRIVATE tournament", async () => {
    // Same window, different identity: the PRIVATE SWISS is invisible to
    // otherAdmin, so the most recent accessible row is the PUBLIC ROUND_ROBIN.
    const res = await request(app)
      .get('/tournaments/analytics/trends?limit=1')
      .set('Authorization', `Bearer ${otherAdmin.token}`);

    expect(res.status).toBe(200);
    const trends = trendsOf(res.body);
    expect(trends).toHaveProperty('ROUND_ROBIN');
    expect(trends).not.toHaveProperty('SWISS');
  });
});

// ---------------------------------------------------------------------------
// `limit` parsing
// ---------------------------------------------------------------------------

describe('limit parsing', () => {
  /**
   * `take: Number(req.query.limit)` turned `?limit=abc` into `take: NaN`, which
   * Prisma rejects — a 500 from nothing worse than a malformed query string.
   */
  it('a non-numeric limit does not 500; it falls back to 10', async () => {
    const res = await request(app)
      .get('/tournaments/analytics/trends?limit=abc')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.filters.limit).toBe(10);
  });

  it('a limit below 1 falls back to 10', async () => {
    for (const raw of ['0', '-5']) {
      const res = await request(app)
        .get(`/tournaments/analytics/trends?limit=${raw}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.filters.limit).toBe(10);
    }
  });

  it('an oversized limit is clamped to 100', async () => {
    const res = await request(app)
      .get('/tournaments/analytics/trends?limit=100000')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.filters.limit).toBe(100);
  });

  it('a valid limit is honoured', async () => {
    const res = await request(app)
      .get('/tournaments/analytics/trends?limit=3')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.body.data.filters.limit).toBe(3);
  });
});
