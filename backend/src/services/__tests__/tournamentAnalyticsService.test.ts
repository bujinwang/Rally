// @ts-nocheck

const mockPrisma: Record<string, any> = {};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(function(this: any) {
    Object.assign(this, mockPrisma);
    return this;
  }),
}));

Object.assign(mockPrisma, {
  tournament: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  tournamentAnalytics: { upsert: jest.fn(), update: jest.fn() },
});

import { TournamentAnalyticsService } from '../tournamentAnalyticsService';

describe('TournamentAnalyticsService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('calculateParticipationMetrics', () => {
    it('calculates participation and completion metrics', async () => {
      mockPrisma.tournament.findUnique.mockResolvedValue({
        id: 't1', maxPlayers: 16, players: [{ id: 'p1' }, { id: 'p2' }],
        matches: [{ status: 'COMPLETED' }],
      });
      mockPrisma.tournamentAnalytics.upsert.mockResolvedValue({});

      const result = await TournamentAnalyticsService.calculateParticipationMetrics('t1');
      expect(result.totalRegistered).toBe(2);
      expect(result.matchesCompleted).toBe(1);
      expect(typeof result.completionRate).toBe('number');
    });

    it('throws when tournament not found', async () => {
      mockPrisma.tournament.findUnique.mockResolvedValue(null);
      await expect(
        TournamentAnalyticsService.calculateParticipationMetrics('bad'),
      ).rejects.toThrow('Tournament not found');
    });
  });

  describe('calculateBracketEfficiency', () => {
    it('calculates bracket efficiency and upsets', async () => {
      mockPrisma.tournament.findUnique.mockResolvedValue({
        id: 't1', players: [{ id: 'p1', seed: 1 }, { id: 'p2', seed: 4 }],
        rounds: [{
          matches: [
            { id: 'm1', status: 'COMPLETED', winnerId: 'p1', player1Id: 'p1', player2Id: 'p2' },
          ],
        }],
      });
      mockPrisma.tournamentAnalytics.update.mockResolvedValue({});

      const result = await TournamentAnalyticsService.calculateBracketEfficiency('t1');
      expect(result.totalMatches).toBe(1);
      expect(result.completedMatches).toBe(1);
      expect(typeof result.bracketEfficiency).toBe('number');
    });
  });

  describe('trackPlayerRankingChanges', () => {
    it('tracks ranking changes from tournament results', async () => {
      mockPrisma.tournament.findUnique.mockResolvedValue({
        id: 't1', players: [
          {
            id: 'p1', finalRank: 1,
            player1Matches: [{ winnerId: 'p1' }, { winnerId: 'p1' }],
            player2Matches: [{ winnerId: 'p1' }],
          },
          {
            id: 'p2', finalRank: 2,
            player1Matches: [{ winnerId: 'p1' }],
            player2Matches: [],
          },
        ],
      });

      const result = await TournamentAnalyticsService.trackPlayerRankingChanges('t1');
      expect(result).toHaveLength(2);
      expect(result[0].wins).toBeGreaterThanOrEqual(2);
    });
  });

  describe('compareTournamentFormats', () => {
    it('compares tournament formats across multiple IDs', async () => {
      mockPrisma.tournament.findMany.mockResolvedValue([
        { id: 't1', tournamentType: 'SINGLE_ELIMINATION', analytics: { completionRate: 0.8, avgMatchDuration: 45, bracketEfficiency: 0.9 }, players: [{}, {}] },
        { id: 't2', tournamentType: 'ROUND_ROBIN', analytics: { completionRate: 0.95, avgMatchDuration: 40, bracketEfficiency: 1.0 }, players: [{}, {}, {}] },
      ]);

      const result = await TournamentAnalyticsService.compareTournamentFormats(['t1', 't2']);
      expect(result).toBeTruthy();
      expect(result.SINGLE_ELIMINATION).toBeDefined();
      expect(result.ROUND_ROBIN).toBeDefined();
    });
  });
});
