import request from 'supertest';
import express from 'express';

jest.mock('../../server', () => ({ io: { emit: jest.fn(), to: () => ({ emit: jest.fn() }) } }));
jest.mock('../../middleware/rateLimit', () => ({ createRateLimiters: () => ({ api: (_r: any, _s: any, n: any) => n(), sensitive: (_r: any, _s: any, n: any) => n() }) }));
jest.mock('../../middleware/permissions', () => ({ requireOrganizer: () => (_r: any, _s: any, n: any) => n(), requireOrganizerOrSelf: () => (_r: any, _s: any, n: any) => n() }));
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

describe('Scoring Routes', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('GET /scoring/:shareCode/scores', () => {
    it('returns match score history', async () => {
      (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue({
        id: 's1', name: 'Test Session', matches: [
          { id: 'm1', matchNumber: 1, team1GamesWon: 2, team2GamesWon: 0, winnerTeam: 1, endTime: new Date(), duration: 20,
            team1Player1: 'A', team1Player2: 'B', team2Player1: 'C', team2Player2: 'D' },
        ],
      });

      const res = await request(app).get('/scoring/ABC/scores').expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.scores).toHaveLength(1);
      expect(res.body.data.scores[0].scoreType).toBe('2-0');
    });

    it('returns 404 for unknown session', async () => {
      (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(null);
      await request(app).get('/scoring/BAD/scores').expect(404);
    });
  });

  describe('GET /scoring/:shareCode/statistics/:playerName', () => {
    it('returns player stats', async () => {
      (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue({ id: 's1' });
      (prisma.mvpPlayer.findFirst as jest.Mock).mockResolvedValue({
        name: 'David', gamesPlayed: 10, wins: 7, losses: 3, winRate: 0.7,
        matchesPlayed: 5, matchWins: 4, matchLosses: 1, matchWinRate: 0.8,
        totalSetsWon: 14, totalSetsLost: 8, totalPlayTime: 200, averageGameDuration: 20,
        partnershipStats: {},
      });

      const res = await request(app).get('/scoring/ABC/statistics/David').expect(200);
      expect(res.body.data.player.name).toBe('David');
      expect(res.body.data.player.winRate).toBe(0.7);
    });

    it('returns 404 for unknown player', async () => {
      (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue({ id: 's1' });
      (prisma.mvpPlayer.findFirst as jest.Mock).mockResolvedValue(null);
      await request(app).get('/scoring/ABC/statistics/Unknown').expect(404);
    });
  });

  describe('GET /scoring/:shareCode/leaderboard', () => {
    it('returns leaderboard sorted by winRate', async () => {
      (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue({
        id: 's1', name: 'Test', players: [
          { name: 'David', gamesPlayed: 5, wins: 4, losses: 1, winRate: 0.8, matchesPlayed: 3, matchWins: 3, matchLosses: 0, matchWinRate: 1.0, totalSetsWon: 8, totalSetsLost: 2 },
          { name: 'Kevin', gamesPlayed: 5, wins: 3, losses: 2, winRate: 0.6, matchesPlayed: 3, matchWins: 2, matchLosses: 1, matchWinRate: 0.67, totalSetsWon: 6, totalSetsLost: 4 },
        ],
      });

      const res = await request(app).get('/scoring/ABC/leaderboard').expect(200);
      expect(res.body.data.leaderboard[0].name).toBe('David');
      expect(res.body.data.leaderboard[0].rank).toBe(1);
      expect(res.body.data.totalPlayers).toBe(2);
    });

    it('supports sortBy=matchWinRate', async () => {
      (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue({
        id: 's1', name: 'Test', players: [
          { name: 'Kevin', gamesPlayed: 5, wins: 3, losses: 2, winRate: 0.6, matchesPlayed: 4, matchWins: 4, matchLosses: 0, matchWinRate: 1.0, totalSetsWon: 8, totalSetsLost: 2 },
          { name: 'David', gamesPlayed: 5, wins: 4, losses: 1, winRate: 0.8, matchesPlayed: 3, matchWins: 2, matchLosses: 1, matchWinRate: 0.67, totalSetsWon: 6, totalSetsLost: 4 },
        ],
      });

      const res = await request(app).get('/scoring/ABC/leaderboard?sortBy=matchWinRate').expect(200);
      expect(res.body.data.leaderboard[0].name).toBe('Kevin');
    });

    it('returns 404 for unknown session', async () => {
      (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(null);
      await request(app).get('/scoring/BAD/leaderboard').expect(404);
    });
  });

  describe('GET /scoring/:shareCode/leaderboard/export', () => {
    it('returns CSV with metadata headers', async () => {
      (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue({
        id: 's1', name: 'Test Session', shareCode: 'ABC', players: [
          { name: 'David', gamesPlayed: 5, wins: 4, losses: 1, winRate: 0.8, matchesPlayed: 3, matchWins: 3, matchLosses: 0, matchWinRate: 1.0, totalSetsWon: 8, totalSetsLost: 2, totalPlayTime: 200, averageGameDuration: 20 },
        ],
      });

      const res = await request(app).get('/scoring/ABC/leaderboard/export').expect(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('Test Session');
      expect(res.text).toContain('Rank,Player Name');
    });
  });

  describe('GET /scoring/:shareCode/scores/export', () => {
    it('exports CSV score history', async () => {
      (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue({
        id: 's1', name: 'Test', shareCode: 'ABC', matches: [
          { matchNumber: 1, team1Player1: 'A', team1Player2: 'B', team2Player1: 'C', team2Player2: 'D', team1GamesWon: 2, team2GamesWon: 1, winnerTeam: 1, duration: 25, endTime: new Date() },
        ],
      });

      const res = await request(app).get('/scoring/ABC/scores/export').expect(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('Match #,Team 1 Player 1');
      expect(res.text).toContain('2-1');
    });
  });
});
