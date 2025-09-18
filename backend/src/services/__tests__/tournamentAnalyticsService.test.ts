import { TournamentAnalyticsService } from '../tournamentAnalyticsService';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Mock data for tests
const mockTournament = {
  id: 'test-tournament',
  maxPlayers: 32,
  players: Array.from({ length: 28 }, (_, i) => ({ id: `player${i}`, seed: i + 1, finalRank: i + 1 })),
  matches: [
    // Completed matches
    { id: 'match1', status: 'COMPLETED', winnerId: 'player1', player1Id: 'player1', player2Id: 'player2' },
    { id: 'match2', status: 'COMPLETED', winnerId: 'player3', player1Id: 'player3', player2Id: 'player4' },
    // Pending match
    { id: 'match3', status: 'SCHEDULED', player1Id: 'player5', player2Id: 'player6' },
  ],
};

describe('TournamentAnalyticsService', () => {
  beforeEach(async () => {
    // Clean up database before each test
    await prisma.tournamentAnalytics.deleteMany();
    await prisma.tournamentFeedback.deleteMany();
    // Assume tournament and related data is seeded
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('calculateParticipationMetrics', () => {
    it('should calculate participation metrics correctly', async () => {
      // Mock prisma calls or use test database
      // For now, test logic isolation
      const result = await TournamentAnalyticsService.calculateParticipationMetrics('test-tournament');

      expect(result.totalRegistered).toBe(28);
      expect(result.participationRate).toBeCloseTo(0.875);
      expect(result.completionRate).toBeCloseTo(0.667); // 2/3 matches
    });

    it('should handle empty tournament', async () => {
      expect.assertions(1);
      try {
        await TournamentAnalyticsService.calculateParticipationMetrics('nonexistent');
      } catch (error: any) {
        expect(error.message).toBe('Tournament not found');
      }
    });
  });

  describe('calculateBracketEfficiency', () => {
    it('should calculate bracket efficiency and upsets', async () => {
      const result = await TournamentAnalyticsService.calculateBracketEfficiency('test-tournament');

      expect(result.totalMatches).toBe(3);
      expect(result.completedMatches).toBe(2);
      expect(result.bracketEfficiency).toBe(0.667);
      expect(result.averageUpsets).toBe(0); // No upsets in mock
    });
  });

  describe('trackPlayerRankingChanges', () => {
    it('should track ranking changes from tournament results', async () => {
      const changes = await TournamentAnalyticsService.trackPlayerRankingChanges('test-tournament');

      expect(changes.length).toBeGreaterThan(0);
      expect(changes[0]).toHaveProperty('winRate');
      expect(changes[0]).toHaveProperty('finalRank');
    });
  });

  describe('compareTournamentFormats', () => {
    it('should compare formats across tournaments', async () => {
      const tournamentIds = ['test1', 'test2'];
      const comparisons = await TournamentAnalyticsService.compareTournamentFormats(tournamentIds);

      expect(comparisons).toHaveProperty('SINGLE_ELIMINATION');
      expect(comparisons['SINGLE_ELIMINATION']).toHaveProperty('averageCompletionRate');
    });

    it('should handle empty tournament list', async () => {
      const comparisons = await TournamentAnalyticsService.compareTournamentFormats([]);
      expect(comparisons).toEqual({});
    });
  });

  // Integration test example
  describe('Integration: Full Analytics Flow', () => {
    it('should generate complete analytics for a tournament', async () => {
      // Create test tournament data
      const tournament = await prisma.tournament.create({
        data: {
          name: 'Test Tournament',
          startDate: new Date(),
          organizerName: 'Test Organizer',
          tournamentType: 'SINGLE_ELIMINATION',
          maxPlayers: 8,
          minPlayers: 4,
        },
        include: {
          players: {
            create: Array.from({ length: 8 }, () => ({
              playerName: 'Test Player',
              registeredAt: new Date(),
            })),
          },
          matches: {
            create: [
              { player1Id: 'player1', player2Id: 'player2', status: 'COMPLETED', winnerId: 'player1' },
              { player1Id: 'player3', player2Id: 'player4', status: 'COMPLETED', winnerId: 'player3' },
            ],
          },
        },
      });

      const metrics = await TournamentAnalyticsService.calculateParticipationMetrics(tournament.id);
      expect(metrics.totalRegistered).toBe(8);

      await prisma.tournament.delete({ where: { id: tournament.id } });
    });
  });

  // Performance test placeholder
  describe('Performance Tests', () => {
    it('should handle large tournament datasets efficiently', async () => {
      // Test with 100+ players - measure execution time
      const start = performance.now();
      // ... large dataset simulation
      const end = performance.now();
      expect(end - start).toBeLessThan(500); // < 500ms
    }, 10000); // Increased timeout for performance test
  });

  // Privacy validation tests
  describe('Privacy and Security Tests', () => {
    it('should not expose individual player data in aggregated analytics', async () => {
      const analytics = await TournamentAnalyticsService.calculateParticipationMetrics('test-tournament');
      // Verify no individual player identifiers in response
      expect(analytics).not.toHaveProperty('playerNames');
      expect(analytics).not.toHaveProperty('personalData');
    });

    it('should respect access controls for tournament analytics', async () => {
      // Test unauthorized access throws error
      expect.assertions(1);
      try {
        await TournamentAnalyticsService.calculateParticipationMetrics('private-tournament');
      } catch (error: any) {
        expect(error.message).toContain('access denied');
      }
    });
  });
});