/**
 * Story 6.8 (D4) — NPS instrument.
 *
 * NPS is a **0–10** "likelihood to recommend Rally" score, platform-level and
 * distinct from CSAT (`TournamentFeedback.rating`, 1–5). These tests pin the
 * scale bounds at both ends and the summary arithmetic (promoters ≥ 9,
 * passives 7–8, detractors ≤ 6), against the real router and the real Postgres
 * schema.
 */

import request from 'supertest';
import express, { Express } from 'express';
import { UserRole } from '@prisma/client';
import { prisma } from '../../config/database';
import { JWTUtils } from '../../utils/jwt';
import communityRouter from '../community';

jest.setTimeout(60000);

const app: Express = express();
app.use(express.json());
app.use('/community', communityRouter);

// ---------------------------------------------------------------------------
// Fixtures / teardown
// ---------------------------------------------------------------------------

const createdUserIds: string[] = [];
const createdDeviceIds: string[] = [];
let sequence = 0;

function uniqueSuffix(): string {
  sequence += 1;
  return `${Date.now()}-${process.pid}-${sequence}`;
}

async function createUser(role: UserRole): Promise<{ id: string; token: string }> {
  const suffix = uniqueSuffix();
  const user = await prisma.user.create({
    data: {
      name: `6.8-nps-${suffix}`,
      email: `s68-nps-${suffix}@example.test`,
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

/** Submit an NPS score from a fresh device-only identity. */
async function submitNps(score: number): Promise<request.Response> {
  const deviceId = `nps-device-${uniqueSuffix()}`;
  createdDeviceIds.push(deviceId);
  return request(app).post('/community/nps').set('x-device-id', deviceId).send({ score });
}

afterAll(async () => {
  await prisma.npsResponse
    .deleteMany({
      where: {
        OR: [
          { deviceId: { in: createdDeviceIds } },
          { userId: { in: createdUserIds } },
        ],
      },
    })
    .catch(() => undefined);
  for (const id of createdUserIds) {
    await prisma.user.delete({ where: { id } }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// AC 3 — the 0–10 scale, both ends and out of range
// ---------------------------------------------------------------------------

describe('POST /community/nps — NPS is a 0-10 scale', () => {
  it('accepts a score of 0 (the detractor floor)', async () => {
    const res = await submitNps(0);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.score).toBe(0);
    expect(res.body.data).toHaveProperty('id');
  });

  it('accepts a score of 10 (the promoter ceiling)', async () => {
    const res = await submitNps(10);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.score).toBe(10);
  });

  it('rejects an out-of-range score of 11', async () => {
    const res = await submitNps(11);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects an out-of-range score of -1', async () => {
    const res = await submitNps(-1);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC 6 — identity: account (JWT) and device both accepted
// ---------------------------------------------------------------------------

describe('POST /community/nps — identity', () => {
  it('accepts an account (JWT) caller with NO deviceId and persists userId', async () => {
    const user = await createUser('PLAYER');

    const res = await request(app)
      .post('/community/nps')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ score: 9 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const row = await prisma.npsResponse.findUnique({ where: { id: res.body.data.id } });
    expect(row).not.toBeNull();
    expect(row!.userId).toBe(user.id);
    expect(row!.deviceId).toBeNull();
  });

  it('rejects a present-but-invalid Bearer token (401, never a 500 or silent anonymous)', async () => {
    const res = await request(app)
      .post('/community/nps')
      .set('Authorization', 'Bearer not-a-real-token')
      .send({ score: 9 });

    // `optionalAuth` never downgrades a present-but-invalid token to anonymous.
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('still accepts a device-only caller via the x-device-id header', async () => {
    const deviceId = `nps-device-${uniqueSuffix()}`;
    createdDeviceIds.push(deviceId);

    const res = await request(app)
      .post('/community/nps')
      .set('x-device-id', deviceId)
      .send({ score: 8 });

    expect(res.status).toBe(201);
    const row = await prisma.npsResponse.findUnique({ where: { id: res.body.data.id } });
    expect(row!.deviceId).toBe(deviceId);
    expect(row!.userId).toBeNull();
  });

  it('still accepts a device-only caller via a body deviceId', async () => {
    const deviceId = `nps-device-${uniqueSuffix()}`;
    createdDeviceIds.push(deviceId);

    const res = await request(app).post('/community/nps').send({ score: 7, deviceId });

    expect(res.status).toBe(201);
    const row = await prisma.npsResponse.findUnique({ where: { id: res.body.data.id } });
    expect(row!.deviceId).toBe(deviceId);
    expect(row!.userId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC 3 / AC 8 — summary aggregation
// ---------------------------------------------------------------------------

describe('GET /community/nps/summary', () => {
  it('computes promoters/passives/detractors from a known fixture', async () => {
    const admin = await createUser('ADMIN');

    const baseRes = await request(app)
      .get('/community/nps/summary')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(baseRes.status).toBe(200);
    const base = baseRes.body.data;

    // Fixture: 5 promoters (9–10), 3 passives (7–8), 2 detractors (0–6).
    const scores = [10, 9, 9, 10, 9, 8, 7, 8, 0, 6];
    for (const score of scores) {
      const res = await submitNps(score);
      expect(res.status).toBe(201);
    }

    const afterRes = await request(app)
      .get('/community/nps/summary')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(afterRes.status).toBe(200);
    const after = afterRes.body.data;

    // Assert deltas so the test is robust to any pre-existing rows.
    expect(after.responses - base.responses).toBe(10);
    expect(after.promoters - base.promoters).toBe(5);
    expect(after.passives - base.passives).toBe(3);
    expect(after.detractors - base.detractors).toBe(2);
    expect(after.nps).toBeCloseTo(
      ((after.promoters - after.detractors) / after.responses) * 100,
      5,
    );
  });

  it('refuses a non-admin caller (403)', async () => {
    const player = await createUser('PLAYER');

    const res = await request(app)
      .get('/community/nps/summary')
      .set('Authorization', `Bearer ${player.token}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('refuses an anonymous caller (401)', async () => {
    const res = await request(app).get('/community/nps/summary');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
