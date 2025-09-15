import request from 'supertest';
import app from '../../server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Statistics API', () => {
  let testSessionId: string;
  let testPlayer1Id: string;
  let testPlayer2Id: string;

  beforeAll(async () => {
    // Create test data
    const session = await prisma.mvpSession.create({
      data: {
        name: 'Test Session - Statistics API',
        scheduledAt: new Date(),
        ownerName: 'Test Organizer',
        ownerDeviceId: 'organizer-device-123',
        shareCode: 'STATS123'
      }
    });
    testSessionId = session.id;

    const player1 = await prisma.mvpPlayer.create({
      data: {
        sessionId: testSessionId,
        name: 'Player 1',
        deviceId: 'player1-device'
      }
    });
    testPlayer1Id = player1.id;

    const player2 = await prisma.mvpPlayer.create({
      data: {
        sessionId: testSessionId,
        name: 'Player 2',
        deviceId: 'player2-device'
      }
    });
    testPlayer2Id = player2.id;

    // Create some test matches
    await prisma.match.createMany({
      data: [
        {
          sessionId: testSessionId,
          player1Id: testPlayer1Id,
          player2Id: testPlayer2Id,
          winnerId: testPlayer1Id,
          scoreType: '2-0',
          recordedBy: 'player1-device'
        },
        {
          sessionId: testSessionId,
          player1Id: testPlayer2Id,
          player2Id: testPlayer1Id,
          winnerId: testPlayer2Id,
          scoreType: '2-1',
          recordedBy: 'player2-device'
        },
        {
          sessionId: testSessionId,
          player1Id: testPlayer1Id,
          player2Id: testPlayer2Id,
          winnerId: testPlayer1Id,
          scoreType: '2-0',
          recordedBy: 'player1-device'
        }
      ]
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.match.deleteMany({
      where: { sessionId: testSessionId }
    });
    await prisma.mvpPlayer.deleteMany({
      where: { sessionId: testSessionId }
    });
    await prisma.mvpSession.deleteMany({
      where: { id: testSessionId }
    });
    await prisma.$disconnect();
  });

  describe('GET /api/statistics/player/:playerId', () => {
    it('should return player statistics', async () => {
      const response = await request(app)
        .get(`/api/statistics/player/${testPlayer1Id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.playerId).toBe(testPlayer1Id);
      expect(response.body.data.playerName).toBe('Player 1');
      expect(response.body.data.matchesPlayed).toBe(3);
      expect(response.body.data.wins).toBe(2);
      expect(response.body.data.losses).toBe(1);
      expect(response.body.data.winRate).toBe(66.7); // 2/3 * 100 rounded
    });

    it('should return player statistics for specific session', async () => {
      const response = await request(app)
        .get(`/api/statistics/player/${testPlayer1Id}`)
        .query({ sessionId: testSessionId })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.matchesPlayed).toBe(3);
    });

    it('should return 404 for non-existent player', async () => {
      const response = await request(app)
        .get('/api/statistics/player/non-existent-player')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('PLAYER_NOT_FOUND');
    });
  });

  describe('GET /api/statistics/leaderboard', () => {
    it('should return leaderboard', async () => {
      const response = await request(app)
        .get('/api/statistics/leaderboard')
        .query({ sessionId: testSessionId })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);

      // Check that leaderboard entries have required fields
      const firstEntry = response.body.data[0];
      expect(firstEntry).toHaveProperty('rank');
      expect(firstEntry).toHaveProperty('playerId');
      expect(firstEntry).toHaveProperty('playerName');
      expect(firstEntry).toHaveProperty('winRate');
      expect(firstEntry).toHaveProperty('matchesPlayed');
      expect(firstEntry).toHaveProperty('performanceRating');
    });

    it('should respect limit parameter', async () => {
      const response = await request(app)
        .get('/api/statistics/leaderboard')
        .query({ sessionId: testSessionId, limit: 1 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
    });

    it('should filter by minimum matches', async () => {
      const response = await request(app)
        .get('/api/statistics/leaderboard')
        .query({ sessionId: testSessionId, minMatches: 5 })
        .expect(200);

      expect(response.body.success).toBe(true);
      // Since our test players have 3 matches each, they should be filtered out
      expect(response.body.data.length).toBe(0);
    });
  });

  describe('GET /api/statistics/session/:sessionId', () => {
    it('should return session statistics', async () => {
      const response = await request(app)
        .get(`/api/statistics/session/${testSessionId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.sessionId).toBe(testSessionId);
      expect(response.body.data.totalMatches).toBe(3);
      expect(response.body.data.totalPlayers).toBe(2);
      expect(response.body.data.averageMatchesPerPlayer).toBe(1.5);
      expect(response.body.data.matchDistribution).toBeDefined();
      expect(response.body.data.matchDistribution['2-0']).toBe(2);
      expect(response.body.data.matchDistribution['2-1']).toBe(1);
    });

    it('should return 404 for non-existent session', async () => {
      const response = await request(app)
        .get('/api/statistics/session/non-existent-session')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('SESSION_NOT_FOUND');
    });
  });

  describe('GET /api/statistics/compare', () => {
    it('should compare multiple players', async () => {
      const response = await request(app)
        .get('/api/statistics/compare')
        .query({
          playerIds: `${testPlayer1Id},${testPlayer2Id}`,
          sessionId: testSessionId
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(2);

      // Check that both players are included
      const playerIds = response.body.data.map((p: any) => p.playerId);
      expect(playerIds).toContain(testPlayer1Id);
      expect(playerIds).toContain(testPlayer2Id);
    });

    it('should return 400 when playerIds is missing', async () => {
      const response = await request(app)
        .get('/api/statistics/compare')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('playerIds parameter is required');
    });
  });

  describe('GET /api/statistics/trends/:playerId', () => {
    it('should return performance trends', async () => {
      const response = await request(app)
        .get(`/api/statistics/trends/${testPlayer1Id}`)
        .query({ days: 30 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data).toHaveProperty('dates');
      expect(response.body.data).toHaveProperty('winRates');
      expect(response.body.data).toHaveProperty('matchesPlayed');
      expect(Array.isArray(response.body.data.dates)).toBe(true);
      expect(Array.isArray(response.body.data.winRates)).toBe(true);
      expect(Array.isArray(response.body.data.matchesPlayed)).toBe(true);
    });

    it('should use default 30 days when days parameter is not provided', async () => {
      const response = await request(app)
        .get(`/api/statistics/trends/${testPlayer1Id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });
  });
});