/**
 * Story 6.7 T04 — AC 9 anti-vacuity acceptance test.
 *
 * This is the single most important test in the story. The pre-6.7 call graph
 * was unreachable: `generateBracket` had zero non-test callers and
 * `startTournament` created 0 rounds / 0 matches, so `completionRate` was
 * permanently 0 (design §0.1, QA finding 1). A test that only called the pure
 * generator would therefore pass **vacuously** — "100% correctness" describing
 * dead code.
 *
 * So every assertion here drives the real HTTP routes against the real Postgres
 * schema and reads the **persisted rows** back. The champion is enumerated by
 * hand (the top seed wins when the lower seed always wins), never recomputed by
 * re-running the engine — that would only prove self-consistency.
 *
 * Covered: create → identity recorded → generate → progress → completion (AC 9),
 * byes auto-advancing through HTTP, the `BracketError` → 400 mapping, the
 * organizer guard, and the preserved public contracts (AC 5).
 */

import request from 'supertest';
import express, { Express } from 'express';
import { prisma } from '../../config/database';
import { JWTUtils } from '../../utils/jwt';
import tournamentsRouter from '../tournaments';

jest.setTimeout(60000);

const app: Express = express();
app.use(express.json());
app.use('/tournaments', tournamentsRouter);

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

async function createUser(label: string): Promise<{ id: string; token: string }> {
  const suffix = uniqueSuffix();
  const user = await prisma.user.create({
    data: {
      name: `T04-${label}-${suffix}`,
      email: `t04-${label}-${suffix}@example.test`,
      role: 'PLAYER',
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

function tournamentBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: `T04-${uniqueSuffix()}`,
    tournamentType: 'SINGLE_ELIMINATION',
    maxPlayers: 8,
    minPlayers: 2,
    startDate: '2026-06-01T09:00:00Z',
    registrationDeadline: '2026-05-25T23:59:59Z',
    matchFormat: 'SINGLES',
    scoringSystem: '21_POINT',
    bestOfGames: 3,
    entryFee: 0,
    prizePool: 0,
    currency: 'USD',
    organizerName: 'T04 Organizer',
    visibility: 'PUBLIC',
    ...overrides,
  };
}

/** Create a tournament through the real route; returns its id. */
async function createTournament(
  overrides: Record<string, unknown> = {},
  opts: { token?: string; deviceId?: string } = {},
): Promise<string> {
  let req = request(app).post('/tournaments').send(tournamentBody(overrides));
  if (opts.token) req = req.set('Authorization', `Bearer ${opts.token}`);
  if (opts.deviceId) req = req.set('x-device-id', opts.deviceId);

  const res = await req;
  expect(res.status).toBe(201);
  const id = res.body.data.id as string;
  createdTournamentIds.push(id);
  return id;
}

async function registerPlayers(tournamentId: string, names: string[]): Promise<void> {
  for (const playerName of names) {
    const res = await request(app)
      .post(`/tournaments/${tournamentId}/register`)
      .send({ playerName });
    expect(res.status).toBe(201);
  }
}

interface PlayerJson {
  id: string;
  seed: number | null;
  playerName: string;
}

interface BracketMatchJson {
  id: string;
  round: number;
  match: number;
  player1Id: string | null;
  player2Id: string | null;
  winnerId: string | null;
  status: string;
}

interface BracketJson {
  tournamentId: string;
  totalRounds: number;
  totalPlayers: number;
  bracket: BracketMatchJson[][];
  isComplete: boolean;
  format: string;
  totalMatches: number;
  byePlayers: string[];
}

interface SeedMaps {
  idBySeed: Map<number, string>;
  seedById: Map<string, number>;
  nameBySeed: Map<number, string>;
}

async function loadSeedMaps(tournamentId: string): Promise<SeedMaps> {
  const res = await request(app).get(`/tournaments/${tournamentId}`);
  expect(res.status).toBe(200);
  const players = res.body.data.players as PlayerJson[];

  const idBySeed = new Map<number, string>();
  const seedById = new Map<string, number>();
  const nameBySeed = new Map<number, string>();
  for (const player of players) {
    if (player.seed == null) continue;
    idBySeed.set(player.seed, player.id);
    seedById.set(player.id, player.seed);
    nameBySeed.set(player.seed, player.playerName);
  }
  return { idBySeed, seedById, nameBySeed };
}

async function fetchBracket(tournamentId: string): Promise<BracketJson> {
  const res = await request(app).get(`/tournaments/${tournamentId}/bracket`);
  expect(res.status).toBe(200);
  return res.body.data.bracket as BracketJson;
}

/**
 * Play every playable match in the earliest round that still has one, through
 * the real result route, always letting the lower seed win. Returns how many
 * matches were recorded.
 */
async function playEarliestRound(
  tournamentId: string,
  token: string,
  seedById: Map<string, number>,
): Promise<number> {
  const bracket = await fetchBracket(tournamentId);

  let playable: BracketMatchJson[] = [];
  for (const round of bracket.bracket) {
    const candidates = round.filter(
      (match) => match.player1Id && match.player2Id && match.status !== 'COMPLETED',
    );
    if (candidates.length > 0) {
      playable = candidates;
      break;
    }
  }
  if (playable.length === 0) return 0;

  for (const match of playable) {
    const seed1 = seedById.get(match.player1Id as string) as number;
    const seed2 = seedById.get(match.player2Id as string) as number;
    const winnerId = seed1 <= seed2 ? (match.player1Id as string) : (match.player2Id as string);

    const res = await request(app)
      .post(`/tournaments/${tournamentId}/matches/${match.id}/result`)
      .set('Authorization', `Bearer ${token}`)
      .send({ winnerId });
    expect(res.status).toBe(200);
  }
  return playable.length;
}

/** Drive the bracket to completion; returns the total matches recorded. */
async function playThrough(
  tournamentId: string,
  token: string,
  seedById: Map<string, number>,
): Promise<number> {
  let total = 0;
  for (let guard = 0; guard < 32; guard += 1) {
    const played = await playEarliestRound(tournamentId, token, seedById);
    if (played === 0) return total;
    total += played;
  }
  throw new Error('playThrough did not terminate — bracket progression is stuck');
}

afterAll(async () => {
  for (const id of createdTournamentIds) {
    await prisma.tournamentAnalytics.deleteMany({ where: { tournamentId: id } }).catch(() => undefined);
    await prisma.tournamentFeedback.deleteMany({ where: { tournamentId: id } }).catch(() => undefined);
    await prisma.tournament.delete({ where: { id } }).catch(() => undefined);
  }
  for (const id of createdUserIds) {
    await prisma.user.delete({ where: { id } }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// AC 9 — generate → progress → complete, end to end
// ---------------------------------------------------------------------------

describe('AC 9 — bracket generation through completion (anti-vacuity)', () => {
  it('creates, generates, progresses and completes an 8-player bracket via HTTP', async () => {
    const organizer = await createUser('organizer');
    const tournamentId = await createTournament({ maxPlayers: 8 }, { token: organizer.token });

    const names = ['Ann', 'Ben', 'Cara', 'Dan', 'Eve', 'Finn', 'Gus', 'Hana']; // seeds 1..8
    await registerPlayers(tournamentId, names);

    // ---- Generate through POST /:id/start (existing public contract) --------
    const start = await request(app).post(`/tournaments/${tournamentId}/start`);
    expect(start.status).toBe(200);
    expect(start.body.success).toBe(true);
    const startBracket = start.body.data.bracket as BracketJson;
    expect(startBracket.totalRounds).toBe(3);
    expect(startBracket.format).toBe('SINGLE_ELIMINATION');

    // ---- Persisted rows actually exist (the old code created 0) -------------
    expect(await prisma.tournamentRound.count({ where: { tournamentId } })).toBe(3);
    const allMatches = await prisma.tournamentMatch.findMany({
      where: { tournamentId },
      include: { round: true },
    });
    expect(allMatches).toHaveLength(7);

    const seeds = await loadSeedMaps(tournamentId);

    // ---- Round 1 is playable; later rounds are placeholders -----------------
    const round1 = allMatches.filter((match) => match.round?.roundNumber === 1);
    expect(round1.every((match) => match.player1Id && match.player2Id)).toBe(true);
    const round3Before = allMatches.filter((match) => match.round?.roundNumber === 3);
    expect(round3Before.every((match) => match.player1Id === null && match.player2Id === null)).toBe(true);

    // ---- Play round 1; round 2 must become fully populated (persisted) ------
    expect(await playEarliestRound(tournamentId, organizer.token, seeds.seedById)).toBe(4);
    const round2 = await prisma.tournamentMatch.findMany({
      where: { tournamentId, round: { roundNumber: 2 } },
    });
    expect(round2).toHaveLength(2);
    expect(round2.every((match) => match.player1Id && match.player2Id)).toBe(true);

    // ---- Finish the bracket -------------------------------------------------
    const remaining = await playThrough(tournamentId, organizer.token, seeds.seedById);
    expect(remaining).toBe(3); // 2 semifinals + 1 final

    // ---- Champion enumerated by hand: the top seed --------------------------
    const championId = seeds.idBySeed.get(1) as string;
    const result = await prisma.tournamentResult.findUnique({ where: { tournamentId } });
    expect(result).not.toBeNull();
    expect(result?.winnerId).toBe(championId);
    expect(result?.winnerName).toBe(names[0]);

    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
    expect(tournament?.status).toBe('COMPLETED');

    // ---- The bracket reads back complete, and stats are no longer vacuous ---
    const finalBracket = await fetchBracket(tournamentId);
    expect(finalBracket.isComplete).toBe(true);
    expect(finalBracket.totalMatches).toBe(7);

    const stats = await request(app).get(`/tournaments/${tournamentId}/stats`);
    expect(stats.status).toBe(200);
    expect(stats.body.data.totalMatches).toBe(7);
    expect(stats.body.data.completedMatches).toBe(7);
    expect(stats.body.data.completionRate).toBe(100);

    // ---- AC 4: the analytics refresh ran and did not throw ------------------
    const analytics = await prisma.tournamentAnalytics.findUnique({ where: { tournamentId } });
    expect(analytics).not.toBeNull();
    expect(analytics?.completionRate).toBeGreaterThan(0);

    // ---- Standings put the champion first ----------------------------------
    const standings = await request(app).get(`/tournaments/${tournamentId}/standings`);
    expect(standings.status).toBe(200);
    expect(standings.body.data.standings[0].playerId).toBe(championId);
    expect(standings.body.data.standings[0].rank).toBe(1);
  });

  it('auto-advances byes through HTTP for a 5-player field', async () => {
    const organizer = await createUser('organizer');
    const tournamentId = await createTournament({ maxPlayers: 5 }, { token: organizer.token });
    await registerPlayers(tournamentId, ['A', 'B', 'C', 'D', 'E']); // seeds 1..5

    const start = await request(app).post(`/tournaments/${tournamentId}/start`);
    expect(start.status).toBe(200);
    const bracket = start.body.data.bracket as BracketJson;

    expect(bracket.totalRounds).toBe(3);
    expect(bracket.bracket[0]).toHaveLength(4);
    // Exactly three first-round byes, each with exactly one real player.
    const byes = bracket.bracket[0].filter((match) => match.status === 'BYE');
    expect(byes).toHaveLength(3);
    for (const bye of byes) {
      expect([bye.player1Id, bye.player2Id].filter(Boolean)).toHaveLength(1);
      expect(bye.winnerId).not.toBeNull();
    }

    // The three bye winners (top seeds) are persisted into round 2.
    const seeds = await loadSeedMaps(tournamentId);
    const round2 = await prisma.tournamentMatch.findMany({
      where: { tournamentId, round: { roundNumber: 2 } },
    });
    const occupied = round2
      .flatMap((match) => [match.player1Id, match.player2Id])
      .filter((id): id is string => typeof id === 'string');
    expect(occupied).toHaveLength(3);
    expect(new Set(occupied)).toEqual(
      new Set([seeds.idBySeed.get(1), seeds.idBySeed.get(2), seeds.idBySeed.get(3)]),
    );
  });
});

// ---------------------------------------------------------------------------
// Create path records organizer identity (AC 15 round trip)
// ---------------------------------------------------------------------------

describe('create path records organizer identity (AC 15)', () => {
  it('records the JWT organizer and lets only that user mutate the tournament', async () => {
    const organizer = await createUser('organizer');
    const intruder = await createUser('intruder');
    const tournamentId = await createTournament({ maxPlayers: 4 }, { token: organizer.token });

    const row = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { organizerUserId: true, organizerDeviceId: true },
    });
    expect(row?.organizerUserId).toBe(organizer.id);
    expect(row?.organizerDeviceId).toBeNull();

    await registerPlayers(tournamentId, ['A', 'B', 'C', 'D']);

    const asCreator = await request(app)
      .post(`/tournaments/${tournamentId}/bracket/generate`)
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(asCreator.status).toBe(201);

    const asIntruder = await request(app)
      .post(`/tournaments/${tournamentId}/bracket/generate`)
      .set('Authorization', `Bearer ${intruder.token}`);
    expect(asIntruder.status).toBe(403);
    expect(asIntruder.body.error.code).toBe('FORBIDDEN');
  });

  it('records a device organizer identity and lets that device mutate the tournament', async () => {
    const deviceId = `device-${uniqueSuffix()}`;
    const tournamentId = await createTournament({ maxPlayers: 4 }, { deviceId });

    const row = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { organizerUserId: true, organizerDeviceId: true },
    });
    expect(row?.organizerUserId).toBeNull();
    expect(row?.organizerDeviceId).toBe(deviceId);

    await registerPlayers(tournamentId, ['A', 'B', 'C', 'D']);

    const generate = await request(app)
      .post(`/tournaments/${tournamentId}/bracket/generate`)
      .set('x-device-id', deviceId);
    expect(generate.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// Guard behaviour on the new mutation endpoints
// ---------------------------------------------------------------------------

describe('organizer guard on the new mutation endpoints (AC 15)', () => {
  it('denies anonymous and non-organizer callers, allows the organizer', async () => {
    const organizer = await createUser('organizer');
    const intruder = await createUser('intruder');
    const tournamentId = await createTournament({ maxPlayers: 4 }, { token: organizer.token });
    await registerPlayers(tournamentId, ['A', 'B', 'C', 'D']);

    // Anonymous → 403 (fails closed).
    const anonymous = await request(app).post(`/tournaments/${tournamentId}/bracket/generate`);
    expect(anonymous.status).toBe(403);
    expect(anonymous.body.error.code).toBe('FORBIDDEN');

    // A different authenticated user → 403.
    const wrong = await request(app)
      .post(`/tournaments/${tournamentId}/bracket/generate`)
      .set('Authorization', `Bearer ${intruder.token}`);
    expect(wrong.status).toBe(403);

    // The organizer → 201.
    const ok = await request(app)
      .post(`/tournaments/${tournamentId}/bracket/generate`)
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(ok.status).toBe(201);
    expect((ok.body.data.bracket as BracketJson).totalRounds).toBe(2); // 4 players

    // The result route is guarded too.
    const anonymousResult = await request(app)
      .post(`/tournaments/${tournamentId}/matches/anything/result`)
      .send({ winnerId: 'x' });
    expect(anonymousResult.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// BracketError → HTTP status mapping
// ---------------------------------------------------------------------------

describe('BracketError mapping', () => {
  it('returns 400 (not 500) for a non-power-of-two double-elimination field', async () => {
    const organizer = await createUser('organizer');
    const tournamentId = await createTournament(
      { tournamentType: 'DOUBLE_ELIMINATION', maxPlayers: 6 },
      { token: organizer.token },
    );
    await registerPlayers(tournamentId, ['A', 'B', 'C', 'D', 'E', 'F']);

    const res = await request(app)
      .post(`/tournaments/${tournamentId}/bracket/generate`)
      .set('Authorization', `Bearer ${organizer.token}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BRACKET_GENERATION_FAILED');
  });

  it('returns 404 for an unknown tournament bracket', async () => {
    const res = await request(app).get('/tournaments/does-not-exist/bracket');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('BRACKET_NOT_FOUND');
  });

  it('returns 404 when generating a bracket for an unknown tournament', async () => {
    const organizer = await createUser('organizer');
    const res = await request(app)
      .post('/tournaments/does-not-exist/bracket/generate')
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Result correction through HTTP (AC 12)
// ---------------------------------------------------------------------------

describe('result correction through HTTP (AC 12)', () => {
  it('refuses without cascade, then corrects with cascade and un-finalises', async () => {
    const organizer = await createUser('organizer');
    const tournamentId = await createTournament({ maxPlayers: 4 }, { token: organizer.token });
    await registerPlayers(tournamentId, ['A', 'B', 'C', 'D']);

    const start = await request(app).post(`/tournaments/${tournamentId}/start`);
    expect(start.status).toBe(200);

    const seeds = await loadSeedMaps(tournamentId);
    await playThrough(tournamentId, organizer.token, seeds.seedById);

    expect((await prisma.tournament.findUnique({ where: { id: tournamentId } }))?.status).toBe(
      'COMPLETED',
    );

    const round1 = await prisma.tournamentMatch.findMany({
      where: { tournamentId, round: { roundNumber: 1 } },
      orderBy: { matchNumber: 'asc' },
    });
    const first = round1[0];
    const otherId = first.player1Id === first.winnerId ? first.player2Id : first.player1Id;

    // The final is already completed → the correction is refused (409).
    const blocked = await request(app)
      .post(`/tournaments/${tournamentId}/matches/${first.id}/correct`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ winnerId: otherId, reason: 'wrong button' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('DOWNSTREAM_COMPLETED');

    // With cascade it succeeds, the downstream results are voided, and the
    // tournament reverts to IN_PROGRESS with no stale champion.
    const corrected = await request(app)
      .post(`/tournaments/${tournamentId}/matches/${first.id}/correct`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ winnerId: otherId, reason: 'wrong button', cascade: true });
    expect(corrected.status).toBe(200);
    expect(corrected.body.data.recomputed).toBe(true);
    expect(corrected.body.data.clearedDownstreamMatchIds.length).toBeGreaterThan(0);

    expect((await prisma.tournament.findUnique({ where: { id: tournamentId } }))?.status).toBe(
      'IN_PROGRESS',
    );
    expect(
      await prisma.tournamentResult.findUnique({ where: { tournamentId } }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Existing public contracts preserved (AC 5)
// ---------------------------------------------------------------------------

describe('existing public endpoints stay unauthenticated (AC 5)', () => {
  it('serves the pre-existing endpoints without any auth header', async () => {
    const organizer = await createUser('organizer');
    const tournamentId = await createTournament({ maxPlayers: 4 }, { token: organizer.token });

    expect((await request(app).get('/tournaments')).status).toBe(200);
    expect((await request(app).get(`/tournaments/${tournamentId}`)).status).toBe(200);
    expect((await request(app).get(`/tournaments/${tournamentId}/stats`)).status).toBe(200);
    expect((await request(app).get(`/tournaments/${tournamentId}/standings`)).status).toBe(200);

    // No bracket exists yet → the public GET returns 404.
    expect((await request(app).get(`/tournaments/${tournamentId}/bracket`)).status).toBe(404);

    // Registration is still public.
    const register = await request(app)
      .post(`/tournaments/${tournamentId}/register`)
      .send({ playerName: 'Zed' });
    expect(register.status).toBe(201);
  });
});
