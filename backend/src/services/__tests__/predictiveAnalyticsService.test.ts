// @ts-nocheck

const mockPrisma: Record<string, any> = {};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(function(this: any) {
    Object.assign(this, mockPrisma);
    return this;
  }),
}));

Object.assign(mockPrisma, {
  session: { findMany: jest.fn() },
  mvpPlayer: { findUnique: jest.fn() },
  predictionModel: { upsert: jest.fn() },
  predictionResult: { create: jest.fn() },
  court: { findMany: jest.fn() },
  courtBooking: { findMany: jest.fn() },
  $queryRaw: jest.fn(),
});

import { PredictiveAnalyticsService } from '../predictiveAnalyticsService';

describe('PredictiveAnalyticsService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('forecastSessionDemand', () => {
    it('forecasts daily session demand for a location', async () => {
      // Mock historical data
      const historical = Array.from({ length: 90 }, (_, i) => ({
        scheduledAt: new Date(Date.now() - (90 - i) * 24 * 60 * 60 * 1000),
        maxPlayers: 8 + Math.floor(Math.random() * 8),
      }));
      mockPrisma.session.findMany.mockResolvedValue(historical);
      mockPrisma.predictionModel.upsert.mockResolvedValue({ id: 'm1', type: 'demand' });
      mockPrisma.predictionResult.create.mockResolvedValue({
        id: 'r1', modelId: 'm1', prediction: [], confidence: 0.78,
      });

      const result = await PredictiveAnalyticsService.forecastSessionDemand('Community Center', 7);
      expect(result).toBeTruthy();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('throws when insufficient historical data (<30 sessions)', async () => {
      mockPrisma.session.findMany.mockResolvedValue(Array(10).fill({}));
      await expect(
        PredictiveAnalyticsService.forecastSessionDemand('New Place', 7),
      ).rejects.toThrow('Insufficient historical data');
    });
  });

  describe('predictChurn', () => {
    it('predicts churn probability for a player', async () => {
      mockPrisma.mvpPlayer.findUnique.mockResolvedValue({
        id: 'p1', updatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        totalMatches: 5, winRate: 0.4, sessionsParticipated: 3,
      });
      mockPrisma.predictionModel.upsert.mockResolvedValue({ id: 'm2', type: 'churn' });
      mockPrisma.predictionResult.create.mockResolvedValue({
        id: 'r2', modelId: 'm2', prediction: { churnProbability: 0.5 }, confidence: 0.72,
      });

      const result = await PredictiveAnalyticsService.predictChurn('p1');
      expect(result).toBeTruthy();
    });

    it('throws when player not found', async () => {
      mockPrisma.mvpPlayer.findUnique.mockResolvedValue(null);
      await expect(PredictiveAnalyticsService.predictChurn('bad')).rejects.toThrow('Player not found');
    });
  });

  describe('analyzeSeasonalTrends', () => {
    it('analyzes monthly session trends', async () => {
      // Mock $queryRaw return for monthly data
      const monthlyData = Array.from({ length: 24 }, (_, i) => ({
        month: new Date(2024, i % 12, 1),
        session_count: 10 + i,
      }));
      mockPrisma.$queryRaw.mockResolvedValue(monthlyData);
      mockPrisma.predictionModel.upsert.mockResolvedValue({ id: 'm3', type: 'seasonal' });
      mockPrisma.predictionResult.create.mockResolvedValue({
        id: 'r3', modelId: 'm3', prediction: {}, confidence: 0.80,
      });

      const result = await PredictiveAnalyticsService.analyzeSeasonalTrends();
      expect(result).toBeTruthy();
    });

    it('handles empty historical data gracefully', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.predictionModel.upsert.mockResolvedValue({ id: 'm3' });
      mockPrisma.predictionResult.create.mockResolvedValue({ id: 'r3' });

      const result = await PredictiveAnalyticsService.analyzeSeasonalTrends();
      expect(result).toBeTruthy();
    });
  });

  describe('optimizeResourceAllocation', () => {
    it('optimizes court scheduling', async () => {
      mockPrisma.court.findMany.mockResolvedValue([{ id: 'c1', maxPlayers: 4 }]);
      mockPrisma.courtBooking.findMany.mockResolvedValue([]);
      const historical = Array.from({ length: 90 }, () => ({
        scheduledAt: new Date(), maxPlayers: 8,
      }));
      mockPrisma.session.findMany.mockResolvedValue(historical);
      // forecastSessionDemand internally calls predictionResult.create
      mockPrisma.predictionResult.create
        .mockResolvedValueOnce({ // forecastSessionDemand result
          id: 'r-demand', modelId: 'm-demand',
          prediction: [{ date: '2026-06-01', predictedSessions: 10, confidence: 0.78 }],
          confidence: 0.78,
        })
        .mockResolvedValueOnce({ // optimizeResourceAllocation result  
          id: 'r4', modelId: 'm4',
          prediction: { optimalSchedule: [], totalCost: 0 },
          confidence: 0.85,
        });
      mockPrisma.predictionModel.upsert.mockResolvedValue({ id: 'm4' });

      const result = await PredictiveAnalyticsService.optimizeResourceAllocation('v1', '2026-06-01');
      expect(result).toBeTruthy();
    });
  });
});
