// @ts-nocheck
import request from 'supertest';
import express from 'express';

jest.mock('../../middleware/auth', () => ({ authenticateToken: (_r: any, _s: any, n: any) => n(), requireRole: () => (_r: any, _s: any, n: any) => n() }));
jest.mock('../../utils/validation', () => ({ validate: () => (_r: any, _s: any, n: any) => n(), validatePairingRequest: (_r: any, _s: any, n: any) => n() }));
jest.mock('../../server', () => ({ io: { on: jest.fn(), emit: jest.fn(), to: () => ({ emit: jest.fn() }) } }));
jest.mock('../../socket/notificationHandlers', () => ({ emitPairingGenerated: jest.fn() }));
jest.mock('../../utils/notificationHelper', () => ({ notifySessionSubscribers: jest.fn().mockResolvedValue(0) }));

jest.mock('../../services/pairingService', () => ({
  PairingService: {
    generatePairings: jest.fn().mockResolvedValue({ pairings: [{ id: 'p1', court: 1, players: [{ id: 'u1' }, { id: 'u2' }] }], fairnessScore: 85 }),
    validatePairing: jest.fn().mockReturnValue({ valid: true, errors: [] }),
  },
}));

jest.mock('../../services/aiPairingService', () => ({
  AIPairingService: {
    generateAISuggestions: jest.fn().mockResolvedValue([{ id: 's1', score: 0.9 }]),
    recordPairingFeedback: jest.fn().mockResolvedValue({}),
    updatePlayerSkillLevels: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('../../config/database', () => ({
  prisma: {
    session: { findUnique: jest.fn() },
    mvpSessionConfiguration: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
    mvpSession: { findUnique: jest.fn() },
  },
  connectDB: jest.fn(),
}));

import { prisma } from '../../config/database';
import pairingsRouter from '../pairings';

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use((r: any, _s: any, n: any) => { r.user = { id: 'u1', email: 'a@b.com', role: 'ORGANIZER' }; n(); });
  app.use('/pairings', pairingsRouter);
  return app;
};

// Helper: mock session lookup with owner access
function mockSessionOwned(sessionId = 's1') {
  (prisma.session.findUnique as jest.Mock).mockResolvedValue({
    id: sessionId, ownerId: 'u1', owner: { id: 'u1' },
    sessionPlayers: [{ userId: 'u1' }],
  });
}

function mockSessionNotFound() {
  (prisma.session.findUnique as jest.Mock).mockResolvedValue(null);
}

describe('Pairings Routes', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('POST /sessions/:sessionId/pairings', () => {
    it('generates pairings', async () => {
      mockSessionOwned();
      (prisma.mvpSessionConfiguration.upsert as jest.Mock).mockResolvedValue({});

      const res = await request(makeApp())
        .post('/pairings/sessions/s1/pairings')
        .send({ algorithm: 'fair' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.pairings).toBeDefined();
    });

    it('returns 404 for unknown session', async () => {
      mockSessionNotFound();
      await request(makeApp()).post('/pairings/sessions/bad/pairings').send({}).expect(404);
    });
  });

  describe('GET /sessions/:sessionId/pairings', () => {
    it('returns stored pairings', async () => {
      mockSessionOwned();
      (prisma.mvpSessionConfiguration.findUnique as jest.Mock).mockResolvedValue({
        customRules: { pairings: { pairings: [{ id: 'p1' }], fairnessScore: 90 } },
      });

      const res = await request(makeApp()).get('/pairings/sessions/s1/pairings').expect(200);
      expect(res.body.data.pairings).toBeDefined();
    });

    it('returns 403 for non-participant', async () => {
      (prisma.session.findUnique as jest.Mock).mockResolvedValue({
        id: 's1', ownerId: 'other', sessionPlayers: [],
      });
      await request(makeApp()).get('/pairings/sessions/s1/pairings').expect(403);
    });
  });

  describe('PUT /sessions/:sessionId/pairings/:pairingId', () => {
    it('adjusts a pairing', async () => {
      mockSessionOwned();
      (prisma.mvpSessionConfiguration.findUnique as jest.Mock).mockResolvedValue({
        customRules: { pairings: { pairings: [{ id: 'p1', players: [] }], fairnessScore: 85 } },
      });
      (prisma.mvpSessionConfiguration.update as jest.Mock).mockResolvedValue({});

      const res = await request(makeApp())
        .put('/pairings/sessions/s1/pairings/p1')
        .send({ players: [{ id: 'u2', name: 'Bob' }, { id: 'u3', name: 'Charlie' }] })
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('DELETE /sessions/:sessionId/pairings', () => {
    it('clears pairings', async () => {
      mockSessionOwned();
      (prisma.mvpSessionConfiguration.findUnique as jest.Mock).mockResolvedValue({
        customRules: { pairings: { pairings: [] }, other: 1 },
      });
      (prisma.mvpSessionConfiguration.update as jest.Mock).mockResolvedValue({});

      const res = await request(makeApp()).delete('/pairings/sessions/s1/pairings').expect(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /suggest', () => {
    it('returns AI suggestions', async () => {
      mockSessionOwned();

      const res = await request(makeApp())
        .post('/pairings/suggest')
        .send({ sessionId: 's1', playerIds: ['u1', 'u2', 'u3', 'u4'] })
        .expect(200);

      expect(res.body.data).toHaveLength(1);
    });

    it('returns 400 when playerIds missing', async () => {
      await request(makeApp()).post('/pairings/suggest').send({ sessionId: 's1' }).expect(400);
    });
  });

  describe('GET /explain/:suggestionId', () => {
    it('returns explanation', async () => {
      const res = await request(makeApp()).get('/pairings/explain/sg1').expect(200);
      expect(res.body.data.explanation).toBeDefined();
      expect(res.body.data.confidence).toBeGreaterThan(0);
    });
  });

  describe('POST /feedback', () => {
    it('records feedback', async () => {
      mockSessionOwned();

      const res = await request(makeApp())
        .post('/pairings/feedback')
        .send({ sessionId: 's1', playerId: 'u1', partnerId: 'u2', feedback: 4 })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('returns 400 for invalid rating', async () => {
      await request(makeApp())
        .post('/pairings/feedback')
        .send({ sessionId: 's1', playerId: 'u1', partnerId: 'u2', feedback: 6 })
        .expect(400);
    });
  });

  describe('POST /update-skills/:sessionId', () => {
    it('updates skill levels', async () => {
      mockSessionOwned();

      const res = await request(makeApp()).post('/pairings/update-skills/s1').expect(200);
      expect(res.body.success).toBe(true);
    });
  });
});
