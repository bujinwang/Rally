import request from 'supertest';
import app from '../../server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Matches API', () => {
  let testSessionId: string;
  let testPlayer1Id: string;
  let testPlayer2Id: string;
  let testOrganizerId: string;

  beforeAll(async () => {
    // Create test data
    const session = await prisma.mvpSession.create({
      data: {
        name: 'Test Session - Matches API',
        scheduledAt: new Date(),
        ownerName: 'Test Organizer',
        ownerDeviceId: 'organizer-device-123',
        shareCode: 'MATCH123'
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

    testOrganizerId = 'organizer-device-123';
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

  describe('POST /api/matches', () => {
    it('should record a match successfully as organizer', async () => {
      const matchData = {
        sessionId: testSessionId,
        player1Id: testPlayer1Id,
        player2Id: testPlayer2Id,
        winnerId: testPlayer1Id,
        scoreType: '2-0',
        deviceId: testOrganizerId
      };

      const response = await request(app)
        .post('/api/matches')
        .send(matchData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.match).toBeDefined();
      expect(response.body.data.match.sessionId).toBe(testSessionId);
      expect(response.body.data.match.winnerId).toBe(testPlayer1Id);
      expect(response.body.data.match.scoreType).toBe('2-0');
      expect(response.body.data.requiresApproval).toBe(false); // Organizer doesn't need approval
    });

    it('should record a match with approval required for player', async () => {
      const matchData = {
        sessionId: testSessionId,
        player1Id: testPlayer1Id,
        player2Id: testPlayer2Id,
        winnerId: testPlayer2Id,
        scoreType: '2-1',
        deviceId: 'player1-device' // Player recording
      };

      const response = await request(app)
        .post('/api/matches')
        .send(matchData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.requiresApproval).toBe(true);
      expect(response.body.data.message).toContain('pending organizer approval');
    });

    it('should validate required fields', async () => {
      const incompleteData = {
        sessionId: testSessionId,
        player1Id: testPlayer1Id,
        // Missing player2Id, winnerId, scoreType
        deviceId: testOrganizerId
      };

      const response = await request(app)
        .post('/api/matches')
        .send(incompleteData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('Missing required fields');
    });

    it('should validate score type', async () => {
      const invalidScoreData = {
        sessionId: testSessionId,
        player1Id: testPlayer1Id,
        player2Id: testPlayer2Id,
        winnerId: testPlayer1Id,
        scoreType: '3-0', // Invalid score type
        deviceId: testOrganizerId
      };

      const response = await request(app)
        .post('/api/matches')
        .send(invalidScoreData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('Invalid score type');
    });

    it('should validate winner is a match participant', async () => {
      const invalidWinnerData = {
        sessionId: testSessionId,
        player1Id: testPlayer1Id,
        player2Id: testPlayer2Id,
        winnerId: 'invalid-player-id',
        scoreType: '2-0',
        deviceId: testOrganizerId
      };

      const response = await request(app)
        .post('/api/matches')
        .send(invalidWinnerData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('Winner must be one of the players');
    });

    it('should reject matches for inactive sessions', async () => {
      // Create an inactive session
      const inactiveSession = await prisma.mvpSession.create({
        data: {
          name: 'Inactive Session',
          scheduledAt: new Date(),
          ownerName: 'Test Owner',
          status: 'COMPLETED', // Inactive
          shareCode: 'INACTIVE123'
        }
      });

      const matchData = {
        sessionId: inactiveSession.id,
        player1Id: testPlayer1Id,
        player2Id: testPlayer2Id,
        winnerId: testPlayer1Id,
        scoreType: '2-0',
        deviceId: testOrganizerId
      };

      const response = await request(app)
        .post('/api/matches')
        .send(matchData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('SESSION_NOT_ACTIVE');

      // Clean up
      await prisma.mvpSession.delete({ where: { id: inactiveSession.id } });
    });

    it('should reject matches with players not in session', async () => {
      // Create a different session
      const otherSession = await prisma.mvpSession.create({
        data: {
          name: 'Other Session',
          scheduledAt: new Date(),
          ownerName: 'Test Owner',
          shareCode: 'OTHER123'
        }
      });

      const matchData = {
        sessionId: otherSession.id, // Wrong session
        player1Id: testPlayer1Id, // From original session
        player2Id: testPlayer2Id,
        winnerId: testPlayer1Id,
        scoreType: '2-0',
        deviceId: testOrganizerId
      };

      const response = await request(app)
        .post('/api/matches')
        .send(matchData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('PLAYER_NOT_IN_SESSION');

      // Clean up
      await prisma.mvpSession.delete({ where: { id: otherSession.id } });
    });

    it('should enforce permission controls', async () => {
      const matchData = {
        sessionId: testSessionId,
        player1Id: testPlayer1Id,
        player2Id: testPlayer2Id,
        winnerId: testPlayer1Id,
        scoreType: '2-0',
        deviceId: 'unauthorized-device' // Not a participant or organizer
      };

      const response = await request(app)
        .post('/api/matches')
        .send(matchData)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('PERMISSION_DENIED');
    });
  });

  describe('PUT /api/matches/:id/approve', () => {
    let pendingMatchId: string;

    beforeAll(async () => {
      // Create a match that requires approval
      const match = await prisma.match.create({
        data: {
          sessionId: testSessionId,
          player1Id: testPlayer1Id,
          player2Id: testPlayer2Id,
          winnerId: testPlayer1Id,
          scoreType: '2-0',
          recordedBy: 'player1-device'
          // No approvedBy/approvedAt, so it needs approval
        }
      });
      pendingMatchId = match.id;
    });

    it('should approve a match as organizer', async () => {
      const response = await request(app)
        .put(`/api/matches/${pendingMatchId}/approve`)
        .send({ deviceId: testOrganizerId })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.match.status).toBe('COMPLETED');
      expect(response.body.data.message).toContain('approved successfully');
    });

    it('should reject approval from non-organizer', async () => {
      // Create another pending match
      const anotherMatch = await prisma.match.create({
        data: {
          sessionId: testSessionId,
          player1Id: testPlayer1Id,
          player2Id: testPlayer2Id,
          winnerId: testPlayer2Id,
          scoreType: '2-1',
          recordedBy: 'player2-device'
        }
      });

      const response = await request(app)
        .put(`/api/matches/${anotherMatch.id}/approve`)
        .send({ deviceId: 'player1-device' }) // Not organizer
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('PERMISSION_DENIED');

      // Clean up
      await prisma.match.delete({ where: { id: anotherMatch.id } });
    });

    it('should reject approval of already approved match', async () => {
      const response = await request(app)
        .put(`/api/matches/${pendingMatchId}/approve`)
        .send({ deviceId: testOrganizerId })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('ALREADY_APPROVED');
    });
  });

  describe('GET /api/matches/session/:sessionId', () => {
    beforeAll(async () => {
      // Create some matches for testing
      await prisma.match.createMany({
        data: [
          {
            sessionId: testSessionId,
            player1Id: testPlayer1Id,
            player2Id: testPlayer2Id,
            winnerId: testPlayer1Id,
            scoreType: '2-0',
            recordedBy: testOrganizerId,
            approvedBy: testOrganizerId,
            approvedAt: new Date()
          },
          {
            sessionId: testSessionId,
            player1Id: testPlayer2Id,
            player2Id: testPlayer1Id,
            winnerId: testPlayer2Id,
            scoreType: '2-1',
            recordedBy: testOrganizerId,
            approvedBy: testOrganizerId,
            approvedAt: new Date()
          }
        ]
      });
    });

    it('should get matches for a session as participant', async () => {
      const response = await request(app)
        .get(`/api/matches/session/${testSessionId}`)
        .query({ deviceId: 'player1-device' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.matches).toBeDefined();
      expect(response.body.data.matches.length).toBeGreaterThanOrEqual(2);
      expect(response.body.data.total).toBeGreaterThanOrEqual(2);
    });

    it('should get matches for a session as organizer', async () => {
      const response = await request(app)
        .get(`/api/matches/session/${testSessionId}`)
        .query({ deviceId: testOrganizerId })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.matches).toBeDefined();
    });

    it('should reject access for non-participants', async () => {
      const response = await request(app)
        .get(`/api/matches/session/${testSessionId}`)
        .query({ deviceId: 'unauthorized-device' })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('ACCESS_DENIED');
    });
  });
});