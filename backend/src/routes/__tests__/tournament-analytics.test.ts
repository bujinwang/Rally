/**
 * Story 6.11 — `GET /tournaments/:id/analytics` route.
 *
 * The route existed but was **never mounted**, and its ownership check matched on
 * `req.user.name` — a field no auth middleware populates — so its organizer branch
 * was unreachable and it could only ever serve PUBLIC tournaments. These tests pin
 * both halves of the fix: that the route is reachable at all, and that the access
 * model is what the design says it is.
 *
 * Everything runs against the real router and the real Postgres schema. The
 * identity cases are driven through real headers (`Authorization`, `x-device-id`),
 * not by stubbing `req.user` — a stubbed identity would pass while the real client
 * sent nothing, which is the failure mode Story 6.7's QA hit.
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
      name: `6.11-${label}-${suffix}`,
      email: `s611-${label}-${suffix}@example.test`,
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

async function createTournament(opts: {
  visibility: string;
  organizerUserId?: string | null;
  organizerDeviceId?: string | null;
}): Promise<string> {
  const suffix = uniqueSuffix();
  const tournament = await prisma.tournament.create({
    data: {
      name: `6.11 Tournament ${suffix}`,
      organizer: `6.11 Organizer ${suffix}`,
      startDate: new Date(Date.now() + 86400000),
      registrationDeadline: new Date(Date.now() + 3600000),
      visibility: opts.visibility,
      organizerUserId: opts.organizerUserId ?? null,
      organizerDeviceId: opts.organizerDeviceId ?? null,
    },
  });
  createdTournamentIds.push(tournament.id);
  return tournament.id;
}

afterAll(async () => {
  for (const id of createdTournamentIds) {
    await prisma.tournamentAnalytics.deleteMany({ where: { tournamentId: id } }).catch(() => undefined);
    await prisma.tournament.delete({ where: { id } }).catch(() => undefined);
  }
  for (const id of createdUserIds) {
    await prisma.user.delete({ where: { id } }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// AC 1 / AC 2 — reachable, and the standard envelope
// ---------------------------------------------------------------------------

describe('AC 1/2 — the route is mounted and speaks the standard envelope', () => {
  it('returns 200 with { success, data } for a PUBLIC tournament, anonymously', async () => {
    const id = await createTournament({ visibility: 'PUBLIC' });

    const res = await request(app).get(`/tournaments/${id}/analytics`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('data');
    // The pre-fix body was the bare analytics object (`res.json(analytics)`),
    // so `success` did not exist at all.
    expect(typeof res.body.data).toBe('object');
  });

  it('returns every field the frontend type declares (AC 11)', async () => {
    const id = await createTournament({ visibility: 'PUBLIC' });

    const res = await request(app).get(`/tournaments/${id}/analytics`);
    const data = res.body.data;

    for (const field of [
      'totalRegistered',
      'participationRate',
      'completionRate',
      'matchesCompleted',
      'totalMatches',
      'bracketEfficiency',
      'averageUpsets',
    ]) {
      expect(data).toHaveProperty(field);
      expect(typeof data[field]).toBe('number');
      // Not merely present — actually populated. The screen used to render
      // `undefined` for six of these.
      expect(data[field]).not.toBeUndefined();
    }
    expect(Array.isArray(data.rankingChanges)).toBe(true);
    expect(typeof data.timestamp).toBe('string');
  });

  it('returns 404 with a coded error envelope for an unknown id', async () => {
    const res = await request(app).get('/tournaments/does-not-exist-6-11/analytics');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('TOURNAMENT_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// AC 3 — access model
// ---------------------------------------------------------------------------

describe('AC 3 — access model', () => {
  it('anonymous CAN read a PUBLIC tournament', async () => {
    const id = await createTournament({ visibility: 'PUBLIC' });
    const res = await request(app).get(`/tournaments/${id}/analytics`);
    expect(res.status).toBe(200);
  });

  it('anonymous CANNOT read a PRIVATE tournament (404, existence not disclosed)', async () => {
    const owner = await createUser('owner');
    const id = await createTournament({
      visibility: 'PRIVATE',
      organizerUserId: owner.id,
    });

    const res = await request(app).get(`/tournaments/${id}/analytics`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TOURNAMENT_NOT_FOUND');
  });

  it('the organizer CAN read their own PRIVATE tournament by JWT (organizerUserId)', async () => {
    const owner = await createUser('owner');
    const id = await createTournament({
      visibility: 'PRIVATE',
      organizerUserId: owner.id,
    });

    const res = await request(app)
      .get(`/tournaments/${id}/analytics`)
      .set('Authorization', `Bearer ${owner.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('the organizer CAN read their own PRIVATE tournament by device (organizerDeviceId)', async () => {
    const id = await createTournament({
      visibility: 'PRIVATE',
      organizerDeviceId: 'device-owner-611',
    });

    const res = await request(app)
      .get(`/tournaments/${id}/analytics`)
      .set('x-device-id', 'device-owner-611');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('a DIFFERENT device is refused on a PRIVATE tournament', async () => {
    const id = await createTournament({
      visibility: 'PRIVATE',
      organizerDeviceId: 'device-owner-611',
    });

    const res = await request(app)
      .get(`/tournaments/${id}/analytics`)
      .set('x-device-id', 'device-someone-else');

    expect(res.status).toBe(404);
  });

  it('a DIFFERENT authenticated user is refused on a PRIVATE tournament', async () => {
    const owner = await createUser('owner');
    const stranger = await createUser('stranger');
    const id = await createTournament({
      visibility: 'PRIVATE',
      organizerUserId: owner.id,
    });

    const res = await request(app)
      .get(`/tournaments/${id}/analytics`)
      .set('Authorization', `Bearer ${stranger.token}`);

    expect(res.status).toBe(404);
  });

  it('ESCALATION: a stranger JWT carrying the owner\'s device id is still refused', async () => {
    // The attack the Story 6.7 guard was hardened against: present a valid token
    // for someone else while also supplying the organizer's device id. With a JWT
    // present, ownership must be decided on `userId` alone — never the device.
    const owner = await createUser('owner');
    const stranger = await createUser('stranger');
    const id = await createTournament({
      visibility: 'PRIVATE',
      organizerUserId: owner.id,
      organizerDeviceId: 'device-owner-611',
    });

    const res = await request(app)
      .get(`/tournaments/${id}/analytics`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .set('x-device-id', 'device-owner-611');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('a malformed token is 401, never a silent downgrade to anonymous', async () => {
    const id = await createTournament({ visibility: 'PUBLIC' });

    const res = await request(app)
      .get(`/tournaments/${id}/analytics`)
      .set('Authorization', 'Bearer not-a-real-token');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});
