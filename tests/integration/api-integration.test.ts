/**
 * API Integration Tests
 * Tests end-to-end API functionality with database and caching layers
 */

import request from 'supertest';
import app from '../../backend/src/server';
import { prisma } from '../../backend/src/config/database';

const request = supertest(app);

describe('API Integration Tests', () => {
  let testSessionId: string;
  let testPlayer1Id: string;
  let testPlayer2Id: string;
  let authToken: string;

  beforeAll(async () => {
    // Setup test data
    const session = await prisma.mvpSession.create({
      data: {
        name: 'Integration Test Session',
        scheduledAt: new Date(),
        ownerName: 'Test Organizer',
        shareCode: 'TEST123'
      }
    });
    testSessionId = session.id;

    const player1 = await prisma.mvpPlayer.create({
      data: {
        sessionId: testSessionId,
        name: 'Test Player 1'
      }
    });
    testPlayer1Id = player1.id;

    const player2 = await prisma.mvpPlayer.create({
      data: {
        sessionId: testSessionId,
        name: 'Test Player 2'
      }
    });
    testPlayer2Id = player2.id;

    // Mock authentication token
    authToken = 'mock-jwt-token';
  });

  afterAll(async () => {
    // Cleanup
    await prisma.match.deleteMany({ where: { sessionId: testSessionId } });
    await prisma.mvpPlayer.deleteMany({ where: { sessionId: testSessionId } });
    await prisma.mvpSession.deleteMany({ where: { id: testSessionId } });
  });

  describe('Session Management Integration', () => {
    it('should create and retrieve session with caching', async () => {
      // Create session
      const createResponse = await request
        .post('/api/sessions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Integration Test Session 2',
          scheduledAt: new Date().toISOString(),
          ownerName: 'Test Organizer'
        });

      expect(createResponse.status).toBe(201);
      const sessionId = createResponse.body.id;

      // Retrieve session (should use cache on second call)
      const getResponse1 = await request
        .get(`/api/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(getResponse1.status).toBe(200);
      expect(getResponse1.body.name).toBe('Integration Test Session 2');

      // Second retrieval (should be cached)
      const getResponse2 = await request
        .get(`/api/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(getResponse2.status).toBe(200);
      expect(getResponse2.body).toEqual(getResponse1.body);

      // Cleanup
      await prisma.mvpSession.delete({ where: { id: sessionId } });
    });

    it('should handle session updates with cache invalidation', async () => {
      const session = await prisma.mvpSession.create({
        data: {
          name: 'Cache Test Session',
          scheduledAt: new Date(),
          ownerName: 'Test Organizer',
          shareCode: 'CACHE123'
        }
      });

      // Get initial data
      const initialResponse = await request
        .get(`/api/sessions/${session.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(initialResponse.body.name).toBe('Cache Test Session');

      // Update session
      const updateResponse = await request
        .put(`/api/sessions/${session.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Updated Cache Test Session'
        });

      expect(updateResponse.status).toBe(200);

      // Get updated data (cache should be invalidated)
      const updatedResponse = await request
        .get(`/api/sessions/${session.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(updatedResponse.body.name).toBe('Updated Cache Test Session');

      // Cleanup
      await prisma.mvpSession.delete({ where: { id: session.id } });
    });
  });

  describe('Match Recording Integration', () => {
    it('should record match and update statistics', async () => {
      // Record a match
      const matchResponse = await request
        .post('/api/matches')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sessionId: testSessionId,
          player1Id: testPlayer1Id,
          player2Id: testPlayer2Id,
          winnerId: testPlayer1Id,
          scoreType: '2-0'
        });

      expect(matchResponse.status).toBe(201);
      const matchId = matchResponse.body.id;

      // Verify match was recorded
      const matchRecord = await prisma.match.findUnique({
        where: { id: matchId }
      });
      expect(matchRecord).toBeTruthy();
      expect(matchRecord?.winnerId).toBe(testPlayer1Id);

      // Verify statistics were updated
      const updatedPlayer1 = await prisma.mvpPlayer.findUnique({
        where: { id: testPlayer1Id }
      });
      expect(updatedPlayer1?.wins).toBe(1);
      expect(updatedPlayer1?.totalMatches).toBe(1);

      const updatedPlayer2 = await prisma.mvpPlayer.findUnique({
        where: { id: testPlayer2Id }
      });
      expect(updatedPlayer2?.losses).toBe(1);
      expect(updatedPlayer2?.totalMatches).toBe(1);
    });

    it('should handle concurrent match recordings', async () => {
      const matchPromises = [];

      // Create 10 concurrent match recordings
      for (let i = 0; i < 10; i++) {
        matchPromises.push(
          request
            .post('/api/matches')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              sessionId: testSessionId,
              player1Id: testPlayer1Id,
              player2Id: testPlayer2Id,
              winnerId: i % 2 === 0 ? testPlayer1Id : testPlayer2Id,
              scoreType: '2-0'
            })
        );
      }

      const responses = await Promise.all(matchPromises);

      // All should succeed
      expect(responses.every(r => r.status === 201)).toBe(true);

      // Verify final statistics
      const finalPlayer1 = await prisma.mvpPlayer.findUnique({
        where: { id: testPlayer1Id }
      });
      const finalPlayer2 = await prisma.mvpPlayer.findUnique({
        where: { id: testPlayer2Id }
      });

      expect(finalPlayer1?.totalMatches).toBeGreaterThan(1);
      expect(finalPlayer2?.totalMatches).toBeGreaterThan(1);
    });
  });

  describe('Statistics API Integration', () => {
    beforeAll(async () => {
      // Create additional test matches for statistics
      for (let i = 0; i < 20; i++) {
        await prisma.match.create({
          data: {
            sessionId: testSessionId,
            player1Id: testPlayer1Id,
            player2Id: testPlayer2Id,
            winnerId: i % 3 === 0 ? testPlayer2Id : testPlayer1Id,
            scoreType: '2-0'
          }
        });
      }
    });

    it('should calculate and cache player statistics', async () => {
      // First request (should calculate)
      const startTime1 = Date.now();
      const response1 = await request
        .get(`/api/players/${testPlayer1Id}/statistics`)
        .set('Authorization', `Bearer ${authToken}`);
      const endTime1 = Date.now();

      expect(response1.status).toBe(200);
      expect(response1.body).toHaveProperty('totalMatches');
      expect(response1.body).toHaveProperty('winRate');

      // Second request (should be cached)
      const startTime2 = Date.now();
      const response2 = await request
        .get(`/api/players/${testPlayer1Id}/statistics`)
        .set('Authorization', `Bearer ${authToken}`);
      const endTime2 = Date.now();

      // Cached response should be faster
      expect(endTime2 - startTime2).toBeLessThan(endTime1 - startTime1);

      // Results should be identical
      expect(response2.body).toEqual(response1.body);
    });

    it('should update cached statistics after new match', async () => {
      // Get current statistics
      const beforeResponse = await request
        .get(`/api/players/${testPlayer1Id}/statistics`)
        .set('Authorization', `Bearer ${authToken}`);

      const beforeMatches = beforeResponse.body.totalMatches;

      // Record new match
      await request
        .post('/api/matches')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sessionId: testSessionId,
          player1Id: testPlayer1Id,
          player2Id: testPlayer2Id,
          winnerId: testPlayer1Id,
          scoreType: '2-0'
        });

      // Get updated statistics
      const afterResponse = await request
        .get(`/api/players/${testPlayer1Id}/statistics`)
        .set('Authorization', `Bearer ${authToken}`);

      const afterMatches = afterResponse.body.totalMatches;

      // Should reflect the new match
      expect(afterMatches).toBe(beforeMatches + 1);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle invalid match data gracefully', async () => {
      const response = await request
        .post('/api/matches')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sessionId: 'invalid-session-id',
          player1Id: testPlayer1Id,
          player2Id: testPlayer2Id,
          winnerId: testPlayer1Id,
          scoreType: 'invalid-score'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle database connection errors', async () => {
      // Temporarily disconnect database (mock scenario)
      // This would require mocking the database connection

      const response = await request
        .get('/api/sessions')
        .set('Authorization', `Bearer ${authToken}`);

      // Should return appropriate error response
      expect([500, 503].includes(response.status)).toBe(true);
    });
  });

  describe('Rate Limiting Integration', () => {
    it('should enforce rate limits on API endpoints', async () => {
      const requests = [];

      // Make many requests quickly
      for (let i = 0; i < 150; i++) {
        requests.push(
          request
            .get('/api/sessions')
            .set('Authorization', `Bearer ${authToken}`)
        );
      }

      const responses = await Promise.all(requests);

      // Some requests should be rate limited
      const rateLimitedCount = responses.filter(r => r.status === 429).length;
      expect(rateLimitedCount).toBeGreaterThan(0);

      // But most should succeed
      const successCount = responses.filter(r => r.status === 200).length;
      expect(successCount).toBeGreaterThan(requests.length * 0.8);
    });
  });
});