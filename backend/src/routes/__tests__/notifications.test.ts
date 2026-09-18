// @ts-nocheck
/**
 * Story 6.9 — notifications route contract, exercised against the REAL Postgres
 * schema (not a mocked Prisma).
 *
 * The previous version of this file mocked Prisma, so the foreign-key contract
 * on `push_tokens.playerId -> mvp_players.id` was never enforced. The mock made
 * POST /notifications/register look green even though it writes
 * `playerId: deviceId` and therefore throws P2003 at runtime (F1 in
 * 6.9.design.md). A mocked persistence layer cannot pin a persistence contract —
 * the same lesson as the 6.11 /stats test.
 *
 * These tests use the real `prisma` client and the real router, so they require
 * a reachable test database (the same one the rest of the backend suite uses).
 */

import request from 'supertest';
import express from 'express';
import { prisma } from '../../config/database';
import { JWTUtils } from '../../utils/jwt';
import notificationsRouter from '../notifications';

const app = express();
app.use(express.json());
app.use('/notifications', notificationsRouter);

jest.setTimeout(60000);

// Unique per run so fixtures never collide with other suites or each other.
const RUN = `${Date.now()}-${process.pid}`;
const DEVICE = `6-9-device-${RUN}`;
const EDGE_DEVICE = `6-9-edge-${RUN}`;
const SHARE = `6-9-${RUN}`.slice(0, 16); // shareCode is a short unique string

let sessionId: string;
const createdUserIds: string[] = [];

async function createUser(): Promise<{ id: string; token: string }> {
  const user = await prisma.user.create({
    data: {
      name: `6.9 Notif User ${RUN}`,
      email: `s69-notif-${RUN}-${createdUserIds.length}@example.test`,
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

beforeAll(async () => {
  const session = await prisma.mvpSession.create({
    data: {
      name: `6.9 Sub Session ${RUN}`,
      ownerName: `6.9 Sub Owner ${RUN}`,
      scheduledAt: new Date(Date.now() + 86400000),
      shareCode: SHARE,
    },
  });
  sessionId = session.id;
});

afterAll(async () => {
  const deviceIds = [DEVICE, EDGE_DEVICE];
  await prisma.sessionSubscription.deleteMany({ where: { deviceId: { in: deviceIds } } }).catch(() => undefined);
  await prisma.pushToken
    .deleteMany({
      where: { OR: [{ deviceId: { in: deviceIds } }, { userId: { in: createdUserIds } }] },
    })
    .catch(() => undefined);
  for (const id of createdUserIds) {
    await prisma.user.delete({ where: { id } }).catch(() => undefined);
  }
  await prisma.mvpSession.deleteMany({ where: { shareCode: SHARE } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe('Notifications routes — validation (no DB rows required)', () => {
  it('POST /register returns 400 when required fields are missing', async () => {
    const res = await request(app).post('/notifications/register').send({}).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /register returns 400 for an invalid platform', async () => {
    const res = await request(app)
      .post('/notifications/register')
      .send({ pushToken: 'tok', deviceId: DEVICE, platform: 'windows' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /:shareCode/subscribe returns 400 when deviceId is missing', async () => {
    const res = await request(app).post(`/notifications/${SHARE}/subscribe`).send({}).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('DELETE /:shareCode/unsubscribe returns 400 when deviceId is missing', async () => {
    const res = await request(app).delete(`/notifications/${SHARE}/unsubscribe`).send({}).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /:shareCode/subscribe returns 404 for an unknown session', async () => {
    const res = await request(app)
      .post('/notifications/DOESNOTEXIST/subscribe')
      .send({ deviceId: DEVICE })
      .expect(404);
    expect(res.body.error.code).toBe('SESSION_NOT_FOUND');
  });

  it('GET /:shareCode/subscribers returns 404 for an unknown session', async () => {
    const res = await request(app).get('/notifications/DOESNOTEXIST/subscribers').expect(404);
    expect(res.body.error.code).toBe('SESSION_NOT_FOUND');
  });
});

describe('Notifications routes — register (REAL DB, F1 BLOCKER)', () => {
  /**
   * The frontend (`NotificationService.registerPushToken`) sends exactly
   * `{ pushToken, deviceId, platform }`. The route stores `playerId: deviceId`,
   * but `PushToken.playerId` is a REQUIRED foreign key to `mvp_players.id` — and a
   * device id is not a player id. So this currently throws P2003
   * (`push_tokens_playerId_fkey`) and the route answers 500. No client can ever
   * register a push token until the identity model in 6.9.design.md §4 is resolved.
   *
   * This test encodes the CORRECT contract and therefore FAILS on the current code.
   * Resolving §4 (and having the route bind a valid player id) flips it green.
   */
  it('POST /register persists a push token for the device', async () => {
    const res = await request(app)
      .post('/notifications/register')
      .send({ pushToken: `tok-${RUN}`, deviceId: DEVICE, platform: 'ios' });

    // Expected once F1 is fixed:
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const stored = await prisma.pushToken.findFirst({ where: { deviceId: DEVICE } });
    expect(stored).not.toBeNull();
    expect(stored!.token).toBe(`tok-${RUN}`);
  });

  it('DELETE /register/:deviceId deactivates tokens for the device', async () => {
    // updateMany is idempotent: with no matching rows it still returns 200. The
    // real-DB version proves the route reaches the table and does not throw.
    const res = await request(app).delete(`/notifications/register/${DEVICE}`).expect(200);
    expect(res.body.success).toBe(true);
  });
});

describe('Notifications routes — register identity (REAL DB, Option C)', () => {
  it('registers for an account (JWT) caller with NO deviceId', async () => {
    const user = await createUser();

    const res = await request(app)
      .post('/notifications/register')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ pushToken: `tok-account-${RUN}`, platform: 'ios' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const stored = await prisma.pushToken.findFirst({ where: { userId: user.id } });
    expect(stored).not.toBeNull();
    expect(stored!.userId).toBe(user.id);
    expect(stored!.deviceId).toBeNull();
    expect(stored!.token).toBe(`tok-account-${RUN}`);
  });

  it('returns 400 (not 500) when neither userId nor deviceId resolves', async () => {
    const res = await request(app)
      .post('/notifications/register')
      .send({ pushToken: `tok-nobody-${RUN}`, platform: 'ios' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('an account-only registration does not overwrite an existing device row', async () => {
    // Seed a device-keyed row.
    const deviceRes = await request(app)
      .post('/notifications/register')
      .send({ pushToken: `tok-edge-device-${RUN}`, deviceId: EDGE_DEVICE, platform: 'android' });
    expect(deviceRes.status).toBe(200);

    const deviceRow = await prisma.pushToken.findFirst({ where: { deviceId: EDGE_DEVICE } });
    expect(deviceRow).not.toBeNull();
    expect(deviceRow!.token).toBe(`tok-edge-device-${RUN}`);

    // An account-only caller must NOT match (or overwrite) the device row: the
    // lookup for a null deviceId would otherwise match every null-deviceId row.
    const user = await createUser();
    const accountRes = await request(app)
      .post('/notifications/register')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ pushToken: `tok-edge-account-${RUN}`, platform: 'ios' });
    expect(accountRes.status).toBe(200);

    // The device row is untouched ...
    const deviceRowAfter = await prisma.pushToken.findUnique({ where: { id: deviceRow!.id } });
    expect(deviceRowAfter).not.toBeNull();
    expect(deviceRowAfter!.token).toBe(`tok-edge-device-${RUN}`);
    expect(deviceRowAfter!.deviceId).toBe(EDGE_DEVICE);

    // ... and a separate account row was created.
    const accountRow = await prisma.pushToken.findFirst({ where: { userId: user.id } });
    expect(accountRow).not.toBeNull();
    expect(accountRow!.deviceId).toBeNull();
    expect(accountRow!.id).not.toBe(deviceRow!.id);
  });
});

describe('Notifications routes — session subscription (REAL DB)', () => {
  it('POST /:shareCode/subscribe upserts an active subscription', async () => {
    const res = await request(app)
      .post(`/notifications/${SHARE}/subscribe`)
      .send({ deviceId: DEVICE })
      .expect(200);
    expect(res.body.success).toBe(true);

    const sub = await prisma.sessionSubscription.findUnique({
      where: { sessionId_deviceId: { sessionId, deviceId: DEVICE } },
    });
    expect(sub).not.toBeNull();
    expect(sub!.isActive).toBe(true);
  });

  it('DELETE /:shareCode/unsubscribe deactivates the subscription', async () => {
    const res = await request(app)
      .delete(`/notifications/${SHARE}/unsubscribe`)
      .send({ deviceId: DEVICE })
      .expect(200);
    expect(res.body.success).toBe(true);

    const sub = await prisma.sessionSubscription.findUnique({
      where: { sessionId_deviceId: { sessionId, deviceId: DEVICE } },
    });
    expect(sub).not.toBeNull();
    expect(sub!.isActive).toBe(false);
  });

  it('GET /:shareCode/subscribers returns the active subscriber count', async () => {
    const res = await request(app).get(`/notifications/${SHARE}/subscribers`).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.count).toBe(0); // unsubscribe above deactivated it
    expect(Array.isArray(res.body.data.subscribers)).toBe(true);
  });
});
