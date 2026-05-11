import request from 'supertest';
import express from 'express';

// Shared mock instance for all PrismaClient constructions
const mockPrismaInstance = {
  mvpSession: { findUnique: jest.fn() },
  mvpPlayer: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
};

// Mock PrismaClient to always return the same instance
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrismaInstance),
}));

// Mock device fingerprint
jest.mock('../../utils/deviceFingerprint', () => ({
  generateDeviceFingerprint: jest.fn().mockReturnValue('fp-test-123'),
  CLIENT_FINGERPRINT_SCRIPT: '/* fingerprint script */',
}));

import webSessionRouter from '../webSession';

const app = express();
app.use(express.json());
app.use('/session', webSessionRouter);

describe('Web Session Routes', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('GET /session/:shareCode', () => {
    it('returns HTML page for valid session', async () => {
      mockPrismaInstance.mvpSession.findUnique.mockResolvedValue({
        name: 'Monday Badminton',
        scheduledAt: new Date('2026-05-11T19:00:00Z'),
        location: 'Community Center',
        maxPlayers: 16,
        shareCode: 'ABC123',
        status: 'ACTIVE',
        players: [
          { id: 'p1', name: 'David', deviceId: 'fp-test-123', status: 'ACTIVE', joinedAt: new Date() },
        ],
      });

      const res = await request(app).get('/session/ABC123').expect(200);
      expect(res.text).toContain('Monday Badminton');
      expect(res.text).toContain('Community Center');
      expect(res.text).toContain('You\'re registered');
    });

    it('returns HTML for session with no players joined', async () => {
      mockPrismaInstance.mvpSession.findUnique.mockResolvedValue({
        name: 'New Session',
        scheduledAt: new Date(),
        location: null,
        maxPlayers: 10,
        shareCode: 'NEW',
        status: 'ACTIVE',
        players: [],
      });

      const res = await request(app).get('/session/NEW').expect(200);
      expect(res.text).toContain('Join this session');
      expect(res.text).toContain('Enter your name');
    });

    it('returns 404 HTML when session not found', async () => {
      mockPrismaInstance.mvpSession.findUnique.mockResolvedValue(null);
      const res = await request(app).get('/session/BAD').expect(404);
      expect(res.text).toContain('Session Not Found');
    });
  });

  describe('GET /session/:shareCode/player-status', () => {
    it('returns player status JSON', async () => {
      mockPrismaInstance.mvpSession.findUnique.mockResolvedValue({
        name: 'Test', scheduledAt: new Date(), location: null, maxPlayers: 10, shareCode: 'ABC',
        players: [{ id: 'p1', name: 'David', status: 'ACTIVE', joinedAt: new Date() }],
      });

      const res = await request(app).get('/session/ABC/player-status?fp=test123').expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.player.name).toBe('David');
    });

    it('returns 400 without fingerprint', async () => {
      await request(app).get('/session/ABC/player-status').expect(400);
    });
  });

  describe('POST /session/:shareCode/join', () => {
    it('joins session successfully', async () => {
      mockPrismaInstance.mvpSession.findUnique.mockResolvedValue({ id: 's1', name: 'Test', maxPlayers: 10 });
      mockPrismaInstance.mvpPlayer.findFirst.mockResolvedValue(null);
      mockPrismaInstance.mvpPlayer.create.mockResolvedValue({ id: 'p1', name: 'Kevin', status: 'ACTIVE' });

      const res = await request(app)
        .post('/session/ABC/join')
        .send({ name: 'Kevin', deviceId: 'fp-123' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.player.name).toBe('Kevin');
    });

    it('returns 400 when name or deviceId missing', async () => {
      await request(app).post('/session/ABC/join').send({}).expect(400);
    });

    it('returns 409 when already registered', async () => {
      mockPrismaInstance.mvpSession.findUnique.mockResolvedValue({ id: 's1', name: 'Test' });
      mockPrismaInstance.mvpPlayer.findFirst.mockResolvedValue({ id: 'p1', name: 'David' });

      await request(app)
        .post('/session/ABC/join')
        .send({ name: 'David', deviceId: 'fp-123' })
        .expect(409);
    });
  });

  describe('DELETE /session/:shareCode/leave', () => {
    it('leaves session successfully', async () => {
      mockPrismaInstance.mvpSession.findUnique.mockResolvedValue({ id: 's1' });
      mockPrismaInstance.mvpPlayer.findFirst.mockResolvedValue({ id: 'p1', name: 'David' });
      mockPrismaInstance.mvpPlayer.update.mockResolvedValue({ id: 'p1', status: 'LEFT' });

      const res = await request(app)
        .delete('/session/ABC/leave')
        .send({ deviceFingerprint: 'fp-123' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.playerName).toBe('David');
    });

    it('returns 404 when not registered', async () => {
      mockPrismaInstance.mvpSession.findUnique.mockResolvedValue({ id: 's1' });
      mockPrismaInstance.mvpPlayer.findFirst.mockResolvedValue(null);

      await request(app)
        .delete('/session/ABC/leave')
        .send({ deviceFingerprint: 'fp-123' })
        .expect(404);
    });
  });
});
