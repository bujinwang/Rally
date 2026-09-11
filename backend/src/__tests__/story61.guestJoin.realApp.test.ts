/**
 * Story 6.1 — independent QA verification (real Express app, real route graph).
 *
 * Unlike the Engineer's `guestJoin.regression.test.ts` (which mounts a minimal
 * app), this suite imports the *full* server so the whole middleware stack —
 * including the global `/api/` rate limiter and the real router mounting at
 * `/api/v1` — is exercised. It proves the #1 risk (guest join + every GET read
 * stay token-free) and that the anonymous failure envelopes are unchanged.
 */
import request from 'supertest';
import app from '../server';
import { prisma } from '../config/database';

const api = '/api/v1/mvp-sessions';
const ownerDevice = `qa-real-owner-${Date.now()}`;
const memberDevice = `qa-real-member-${Date.now()}`;
const shareCode = `QAR${Date.now().toString().slice(-5)}`;
let sessionId = '';

// A syntactically plausible but cryptographically invalid token.
const STALE = 'Bearer stale.invalid.jwt.token';

beforeAll(async () => {
  const session = await prisma.mvpSession.create({
    data: {
      name: 'QA Real-App Session',
      scheduledAt: new Date(Date.now() + 86_400_000),
      location: 'QA Court',
      maxPlayers: 8,
      ownerName: 'QA Owner',
      ownerDeviceId: ownerDevice,
      shareCode,
      status: 'ACTIVE',
    },
  });
  sessionId = session.id;
  await prisma.mvpPlayer.create({
    data: { sessionId, name: 'QA Owner', deviceId: ownerDevice, role: 'ORGANIZER' },
  });
  await prisma.mvpPlayer.create({
    data: { sessionId, name: 'QA Member', deviceId: memberDevice, role: 'PLAYER' },
  });
});

afterAll(async () => {
  await prisma.mvpPlayer.deleteMany({ where: { sessionId } });
  await prisma.mvpSession.deleteMany({ where: { id: sessionId } });
});

describe('QA — guest join (real app, /api/v1)', () => {
  it('POST /join/:shareCode with NO token → 201', async () => {
    const res = await request(app)
      .post(`${api}/join/${shareCode}`)
      .send({ name: 'Real Guest', deviceId: `real-guest-${Date.now()}` })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.player.name).toBe('Real Guest');
  });

  it('POST /join/:shareCode with a STALE Bearer token → still 201', async () => {
    const res = await request(app)
      .post(`${api}/join/${shareCode}`)
      .set('Authorization', STALE)
      .send({ name: 'Real Guest 2', deviceId: `real-guest2-${Date.now()}` })
      .expect(201);

    expect(res.body.success).toBe(true);
  });
});

describe('QA — reads stay token-free', () => {
  it('GET /:shareCode with NO token → 200', async () => {
    await request(app).get(`${api}/${shareCode}`).expect(200);
  });

  it('GET /:shareCode with a STALE token → 200', async () => {
    await request(app).get(`${api}/${shareCode}`).set('Authorization', STALE).expect(200);
  });

  it('GET /join/:shareCode with a STALE token → 200', async () => {
    await request(app).get(`${api}/join/${shareCode}`).set('Authorization', STALE).expect(200);
  });
});

describe('QA — mutating routes: device fallback preserved + envelopes unchanged', () => {
  it('PUT /:shareCode device-only (no token) as the owner device → 200', async () => {
    const res = await request(app)
      .put(`${api}/${shareCode}`)
      .send({ deviceId: ownerDevice, ownerDeviceId: ownerDevice, courtCount: 2 })
      .expect(200);

    expect(res.body.success).toBe(true);
  });

  it('PUT /:shareCode with no device and no token → 403 MISSING_DEVICE_ID', async () => {
    const res = await request(app).put(`${api}/${shareCode}`).send({}).expect(403);

    expect(res.body).toMatchObject({
      success: false,
      error: { code: 'MISSING_DEVICE_ID' },
    });
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('PUT /:shareCode with a member (non-organizer) device → 403 FORBIDDEN', async () => {
    const res = await request(app)
      .put(`${api}/${shareCode}`)
      .send({ deviceId: memberDevice, courtCount: 3 })
      .expect(403);

    // The role-mismatch envelope is produced by the *unchanged*
    // `createPermissionError(...)`: it has NO `code` field (HEAD parity).
    expect(res.body).toMatchObject({
      success: false,
      error: {
        error: 'Insufficient permissions',
        requiredRole: 'ORGANIZER',
        userRole: 'PLAYER',
        operation: 'edit_session',
      },
    });
    expect(res.body.error.code).toBeUndefined();
  });

  it('PUT /:shareCode with a device but unknown share code → 404 SESSION_NOT_FOUND', async () => {
    const res = await request(app)
      .put(`${api}/NOPE${Date.now().toString().slice(-4)}`)
      .send({ deviceId: ownerDevice })
      .expect(404);

    expect(res.body).toMatchObject({
      success: false,
      error: { code: 'SESSION_NOT_FOUND' },
    });
  });

  it('PUT /:shareCode with a present-but-invalid token → 401 UNAUTHORIZED', async () => {
    const res = await request(app)
      .put(`${api}/${shareCode}`)
      .set('Authorization', STALE)
      .send({ deviceId: ownerDevice })
      .expect(401);

    expect(res.body).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });
});

describe('QA — authenticated create attributes ownership (design T03.4)', () => {
  const email = `qa_create_${Date.now()}@example.com`;
  let createdSessionId = '';

  afterAll(async () => {
    try {
      if (createdSessionId) {
        await prisma.mvpPlayer.deleteMany({ where: { sessionId: createdSessionId } });
        await prisma.mvpSession.deleteMany({ where: { id: createdSessionId } });
      }
      await prisma.user.deleteMany({ where: { email } });
    } catch (error) {
      console.warn('create-attribution cleanup failed:', error);
    }
  });

  it('POST / with a valid JWT sets ownerUserId and links the organizer player', async () => {
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'QA Creator', email, password: 'Password123' })
      .expect(201);
    const userId = reg.body.data.user.id as string;
    const token = reg.body.data.tokens.accessToken as string;

    const res = await request(app)
      .post(api)
      .set('Authorization', `Bearer ${token}`)
      .send({
        dateTime: new Date(Date.now() + 86_400_000).toISOString(),
        organizerName: 'QA Creator',
        maxPlayers: 4,
      })
      .expect(201);

    createdSessionId = res.body.data.session.id;
    const created = await prisma.mvpSession.findUnique({ where: { id: createdSessionId } });
    expect(created?.ownerUserId).toBe(userId);

    const organizerPlayer = await prisma.mvpPlayer.findFirst({
      where: { sessionId: createdSessionId },
    });
    expect(organizerPlayer?.userId).toBe(userId);
  });
});
