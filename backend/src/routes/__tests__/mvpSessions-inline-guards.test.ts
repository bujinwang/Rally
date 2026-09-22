/**
 * Behavioural safety proof for the proposed deletion of nine inline
 * device-identity checks in `routes/mvpSessions.ts`.
 *
 * Each of the nine sites does its own authorization inside the handler body
 * (`session.ownerDeviceId !== <client-supplied id>` → 403). The design claims
 * every owning route is ALREADY protected by mounted middleware
 * (`requireOrganizer` / `requireOrganizerOrSelf`) which is equivalent-or-stricter,
 * making the inline check redundant.
 *
 * This suite is the empirical half of that claim. It uses the REAL permission
 * middleware (`middleware/permissions.ts` — deliberately NOT mocked) and the REAL
 * database, and fires each owning route as:
 *   1. a non-organizer PARTICIPANT (a real `PLAYER`-role device in the session),
 *      presenting its device id in every identity field the route could read
 *      (`deviceId`, `ownerDeviceId`, `organizerDeviceId`) plus `x-device-id`;
 *   2. a fully anonymous request (no device id, no JWT).
 * It asserts both are denied, that the denial carries the MIDDLEWARE's signature
 * (not the inline check's), and that no state changed.
 *
 * The mutation procedure (neutralize one inline check, re-run, restore) was run
 * externally against this file; see the task report for the per-site verdicts.
 *
 * ACCEPTED RISK (recorded after the nine checks were deleted):
 * the inline checks were the ONLY gate against a second ORGANIZER-role player
 * row carrying a DIFFERENT deviceId. The mounted middleware identifies an
 * organizer by role, so such a row passes it; only the inline
 * `session.ownerDeviceId !== <id>` comparison denied it. That DB state cannot be
 * produced through the HTTP API — the ownership-claim handler
 * (mvpSessions.ts :970-1014) demotes every other ORGANIZER row inside a
 * transaction — so the residual exposure is limited to out-of-band/hostile
 * writes. Removing the checks is a deliberate defence-in-depth trade for
 * correctness: it repairs the null-owner lockout that denied the legitimate
 * organizer on six routes. The residual-risk block near the bottom of this file
 * pins the new behaviour.
 */

jest.mock('../../server', () => ({
  io: { to: jest.fn().mockReturnThis(), emit: jest.fn() },
}));

jest.mock('../../middleware/rateLimit', () => {
  const passthrough = (_req: any, _res: any, next: any) => next();
  return {
    createRateLimiters: () => ({
      auth: passthrough,
      api: passthrough,
      public: passthrough,
      sensitive: passthrough,
      custom: () => passthrough,
    }),
  };
});

jest.mock('../../middleware/caching', () => {
  const passthrough = (_req: any, _res: any, next: any) => next();
  return {
    cachingMiddleware: () => passthrough,
    cacheInvalidationMiddleware: () => passthrough,
  };
});

jest.mock('../../middleware/versioning', () => {
  const passthrough = (_req: any, _res: any, next: any) => next();
  return { versioning: () => passthrough };
});

jest.mock('../../services/messagingService', () => ({
  messagingService: {
    createThread: jest.fn(),
    sendMessage: jest.fn(),
    getThreadsForUser: jest.fn(),
    getOrCreateSessionChat: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('../../socket/notificationHandlers', () => ({
  emitPlayerJoined: jest.fn(),
}));

jest.mock('../../utils/notificationHelper', () => ({
  notifySessionSubscribers: jest.fn().mockResolvedValue(0),
}));

jest.mock('../../utils/statisticsService', () => ({
  updatePlayerGameStatistics: jest.fn().mockResolvedValue(undefined),
  updatePlayerMatchStatistics: jest.fn().mockResolvedValue(undefined),
  getPlayerStatistics: jest.fn().mockResolvedValue(null),
  getSessionStatistics: jest.fn().mockResolvedValue(null),
  getSessionLeaderboard: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../utils/rotationAlgorithm', () => ({
  generateOptimalRotation: jest.fn(),
  getRotationExplanation: jest.fn().mockReturnValue('rotation explanation'),
}));

jest.mock('../../utils/auditLogger', () => ({
  AuditLogger: { logAction: jest.fn() },
}));

jest.mock('../../socket/events/sessionEvents', () => ({
  emitScoreUpdated: jest.fn().mockResolvedValue(undefined),
  emitPlayerStatusChanged: jest.fn().mockResolvedValue(undefined),
  invalidateSessionCache: jest.fn().mockResolvedValue(undefined),
}));

// NOTE: `../../config/database` and `../../middleware/permissions` are
// intentionally NOT mocked — the whole point is to exercise the real gate.
import request from 'supertest';
import express from 'express';
import mvpSessionsRouter from '../mvpSessions';
import { prisma } from '../../config/database';

const app = express();
app.use(express.json());
app.use('/api/sessions', mvpSessionsRouter);

const runId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const ownerDev = `ig-owner-${runId}`;
const attackerDev = `ig-atk-${runId}`;
const targetDev = `ig-tgt-${runId}`;
const secondOrgDev = `ig-org2-${runId}`;

interface Seed {
  shareCode: string;
  sessionId: string;
  ownerPlayerId: string;
  attackerPlayerId: string;
  targetPlayerId: string;
}

const createdSessionIds: string[] = [];

async function seedSession(
  prefix: string,
  status: 'ACTIVE' | 'CANCELLED' = 'ACTIVE',
  withSecondOrganizer = false,
): Promise<Seed> {
  const shareCode = `${prefix}${runId}`.slice(0, 24);
  const session = await prisma.mvpSession.create({
    data: {
      name: `Inline guard ${prefix}`,
      scheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      location: 'Guard Test Court',
      maxPlayers: 20,
      courtCount: 2,
      ownerName: `Owner ${prefix}`,
      shareCode,
      status,
      ownerDeviceId: ownerDev,
      sport: 'badminton',
    },
  });
  createdSessionIds.push(session.id);

  const owner = await prisma.mvpPlayer.create({
    data: {
      sessionId: session.id,
      name: `Owner ${prefix}`,
      deviceId: ownerDev,
      status: 'ACTIVE',
      role: 'ORGANIZER',
      preferredSports: ['badminton'],
    },
  });
  const attacker = await prisma.mvpPlayer.create({
    data: {
      sessionId: session.id,
      name: `Attacker ${prefix}`,
      deviceId: attackerDev,
      status: 'ACTIVE',
      role: 'PLAYER',
      preferredSports: ['badminton'],
    },
  });
  const target = await prisma.mvpPlayer.create({
    data: {
      sessionId: session.id,
      name: `Target ${prefix}`,
      deviceId: targetDev,
      status: 'ACTIVE',
      role: 'PLAYER',
      preferredSports: ['badminton'],
    },
  });
  if (withSecondOrganizer) {
    await prisma.mvpPlayer.create({
      data: {
        sessionId: session.id,
        name: `SecondOrg ${prefix}`,
        deviceId: secondOrgDev,
        status: 'ACTIVE',
        role: 'ORGANIZER',
        preferredSports: ['badminton'],
      },
    });
  }

  return {
    shareCode,
    sessionId: session.id,
    ownerPlayerId: owner.id,
    attackerPlayerId: attacker.id,
    targetPlayerId: target.id,
  };
}

/** Snapshot the mutable state the inline checks were guarding. */
async function snapshot(seed: Seed) {
  const session = await prisma.mvpSession.findUnique({ where: { id: seed.sessionId } });
  const target = await prisma.mvpPlayer.findUnique({ where: { id: seed.targetPlayerId } });
  return {
    session: session
      ? {
          status: session.status,
          maxPlayers: session.maxPlayers,
          courtCount: session.courtCount,
          location: session.location,
          ownerDeviceId: session.ownerDeviceId,
        }
      : null,
    target: target
      ? { status: target.status, restGamesRemaining: target.restGamesRemaining, deviceId: target.deviceId }
      : null,
  };
}

/**
 * Assert the request was denied AND the denial came from the mounted
 * `requireOrganizer` gate (not from the inline check, whose body shape differs).
 */
function expectDeniedByRequireOrganizer(res: request.Response) {
  expect(res.status).toBeGreaterThanOrEqual(400);
  expect(res.status).toBeLessThan(500);
  const err = res.body?.error;
  const byRole = err?.requiredRole === 'ORGANIZER';
  const noPlayer = err?.code === 'PLAYER_NOT_FOUND';
  const noDevice = err?.code === 'MISSING_DEVICE_ID';
  if (!(byRole || noPlayer || noDevice)) {
    throw new Error(
      `Expected a requireOrganizer denial signature, got status=${res.status} body=${JSON.stringify(res.body)}`,
    );
  }
}

/** Assert denial came from the mounted `requireOrganizerOrSelf` gate. */
function expectDeniedByRequireOrganizerOrSelf(res: request.Response) {
  expect(res.status).toBeGreaterThanOrEqual(400);
  expect(res.status).toBeLessThan(500);
  const err = res.body?.error;
  const noPlayer = err?.code === 'REQUESTING_PLAYER_NOT_FOUND';
  const selfDenial =
    err?.code === 'FORBIDDEN' && /Only organizer or player themselves/.test(err?.message || '');
  expect(noPlayer || selfDenial).toBe(true);
}

const nullOrgDev = `ig-null-org-${runId}`;
const nullPlayerDev = `ig-null-player-${runId}`;

/**
 * Seed a session with `ownerDeviceId = null` AND a legitimate organizer player
 * whose `deviceId` IS set — the exact state that triggered the lockout.
 */
async function seedNullOwnerSession(
  prefix: string,
  status: 'ACTIVE' | 'CANCELLED' = 'ACTIVE',
): Promise<Seed> {
  const shareCode = `${prefix}${runId}`.slice(0, 24);
  const session = await prisma.mvpSession.create({
    data: {
      name: `Null owner ${prefix}`,
      scheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      location: 'Null Owner Court',
      maxPlayers: 20,
      courtCount: 2,
      ownerName: `NullOwner ${prefix}`,
      shareCode,
      status,
      ownerDeviceId: null,
      sport: 'badminton',
    },
  });
  createdSessionIds.push(session.id);

  const owner = await prisma.mvpPlayer.create({
    data: {
      sessionId: session.id,
      name: `NullOwner ${prefix}`,
      deviceId: nullOrgDev,
      status: 'ACTIVE',
      role: 'ORGANIZER',
      preferredSports: ['badminton'],
    },
  });
  const target = await prisma.mvpPlayer.create({
    data: {
      sessionId: session.id,
      name: `NullPlayer ${prefix}`,
      deviceId: nullPlayerDev,
      status: 'ACTIVE',
      role: 'PLAYER',
      preferredSports: ['badminton'],
    },
  });

  return {
    shareCode,
    sessionId: session.id,
    ownerPlayerId: owner.id,
    attackerPlayerId: target.id,
    targetPlayerId: target.id,
  };
}

afterAll(async () => {
  try {
    if (createdSessionIds.length > 0) {
      await prisma.mvpPlayer.deleteMany({ where: { sessionId: { in: createdSessionIds } } });
      await prisma.mvpSession.deleteMany({ where: { id: { in: createdSessionIds } } });
    }
  } catch (error) {
    console.warn('inline-guards cleanup failed:', error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Site 1 — mvpSessions.ts:1222  PUT /:shareCode   (requireOrganizer edit_session)
// ─────────────────────────────────────────────────────────────────────────────
describe('Site 1 :1222 — PUT /:shareCode', () => {
  it('denies a non-organizer participant and an anonymous caller, no state change', async () => {
    const seed = await seedSession('S1');
    const before = await snapshot(seed);

    const attacker = await request(app)
      .put(`/api/sessions/${seed.shareCode}`)
      .set('x-device-id', attackerDev)
      .send({ deviceId: attackerDev, ownerDeviceId: attackerDev, maxPlayers: 99 });
    expectDeniedByRequireOrganizer(attacker);

    const anon = await request(app)
      .put(`/api/sessions/${seed.shareCode}`)
      .send({ maxPlayers: 99 });
    expectDeniedByRequireOrganizer(anon);

    expect(await snapshot(seed)).toEqual(before);
  });

  it('control: the real owner device is allowed (gate discriminates on identity)', async () => {
    const seed = await seedSession('S1c');
    const res = await request(app)
      .put(`/api/sessions/${seed.shareCode}`)
      .send({ deviceId: ownerDev, ownerDeviceId: ownerDev, maxPlayers: 42 });
    expect(res.status).toBe(200);
    const session = await prisma.mvpSession.findUnique({ where: { id: seed.sessionId } });
    expect(session?.maxPlayers).toBe(42);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Site 2 — mvpSessions.ts:1442  PUT /terminate/:shareCode (requireOrganizer delete_session)
// ─────────────────────────────────────────────────────────────────────────────
describe('Site 2 :1442 — PUT /terminate/:shareCode', () => {
  it('denies a non-organizer participant and an anonymous caller, no state change', async () => {
    const seed = await seedSession('S2');
    const before = await snapshot(seed);

    const attacker = await request(app)
      .put(`/api/sessions/terminate/${seed.shareCode}`)
      .set('x-device-id', attackerDev)
      .send({ deviceId: attackerDev, ownerDeviceId: attackerDev });
    expectDeniedByRequireOrganizer(attacker);

    const anon = await request(app).put(`/api/sessions/terminate/${seed.shareCode}`).send({});
    expectDeniedByRequireOrganizer(anon);

    expect(await snapshot(seed)).toEqual(before);
  });

  it('control: the real owner device can terminate', async () => {
    const seed = await seedSession('S2c');
    const res = await request(app)
      .put(`/api/sessions/terminate/${seed.shareCode}`)
      .send({ deviceId: ownerDev, ownerDeviceId: ownerDev });
    expect(res.status).toBe(200);
    const session = await prisma.mvpSession.findUnique({ where: { id: seed.sessionId } });
    expect(session?.status).toBe('CANCELLED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Site 3 — mvpSessions.ts:1536  PUT /reactivate/:shareCode (requireOrganizer edit_session)
// ─────────────────────────────────────────────────────────────────────────────
describe('Site 3 :1536 — PUT /reactivate/:shareCode', () => {
  it('denies a non-organizer participant and an anonymous caller, no state change', async () => {
    const seed = await seedSession('S3', 'CANCELLED');
    const before = await snapshot(seed);

    const attacker = await request(app)
      .put(`/api/sessions/reactivate/${seed.shareCode}`)
      .set('x-device-id', attackerDev)
      .send({ deviceId: attackerDev, ownerDeviceId: attackerDev });
    expectDeniedByRequireOrganizer(attacker);

    const anon = await request(app).put(`/api/sessions/reactivate/${seed.shareCode}`).send({});
    expectDeniedByRequireOrganizer(anon);

    expect(await snapshot(seed)).toEqual(before);
  });

  it('control: the real owner device can reactivate', async () => {
    const seed = await seedSession('S3c', 'CANCELLED');
    const res = await request(app)
      .put(`/api/sessions/reactivate/${seed.shareCode}`)
      .send({ deviceId: ownerDev, ownerDeviceId: ownerDev });
    expect(res.status).toBe(200);
    const session = await prisma.mvpSession.findUnique({ where: { id: seed.sessionId } });
    expect(session?.status).toBe('ACTIVE');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Site 4 — mvpSessions.ts:1665  DELETE /:shareCode/players/:playerId (requireOrganizer remove_players)
// Site 6 — mvpSessions.ts:3179  SAME method+path (second registration)
// ─────────────────────────────────────────────────────────────────────────────
describe('Site 4 :1665 — DELETE /:shareCode/players/:playerId', () => {
  it('denies a non-organizer participant and an anonymous caller, no state change', async () => {
    const seed = await seedSession('S4');
    const before = await snapshot(seed);

    const attacker = await request(app)
      .delete(`/api/sessions/${seed.shareCode}/players/${seed.targetPlayerId}`)
      .set('x-device-id', attackerDev)
      .send({ deviceId: attackerDev, ownerDeviceId: attackerDev, organizerDeviceId: attackerDev });
    expectDeniedByRequireOrganizer(attacker);

    const anon = await request(app)
      .delete(`/api/sessions/${seed.shareCode}/players/${seed.targetPlayerId}`)
      .send({});
    expectDeniedByRequireOrganizer(anon);

    expect(await snapshot(seed)).toEqual(before);
  });

  it('control: the real owner device can remove the player', async () => {
    const seed = await seedSession('S4c');
    const res = await request(app)
      .delete(`/api/sessions/${seed.shareCode}/players/${seed.targetPlayerId}`)
      .send({ deviceId: ownerDev });
    expect(res.status).toBe(200);
    const target = await prisma.mvpPlayer.findUnique({ where: { id: seed.targetPlayerId } });
    expect(target).toBeNull();
  });

  it('shadowing proof: the LIVE handler for this path is :1636 (site 4), not :3155 (site 6)', async () => {
    // Route registration order decides which handler serves the path. The two
    // registrations differ in response SHAPE for an unknown player, so a request
    // that reaches the handler proves which one ran:
    //   live :1636     -> 404 { success:false, error:{ code:'NOT_FOUND', … } }
    //   shadowed :3155 -> 404 { success:false, message:'Player not found' }   (no `error`)
    const seed = await seedSession('S4s');
    const res = await request(app)
      .delete(`/api/sessions/${seed.shareCode}/players/does-not-exist-${runId}`)
      .send({ deviceId: ownerDev });
    expect(res.status).toBe(404);
    expect(res.body?.error?.code).toBe('NOT_FOUND');
    expect(res.body?.message).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Site 5 — mvpSessions.ts:1756  POST /:shareCode/add-player (requireOrganizer add_players)
// ─────────────────────────────────────────────────────────────────────────────
describe('Site 5 :1756 — POST /:shareCode/add-player', () => {
  it('denies a non-organizer participant and an anonymous caller, no state change', async () => {
    const seed = await seedSession('S5');
    const before = await snapshot(seed);

    const attacker = await request(app)
      .post(`/api/sessions/${seed.shareCode}/add-player`)
      .set('x-device-id', attackerDev)
      .send({ playerName: `Injected ${runId}`, deviceId: attackerDev, ownerDeviceId: attackerDev });
    expectDeniedByRequireOrganizer(attacker);

    const anon = await request(app)
      .post(`/api/sessions/${seed.shareCode}/add-player`)
      .send({ playerName: `Injected2 ${runId}` });
    expectDeniedByRequireOrganizer(anon);

    const injected = await prisma.mvpPlayer.findFirst({
      where: { sessionId: seed.sessionId, name: { startsWith: 'Injected' } },
    });
    expect(injected).toBeNull();
    expect(await snapshot(seed)).toEqual(before);
  });

  it('control: the real owner device can add a player', async () => {
    const seed = await seedSession('S5c');
    const res = await request(app)
      .post(`/api/sessions/${seed.shareCode}/add-player`)
      .send({ playerName: `Guest ${runId}`, deviceId: ownerDev });
    expect(res.status).toBe(201);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Site 6 — mvpSessions.ts:3179  DELETE /:shareCode/players/:playerId (SHADOWED by :1636)
// The behavioural guarantee is inherited from Site 4's live handler; the
// shadowing proof above establishes that this handler never executes.
// ─────────────────────────────────────────────────────────────────────────────
describe('Site 6 :3179 — DELETE /:shareCode/players/:playerId (shadowed)', () => {
  it('route is denied to a non-organizer and an anonymous caller (served by the live :1636 handler)', async () => {
    const seed = await seedSession('S6');
    const before = await snapshot(seed);

    const attacker = await request(app)
      .delete(`/api/sessions/${seed.shareCode}/players/${seed.targetPlayerId}`)
      .set('x-device-id', attackerDev)
      .send({ deviceId: attackerDev, organizerDeviceId: attackerDev });
    expectDeniedByRequireOrganizer(attacker);

    const anon = await request(app)
      .delete(`/api/sessions/${seed.shareCode}/players/${seed.targetPlayerId}`)
      .send({});
    expectDeniedByRequireOrganizer(anon);

    expect(await snapshot(seed)).toEqual(before);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Site 7 — mvpSessions.ts:3445  PUT /:shareCode/players/:playerId/status (SHADOWED by :3022)
// ─────────────────────────────────────────────────────────────────────────────
describe('Site 7 :3445 — PUT /:shareCode/players/:playerId/status', () => {
  it('denies a non-organizer participant and an anonymous caller, no state change', async () => {
    const seed = await seedSession('S7');
    const before = await snapshot(seed);

    const attacker = await request(app)
      .put(`/api/sessions/${seed.shareCode}/players/${seed.targetPlayerId}/status`)
      .set('x-device-id', attackerDev)
      .send({ status: 'LEFT', deviceId: attackerDev, ownerDeviceId: attackerDev });
    expectDeniedByRequireOrganizerOrSelf(attacker);

    const anon = await request(app)
      .put(`/api/sessions/${seed.shareCode}/players/${seed.targetPlayerId}/status`)
      .send({ status: 'LEFT' });
    expectDeniedByRequireOrganizerOrSelf(anon);

    expect(await snapshot(seed)).toEqual(before);
  });

  it('shadowing proof: the LIVE handler for this path is :3022, not :3371 (site 7)', async () => {
    // The two registrations differ in response SHAPE for an invalid status:
    //   live :3022     -> 400 { success:false, message:'Invalid status…' }         (flat, no `error`)
    //   shadowed :3371 -> 400 { success:false, error:{ code:'INVALID_STATUS', … } } (nested)
    const seed = await seedSession('S7s');
    const res = await request(app)
      .put(`/api/sessions/${seed.shareCode}/players/${seed.targetPlayerId}/status`)
      .send({ status: 'BOGUS', deviceId: ownerDev });
    expect(res.status).toBe(400);
    expect(res.body?.error).toBeUndefined();
    expect(res.body?.message).toMatch(/Invalid status/);
  });

  it('control: the target player may update their own status (requireOrganizerOrSelf)', async () => {
    const seed = await seedSession('S7c');
    const res = await request(app)
      .put(`/api/sessions/${seed.shareCode}/players/${seed.targetPlayerId}/status`)
      .send({ status: 'RESTING', deviceId: targetDev });
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Site 8 — mvpSessions.ts:3871  PUT /:shareCode/courts (requireOrganizer edit_session)
// ─────────────────────────────────────────────────────────────────────────────
describe('Site 8 :3871 — PUT /:shareCode/courts', () => {
  it('denies a non-organizer participant and an anonymous caller, no state change', async () => {
    const seed = await seedSession('S8');
    const before = await snapshot(seed);

    const attacker = await request(app)
      .put(`/api/sessions/${seed.shareCode}/courts`)
      .set('x-device-id', attackerDev)
      .send({ courtCount: 9, deviceId: attackerDev, ownerDeviceId: attackerDev });
    expectDeniedByRequireOrganizer(attacker);

    const anon = await request(app).put(`/api/sessions/${seed.shareCode}/courts`).send({ courtCount: 9 });
    expectDeniedByRequireOrganizer(anon);

    expect(await snapshot(seed)).toEqual(before);
  });

  it('control: the real owner device can update court count', async () => {
    const seed = await seedSession('S8c');
    const res = await request(app)
      .put(`/api/sessions/${seed.shareCode}/courts`)
      .send({ courtCount: 4, deviceId: ownerDev, ownerDeviceId: ownerDev });
    expect(res.status).toBe(200);
    const session = await prisma.mvpSession.findUnique({ where: { id: seed.sessionId } });
    expect(session?.courtCount).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Site 9 — mvpSessions.ts:4055  PUT /:shareCode/players/:playerId/rest (requireOrganizerOrSelf)
// ─────────────────────────────────────────────────────────────────────────────
describe('Site 9 :4055 — PUT /:shareCode/players/:playerId/rest', () => {
  it('denies a non-organizer participant and an anonymous caller, no state change', async () => {
    const seed = await seedSession('S9');
    const before = await snapshot(seed);

    const attacker = await request(app)
      .put(`/api/sessions/${seed.shareCode}/players/${seed.targetPlayerId}/rest`)
      .set('x-device-id', attackerDev)
      .send({ gamesCount: 3, deviceId: attackerDev, ownerDeviceId: attackerDev });
    expectDeniedByRequireOrganizerOrSelf(attacker);

    const anon = await request(app)
      .put(`/api/sessions/${seed.shareCode}/players/${seed.targetPlayerId}/rest`)
      .send({ gamesCount: 3 });
    expectDeniedByRequireOrganizerOrSelf(anon);

    expect(await snapshot(seed)).toEqual(before);
  });

  it('control: the target player may manage their own rest (requireOrganizerOrSelf)', async () => {
    const seed = await seedSession('S9c');
    const res = await request(app)
      .put(`/api/sessions/${seed.shareCode}/players/${seed.targetPlayerId}/rest`)
      .send({ gamesCount: 2, deviceId: targetDev });
    expect(res.status).toBe(200);
    const target = await prisma.mvpPlayer.findUnique({ where: { id: seed.targetPlayerId } });
    expect(target?.restGamesRemaining).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ACCEPTED RISK — the removed inline checks were the ONLY gate against a second
// ORGANIZER-role row (a hostile/out-of-band DB state the HTTP API cannot
// produce). This block pins the NEW behaviour so the trade is explicit and any
// future re-introduction of a stricter gate is a conscious decision.
// ─────────────────────────────────────────────────────────────────────────────
describe('ACCEPTED RISK: a non-owner ORGANIZER device is no longer stopped inline', () => {
  it('site 4: a second ORGANIZER-role device now passes the (previously inline) owner check', async () => {
    const seed = await seedSession('CAV', 'ACTIVE', true);
    const res = await request(app)
      .delete(`/api/sessions/${seed.shareCode}/players/${seed.targetPlayerId}`)
      .send({ deviceId: secondOrgDev });
    // The mounted requireOrganizer gate PASSES (secondOrgDev holds an ORGANIZER
    // row). With the inline owner check removed the request now SUCCEEDS — the
    // deliberate defence-in-depth trade documented in the file header. The DB
    // state required to exploit it is unreachable through the HTTP API.
    expect(res.status).toBe(200);
    const target = await prisma.mvpPlayer.findUnique({ where: { id: seed.targetPlayerId } });
    expect(target).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NULL `ownerDeviceId` LOCKOUT — REPAIRED
//
// A session whose `ownerDeviceId` is `null` (the state of all four local dev
// sessions) that nevertheless holds an ORGANIZER-role player with a real
// `deviceId` — the legitimate organizer. The mounted middleware identifies the
// organizer by that player row (the device path never reads
// `session.ownerDeviceId`), so it PASSES. The (now deleted) inline checks
// compared `session.ownerDeviceId` (null) against the request's string device
// id, i.e. `null !== "<id>"` → true → 403 — locking the legitimate organizer
// out of their own session.
//
// Each block fires the route as (a) the legitimate organizer and (b) the
// non-organizer PLAYER. The organizer MUST now be ALLOWED (2xx, plus the state
// change) on every route that previously 403'd — sites 2,3,4,5,6,8,9 — and the
// non-organizer MUST still be denied by the mounted middleware. The two are
// SEPARATE tests so a regression in either direction is localised.
// ─────────────────────────────────────────────────────────────────────────────
describe('Null ownerDeviceId — lockout repaired', () => {
  // The organizer probe asserts the fix (2xx + the resulting state change); the
  // player probe asserts the mounted middleware still denies a non-organizer.

  // ── Site 1 :1222 PUT /:shareCode (requireOrganizer edit_session) ──
  it('Site 1 :1222 — organizer NOT locked out (inline check is null-guarded)', async () => {
    const seed = await seedNullOwnerSession('N1');
    const org = await request(app)
      .put(`/api/sessions/${seed.shareCode}`)
      .set('x-device-id', nullOrgDev)
      .send({ deviceId: nullOrgDev, ownerDeviceId: nullOrgDev, maxPlayers: 33 });
    expect(org.status).toBe(200);
  });
  it('Site 1 :1222 — non-organizer PLAYER denied by middleware (null-owner state)', async () => {
    const seed = await seedNullOwnerSession('N1p');
    const player = await request(app)
      .put(`/api/sessions/${seed.shareCode}`)
      .set('x-device-id', nullPlayerDev)
      .send({ deviceId: nullPlayerDev, ownerDeviceId: nullPlayerDev, maxPlayers: 34 });
    expectDeniedByRequireOrganizer(player);
  });

  // ── Site 2 :1442 PUT /terminate/:shareCode (requireOrganizer delete_session) ──
  it('Site 2 :1442 — organizer ALLOWED (null-owner lockout repaired)', async () => {
    const seed = await seedNullOwnerSession('N2');
    const org = await request(app)
      .put(`/api/sessions/terminate/${seed.shareCode}`)
      .set('x-device-id', nullOrgDev)
      .send({ deviceId: nullOrgDev, ownerDeviceId: nullOrgDev });
    expect(org.status).toBe(200);
    const session = await prisma.mvpSession.findUnique({ where: { id: seed.sessionId } });
    expect(session?.status).toBe('CANCELLED');
  });
  it('Site 2 :1442 — non-organizer PLAYER denied by middleware (null-owner state)', async () => {
    const seed = await seedNullOwnerSession('N2p');
    const player = await request(app)
      .put(`/api/sessions/terminate/${seed.shareCode}`)
      .set('x-device-id', nullPlayerDev)
      .send({ deviceId: nullPlayerDev, ownerDeviceId: nullPlayerDev });
    expectDeniedByRequireOrganizer(player);
  });

  // ── Site 3 :1536 PUT /reactivate/:shareCode (requireOrganizer edit_session) ──
  it('Site 3 :1536 — organizer ALLOWED (null-owner lockout repaired)', async () => {
    const seed = await seedNullOwnerSession('N3', 'CANCELLED');
    const org = await request(app)
      .put(`/api/sessions/reactivate/${seed.shareCode}`)
      .set('x-device-id', nullOrgDev)
      .send({ deviceId: nullOrgDev, ownerDeviceId: nullOrgDev });
    expect(org.status).toBe(200);
    const session = await prisma.mvpSession.findUnique({ where: { id: seed.sessionId } });
    expect(session?.status).toBe('ACTIVE');
  });
  it('Site 3 :1536 — non-organizer PLAYER denied by middleware (null-owner state)', async () => {
    const seed = await seedNullOwnerSession('N3p', 'CANCELLED');
    const player = await request(app)
      .put(`/api/sessions/reactivate/${seed.shareCode}`)
      .set('x-device-id', nullPlayerDev)
      .send({ deviceId: nullPlayerDev, ownerDeviceId: nullPlayerDev });
    expectDeniedByRequireOrganizer(player);
  });

  // ── Site 4 :1665 DELETE /:shareCode/players/:playerId (requireOrganizer remove_players) ──
  it('Site 4 :1665 — organizer ALLOWED (null-owner lockout repaired)', async () => {
    const seed = await seedNullOwnerSession('N4');
    const org = await request(app)
      .delete(`/api/sessions/${seed.shareCode}/players/${seed.targetPlayerId}`)
      .set('x-device-id', nullOrgDev)
      .send({ deviceId: nullOrgDev, organizerDeviceId: nullOrgDev });
    expect(org.status).toBe(200);
    const target = await prisma.mvpPlayer.findUnique({ where: { id: seed.targetPlayerId } });
    expect(target).toBeNull();
  });
  it('Site 4 :1665 — non-organizer PLAYER denied by middleware (null-owner state)', async () => {
    const seed = await seedNullOwnerSession('N4p');
    const player = await request(app)
      .delete(`/api/sessions/${seed.shareCode}/players/${seed.targetPlayerId}`)
      .set('x-device-id', nullPlayerDev)
      .send({ deviceId: nullPlayerDev, organizerDeviceId: nullPlayerDev });
    expectDeniedByRequireOrganizer(player);
  });

  // ── Site 5 :1756 POST /:shareCode/add-player (requireOrganizer add_players) ──
  it('Site 5 :1756 — organizer ALLOWED (null-owner lockout repaired)', async () => {
    const seed = await seedNullOwnerSession('N5');
    const org = await request(app)
      .post(`/api/sessions/${seed.shareCode}/add-player`)
      .set('x-device-id', nullOrgDev)
      .send({ playerName: `NullGuest ${runId}`, deviceId: nullOrgDev, ownerDeviceId: nullOrgDev });
    expect(org.status).toBe(201);
    const added = await prisma.mvpPlayer.findFirst({
      where: { sessionId: seed.sessionId, name: { startsWith: 'NullGuest' } },
    });
    expect(added).not.toBeNull();
  });
  it('Site 5 :1756 — non-organizer PLAYER denied by middleware (null-owner state)', async () => {
    const seed = await seedNullOwnerSession('N5p');
    const player = await request(app)
      .post(`/api/sessions/${seed.shareCode}/add-player`)
      .set('x-device-id', nullPlayerDev)
      .send({ playerName: `NullGuestP ${runId}`, deviceId: nullPlayerDev });
    expectDeniedByRequireOrganizer(player);
  });

  // ── Site 6 :3179 DELETE /:shareCode/players/:playerId (SHADOWED by :1636) ──
  it('Site 6 :3179 — organizer ALLOWED (served by live :1636, lockout repaired)', async () => {
    const seed = await seedNullOwnerSession('N6');
    const org = await request(app)
      .delete(`/api/sessions/${seed.shareCode}/players/${seed.targetPlayerId}`)
      .set('x-device-id', nullOrgDev)
      .send({ deviceId: nullOrgDev, organizerDeviceId: nullOrgDev });
    expect(org.status).toBe(200);
    const target = await prisma.mvpPlayer.findUnique({ where: { id: seed.targetPlayerId } });
    expect(target).toBeNull();
  });
  it('Site 6 :3179 — non-organizer PLAYER denied by middleware (null-owner state)', async () => {
    const seed = await seedNullOwnerSession('N6p');
    const player = await request(app)
      .delete(`/api/sessions/${seed.shareCode}/players/${seed.targetPlayerId}`)
      .set('x-device-id', nullPlayerDev)
      .send({ deviceId: nullPlayerDev, organizerDeviceId: nullPlayerDev });
    expectDeniedByRequireOrganizer(player);
  });

  // ── Site 7 :3445 PUT /:shareCode/players/:playerId/status (SHADOWED by :3022) ──
  it('Site 7 :3445 — organizer SUCCEEDS (live :3022 has NO inline check)', async () => {
    const seed = await seedNullOwnerSession('N7');
    const org = await request(app)
      .put(`/api/sessions/${seed.shareCode}/players/${seed.targetPlayerId}/status`)
      .set('x-device-id', nullOrgDev)
      .send({ status: 'RESTING', deviceId: nullOrgDev, ownerDeviceId: nullOrgDev });
    expect(org.status).toBe(200);
  });
  it('Site 7 :3445 — non-organizer PLAYER denied by middleware (null-owner state)', async () => {
    const seed = await seedNullOwnerSession('N7p');
    const player = await request(app)
      .put(`/api/sessions/${seed.shareCode}/players/${seed.ownerPlayerId}/status`)
      .set('x-device-id', nullPlayerDev)
      .send({ status: 'LEFT', deviceId: nullPlayerDev, ownerDeviceId: nullPlayerDev });
    expectDeniedByRequireOrganizerOrSelf(player);
  });

  // ── Site 8 :3871 PUT /:shareCode/courts (requireOrganizer edit_session) ──
  it('Site 8 :3871 — organizer ALLOWED (null-owner lockout repaired)', async () => {
    const seed = await seedNullOwnerSession('N8');
    const org = await request(app)
      .put(`/api/sessions/${seed.shareCode}/courts`)
      .set('x-device-id', nullOrgDev)
      .send({ courtCount: 9, deviceId: nullOrgDev, ownerDeviceId: nullOrgDev });
    expect(org.status).toBe(200);
    const session = await prisma.mvpSession.findUnique({ where: { id: seed.sessionId } });
    expect(session?.courtCount).toBe(9);
  });
  it('Site 8 :3871 — non-organizer PLAYER denied by middleware (null-owner state)', async () => {
    const seed = await seedNullOwnerSession('N8p');
    const player = await request(app)
      .put(`/api/sessions/${seed.shareCode}/courts`)
      .set('x-device-id', nullPlayerDev)
      .send({ courtCount: 8, deviceId: nullPlayerDev, ownerDeviceId: nullPlayerDev });
    expectDeniedByRequireOrganizer(player);
  });

  // ── Site 9 :4055 PUT /:shareCode/players/:playerId/rest (requireOrganizerOrSelf) ──
  it('Site 9 :4055 — organizer ALLOWED (null-owner lockout repaired)', async () => {
    const seed = await seedNullOwnerSession('N9');
    const org = await request(app)
      .put(`/api/sessions/${seed.shareCode}/players/${seed.targetPlayerId}/rest`)
      .set('x-device-id', nullOrgDev)
      .send({ gamesCount: 3, deviceId: nullOrgDev, ownerDeviceId: nullOrgDev });
    expect(org.status).toBe(200);
    const target = await prisma.mvpPlayer.findUnique({ where: { id: seed.targetPlayerId } });
    expect(target?.restGamesRemaining).toBe(3);
  });
  it('Site 9 :4055 — non-organizer PLAYER denied by middleware (null-owner state)', async () => {
    const seed = await seedNullOwnerSession('N9p');
    const player = await request(app)
      .put(`/api/sessions/${seed.shareCode}/players/${seed.ownerPlayerId}/rest`)
      .set('x-device-id', nullPlayerDev)
      .send({ gamesCount: 3, deviceId: nullPlayerDev, ownerDeviceId: nullPlayerDev });
    expectDeniedByRequireOrganizerOrSelf(player);
  });
});
