/**
 * Load Testing Scenarios for Performance Optimization
 * Tests system performance under various load conditions
 */

import { describe, it, beforeAll, afterAll } from '@jest/globals';
import supertest from 'supertest';
import { createServer } from '../../backend/src/server';
import { prisma } from '../../backend/src/config/database';

const request = supertest(createServer());

describe('Load Testing - Performance Optimization', () => {
  beforeAll(async () => {
    // Setup test data
    await setupTestData();
  });

  afterAll(async () => {
    // Cleanup test data
    await cleanupTestData();
  });

  describe('Concurrent User Load Tests', () => {
    it('should handle 100 concurrent users accessing sessions', async () => {
      const concurrentRequests = 100;
      const promises = [];

      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          request
            .get('/api/sessions')
            .set('Authorization', `Bearer ${getTestToken()}`)
        );
      }

      const startTime = Date.now();
      const responses = await Promise.all(promises);
      const endTime = Date.now();

      const totalTime = endTime - startTime;
      const avgResponseTime = totalTime / concurrentRequests;

      // Assert performance requirements
      expect(avgResponseTime).toBeLessThan(200); // < 200ms average
      expect(responses.every(r => r.status === 200)).toBe(true);
    });

    it('should handle 50 concurrent match recordings', async () => {
      const concurrentRequests = 50;
      const promises = [];

      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          request
            .post('/api/matches')
            .set('Authorization', `Bearer ${getTestToken()}`)
            .send({
              sessionId: getTestSessionId(),
              player1Id: getTestPlayerId(),
              player2Id: getTestPlayerId(),
              winnerId: getTestPlayerId(),
              scoreType: '2-0'
            })
        );
      }

      const startTime = Date.now();
      const responses = await Promise.all(promises);
      const endTime = Date.now();

      const totalTime = endTime - startTime;
      const avgResponseTime = totalTime / concurrentRequests;

      expect(avgResponseTime).toBeLessThan(300); // < 300ms for write operations
      expect(responses.filter(r => r.status === 201).length).toBeGreaterThan(concurrentRequests * 0.95); // 95% success rate
    });

    it('should maintain performance under sustained load', async () => {
      const duration = 30000; // 30 seconds
      const startTime = Date.now();
      let requestCount = 0;

      while (Date.now() - startTime < duration) {
        await request
          .get('/api/sessions')
          .set('Authorization', `Bearer ${getTestToken()}`);
        requestCount++;
      }

      const rps = requestCount / (duration / 1000);
      expect(rps).toBeGreaterThan(50); // At least 50 requests per second
    });
  });

  describe('Database Performance Tests', () => {
    it('should execute complex queries within performance bounds', async () => {
      const startTime = Date.now();

      // Complex query with joins and aggregations
      const result = await request
        .get('/api/statistics/player-performance')
        .set('Authorization', `Bearer ${getTestToken()}`)
        .query({ playerId: getTestPlayerId() });

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(responseTime).toBeLessThan(500); // < 500ms for complex queries
      expect(result.status).toBe(200);
    });

    it('should handle bulk data operations efficiently', async () => {
      const bulkData = generateBulkTestData(1000);

      const startTime = Date.now();
      const response = await request
        .post('/api/statistics/bulk-update')
        .set('Authorization', `Bearer ${getTestToken()}`)
        .send(bulkData);

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(responseTime).toBeLessThan(2000); // < 2s for bulk operations
      expect(response.status).toBe(200);
    });
  });

  describe('Caching Performance Tests', () => {
    it('should serve cached data faster than uncached', async () => {
      // First request (uncached)
      const startTime1 = Date.now();
      await request
        .get('/api/statistics/popular-sessions')
        .set('Authorization', `Bearer ${getTestToken()}`);
      const endTime1 = Date.now();
      const uncachedTime = endTime1 - startTime1;

      // Second request (cached)
      const startTime2 = Date.now();
      await request
        .get('/api/statistics/popular-sessions')
        .set('Authorization', `Bearer ${getTestToken()}`);
      const endTime2 = Date.now();
      const cachedTime = endTime2 - startTime2;

      // Cached request should be at least 3x faster
      expect(cachedTime).toBeLessThan(uncachedTime / 3);
    });

    it('should maintain cache consistency under load', async () => {
      const concurrentRequests = 20;
      const promises = [];

      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          request
            .get('/api/statistics/player-ranking')
            .set('Authorization', `Bearer ${getTestToken()}`)
            .query({ playerId: getTestPlayerId() })
        );
      }

      const responses = await Promise.all(promises);

      // All responses should be consistent
      const firstResponse = responses[0];
      expect(responses.every(r =>
        r.status === firstResponse.status &&
        JSON.stringify(r.body) === JSON.stringify(firstResponse.body)
      )).toBe(true);
    });
  });

  describe('Memory and Resource Usage Tests', () => {
    it('should not have memory leaks under sustained load', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        await request
          .get('/api/sessions')
          .set('Authorization', `Bearer ${getTestToken()}`);
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be minimal (< 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });

    it('should handle connection pooling efficiently', async () => {
      const concurrentRequests = 100;
      const promises = [];

      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          request
            .get('/api/sessions')
            .set('Authorization', `Bearer ${getTestToken()}`)
        );
      }

      const startTime = Date.now();
      await Promise.all(promises);
      const endTime = Date.now();

      // Should complete within reasonable time with connection pooling
      expect(endTime - startTime).toBeLessThan(5000);
    });
  });
});

// Helper functions
async function setupTestData() {
  // Create test sessions, players, and matches
  await prisma.mvpSession.createMany({
    data: generateTestSessions(50)
  });

  await prisma.mvpPlayer.createMany({
    data: generateTestPlayers(200)
  });

  await prisma.match.createMany({
    data: generateTestMatches(1000)
  });
}

async function cleanupTestData() {
  await prisma.match.deleteMany();
  await prisma.mvpPlayer.deleteMany();
  await prisma.mvpSession.deleteMany();
}

function getTestToken() {
  return 'test-jwt-token'; // Mock token
}

function getTestSessionId() {
  return 'test-session-id';
}

function getTestPlayerId() {
  return 'test-player-id';
}

function generateTestSessions(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `test-session-${i}`,
    name: `Test Session ${i}`,
    scheduledAt: new Date(),
    location: `Location ${i}`,
    maxPlayers: 20,
    ownerName: `Owner ${i}`,
    shareCode: `SHARE${i}`
  }));
}

function generateTestPlayers(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `test-player-${i}`,
    sessionId: `test-session-${i % 50}`,
    name: `Player ${i}`,
    totalMatches: Math.floor(Math.random() * 20),
    wins: Math.floor(Math.random() * 15),
    losses: Math.floor(Math.random() * 10),
    winRate: Math.random()
  }));
}

function generateTestMatches(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    sessionId: `test-session-${i % 50}`,
    player1Id: `test-player-${i * 2}`,
    player2Id: `test-player-${i * 2 + 1}`,
    winnerId: `test-player-${Math.random() > 0.5 ? i * 2 : i * 2 + 1}`,
    scoreType: Math.random() > 0.5 ? '2-0' : '2-1'
  }));
}

function generateBulkTestData(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    playerId: `test-player-${i}`,
    matchesPlayed: Math.floor(Math.random() * 50),
    wins: Math.floor(Math.random() * 30),
    losses: Math.floor(Math.random() * 25)
  }));
}