import request from 'supertest';
import express from 'express';

jest.mock('../../middleware/auth', () => ({
  authenticateToken: (_r: any, _s: any, n: any) => n(),
  getCurrentUser: () => null,
}));

jest.mock('../../config/database', () => ({
  prisma: {
    mvpSession: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
    mvpGame: { create: jest.fn(), update: jest.fn() },
    mvpGameSet: { create: jest.fn() },
    mvpPlayer: { findMany: jest.fn(), update: jest.fn() },
    session: { findMany: jest.fn(), findUnique: jest.fn() },
    sessionPlayer: { findMany: jest.fn() },
  },
}));

import { prisma } from '../../config/database';
import sessionHistoryRouter from '../sessionHistory';

const app = express();
app.use(express.json());
app.use('/history', sessionHistoryRouter);

describe('Session History Routes', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('GET /history', () => {
    it('returns session history with pagination', async () => {
      (prisma.mvpSession.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.mvpSession.count as jest.Mock).mockResolvedValue(0);

      const res = await request(app).get('/history').expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sessions).toEqual([]);
      expect(res.body.data.pagination.total).toBe(0);
    });

    it('supports filter=organized by deviceId', async () => {
      (prisma.mvpSession.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.mvpSession.count as jest.Mock).mockResolvedValue(0);

      await request(app).get('/history?deviceId=dev1&filter=organized').expect(200);
      // Verify the where clause includes ownerDeviceId
      const callArgs = (prisma.mvpSession.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where.ownerDeviceId).toBe('dev1');
    });

    it('supports sortBy=players', async () => {
      (prisma.mvpSession.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.mvpSession.count as jest.Mock).mockResolvedValue(0);

      await request(app).get('/history?sortBy=players').expect(200);
    });

    it('returns enriched sessions with player stats', async () => {
      (prisma.mvpSession.findMany as jest.Mock).mockResolvedValue([
        {
          id: 's1', name: 'Monday Badminton', scheduledAt: new Date('2026-05-11T19:00:00Z'),
          location: 'Community Center', ownerName: 'David', status: 'COMPLETED',
          shareCode: 'ABC', players: [
            { id: 'p1', name: 'David', gamesPlayed: 5, wins: 4, losses: 1, status: 'ACTIVE' },
          ],
          games: [
            {
              id: 'g1', gameNumber: 1, courtName: 'Court 1',
              team1Player1: 'David', team1Player2: 'Kevin',
              team2Player1: 'Jie', team2Player2: 'Bertchen',
              team1FinalScore: 21, team2FinalScore: 17, winnerTeam: 1,
              startTime: new Date('2026-05-11T19:00:00Z'),
              endTime: new Date('2026-05-11T19:25:00Z'),
              duration: 25, status: 'COMPLETED',
              sets: [{ setNumber: 1, team1Score: 21, team2Score: 17, winnerTeam: 1, isCompleted: true }],
            },
          ],
        },
      ]);
      (prisma.mvpSession.count as jest.Mock).mockResolvedValue(1);

      const res = await request(app).get('/history').expect(200);
      expect(res.body.data.sessions[0].name).toBe('Monday Badminton');
      expect(res.body.data.sessions[0].players[0].winRate).toBe(80); // 4/5 = 80%
      expect(res.body.data.sessions[0].games[0].team1Score).toBe(21);
    });
  });

  describe('GET /history/:sessionId', () => {
    it('returns session detail with summary', async () => {
      (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue({
        id: 's1', name: 'Test', scheduledAt: new Date(), location: 'Gym',
        ownerName: 'David', status: 'COMPLETED', shareCode: 'ABC',
        players: [
          { id: 'p1', name: 'David', gamesPlayed: 3, wins: 2, losses: 1, status: 'ACTIVE', joinedAt: new Date() },
        ],
        games: [
          {
            id: 'g1', gameNumber: 1, courtName: 'Court 1',
            team1Player1: 'David', team1Player2: 'Kevin',
            team2Player1: 'Jie', team2Player2: 'Bertchen',
            team1FinalScore: 21, team2FinalScore: 19, winnerTeam: 1,
            startTime: new Date(), endTime: new Date(), duration: 20, status: 'COMPLETED',
            sets: [],
          },
        ],
      });

      const res = await request(app).get('/history/s1').expect(200);
      expect(res.body.data.session.name).toBe('Test');
      expect(res.body.data.session.summary.topPerformer).toBe('David');
      expect(res.body.data.session.summary.totalSets).toBe(0);
    });

    it('returns 404 when session not found', async () => {
      (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(null);
      await request(app).get('/history/bad').expect(404);
    });
  });

  describe('GET /history/players/:deviceId/stats', () => {
    it('returns player statistics across sessions', async () => {
      (prisma.mvpSession.findMany as jest.Mock).mockResolvedValue([
        {
          id: 's1', name: 'Session 1', scheduledAt: new Date(),
          players: [{ name: 'David', gamesPlayed: 5, wins: 4, losses: 1 }],
          games: [
            {
              team1Player1: 'David', team1Player2: 'Kevin',
              team2Player1: 'Jie', team2Player2: 'Bertchen',
              status: 'COMPLETED',
            },
          ],
        },
      ]);

      const res = await request(app).get('/history/players/dev1/stats').expect(200);
      expect(res.body.data.playerStats.totalSessions).toBe(1);
      expect(res.body.data.playerStats.overallWinRate).toBe(80);
    });
  });
});
