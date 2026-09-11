import request from 'supertest';
import express from 'express';
import { prisma } from '../config/database';

// Import the server first so the route graph (and the mvpSessions <-> server
// circular import) is fully initialised before we pull the router below.
import '../server';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mvpSessionRoutes = require('../routes/mvpSessions').default;

// Story 6.1 regression: the guest share-link join and every GET read must stay
// completely open and token-free, while mutating routes stay device-gated.
// A minimal app avoids the full server's global rate limiter (shared per jest
// worker), keeping this suite from perturbing unrelated suites.
const app = express();
app.use(express.json());
app.use('/mvp-sessions', mvpSessionRoutes);

const base = '/mvp-sessions';
const shareCode = `REG${Date.now().toString().slice(-6)}`;
let testSession: any;

describe('Guest join & reads regression (Story 6.1)', () => {
  beforeAll(async () => {
    testSession = await prisma.mvpSession.create({
      data: {
        name: 'Guest Regression Session',
        scheduledAt: new Date(Date.now() + 86_400_000),
        location: 'Test Court',
        maxPlayers: 4,
        ownerName: 'Regression Owner',
        ownerDeviceId: 'regression-owner-device',
        shareCode,
        status: 'ACTIVE',
      },
    });
  });

  afterAll(async () => {
    await prisma.mvpPlayer.deleteMany({ where: { sessionId: testSession.id } });
    await prisma.mvpSession.deleteMany({ where: { id: testSession.id } });
  });

  beforeEach(async () => {
    await prisma.mvpPlayer.deleteMany({ where: { sessionId: testSession.id } });
  });

  describe('token-free reads', () => {
    it('GET /join/:shareCode succeeds with no token', async () => {
      const res = await request(app).get(`${base}/join/${shareCode}`).expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.session.shareCode).toBe(shareCode);
    });

    it('GET /:shareCode succeeds with no token', async () => {
      await request(app).get(`${base}/${shareCode}`).expect(200);
    });

    it('GET /:shareCode still succeeds when a stale/invalid token is sent', async () => {
      // Reads carry NO auth middleware, so an invalid token must not break them.
      await request(app)
        .get(`${base}/${shareCode}`)
        .set('Authorization', 'Bearer stale-invalid-token')
        .expect(200);
    });
  });

  describe('token-free guest join', () => {
    it('POST /join/:shareCode succeeds with no token', async () => {
      const res = await request(app)
        .post(`${base}/join/${shareCode}`)
        .send({ name: 'Guest One', deviceId: 'guest-device-1' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.player.name).toBe('Guest One');
    });

    it('POST /join/:shareCode still succeeds when an invalid token is sent', async () => {
      // The join route deliberately has no auth middleware at all.
      const res = await request(app)
        .post(`${base}/join/${shareCode}`)
        .set('Authorization', 'Bearer stale-invalid-token')
        .send({ name: 'Guest Two', deviceId: 'guest-device-2' })
        .expect(201);

      expect(res.body.success).toBe(true);
    });
  });

  describe('mutating routes stay device-gated', () => {
    it('PUT /:shareCode without device or token returns the same 403 MISSING_DEVICE_ID as before', async () => {
      const res = await request(app).put(`${base}/${shareCode}`).send({}).expect(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('MISSING_DEVICE_ID');
    });

    it('PUT /:shareCode with a present-but-invalid token returns 401 (optionalAuth)', async () => {
      const res = await request(app)
        .put(`${base}/${shareCode}`)
        .set('Authorization', 'Bearer invalid-token')
        .send({})
        .expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });
});
