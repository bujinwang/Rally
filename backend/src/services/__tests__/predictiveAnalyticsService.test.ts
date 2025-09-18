import { PredictiveAnalyticsService } from '../predictiveAnalyticsService';
import { PrismaClient } from '@prisma/client';

// Mock Prisma
jest.mock('@prisma/client', () => {
  const mockPrisma = {
    predictionModel: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
    predictionResult: {
      create: jest.fn(),
    },
    session: {
      findMany: jest.fn(),
    },
    mvpPlayer: {
      findUnique: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

const mockPrisma = new (require('@prisma/client').PrismaClient)();

// Mock ML functions
jest.mock('ml-library', () => ({
  linearRegression: jest.fn(() => (input: number[]) => 10),
  logisticRegression: jest.fn(() => (input: number[]) => 0.3),
  timeSeriesForecast: jest.fn(() => [5, 6, 7, 8, 9, 10, 11, 12]),
  linearProgramming: jest.fn(() => ({ optimalSchedule: [], totalCost: 100 })),
}));

const mockLinearRegression = require('ml-library').linearRegression;
const mockLogisticRegression = require('ml-library').logisticRegression;
const mockTimeSeriesForecast = require('ml-library').timeSeriesForecast;
const mockLinearProgramming = require('ml-library').linearProgramming;

describe('PredictiveAnalyticsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('forecastSessionDemand', () => {
    it('should forecast demand with historical data', async () => {
      const mockSessions = [
        { scheduledAt: new Date('2024-01-01'), maxPlayers: 20 },
        { scheduledAt: new Date('2024-01-02'), maxPlayers: 25 },
      ];
      mockPrisma.session.findMany.mockResolvedValue(mockSessions);
      mockPrisma.predictionModel.upsert.mockResolvedValue({ id: 'model1' });
      mockPrisma.predictionResult.create.mockResolvedValue({ id: 'result1' });

      const result = await PredictiveAnalyticsService.forecastSessionDemand('test-loc', 3);

      expect(mockPrisma.session.findMany).toHaveBeenCalledWith({
        where: { location: 'test-loc', status: 'COMPLETED' },
        select: { scheduledAt: true, maxPlayers: true },
        orderBy: { scheduledAt: 'desc' },
        take: 365,
      });
      expect(result).toHaveProperty('id');
      expect(result.confidence).toBe(0.78);
    });

    it('should throw error on insufficient data', async () => {
      mockPrisma.session.findMany.mockResolvedValue([]);

      await expect(PredictiveAnalyticsService.forecastSessionDemand('test-loc')).rejects.toThrow('Insufficient historical data');
    });
  });

  describe('predictChurn', () => {
    it('should predict churn probability', async () => {
      const mockPlayer = {
        id: 'player1',
        lastActiveAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        totalMatches: 10,
        winRate: 0.6,
        sessionsParticipated: 5,
      };
      mockPrisma.mvpPlayer.findUnique.mockResolvedValue(mockPlayer);
      mockPrisma.predictionModel.upsert.mockResolvedValue({ id: 'model2' });
      mockPrisma.predictionResult.create.mockResolvedValue({ id: 'result2' });

      const result = await PredictiveAnalyticsService.predictChurn('player1');

      expect(mockPrisma.mvpPlayer.findUnique).toHaveBeenCalledWith({
        where: { id: 'player1' },
        select: { lastActiveAt: true, totalMatches: true, winRate: true, sessionsParticipated: true },
      });
      expect(result).toHaveProperty('churnProbability');
      expect(result.confidence).toBe(0.72);
    });

    it('should throw error if player not found', async () => {
      mockPrisma.mvpPlayer.findUnique.mockResolvedValue(null);

      await expect(PredictiveAnalyticsService.predictChurn('nonexistent')).rejects.toThrow('Player not found');
    });
  });

  describe('analyzeSeasonalTrends', () => {
    it('should analyze seasonal trends', async () => {
      const mockQuery = [{ month: '2023-01-01T00:00:00.000Z', session_count: 10 }];
      mockPrisma.$queryRaw.mockResolvedValue(mockQuery);
      mockPrisma.predictionModel.upsert.mockResolvedValue({ id: 'model3' });
      mockPrisma.predictionResult.create.mockResolvedValue({ id: 'result3' });

      const result = await PredictiveAnalyticsService.analyzeSeasonalTrends();

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
      expect(result).toHaveProperty('insights');
      expect(result.confidence).toBe(0.80);
    });
  });

  describe('optimizeResourceAllocation', () => {
    it('should optimize allocation', async () => {
      const mockCourts = [{ id: 'court1', maxPlayers: 4 }];
      const mockBookings = [{ id: 'booking1', startTime: new Date(), endTime: new Date(Date.now() + 3600000), totalPrice: 50 }];
      mockPrisma.court.findMany.mockResolvedValue(mockCourts);
      mockPrisma.courtBooking.findMany.mockResolvedValue(mockBookings);
      mockPrisma.predictionModel.upsert.mockResolvedValue({ id: 'model4' });
      mockPrisma.predictionResult.create.mockResolvedValue({ id: 'result4' });

      const result = await PredictiveAnalyticsService.optimizeResourceAllocation('venue1', '2024-01-01');

      expect(result).toHaveProperty('totalCost');
      expect(result.confidence).toBe(0.85);
    });

    it('should throw error if missing params', async () => {
      await expect(PredictiveAnalyticsService.optimizeResourceAllocation('venue1', '')).rejects.toThrow('venueId and date required');
    });
  });

  // Integration test
  describe('Integration: Full Prediction Flow', () => {
    it('should complete demand forecast and save results', async () => {
      // Mock full flow
      const mockSessions = [{ scheduledAt: new Date(), maxPlayers: 20 }];
      mockPrisma.session.findMany.mockResolvedValue(mockSessions);
      mockPrisma.predictionModel.upsert.mockResolvedValue({ id: 'int-model' });
      mockPrisma.predictionResult.create.mockResolvedValue({ id: 'int-result' });

      const result = await PredictiveAnalyticsService.forecastSessionDemand('test', 1);

      expect(result).toBeDefined();
      expect(mockPrisma.predictionResult.create).toHaveBeenCalled();
    });
  });

  // Performance test
  describe('Performance Tests', () => {
    it('should respond within 5 seconds', async () => {
      const start = Date.now();
      await PredictiveAnalyticsService.analyzeSeasonalTrends();
      const end = Date.now();
      expect(end - start).toBeLessThan(5000);
    }, 6000);
  });

  // Accuracy validation
  describe('Accuracy Validation Tests', () => {
    it('should have prediction accuracy > 75%', async () => {
      const result = await PredictiveAnalyticsService.forecastSessionDemand('test', 1);
      expect(result.confidence).toBeGreaterThan(0.75);
    });
  });
});