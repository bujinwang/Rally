/**
 * Story 6.8 (D5) — repaired CSAT feedback write path.
 *
 * The old `POST /tournaments/:id/feedback` was unimplementable: it stored a
 * `User.id` into `TournamentFeedback.playerId` (which FK'd to `MvpPlayer.id`),
 * with a `'temp-user-id'` fallback, and checked participation by comparing a
 * device id to a user id. The FK is now repointed to `TournamentPlayer.id` and
 * the path resolves the caller's tournament-scoped participant row.
 *
 * These tests pin the repaired identity model against the real router and the
 * real Postgres schema: a non-participant is 403, a participating device-only
 * caller succeeds and the row is a **`TournamentPlayer.id`** (never a `User.id`
 * or an `MvpPlayer.id`), and the rating is validated 1–5.
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

async function createUser(label: string): Promise<{ id: string; token: string }> {
  const suffix = uniqueSuffix();
  const user = await prisma.user.create({
    data: {
      name: `6.8-fb-${label}-${suffix}`,
      email: `s68-fb-${label}-${suffix}@example.test`,
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

async function createTournament(): Promise<string> {
  const suffix = uniqueSuffix();
  const tournament = await prisma.tournament.create({
    data: {
      name: `6.8 Feedback Tournament ${suffix}`,
      organizer: `6.8 Organizer ${suffix}`,
      startDate: new Date(Date.now() + 86400000),
      registrationDeadline: new Date(Date.now() + 3600000),
      visibility: 'PUBLIC',
    },
  });
  createdTournamentIds.push(tournament.id);
  return tournament.id;
}

/** Register a `TournamentPlayer` for a tournament and return its id. */
async function createParticipant(
  tournamentId: string,
  opts: { deviceId?: string; userId?: string },
): Promise<string> {
  const suffix = uniqueSuffix();
  const participant = await prisma.tournamentPlayer.create({
    data: {
      tournamentId,
      playerName: `6.8 Player ${suffix}`,
      deviceId: opts.deviceId ?? null,
      userId: opts.userId ?? null,
    },
  });
  return participant.id;
}

afterAll(async () => {
  for (const id of createdTournamentIds) {
    await prisma.tournamentFeedback.deleteMany({ where: { tournamentId: id } }).catch(() => undefined);
    await prisma.tournamentPlayer.deleteMany({ where: { tournamentId: id } }).catch(() => undefined);
    await prisma.tournamentAnalytics.deleteMany({ where: { tournamentId: id } }).catch(() => undefined);
    await prisma.tournament.delete({ where: { id } }).catch(() => undefined);
  }
  for (const id of createdUserIds) {
    await prisma.user.delete({ where: { id } }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// AC 3 / AC 6 — identity
// ---------------------------------------------------------------------------

describe('POST /tournaments/:id/feedback — repaired CSAT write path', () => {
  it('rejects a non-participant with 403', async () => {
    const tournamentId = await createTournament();
    const stranger = await createUser('stranger');

    const res = await request(app)
      .post(`/tournaments/${tournamentId}/feedback`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({ rating: 4 });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_PARTICIPANT');
  });

  it('lets a participating device-only caller succeed with a TournamentPlayer.id', async () => {
    const tournamentId = await createTournament();
    const deviceId = `fb-device-${uniqueSuffix()}`;
    const tournamentPlayerId = await createParticipant(tournamentId, { deviceId });

    const res = await request(app)
      .post(`/tournaments/${tournamentId}/feedback`)
      .set('x-device-id', deviceId)
      .send({ rating: 5, comments: 'Great tournament' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');

    const row = await prisma.tournamentFeedback.findUnique({ where: { id: res.body.data.id } });
    expect(row).not.toBeNull();

    // The row is a `TournamentPlayer.id` ...
    expect(row!.playerId).toBe(tournamentPlayerId);
    // ... and explicitly NOT a `User.id` nor an `MvpPlayer.id` (the two wrong
    // identities the old path used / pointed at).
    expect(await prisma.user.findUnique({ where: { id: row!.playerId } })).toBeNull();
    expect(await prisma.mvpPlayer.findUnique({ where: { id: row!.playerId } })).toBeNull();
    expect(await prisma.tournamentPlayer.findUnique({ where: { id: row!.playerId } })).not.toBeNull();
  });

  it('lets a JWT participant matched by userId succeed', async () => {
    const tournamentId = await createTournament();
    const user = await createUser('participant');
    const tournamentPlayerId = await createParticipant(tournamentId, { userId: user.id });

    const res = await request(app)
      .post(`/tournaments/${tournamentId}/feedback`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ rating: 3 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const row = await prisma.tournamentFeedback.findUnique({ where: { id: res.body.data.id } });
    expect(row!.playerId).toBe(tournamentPlayerId);
  });

  it('returns the { success, data } envelope on success', async () => {
    const tournamentId = await createTournament();
    const deviceId = `fb-device-${uniqueSuffix()}`;
    await createParticipant(tournamentId, { deviceId });

    const res = await request(app)
      .post(`/tournaments/${tournamentId}/feedback`)
      .set('x-device-id', deviceId)
      .send({ rating: 4 });

    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body).toHaveProperty('timestamp');
    // The pre-fix body was `{ message, feedback }` — `success` did not exist.
    expect(res.body).not.toHaveProperty('feedback');
  });

  it('rejects a rating outside 1-5 (6)', async () => {
    const tournamentId = await createTournament();
    const deviceId = `fb-device-${uniqueSuffix()}`;
    await createParticipant(tournamentId, { deviceId });

    const res = await request(app)
      .post(`/tournaments/${tournamentId}/feedback`)
      .set('x-device-id', deviceId)
      .send({ rating: 6 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects a rating outside 1-5 (0)', async () => {
    const tournamentId = await createTournament();
    const deviceId = `fb-device-${uniqueSuffix()}`;
    await createParticipant(tournamentId, { deviceId });

    const res = await request(app)
      .post(`/tournaments/${tournamentId}/feedback`)
      .set('x-device-id', deviceId)
      .send({ rating: 0 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects an anonymous caller (401)', async () => {
    const tournamentId = await createTournament();

    const res = await request(app)
      .post(`/tournaments/${tournamentId}/feedback`)
      .send({ rating: 4 });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Regression — the sibling analytics route is unaffected by the repair
// ---------------------------------------------------------------------------

describe('Regression — GET /tournaments/:id/analytics still works', () => {
  it('returns 200 with { success, data } for a PUBLIC tournament', async () => {
    const tournamentId = await createTournament();

    const res = await request(app).get(`/tournaments/${tournamentId}/analytics`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
  });
});
