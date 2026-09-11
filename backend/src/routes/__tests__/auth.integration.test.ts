import request from 'supertest';
import express from 'express';
import { prisma } from '../../config/database';
import { requiredAuth } from '../../middleware/auth';
import authRouter from '../auth';

// Integration test against the real database: register → login → protected →
// refresh (rotate) → reuse-detection → logout → 401, plus device claim.
const app = express();
app.use(express.json());
app.use('/auth', authRouter);
app.get('/protected', requiredAuth, (req, res) => {
  res.json({ success: true, userId: (req as any).user.id });
});

const runId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const email = `integration_${runId}@example.com`;
const password = 'Password123';
const deviceId = `int-device-${runId}`;
const shareCode = `INT${runId.slice(-6)}`;

let accessToken = '';
let refreshToken = '';
let userId = '';
let sessionId = '';

afterAll(async () => {
  try {
    if (sessionId) {
      await prisma.mvpPlayer.deleteMany({ where: { sessionId } });
      await prisma.mvpSession.deleteMany({ where: { id: sessionId } });
    }
    await prisma.mvpPlayer.deleteMany({ where: { deviceId } });
    await prisma.mvpSession.deleteMany({ where: { ownerDeviceId: deviceId } });
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    } else {
      await prisma.user.deleteMany({ where: { email } });
    }
  } catch (error) {
    console.warn('integration cleanup failed:', error);
  }
});

describe('Auth integration (Story 6.1)', () => {
  it('registers a user and returns a token pair', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ name: 'Integration User', email, password, deviceId })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.tokens.accessToken).toBeTruthy();
    expect(res.body.data.tokens.refreshToken).toBeTruthy();
    userId = res.body.data.user.id;
    accessToken = res.body.data.tokens.accessToken;
    refreshToken = res.body.data.tokens.refreshToken;
  });

  it('logs in and issues a fresh pair', async () => {
    const res = await request(app).post('/auth/login').send({ email, password }).expect(200);
    expect(res.body.data.tokens.accessToken).toBeTruthy();
    accessToken = res.body.data.tokens.accessToken;
    refreshToken = res.body.data.tokens.refreshToken;
  });

  it('rejects a protected route without a token (401)', async () => {
    const res = await request(app).get('/protected').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('allows a protected route with a valid access token', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.userId).toBe(userId);
  });

  it('rotates the refresh token and revokes the presented one', async () => {
    const oldRefresh = refreshToken;
    const res = await request(app).post('/auth/refresh').send({ refreshToken: oldRefresh }).expect(200);

    const newRefresh = res.body.data.tokens.refreshToken;
    expect(newRefresh).toBeTruthy();
    expect(newRefresh).not.toBe(oldRefresh);

    const oldRow = await prisma.refreshToken.findFirst({ where: { userId, tokenHash: sha256(oldRefresh) } });
    expect(oldRow?.revokedAt).not.toBeNull();
    expect(oldRow?.replacedByJti).toBeTruthy();

    refreshToken = newRefresh;
    accessToken = res.body.data.tokens.accessToken;
  });

  it('tolerates an immediate replay of the just-rotated token (grace window, R9)', async () => {
    const login = await request(app).post('/auth/login').send({ email, password }).expect(200);
    const r1 = login.body.data.tokens.refreshToken;

    await request(app).post('/auth/refresh').send({ refreshToken: r1 }).expect(200);

    // Replay r1 immediately → tolerated (200) and a new token is issued.
    const replay = await request(app).post('/auth/refresh').send({ refreshToken: r1 }).expect(200);
    expect(replay.body.data.tokens.refreshToken).toBeTruthy();
  });

  it('revokes the whole family when a token is reused beyond the grace window', async () => {
    const login = await request(app).post('/auth/login').send({ email, password }).expect(200);
    const r1 = login.body.data.tokens.refreshToken;

    const rotated = await request(app).post('/auth/refresh').send({ refreshToken: r1 }).expect(200);
    const r2 = rotated.body.data.tokens.refreshToken;

    // Age the presented token beyond the 10s grace window.
    await prisma.refreshToken.updateMany({
      where: { userId, tokenHash: sha256(r1) },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });

    const reuse = await request(app).post('/auth/refresh').send({ refreshToken: r1 }).expect(401);
    expect(reuse.body.error.code).toBe('UNAUTHORIZED');

    // The family is revoked, so the previously-issued r2 is now dead too.
    const afterFamily = await request(app).post('/auth/refresh').send({ refreshToken: r2 }).expect(401);
    expect(afterFamily.body.error.code).toBe('UNAUTHORIZED');
  });

  it('logout revokes the caller\'s refresh token', async () => {
    const login = await request(app).post('/auth/login').send({ email, password }).expect(200);
    const freshAccess = login.body.data.tokens.accessToken;
    const freshRefresh = login.body.data.tokens.refreshToken;

    await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${freshAccess}`)
      .send({ refreshToken: freshRefresh })
      .expect(200);

    const res = await request(app).post('/auth/refresh').send({ refreshToken: freshRefresh }).expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('claims guest-created session/player activity for the authenticated user', async () => {
    const session = await prisma.mvpSession.create({
      data: {
        name: 'Integration Claim Session',
        scheduledAt: new Date(Date.now() + 86_400_000),
        ownerName: 'Guest Owner',
        ownerDeviceId: deviceId,
        shareCode,
        status: 'ACTIVE',
      },
    });
    sessionId = session.id;
    await prisma.mvpPlayer.create({
      data: { sessionId: session.id, name: 'Guest Owner', deviceId, role: 'ORGANIZER' },
    });

    const login = await request(app).post('/auth/login').send({ email, password }).expect(200);
    const token = login.body.data.tokens.accessToken;

    const res = await request(app)
      .post('/auth/claim')
      .set('Authorization', `Bearer ${token}`)
      .send({ deviceId })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.claimed.sessions).toBeGreaterThanOrEqual(1);
    expect(res.body.data.claimed.players).toBeGreaterThanOrEqual(1);

    const claimedSession = await prisma.mvpSession.findUnique({ where: { id: session.id } });
    expect(claimedSession?.ownerUserId).toBe(userId);
  });

  it('does not leak stack traces or secrets on auth failure', async () => {
    const res = await request(app).post('/auth/refresh').send({ refreshToken: 'garbage' }).expect(401);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/at .*\.ts:/);
    expect(serialized).not.toMatch(/secret/i);
  });
});

function sha256(raw: string): string {
  return require('crypto').createHash('sha256').update(raw).digest('hex');
}
