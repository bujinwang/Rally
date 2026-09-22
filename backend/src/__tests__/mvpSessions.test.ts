import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';

// Mock the database (must precede importing the router)
jest.mock('../config/database', () => ({
  prisma: {
    mvpSession: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    mvpPlayer: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    mvpGame: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    mvpMatch: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

// Mock permission middleware — pass-through so organizer routes are reachable.
// `resolveIdentity` (Story 6.9 Phase 0 — server-computed viewer signals) is kept
// REAL so the session GETs derive the viewer from the request as in production.
jest.mock('../middleware/permissions', () => {
  const actual = jest.requireActual('../middleware/permissions');
  return {
    ...actual,
    requireOrganizer: () => (_req: any, _res: any, next: any) => next(),
    requireOrganizerOrSelf: () => (_req: any, _res: any, next: any) => next(),
  };
});

// Mock rate limiters — pass-through (avoids cacheService work per request).
jest.mock('../middleware/rateLimit', () => {
  const passthrough = (_req: any, _res: any, next: any) => next();
  return {
    createRateLimiters: () => ({
      auth: passthrough,
      api: passthrough,
      public: passthrough,
      sensitive: passthrough,
      custom: () => passthrough,
    }),
  };
});

// Mock Socket.IO
jest.mock('../server', () => ({
  io: {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  },
}));

jest.mock('../socket/notificationHandlers', () => ({
  emitPlayerJoined: jest.fn(),
}));

jest.mock('../utils/notificationHelper', () => ({
  notifySessionSubscribers: jest.fn().mockResolvedValue(0),
}));

jest.mock('../utils/statisticsService', () => ({
  updatePlayerGameStatistics: jest.fn().mockResolvedValue(undefined),
  updatePlayerMatchStatistics: jest.fn().mockResolvedValue(undefined),
  getPlayerStatistics: jest.fn().mockResolvedValue(null),
  getSessionStatistics: jest.fn().mockResolvedValue(null),
  getSessionLeaderboard: jest.fn().mockResolvedValue([]),
}));

jest.mock('../utils/rotationAlgorithm', () => ({
  generateOptimalRotation: jest.fn(),
  getRotationExplanation: jest.fn().mockReturnValue('rotation explanation'),
}));

// Avoid constructing a real PrismaClient inside messagingService at import time.
jest.mock('../services/messagingService', () => ({
  messagingService: {
    createThread: jest.fn(),
    sendMessage: jest.fn(),
    getThreadsForUser: jest.fn(),
    getOrCreateSessionChat: jest.fn().mockResolvedValue({}),
  },
}));

import mvpSessionsRouter from '../routes/mvpSessions';
import { prisma } from '../config/database';
import { generateOptimalRotation, getRotationExplanation } from '../utils/rotationAlgorithm';
import {
  updatePlayerGameStatistics,
  getPlayerStatistics,
  getSessionStatistics,
  getSessionLeaderboard,
} from '../utils/statisticsService';

const app = express();
app.use(express.json());
app.use('/api/sessions', mvpSessionsRouter);

// clearAllMocks does not reset implementations, so stale mockResolvedValue values
// leak between tests — e.g. a truthy mvpSession.findUnique makes the share-code
// uniqueness loop in POST / run forever (OOM). Reset prisma mocks each test.
beforeEach(() => {
  jest.clearAllMocks();
  for (const model of [prisma.mvpSession, prisma.mvpPlayer, prisma.mvpGame, prisma.mvpMatch]) {
    for (const fn of Object.values(model)) {
      (fn as jest.Mock).mockReset();
    }
  }
  (prisma.$transaction as jest.Mock).mockReset();
});

describe('POST /api/sessions - Create Session', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a session successfully with valid data', async () => {
    const mockSession = {
      id: 'session-123',
      name: 'Test Session',
      shareCode: 'ABC123',
      scheduledAt: new Date('2025-01-15T10:00:00Z'),
      location: 'Test Court',
      maxPlayers: 20,
      ownerName: 'John Doe',
      status: 'ACTIVE',
      createdAt: new Date(),
    };

    const mockPlayer = {
      id: 'player-123',
      name: 'John Doe',
      status: 'ACTIVE',
      joinedAt: new Date(),
    };

    // Mock the database calls:
    // 1st findUnique = share-code uniqueness probe (null => no collision)
    // 2nd findUnique = re-fetch created session with players
    (prisma.mvpSession.findUnique as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...mockSession, players: [mockPlayer] });
    (prisma.mvpSession.create as jest.Mock).mockResolvedValue(mockSession);
    (prisma.mvpPlayer.create as jest.Mock).mockResolvedValue(mockPlayer);

    const requestData = {
      name: 'Test Session',
      dateTime: '2025-01-15T10:00:00Z',
      location: 'Test Court',
      maxPlayers: 20,
      organizerName: 'John Doe',
    };

    const response = await request(app)
      .post('/api/sessions')
      .send(requestData)
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.session.shareCode).toBe('ABC123');
    expect(response.body.data.session.organizerName).toBe('John Doe');
    expect(response.body.data.shareLink).toContain('/join/ABC123');
    expect(response.body.data.organizerCode).toMatch(/^[A-Z2-9]{6}$/);

    // Verify database calls
    expect(prisma.mvpSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Test Session',
        scheduledAt: new Date('2025-01-15T10:00:00Z'),
        location: 'Test Court',
        maxPlayers: 20,
        ownerName: 'John Doe',
        shareCode: expect.any(String),
        status: 'ACTIVE',
        sport: 'badminton',
        organizerSecretHash: expect.any(String),
      }),
    });

    expect(prisma.mvpPlayer.create).toHaveBeenCalledWith({
      data: {
        sessionId: 'session-123',
        name: 'John Doe',
        deviceId: null,
        status: 'ACTIVE',
        role: 'ORGANIZER',
      },
    });
  });

  it('should create session with auto-generated name when name is not provided', async () => {
    const mockSession = {
      id: 'session-124',
      name: "Jane Doe's Session - 1/15/2025",
      shareCode: 'DEF456',
      scheduledAt: new Date('2025-01-15T10:00:00Z'),
      location: 'Test Court',
      maxPlayers: 20,
      ownerName: 'Jane Doe',
      status: 'ACTIVE',
      createdAt: new Date(),
    };

    (prisma.mvpSession.findUnique as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...mockSession, players: [] });
    (prisma.mvpSession.create as jest.Mock).mockResolvedValue(mockSession);
    (prisma.mvpPlayer.create as jest.Mock).mockResolvedValue({});

    const requestData = {
      dateTime: '2025-01-15T10:00:00Z',
      location: 'Test Court',
      maxPlayers: 20,
      organizerName: 'Jane Doe',
    };

    const response = await request(app)
      .post('/api/sessions')
      .send(requestData)
      .expect(201);

    expect(response.body.success).toBe(true);
    const expectedName = `Jane Doe's Session - ${new Date('2025-01-15T10:00:00Z').toLocaleDateString()}`;
    expect(prisma.mvpSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: expectedName }),
    });
  });

  it('should validate required fields', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({
        name: 'Test Session',
        location: 'Test Court',
        maxPlayers: 20,
        // Missing organizerName and dateTime
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toBeDefined();
  });

  it('should validate organizer name length', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({
        dateTime: '2025-01-15T10:00:00Z',
        location: 'Test Court',
        maxPlayers: 20,
        organizerName: 'A', // Too short
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.details.some((detail: any) =>
      detail.msg.includes('Organizer name is required')
    )).toBe(true);
  });

  it('should validate session name length if provided', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({
        name: '', // Empty (min length 1)
        dateTime: '2025-01-15T10:00:00Z',
        location: 'Test Court',
        maxPlayers: 20,
        organizerName: 'John Doe',
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.details.some((detail: any) =>
      detail.msg.includes('Session name must be valid if provided')
    )).toBe(true);
  });

  it('should validate max players range', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({
        dateTime: '2025-01-15T10:00:00Z',
        location: 'Test Court',
        maxPlayers: 1, // Too low
        organizerName: 'John Doe',
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.details.some((detail: any) =>
      detail.msg.includes('Max players must be between 2 and 20')
    )).toBe(true);
  });

  it('should reject a non-ISO date/time', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({
        dateTime: 'not-a-date',
        location: 'Test Court',
        maxPlayers: 20,
        organizerName: 'John Doe',
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.details.some((detail: any) =>
      detail.msg.includes('Valid date/time required')
    )).toBe(true);
  });

  it('should generate unique share code', async () => {
    const mockSession = {
      id: 'session-125',
      name: 'Test Session',
      shareCode: 'XYZ789',
      scheduledAt: new Date('2025-01-15T10:00:00Z'),
      location: 'Test Court',
      maxPlayers: 20,
      ownerName: 'John Doe',
      status: 'ACTIVE',
      createdAt: new Date(),
    };

    // 1st probe collides, 2nd probe succeeds, 3rd call re-fetches created session.
    (prisma.mvpSession.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 'existing-session' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...mockSession, players: [] });
    (prisma.mvpSession.create as jest.Mock).mockResolvedValue(mockSession);
    (prisma.mvpPlayer.create as jest.Mock).mockResolvedValue({});

    const requestData = {
      dateTime: '2025-01-15T10:00:00Z',
      location: 'Test Court',
      maxPlayers: 20,
      organizerName: 'John Doe',
    };

    await request(app)
      .post('/api/sessions')
      .send(requestData)
      .expect(201);

    // Two collision probes + one post-create fetch.
    expect(prisma.mvpSession.findUnique).toHaveBeenCalledTimes(3);
  });

  it('should handle database errors gracefully', async () => {
    (prisma.mvpSession.create as jest.Mock).mockRejectedValue(new Error('Database connection failed'));

    const requestData = {
      dateTime: '2025-01-15T10:00:00Z',
      location: 'Test Court',
      maxPlayers: 20,
      organizerName: 'John Doe',
    };

    const response = await request(app)
      .post('/api/sessions')
      .send(requestData)
      .expect(500);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(response.body.error.message).toBe('Failed to create session');
  });
});

describe('GET /api/sessions/:shareCode - Get Session', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return session data successfully', async () => {
    const mockSession = {
      id: 'session-123',
      name: 'Test Session',
      shareCode: 'ABC123',
      scheduledAt: new Date('2025-01-15T10:00:00Z'),
      location: 'Test Court',
      maxPlayers: 20,
      ownerName: 'John Doe',
      status: 'ACTIVE',
      createdAt: new Date(),
      players: [
        {
          id: 'player-1',
          name: 'John Doe',
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      ],
      games: [],
      matches: [],
    };

    (prisma.mvpSession.findFirst as jest.Mock).mockResolvedValue(mockSession);

    const response = await request(app)
      .get('/api/sessions/ABC123')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.session.shareCode).toBe('ABC123');
    expect(response.body.data.session.players).toHaveLength(1);
  });

  it('should return 404 for non-existent session', async () => {
    (prisma.mvpSession.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await request(app)
      .get('/api/sessions/NONEXISTENT')
      .expect(404);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('SESSION_NOT_FOUND');
  });
});

describe('POST /api/sessions/join/:shareCode - Join Session', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should allow player to join session successfully', async () => {
    const mockSession = {
      id: 'session-123',
      shareCode: 'ABC123',
      status: 'ACTIVE',
      players: [],
      maxPlayers: 20,
    };

    const mockPlayer = {
      id: 'player-456',
      name: 'Jane Smith',
      status: 'ACTIVE',
      joinedAt: new Date(),
    };

    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(mockSession);
    (prisma.mvpPlayer.findFirst as jest.Mock).mockResolvedValue(null); // No existing player
    (prisma.mvpPlayer.create as jest.Mock).mockResolvedValue(mockPlayer);

    const requestData = {
      name: 'Jane Smith',
      deviceId: 'device-123',
    };

    const response = await request(app)
      .post('/api/sessions/join/ABC123')
      .send(requestData)
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.player.name).toBe('Jane Smith');
    expect(response.body.data.player.status).toBe('ACTIVE');
  });

  it('should prevent joining full session', async () => {
    const mockSession = {
      id: 'session-123',
      shareCode: 'ABC123',
      status: 'ACTIVE',
      players: Array(20).fill({}), // 20 players already
      maxPlayers: 20,
    };

    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(mockSession);

    const requestData = {
      name: 'Jane Smith',
      deviceId: 'device-123',
    };

    const response = await request(app)
      .post('/api/sessions/join/ABC123')
      .send(requestData)
      .expect(403);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('SESSION_FULL');
  });

  it('should prevent duplicate player names', async () => {
    const mockSession = {
      id: 'session-123',
      shareCode: 'ABC123',
      status: 'ACTIVE',
      players: [{ name: 'Jane Smith' }],
      maxPlayers: 20,
    };

    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(mockSession);

    const requestData = {
      name: 'Jane Smith', // Same name as existing player
      deviceId: 'device-123',
    };

    const response = await request(app)
      .post('/api/sessions/join/ABC123')
      .send(requestData)
      .expect(409);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('NAME_EXISTS');
  });
});

// ---------------------------------------------------------------------------
// Extended coverage for additional mvpSessions handlers
// ---------------------------------------------------------------------------

const futureIso = (days = 1) => new Date(Date.now() + days * 86400000).toISOString();

function baseSession(overrides: Record<string, any> = {}) {
  return {
    id: 'session-123',
    name: 'Test Session',
    shareCode: 'ABC123',
    scheduledAt: new Date(futureIso()),
    location: 'Test Court',
    maxPlayers: 20,
    courtCount: 2,
    ownerName: 'John Doe',
    ownerDeviceId: 'dev-1',
    status: 'ACTIVE',
    sport: 'badminton',
    players: [],
    games: [],
    matches: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('GET /api/sessions - List sessions', () => {
  it('returns an empty list', async () => {
    (prisma.mvpSession.findMany as jest.Mock).mockResolvedValue([]);
    const response = await request(app).get('/api/sessions').expect(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.sessions).toEqual([]);
  });

  it('formats sessions with player counts', async () => {
    (prisma.mvpSession.findMany as jest.Mock).mockResolvedValue([
      baseSession({ players: [{ id: 'p1' }] }),
    ]);
    const response = await request(app).get('/api/sessions').expect(200);
    expect(response.body.data.sessions[0].playerCount).toBe(1);
    expect(response.body.data.sessions[0].sport).toBe('badminton');
  });

  it('returns 500 when the query fails', async () => {
    (prisma.mvpSession.findMany as jest.Mock).mockRejectedValue(new Error('boom'));
    const response = await request(app).get('/api/sessions').expect(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
  });
});

describe('GET /api/sessions/:shareCode/recap', () => {
  it('returns recap with MVP and summary', async () => {
    const session = baseSession({
      players: [
        { id: 'p1', name: 'Ace', gamesPlayed: 3, wins: 3, winRate: 1, bestStreak: 3 },
        { id: 'p2', name: 'Rookie', gamesPlayed: 0, wins: 0, winRate: 0 },
      ],
      games: [
        {
          id: 'g1',
          gameNumber: 1,
          status: 'COMPLETED',
          duration: 20,
          team1FinalScore: 2,
          team2FinalScore: 1,
          team1Player1: 'Ace',
          team1Player2: 'B',
          team2Player1: 'C',
          team2Player2: 'D',
        },
      ],
      matches: [{ id: 'm1', status: 'COMPLETED' }],
    });
    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(session);

    const response = await request(app).get('/api/sessions/ABC123/recap').expect(200);
    expect(response.body.data.mvp.name).toBe('Ace');
    expect(response.body.data.summary.totalGames).toBe(1);
    expect(response.body.data.summary.activePlayers).toBe(1);
    expect(response.body.data.longestGame.gameNumber).toBe(1);
  });

  it('returns 404 when the session is missing', async () => {
    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(null);
    await request(app).get('/api/sessions/NOPE/recap').expect(404);
  });
});

describe('PUT /api/sessions/:shareCode - Update session', () => {
  it('updates court count for the owner', async () => {
    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(baseSession());
    (prisma.mvpSession.update as jest.Mock).mockResolvedValue(baseSession({ courtCount: 4 }));

    const response = await request(app)
      .put('/api/sessions/ABC123')
      .send({ ownerDeviceId: 'dev-1', courtCount: 4 })
      .expect(200);

    expect(response.body.data.session.courtCount).toBe(4);
    expect(prisma.mvpSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shareCode: 'ABC123' } })
    );
  });

  it('returns 404 for an unknown session', async () => {
    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(null);
    await request(app).put('/api/sessions/NOPE').send({ courtCount: 3 }).expect(404);
  });

  it('no longer gates on the ownerDeviceId body field (inline check removed)', async () => {
    // The route-level `session.ownerDeviceId !== ownerDeviceId` check was removed.
    // Authorization is now solely the mounted `requireOrganizer` middleware
    // (mocked pass-through in this file — exercised with the REAL middleware in
    // mvpSessions-inline-guards.test.ts). A body mismatch is therefore inert at
    // the route layer and the request proceeds.
    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(baseSession());
    (prisma.mvpSession.update as jest.Mock).mockResolvedValue(baseSession({ maxPlayers: 21 }));

    const res = await request(app)
      .put('/api/sessions/ABC123')
      .send({ ownerDeviceId: 'other', maxPlayers: 21 });

    expect(res.status).toBe(200);
  });
});

describe('PUT /api/sessions/terminate/:shareCode', () => {
  it('terminates the session for the owner', async () => {
    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(baseSession());
    (prisma.mvpSession.update as jest.Mock).mockResolvedValue({
      id: 'session-123',
      shareCode: 'ABC123',
      status: 'CANCELLED',
      updatedAt: new Date(),
    });

    const response = await request(app)
      .put('/api/sessions/terminate/ABC123')
      .send({ ownerDeviceId: 'dev-1' })
      .expect(200);

    expect(response.body.data.session.status).toBe('CANCELLED');
  });

  it('no longer gates on the ownerDeviceId body field (inline check removed)', async () => {
    // See the note in the `PUT /:shareCode` block: the inline owner check was
    // removed, so a body mismatch no longer 403s at the route layer.
    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(baseSession());
    (prisma.mvpSession.update as jest.Mock).mockResolvedValue({
      id: 'session-123',
      shareCode: 'ABC123',
      status: 'CANCELLED',
      updatedAt: new Date(),
    });

    const res = await request(app)
      .put('/api/sessions/terminate/ABC123')
      .send({ ownerDeviceId: 'other' });

    expect(res.status).toBe(200);
  });

  it('returns 404 when missing', async () => {
    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(null);
    await request(app).put('/api/sessions/terminate/X').send({ ownerDeviceId: 'dev-1' }).expect(404);
  });
});

describe('PUT /api/sessions/reactivate/:shareCode', () => {
  it('reactivates a cancelled future session', async () => {
    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(
      baseSession({ status: 'CANCELLED', scheduledAt: new Date(futureIso()) })
    );
    (prisma.mvpSession.update as jest.Mock).mockResolvedValue({
      id: 'session-123',
      shareCode: 'ABC123',
      status: 'ACTIVE',
      updatedAt: new Date(),
    });

    const response = await request(app)
      .put('/api/sessions/reactivate/ABC123')
      .send({ ownerDeviceId: 'dev-1' })
      .expect(200);

    expect(response.body.data.session.status).toBe('ACTIVE');
  });

  it('rejects when the session is not cancelled', async () => {
    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(baseSession({ status: 'ACTIVE' }));
    await request(app).put('/api/sessions/reactivate/ABC123').send({ ownerDeviceId: 'dev-1' }).expect(400);
  });

  it('rejects when the session is past due', async () => {
    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(
      baseSession({ status: 'CANCELLED', scheduledAt: new Date(Date.now() - 86400000) })
    );
    await request(app).put('/api/sessions/reactivate/ABC123').send({ ownerDeviceId: 'dev-1' }).expect(400);
  });
});

describe('POST /api/sessions/:shareCode/games', () => {
  it('creates a game', async () => {
    (prisma.mvpSession.findFirst as jest.Mock).mockResolvedValue(baseSession({ games: [] }));
    (prisma.mvpGame.create as jest.Mock).mockResolvedValue({ id: 'g1', gameNumber: 1 });

    const response = await request(app)
      .post('/api/sessions/ABC123/games')
      .send({ team1Player1: 'A', team1Player2: 'B', team2Player1: 'C', team2Player2: 'D', courtName: 'Court 1' })
      .expect(201);

    expect(response.body.data.game.id).toBe('g1');
  });

  it('requires all four players', async () => {
    await request(app).post('/api/sessions/ABC123/games').send({ team1Player1: 'A' }).expect(400);
  });
});

describe('PUT /api/sessions/:shareCode/games/:gameId/score', () => {
  const url = '/api/sessions/ABC123/games/g1/score';

  it('rejects non-numeric scores', async () => {
    await request(app).put(url).send({ team1FinalScore: 'x', team2FinalScore: 1 }).expect(400);
  });

  it('rejects a tie', async () => {
    await request(app).put(url).send({ team1FinalScore: 2, team2FinalScore: 2 }).expect(400);
  });

  it('rejects a score outside 0-2', async () => {
    await request(app).put(url).send({ team1FinalScore: 3, team2FinalScore: 1 }).expect(400);
  });

  it('updates the score and player statistics', async () => {
    (prisma.mvpSession.findFirst as jest.Mock).mockResolvedValue(baseSession());
    (prisma.mvpGame.findFirst as jest.Mock).mockResolvedValue({
      id: 'g1',
      sessionId: 'session-123',
      startTime: new Date(),
      team1Player1: 'A',
      team1Player2: 'B',
      team2Player1: 'C',
      team2Player2: 'D',
    });
    (prisma.mvpGame.update as jest.Mock).mockResolvedValue({ id: 'g1', gameNumber: 1, winnerTeam: 1, duration: 10 });

    const response = await request(app)
      .put(url)
      .send({ team1FinalScore: 2, team2FinalScore: 0 })
      .expect(200);

    expect(response.body.data.game.winnerTeam).toBe(1);
    expect(updatePlayerGameStatistics).toHaveBeenCalled();
  });
});

describe('GET /api/sessions/:shareCode/rotation', () => {
  it('returns rotation suggestions', async () => {
    (prisma.mvpSession.findFirst as jest.Mock).mockResolvedValue(
      baseSession({
        courtCount: 2,
        players: [
          { id: 'p1', name: 'A', status: 'ACTIVE', gamesPlayed: 0, wins: 0, losses: 0, joinedAt: new Date() },
        ],
      })
    );
    (generateOptimalRotation as jest.Mock).mockReturnValue({
      suggestedGames: [],
      fairnessMetrics: { averageGamesPlayed: 0, gameVariance: 0 },
    });

    const response = await request(app).get('/api/sessions/ABC123/rotation').expect(200);
    expect(response.body.data.explanation).toBe('rotation explanation');
    expect(response.body.data.sessionStats.totalPlayers).toBe(1);
    expect(getRotationExplanation).toHaveBeenCalled();
  });

  it('returns 404 when missing', async () => {
    (prisma.mvpSession.findFirst as jest.Mock).mockResolvedValue(null);
    await request(app).get('/api/sessions/NOPE/rotation').expect(404);
  });
});

describe('GET /api/sessions/:shareCode/statistics', () => {
  it('returns session statistics', async () => {
    (prisma.mvpSession.findFirst as jest.Mock).mockResolvedValue(baseSession());
    (getSessionStatistics as jest.Mock).mockResolvedValue({ totalGames: 5 });

    const response = await request(app).get('/api/sessions/ABC123/statistics').expect(200);
    expect(response.body.data.sessionStats.totalGames).toBe(5);
  });

  it('returns 404 when missing', async () => {
    (prisma.mvpSession.findFirst as jest.Mock).mockResolvedValue(null);
    await request(app).get('/api/sessions/NOPE/statistics').expect(404);
  });
});

describe('GET /api/sessions/:shareCode/leaderboard', () => {
  it('returns the leaderboard', async () => {
    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(baseSession());
    (getSessionLeaderboard as jest.Mock).mockResolvedValue([{ name: 'Ace', wins: 3 }]);

    const response = await request(app).get('/api/sessions/ABC123/leaderboard').expect(200);
    expect(response.body.data.leaderboard).toHaveLength(1);
  });
});

describe('GET /api/sessions/:shareCode/players/:playerName/stats', () => {
  it('returns 404 when the player has no stats', async () => {
    (prisma.mvpSession.findFirst as jest.Mock).mockResolvedValue(baseSession());
    (getPlayerStatistics as jest.Mock).mockResolvedValue(null);
    await request(app).get('/api/sessions/ABC123/players/Nobody/stats').expect(404);
  });

  it('returns player statistics', async () => {
    (prisma.mvpSession.findFirst as jest.Mock).mockResolvedValue(baseSession());
    (getPlayerStatistics as jest.Mock).mockResolvedValue({ wins: 2 });

    const response = await request(app).get('/api/sessions/ABC123/players/Ace/stats').expect(200);
    expect(response.body.data.stats.wins).toBe(2);
  });
});

describe('POST /api/sessions/:shareCode/matches', () => {
  it('creates a match', async () => {
    (prisma.mvpSession.findFirst as jest.Mock).mockResolvedValue(baseSession({ matches: [] }));
    (prisma.mvpMatch.create as jest.Mock).mockResolvedValue({ id: 'm1', matchNumber: 1 });

    const response = await request(app)
      .post('/api/sessions/ABC123/matches')
      .send({ team1Player1: 'A', team1Player2: 'B', team2Player1: 'C', team2Player2: 'D', courtName: 'Court 1' })
      .expect(201);

    expect(response.body.data.match.id).toBe('m1');
  });

  it('requires all four players', async () => {
    await request(app).post('/api/sessions/ABC123/matches').send({}).expect(400);
  });
});

describe('PUT /api/sessions/:shareCode/courts', () => {
  it('updates the court count for the owner', async () => {
    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(baseSession());
    (prisma.mvpSession.update as jest.Mock).mockResolvedValue(baseSession({ courtCount: 3 }));

    const response = await request(app)
      .put('/api/sessions/ABC123/courts')
      .send({ ownerDeviceId: 'dev-1', courtCount: 3 })
      .expect(200);

    expect(response.body.data.session.courtCount).toBe(3);
  });

  it('no longer gates on the ownerDeviceId body field (inline check removed)', async () => {
    // See the note in the `PUT /:shareCode` block: the inline owner check was
    // removed, so a body mismatch no longer 403s at the route layer.
    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(baseSession());
    (prisma.mvpSession.update as jest.Mock).mockResolvedValue(baseSession({ courtCount: 2 }));

    const res = await request(app)
      .put('/api/sessions/ABC123/courts')
      .send({ ownerDeviceId: 'other' });

    expect(res.status).toBe(200);
  });

  it('returns 404 when missing', async () => {
    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(null);
    await request(app).put('/api/sessions/NOPE/courts').send({ ownerDeviceId: 'dev-1' }).expect(404);
  });
});

describe('POST /api/sessions/claim - Claim organizer role', () => {
  const secretHash = bcrypt.hashSync('SECRET1', 4);

  const mockClaimTransaction = () => {
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb({
        mvpPlayer: {
          update: jest.fn().mockResolvedValue({}),
          create: jest.fn().mockResolvedValue({ id: 'p9', name: 'Claimer' }),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        mvpSession: { update: jest.fn().mockResolvedValue({}) },
      })
    );
  };

  it('claims organizer role for a new device', async () => {
    const session = baseSession({ organizerSecretHash: secretHash, players: [] });
    const refreshed = baseSession({
      ownerDeviceId: 'dev-new',
      players: [{ id: 'p9', name: 'Claimer', status: 'ACTIVE' }],
    });
    (prisma.mvpSession.findUnique as jest.Mock)
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce(refreshed);
    mockClaimTransaction();

    const response = await request(app)
      .post('/api/sessions/claim')
      .send({ shareCode: 'ABC123', secret: 'SECRET1', deviceId: 'dev-new', playerName: 'Claimer' })
      .expect(200);

    expect(response.body.data.currentUserRole).toBe('ORGANIZER');
    expect(response.body.data.session.ownerDeviceId).toBe('dev-new');
  });

  it('returns 404 when the session is missing', async () => {
    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(null);
    await request(app)
      .post('/api/sessions/claim')
      .send({ shareCode: 'NOPE', secret: 'SECRET1', deviceId: 'dev-new', playerName: 'Claimer' })
      .expect(404);
  });

  it('returns 409 when no organizer secret is configured', async () => {
    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(
      baseSession({ organizerSecretHash: null, players: [] })
    );
    await request(app)
      .post('/api/sessions/claim')
      .send({ shareCode: 'ABC123', secret: 'SECRET1', deviceId: 'dev-new', playerName: 'Claimer' })
      .expect(409);
  });

  it('returns 403 for an invalid secret', async () => {
    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(
      baseSession({ organizerSecretHash: secretHash, players: [] })
    );
    await request(app)
      .post('/api/sessions/claim')
      .send({ shareCode: 'ABC123', secret: 'WRONG99', deviceId: 'dev-new', playerName: 'Claimer' })
      .expect(403);
  });

  it('returns 400 when a new device provides no player name', async () => {
    (prisma.mvpSession.findUnique as jest.Mock).mockResolvedValue(
      baseSession({ organizerSecretHash: secretHash, players: [] })
    );
    await request(app)
      .post('/api/sessions/claim')
      .send({ shareCode: 'ABC123', secret: 'SECRET1', deviceId: 'dev-new' })
      .expect(400);
  });
});