import request from 'supertest';
import express from 'express';

// Mock server module (avoid full server startup)
jest.mock('../../server', () => ({
  io: { emit: jest.fn(), to: jest.fn(() => ({ emit: jest.fn() })), in: jest.fn(() => ({ fetchSockets: jest.fn(() => []) })) },
}));

// Mock rate limiter
jest.mock('../../middleware/rateLimit', () => ({
  createRateLimiters: () => ({
    api: (_req: any, _res: any, next: any) => next(),
    sensitive: (_req: any, _res: any, next: any) => next(),
  }),
}));

// Mock socket notification handlers
jest.mock('../../socket/notificationHandlers', () => ({
  emitPlayerJoined: jest.fn(),
}));

// Mock notification helper
jest.mock('../../utils/notificationHelper', () => ({
  notifySessionSubscribers: jest.fn().mockResolvedValue(0),
}));

// Mock messaging service
jest.mock('../../services/messagingService', () => ({
  messagingService: {
    getOrCreateSessionChat: jest.fn().mockResolvedValue(null),
  },
}));

// Mock statistics service
jest.mock('../../utils/statisticsService', () => ({
  updatePlayerGameStatistics: jest.fn(),
  updatePlayerMatchStatistics: jest.fn(),
  getPlayerStatistics: jest.fn().mockResolvedValue(null),
  getSessionStatistics: jest.fn().mockResolvedValue(null),
  getSessionLeaderboard: jest.fn().mockResolvedValue([]),
}));

// Mock password utils
jest.mock('../../utils/password', () => ({
  PasswordUtils: {
    verify: jest.fn().mockReturnValue(false),
  },
}));

// Mock rotation algorithm
jest.mock('../../utils/rotationAlgorithm', () => ({
  generateOptimalRotation: jest.fn().mockReturnValue([]),
  getRotationExplanation: jest.fn().mockReturnValue(''),
}));

// Mock Prisma
jest.mock('../../config/database', () => ({
  prisma: {
    mvpSession: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    mvpPlayer: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

import { prisma } from '../../config/database';
import mvpSessionsRouter from '../mvpSessions';

const app = express();
app.use(express.json());
app.use('/mvp-sessions', mvpSessionsRouter);

describe('GET /mvp-sessions/:shareCode/recap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns session recap for completed session with players and games', async () => {
    const mockSession = {
      name: 'Monday Badminton',
      scheduledAt: new Date('2026-05-11T19:00:00Z'),
      location: 'Community Center',
      status: 'COMPLETED',
      sport: 'badminton',
      maxPlayers: 16,
      players: [
        { name: 'David', wins: 4, gamesPlayed: 5, winRate: 0.80, bestStreak: 3, status: 'ACTIVE' },
        { name: 'Kevin', wins: 3, gamesPlayed: 5, winRate: 0.60, bestStreak: 2, status: 'ACTIVE' },
        { name: 'Jie', wins: 2, gamesPlayed: 4, winRate: 0.50, bestStreak: 1, status: 'ACTIVE' },
        { name: 'Bertchen', wins: 2, gamesPlayed: 5, winRate: 0.40, bestStreak: 0, status: 'RESTING' },
      ],
      games: [
        {
          gameNumber: 1,
          team1Player1: 'David', team1Player2: 'Kevin',
          team2Player1: 'Jie', team2Player2: 'Bertchen',
          team1FinalScore: 21, team2FinalScore: 17,
          duration: 18, status: 'COMPLETED',
          endTime: new Date('2026-05-11T19:25:00Z'),
        },
        {
          gameNumber: 2,
          team1Player1: 'David', team1Player2: 'Jie',
          team2Player1: 'Kevin', team2Player2: 'Bertchen',
          team1FinalScore: 22, team2FinalScore: 20,
          duration: 25, status: 'COMPLETED',
          endTime: new Date('2026-05-11T19:55:00Z'),
        },
        {
          gameNumber: 3,
          team1Player1: 'David', team1Player2: 'Bertchen',
          team2Player1: 'Kevin', team2Player2: 'Jie',
          team1FinalScore: 21, team2FinalScore: 19,
          duration: 20, status: 'COMPLETED',
          endTime: new Date('2026-05-11T20:20:00Z'),
        },
      ],
      matches: [],
    };

    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(mockSession);

    const response = await request(app)
      .get('/mvp-sessions/MON123/recap')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.sessionName).toBe('Monday Badminton');
    expect(response.body.data.location).toBe('Community Center');
    expect(response.body.data.sport).toBe('badminton');

    // Summary
    expect(response.body.data.summary.totalGames).toBe(3);
    expect(response.body.data.summary.totalPlayers).toBe(4);
    expect(response.body.data.summary.activePlayers).toBe(4); // all 4 have gamesPlayed>0
    expect(response.body.data.summary.avgGameDuration).toBe(21); // (18+25+20)/3 = 21

    // MVP — David with most wins
    expect(response.body.data.mvp).toBeTruthy();
    expect(response.body.data.mvp.name).toBe('David');
    expect(response.body.data.mvp.wins).toBe(4);
    expect(response.body.data.mvp.winRate).toBe(0.80);
    expect(response.body.data.mvp.gamesPlayed).toBe(5);

    // Top performers (sorted by win rate)
    expect(response.body.data.topPerformers).toHaveLength(3);
    expect(response.body.data.topPerformers[0].name).toBe('David');
    expect(response.body.data.topPerformers[0].winRate).toBe(0.80);

    // Most improved
    expect(response.body.data.mostImproved).toBeTruthy();
    expect(response.body.data.mostImproved.name).toBe('David');
    expect(response.body.data.mostImproved.bestStreak).toBe(3);

    // Longest game
    expect(response.body.data.longestGame).toBeTruthy();
    expect(response.body.data.longestGame.duration).toBe(25);
    expect(response.body.data.longestGame.score).toBe('22-20');

    // Closest game
    expect(response.body.data.closestGame).toBeTruthy();
    expect(response.body.data.closestGame.margin).toBe(2);
    expect(response.body.data.closestGame.score).toBe('22-20');
  });

  it('returns 404 for non-existent share code', async () => {
    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(null);

    const response = await request(app)
      .get('/mvp-sessions/NONEXIST/recap')
      .expect(404);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('SESSION_NOT_FOUND');
  });

  it('handles session with no active players gracefully', async () => {
    const mockSession = {
      name: 'Empty Session',
      scheduledAt: new Date(),
      location: null,
      status: 'COMPLETED',
      sport: 'badminton',
      players: [],
      games: [],
      matches: [],
    };

    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(mockSession);

    const response = await request(app)
      .get('/mvp-sessions/EMPTY/recap')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.mvp).toBeNull();
    expect(response.body.data.topPerformers).toEqual([]);
    expect(response.body.data.mostImproved).toBeNull();
    expect(response.body.data.longestGame).toBeNull();
    expect(response.body.data.closestGame).toBeNull();
    expect(response.body.data.summary.totalGames).toBe(0);
    expect(response.body.data.summary.totalPlayers).toBe(0);
    expect(response.body.data.summary.avgGameDuration).toBe(0);
  });

  it('returns 500 on database error', async () => {
    (prisma.mvpSession.findUnique as jest.Mock).mockRejectedValue(
      new Error('Database connection failed')
    );

    const response = await request(app)
      .get('/mvp-sessions/ERROR/recap')
      .expect(500);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
  });

  it('handles games without duration for avg calculation', async () => {
    const mockSession = {
      name: 'No Duration Session',
      scheduledAt: new Date(),
      location: null,
      status: 'COMPLETED',
      sport: 'badminton',
      players: [
        { name: 'Player1', wins: 1, gamesPlayed: 1, winRate: 1.0, bestStreak: 1, status: 'ACTIVE' },
      ],
      games: [
        {
          gameNumber: 1,
          team1Player1: 'Player1', team1Player2: '',
          team2Player1: 'Player2', team2Player2: '',
          team1FinalScore: 21, team2FinalScore: 10,
          duration: null, status: 'COMPLETED',
          endTime: new Date(),
        },
      ],
      matches: [],
    };

    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(mockSession);

    const response = await request(app)
      .get('/mvp-sessions/NODUR/recap')
      .expect(200);

    expect(response.body.data.summary.avgGameDuration).toBe(0);
  });
});
