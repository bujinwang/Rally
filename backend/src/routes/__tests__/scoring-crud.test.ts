import request from 'supertest';
import express from 'express';

jest.mock('../../server', () => ({ io: { emit: jest.fn(), to: () => ({ emit: jest.fn() }) } }));
jest.mock('../../middleware/rateLimit', () => ({ createRateLimiters: () => ({ api: (_r: any, _s: any, n: any) => n(), sensitive: (_r: any, _s: any, n: any) => n() }) }));
jest.mock('../../middleware/permissions', () => ({ requireOrganizer: () => (_r: any, _s: any, n: any) => n() }));
jest.mock('../../utils/statisticsService', () => ({ updatePlayerMatchStatistics: jest.fn() }));
jest.mock('../../utils/auditLogger', () => ({ AuditLogger: { logAction: jest.fn().mockResolvedValue(undefined) } }));
jest.mock('../../utils/notificationHelper', () => ({ notifySessionSubscribers: jest.fn().mockResolvedValue(0) }));
jest.mock('../../socket/notificationHandlers', () => ({ emitScoreRecorded: jest.fn() }));

jest.mock('../../config/database', () => ({
  prisma: {
    mvpSession: { findUnique: jest.fn(), findMany: jest.fn() },
    mvpMatch: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    mvpPlayer: { findFirst: jest.fn(), findMany: jest.fn() },
  },
}));

import { prisma } from '../../config/database';
import scoringRouter from '../scoring';

const app = express();
app.use(express.json());
app.use('/scoring', scoringRouter);

describe('Scoring Routes — POST/PUT/DELETE', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── POST Record Score ──────────────────────────────────────

  describe('POST /scoring/:shareCode/matches/:matchId/score', () => {
    const validBody = { team1Score: 2, team2Score: 0, recordedBy: 'David', deviceId: 'dev1' };

    it('records score successfully (2-0)', async () => {
      (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue({ id: 's1', name: 'Test' });
      (prisma.mvpMatch.findUnique as jest.Mock).mockResolvedValue({
        id: 'm1', sessionId: 's1', matchNumber: 1,
        team1Player1: 'A', team1Player2: 'B', team2Player1: 'C', team2Player2: 'D', games: [],
      });
      (prisma.mvpMatch.update as jest.Mock).mockResolvedValue({
        id: 'm1', matchNumber: 1, team1GamesWon: 2, team2GamesWon: 0, winnerTeam: 1, status: 'COMPLETED', endTime: new Date(),
      });

      const res = await request(app)
        .post('/scoring/ABC/matches/m1/score')
        .send(validBody)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.match.scoreType).toBe('2-0');
      expect(res.body.data.match.winnerTeam).toBe(1);
    });

    it('records alternate win score (2-0 with reversed teams)', async () => {
      (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue({ id: 's1' });
      (prisma.mvpMatch.findUnique as jest.Mock).mockResolvedValue({
        id: 'm1', sessionId: 's1', team1Player1: 'A', team1Player2: 'B', team2Player1: 'C', team2Player2: 'D', games: [],
      });
      (prisma.mvpMatch.update as jest.Mock).mockResolvedValue({
        id: 'm1', matchNumber: 1, team1GamesWon: 0, team2GamesWon: 2, winnerTeam: 2, status: 'COMPLETED',
      });

      const res = await request(app)
        .post('/scoring/ABC/matches/m1/score')
        .send({ ...validBody, team1Score: 0, team2Score: 2 })
        .expect(200);

      expect(res.body.data.match.scoreType).toBe('2-0');
      expect(res.body.data.match.winnerTeam).toBe(2);
    });

    it('rejects incomplete score (1-0 not valid)', async () => {
      (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue({ id: 's1' });

      const res = await request(app)
        .post('/scoring/ABC/matches/m1/score')
        .send({ ...validBody, team1Score: 1, team2Score: 0 })
        .expect(400);

      expect(res.body.error.code).toBe('INVALID_SCORE');
    });

    it('returns 404 for unknown session', async () => {
      (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(null);
      await request(app).post('/scoring/BAD/matches/m1/score').send(validBody).expect(404);
    });

    it('returns 404 for unknown match', async () => {
      (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue({ id: 's1' });
      (prisma.mvpMatch.findUnique as jest.Mock).mockResolvedValue(null);
      await request(app).post('/scoring/ABC/matches/m1/score').send(validBody).expect(404);
    });

    it('returns 400 when match does not belong to session', async () => {
      (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue({ id: 's1' });
      (prisma.mvpMatch.findUnique as jest.Mock).mockResolvedValue({ id: 'm1', sessionId: 'other' });
      await request(app).post('/scoring/ABC/matches/m1/score').send(validBody).expect(400);
    });
  });

  // ── PUT Edit Score ─────────────────────────────────────────

  describe('PUT /scoring/:shareCode/matches/:matchId/score', () => {
    const validBody = { team1Score: 0, team2Score: 2, recordedBy: 'David', deviceId: 'dev1' };

    it('edits score successfully', async () => {
      (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue({ id: 's1' });
      (prisma.mvpMatch.findUnique as jest.Mock).mockResolvedValue({
        id: 'm1', sessionId: 's1', team1GamesWon: 2, team2GamesWon: 0, winnerTeam: 1,
        team1Player1: 'A', team1Player2: 'B', team2Player1: 'C', team2Player2: 'D',
      });
      (prisma.mvpMatch.update as jest.Mock).mockResolvedValue({
        id: 'm1', team1GamesWon: 0, team2GamesWon: 2, winnerTeam: 2,
      });

      const res = await request(app)
        .put('/scoring/ABC/matches/m1/score')
        .send(validBody)
        .expect(200);

      expect(res.body.data.match.scoreType).toBe('2-0');
      expect(res.body.message).toContain('Score updated');
    });
  });

  // ── DELETE Score ───────────────────────────────────────────

  describe('DELETE /scoring/:shareCode/matches/:matchId/score', () => {
    it('deletes score successfully', async () => {
      (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue({ id: 's1' });
      (prisma.mvpMatch.findUnique as jest.Mock).mockResolvedValue({
        id: 'm1', sessionId: 's1', team1GamesWon: 2, team2GamesWon: 0, winnerTeam: 1,
        team1Player1: 'A', team1Player2: 'B', team2Player1: 'C', team2Player2: 'D',
      });
      (prisma.mvpMatch.update as jest.Mock).mockResolvedValue({ id: 'm1', status: 'IN_PROGRESS' });

      const res = await request(app)
        .delete('/scoring/ABC/matches/m1/score')
        .send({ deviceId: 'dev1' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Score deleted successfully');
    });
  });
});
