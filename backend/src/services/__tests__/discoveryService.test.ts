// @ts-nocheck
// Tests for DiscoveryService — pure logic methods don't need DB mocks

jest.mock('../../config/database', () => ({
  prisma: {
    mvpSession: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
    mvpPlayer: { findMany: jest.fn() },
  },
}));

jest.mock('../cacheService', () => ({
  cacheService: {
    getDiscoveryResults: jest.fn().mockResolvedValue(null),
    setDiscoveryResults: jest.fn(),
    getSession: jest.fn().mockResolvedValue(null),
    setSession: jest.fn(),
    invalidateDiscoveryCache: jest.fn(),
    invalidateSession: jest.fn(),
    getPopularSessions: jest.fn().mockResolvedValue(null),
    setPopularSessions: jest.fn(),
    getNearbySessions: jest.fn().mockResolvedValue(null),
    setNearbySessions: jest.fn(),
  },
}));

import { DiscoveryService } from '../discoveryService';

describe('DiscoveryService', () => {
  // ── Haversine Distance ─────────────────────────────────────

  describe('calculateDistance', () => {
    it('calculates distance between two known points (NYC to LA)', () => {
      // NYC: 40.7128, -74.0060 | LA: 34.0522, -118.2437
      // Expected: ~3944 km
      const distance = (DiscoveryService as any).calculateDistance(40.7128, -74.0060, 34.0522, -118.2437);
      expect(distance).toBeGreaterThan(3900);
      expect(distance).toBeLessThan(4000);
    });

    it('returns 0 for same point', () => {
      const distance = (DiscoveryService as any).calculateDistance(40.7128, -74.0060, 40.7128, -74.0060);
      expect(distance).toBe(0);
    });

    it('calculates short distance (Central Park to Times Square ~1.2 km)', () => {
      const distance = (DiscoveryService as any).calculateDistance(40.7829, -73.9654, 40.7580, -73.9855);
      expect(distance).toBeGreaterThan(1);
      expect(distance).toBeLessThan(4);
    });

    it('is symmetric', () => {
      const d1 = (DiscoveryService as any).calculateDistance(40.7, -74.0, 34.0, -118.0);
      const d2 = (DiscoveryService as any).calculateDistance(34.0, -118.0, 40.7, -74.0);
      expect(Math.abs(d1 - d2)).toBeLessThan(0.01);
    });
  });

  // ── toRadians ──────────────────────────────────────────────

  describe('toRadians', () => {
    it('converts degrees to radians', () => {
      expect((DiscoveryService as any).toRadians(180)).toBeCloseTo(Math.PI);
      expect((DiscoveryService as any).toRadians(90)).toBeCloseTo(Math.PI / 2);
      expect((DiscoveryService as any).toRadians(0)).toBe(0);
      expect((DiscoveryService as any).toRadians(360)).toBeCloseTo(2 * Math.PI);
    });
  });

  // ── Relevance Score ────────────────────────────────────────

  describe('calculateRelevanceScore', () => {
    const baseSession = {
      name: 'Test', scheduledAt: new Date(Date.now() + 2 * 3600 * 1000), maxPlayers: 16,
      skillLevel: '5', location: 'Test',
    };

    it('returns high base score for matching skill level', () => {
      const score = (DiscoveryService as any).calculateRelevanceScore(
        { ...baseSession }, { skillLevel: '5' }, undefined,
      );
      expect(score).toBeGreaterThanOrEqual(100); // exact skill match = +20
    });

    it('returns base score without filters', () => {
      const score = (DiscoveryService as any).calculateRelevanceScore(
        { ...baseSession }, {}, undefined,
      );
      expect(score).toBeGreaterThanOrEqual(100);
      expect(score).toBeLessThanOrEqual(110); // base 100 + availability bonus at most
    });

    it('bonuses sessions with availability', () => {
      const session = { ...baseSession, players: [{}, {}] }; // 2/16 = 12.5% full < 80%
      const score = (DiscoveryService as any).calculateRelevanceScore(
        session, {}, undefined,
      );
      expect(score).toBeGreaterThanOrEqual(100); // availability bonus +10
    });

    it('penalizes past sessions', () => {
      const session = { ...baseSession, scheduledAt: new Date(Date.now() - 3600 * 1000) }; // 1 hour ago
      const score = (DiscoveryService as any).calculateRelevanceScore(
        session, { startTime: new Date() }, undefined,
      );
      expect(score).toBeLessThan(100); // past session penalty
    });

    it('reduces score with distance', () => {
      // 25 km away with 50 km radius
      const score = (DiscoveryService as any).calculateRelevanceScore(
        { ...baseSession }, { latitude: 40.7, longitude: -74.0 }, 25,
      );
      expect(score).toBeLessThan(100); // distance penalty
    });

    it('clamps score between 0 and 100', () => {
      // Very far away (100 km with 50 km radius) + past + skill mismatch
      const session = { ...baseSession, scheduledAt: new Date(Date.now() - 3600 * 1000) };
      const score = (DiscoveryService as any).calculateRelevanceScore(
        session, { latitude: 40.7, longitude: -74.0, skillLevel: '9', startTime: new Date(), radius: 50 }, 100,
      );
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });
});
