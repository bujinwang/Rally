/**
 * Story 6.9 (AC 3) — GET/PUT /notifications/preferences, against the REAL
 * Postgres schema.
 *
 * Route ordering is load-bearing: `/preferences` is a static segment and must be
 * matched before any `/:shareCode` parameter route. These tests assert the
 * preferences contract (never a session 404), which would fail if the route were
 * shadowed.
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

const RUN = `${Date.now()}-${process.pid}`;
const DEVICE = `6-9-pref-device-${RUN}`;
const createdUserIds: string[] = [];

async function createUser(): Promise<{ id: string; token: string }> {
  const user = await prisma.user.create({
    data: {
      name: `6.9 Pref User ${RUN}`,
      email: `s69-pref-${RUN}-${createdUserIds.length}@example.test`,
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

beforeEach(async () => {
  await prisma.notificationPreferences.deleteMany({ where: { deviceId: DEVICE } }).catch(() => undefined);
});

afterAll(async () => {
  await prisma.notificationPreferences
    .deleteMany({ where: { OR: [{ deviceId: DEVICE }, { userId: { in: createdUserIds } }] } })
    .catch(() => undefined);
  for (const id of createdUserIds) {
    await prisma.user.delete({ where: { id } }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

describe('GET /notifications/preferences', () => {
  it('returns schema defaults for a device with no stored row', async () => {
    const res = await request(app)
      .get('/notifications/preferences')
      .set('x-device-id', DEVICE)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      pushEnabled: true,
      sessionReminders: true,
      matchResults: true,
      socialMessages: false,
      emailEnabled: false,
    });
    expect(res.body.timestamp).toBeDefined();
  });

  it('returns 400 when no identity is present', async () => {
    const res = await request(app).get('/notifications/preferences').expect(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns the stored row for a device caller', async () => {
    await prisma.notificationPreferences.create({
      data: { deviceId: DEVICE, pushEnabled: false, sessionReminders: false },
    });

    const res = await request(app)
      .get('/notifications/preferences')
      .set('x-device-id', DEVICE)
      .expect(200);

    expect(res.body.data.pushEnabled).toBe(false);
    expect(res.body.data.sessionReminders).toBe(false);
  });

  it('returns preferences for an account (JWT) caller', async () => {
    const user = await createUser();

    const res = await request(app)
      .get('/notifications/preferences')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.pushEnabled).toBe(true);
  });
});

describe('PUT /notifications/preferences', () => {
  it('creates and returns preferences for a device caller', async () => {
    const res = await request(app)
      .put('/notifications/preferences')
      .set('x-device-id', DEVICE)
      .send({ pushEnabled: false, socialMessages: true })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.pushEnabled).toBe(false);
    expect(res.body.data.socialMessages).toBe(true);

    const row = await prisma.notificationPreferences.findUnique({ where: { deviceId: DEVICE } });
    expect(row).not.toBeNull();
    expect(row!.pushEnabled).toBe(false);
    expect(row!.socialMessages).toBe(true);
  });

  it('updates an existing row (upsert)', async () => {
    await request(app)
      .put('/notifications/preferences')
      .set('x-device-id', DEVICE)
      .send({ sessionReminders: false })
      .expect(200);

    const res = await request(app)
      .put('/notifications/preferences')
      .set('x-device-id', DEVICE)
      .send({ sessionReminders: true, pushEnabled: false })
      .expect(200);

    expect(res.body.data.sessionReminders).toBe(true);
    expect(res.body.data.pushEnabled).toBe(false);
  });

  it('keys the row on userId for an authenticated caller', async () => {
    const user = await createUser();

    const res = await request(app)
      .put('/notifications/preferences')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ matchResults: false })
      .expect(200);

    expect(res.body.data.matchResults).toBe(false);

    const row = await prisma.notificationPreferences.findUnique({ where: { userId: user.id } });
    expect(row).not.toBeNull();
    expect(row!.matchResults).toBe(false);
  });

  it('returns 400 when no identity is present', async () => {
    const res = await request(app)
      .put('/notifications/preferences')
      .send({ pushEnabled: false })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for a non-boolean preference value', async () => {
    const res = await request(app)
      .put('/notifications/preferences')
      .set('x-device-id', DEVICE)
      .send({ pushEnabled: 'nope' })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('ignores unknown fields', async () => {
    const res = await request(app)
      .put('/notifications/preferences')
      .set('x-device-id', DEVICE)
      .send({ pushEnabled: false, notARealField: 'x' })
      .expect(200);

    expect(res.body.data.pushEnabled).toBe(false);
    const row = await prisma.notificationPreferences.findUnique({ where: { deviceId: DEVICE } });
    expect(row).not.toBeNull();
    expect(row).not.toHaveProperty('notARealField');
  });

  it('clears a quiet-hour bound sent as an empty string', async () => {
    await request(app)
      .put('/notifications/preferences')
      .set('x-device-id', DEVICE)
      .send({ quietHoursStart: '22:00', quietHoursEnd: '08:00' })
      .expect(200);

    const res = await request(app)
      .put('/notifications/preferences')
      .set('x-device-id', DEVICE)
      .send({ quietHoursStart: '' })
      .expect(200);

    expect(res.body.data.quietHoursStart).toBeUndefined();
    const row = await prisma.notificationPreferences.findUnique({ where: { deviceId: DEVICE } });
    expect(row).not.toBeNull();
    expect(row!.quietHoursStart).toBeNull();
    expect(row!.quietHoursEnd).toBe('08:00');
  });
});
