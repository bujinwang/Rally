/**
 * AI Pairing Service Tests
 *
 * Comprehensive test suite for AI-powered pairing algorithms, including:
 * - Skill-based matching algorithms
 * - Preference consideration logic
 * - Historical data integration
 * - Confidence score calculations
 * - Privacy protection mechanisms
 * - Performance optimization for real-time suggestions
 */

import { AIPairingService, PlayerWithAIData } from '../aiPairingService';

// Mock dependencies
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    mvpPlayer: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    pairingHistory: {
      create: jest.fn(),
    },
    aIModelParameters: {
      findFirst: jest.fn(),
    },
  })),
}));

jest.mock('../cacheService', () => ({
  cacheService: {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../performanceService', () => ({
  performanceService: {
    recordMetric: jest.fn(),
  },
}));

// Test data helper
const createMockPlayer = (overrides: Partial<PlayerWithAIData> = {}): PlayerWithAIData => ({
  id: 'p1',
  name: 'Alice',
  skillLevel: 75,
  winRate: 0.6,
  gamesPlayed: 20,
  preferences: { singles: true, doubles: false, time: 'evenings', skillPreference: 'balanced' },
  pairingHistory: [],
  ...overrides,
});

describe('AIPairingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateSkillMatch', () => {
    const testSpecs = [
      {
        description: 'Should return perfect match for identical skill levels',
        input: {
          player1: createMockPlayer({ skillLevel: 75 }),
          player2: createMockPlayer({ id: 'p2', name: 'Bob', skillLevel: 75 })
        },
        expected: 1.0
      },
      {
        description: 'Should return high match for close skill levels',
        input: {
          player1: createMockPlayer({ skillLevel: 70 }),
          player2: createMockPlayer({ id: 'p2', name: 'Bob', skillLevel: 75 })
        },
        expected: 0.95
      },
      {
        description: 'Should return low match for very different skill levels',
        input: {
          player1: createMockPlayer({ skillLevel: 20 }),
          player2: createMockPlayer({ id: 'p2', name: 'Bob', skillLevel: 90 })
        },
        expected: 0.0
      },
      {
        description: 'Should handle missing skill levels gracefully',
        input: {
          player1: createMockPlayer({ skillLevel: undefined }),
          player2: createMockPlayer({ id: 'p2', name: 'Bob', skillLevel: 75 })
        },
        expected: 0.5
      }
    ];

    testSpecs.forEach(({ description, input, expected }) => {
      it(description, () => {
        // Access private method using type assertion
        const result = (AIPairingService as any).calculateSkillMatch(input.player1, input.player2);
        expect(result).toBeCloseTo(expected, 2);
      });
    });
  });

  describe('calculatePreferenceMatch', () => {
    const testSpecs = [
      {
        description: 'Should return perfect match for identical preferences',
        input: {
          player1: createMockPlayer({
            preferences: { singles: true, doubles: false, time: 'evenings', skillPreference: 'balanced' }
          }),
          player2: createMockPlayer({
            id: 'p2', name: 'Bob',
            preferences: { singles: true, doubles: false, time: 'evenings', skillPreference: 'balanced' }
          }),
          weight: 0.3
        },
        expected: 1.0
      },
      {
        description: 'Should return partial match for some preference alignment',
        input: {
          player1: createMockPlayer({
            preferences: { singles: true, doubles: false, time: 'evenings' }
          }),
          player2: createMockPlayer({
            id: 'p2', name: 'Bob',
            preferences: { singles: false, doubles: true, time: 'evenings' }
          }),
          weight: 0.3
        },
        expected: 0.333
      },
      {
        description: 'Should return neutral score when no preferences set',
        input: {
          player1: createMockPlayer({ preferences: undefined }),
          player2: createMockPlayer({ id: 'p2', name: 'Bob', preferences: undefined }),
          weight: 0.3
        },
        expected: 0.5
      }
    ];

    testSpecs.forEach(({ description, input, expected }) => {
      it(description, () => {
        const result = (AIPairingService as any).calculatePreferenceMatch(input.player1, input.player2, input.weight);
        expect(result).toBeCloseTo(expected, 2);
      });
    });
  });

  describe('calculateHistoricalCompatibility', () => {
    const testSpecs = [
      {
        description: 'Should return high compatibility for successful past pairings',
        input: {
          player1: createMockPlayer({
            pairingHistory: [
              { partnerId: 'p2', feedback: 5, outcome: 'win', createdAt: new Date() },
              { partnerId: 'p2', feedback: 4, outcome: 'win', createdAt: new Date() }
            ]
          }),
          player2: createMockPlayer({ id: 'p2', name: 'Bob', pairingHistory: [] })
        },
        expected: 0.9
      },
      {
        description: 'Should return low compatibility for poor past pairings',
        input: {
          player1: createMockPlayer({
            pairingHistory: [
              { partnerId: 'p2', feedback: 1, outcome: 'loss', createdAt: new Date() },
              { partnerId: 'p2', feedback: 2, outcome: 'loss', createdAt: new Date() }
            ]
          }),
          player2: createMockPlayer({ id: 'p2', name: 'Bob', pairingHistory: [] })
        },
        expected: 0.15
      },
      {
        description: 'Should return neutral score for new pairings',
        input: {
          player1: createMockPlayer({ pairingHistory: [] }),
          player2: createMockPlayer({ id: 'p2', name: 'Bob', pairingHistory: [] })
        },
        expected: 0.5
      },
      {
        description: 'Should apply recency penalty for frequent pairings',
        input: {
          player1: createMockPlayer({
            pairingHistory: Array(5).fill({
              partnerId: 'p2',
              feedback: 5,
              outcome: 'win',
              createdAt: new Date()
            })
          }),
          player2: createMockPlayer({ id: 'p2', name: 'Bob', pairingHistory: [] })
        },
        expected: 0.75
      }
    ];

    testSpecs.forEach(({ description, input, expected }) => {
      it(description, async () => {
        const result = await (AIPairingService as any).calculateHistoricalCompatibility(input.player1, input.player2);
        expect(result).toBeCloseTo(expected, 2);
      });
    });
  });

  describe('scorePairing', () => {
    const testSpecs = [
      {
        description: 'Should calculate high confidence for well-matched players',
        input: {
          pairing: [
            createMockPlayer({ skillLevel: 75, preferences: { singles: true }, pairingHistory: [] }),
            createMockPlayer({ id: 'p2', name: 'Bob', skillLevel: 75, preferences: { singles: true }, pairingHistory: [] })
          ],
          modelParams: {
            skillWeights: { skillMatch: 0.5, preferenceMatch: 0.3, historicalCompatibility: 0.2 },
            version: 'v1.0.0'
          },
          options: { includeHistoricalData: false, preferenceWeight: 0.3 }
        },
        expected: {
          confidence: { min: 0.8, max: 1.0 },
          factors: {
            skillMatch: 1.0,
            preferenceMatch: 1.0,
            historicalCompatibility: 0.5
          }
        }
      },
      {
        description: 'Should calculate low confidence for poorly matched players',
        input: {
          pairing: [
            createMockPlayer({ skillLevel: 20, preferences: { singles: true }, pairingHistory: [] }),
            createMockPlayer({ id: 'p2', name: 'Bob', skillLevel: 90, preferences: { doubles: true }, pairingHistory: [] })
          ],
          modelParams: {
            skillWeights: { skillMatch: 0.5, preferenceMatch: 0.3, historicalCompatibility: 0.2 },
            version: 'v1.0.0'
          },
          options: { includeHistoricalData: false, preferenceWeight: 0.3 }
        },
        expected: {
          confidence: { min: 0.0, max: 0.3 },
          factors: {
            skillMatch: 0.0,
            preferenceMatch: 0.0,
            historicalCompatibility: 0.5
          }
        }
      }
    ];

    testSpecs.forEach(({ description, input, expected }) => {
      it(description, async () => {
        const result = await (AIPairingService as any).scorePairing(input.pairing[0], input.pairing[1], input.modelParams, input.options);

        expect(result.confidence).toBeGreaterThanOrEqual(expected.confidence.min);
        expect(result.confidence).toBeLessThanOrEqual(expected.confidence.max);
        expect(result.factors.skillMatch).toBeCloseTo(expected.factors.skillMatch, 1);
        expect(result.factors.preferenceMatch).toBeCloseTo(expected.factors.preferenceMatch, 1);
        expect(result.factors.historicalCompatibility).toBeCloseTo(expected.factors.historicalCompatibility, 1);
      });
    });
  });

  describe('generatePairingReason', () => {
    const testSpecs = [
      {
        description: 'Should generate detailed reason for high confidence pairing',
        input: {
          factors: { skillMatch: 1.0, preferenceMatch: 1.0, historicalCompatibility: 0.8 },
          confidence: 0.95
        },
        expected: {
          contains: ['Excellent skill level match', 'Strong preference alignment', '95% confidence'],
          length: { min: 50, max: 200 }
        }
      },
      {
        description: 'Should generate reason for mixed factors',
        input: {
          factors: { skillMatch: 0.6, preferenceMatch: 0.3, historicalCompatibility: 0.5 },
          confidence: 0.65
        },
        expected: {
          contains: ['Good skill level compatibility', '65% confidence'],
          notContains: ['Excellent', 'Strong']
        }
      }
    ];

    testSpecs.forEach(({ description, input, expected }) => {
      it(description, () => {
        const result = (AIPairingService as any).generatePairingReason(input.factors, input.confidence);

        expect(result.length).toBeGreaterThanOrEqual(expected.length?.min || 0);
        expect(result.length).toBeLessThanOrEqual(expected.length?.max || 1000);

        expected.contains?.forEach(text => {
          expect(result).toContain(text);
        });

        expected.notContains?.forEach(text => {
          expect(result).not.toContain(text);
        });
      });
    });
  });

  describe('generateAISuggestions', () => {
    const mockPlayers = [
      createMockPlayer({ id: 'p1', skillLevel: 75 }),
      createMockPlayer({ id: 'p2', skillLevel: 70 }),
      createMockPlayer({ id: 'p3', skillLevel: 80 }),
      createMockPlayer({ id: 'p4', skillLevel: 65 }),
      createMockPlayer({ id: 'p5', skillLevel: 85 }),
      createMockPlayer({ id: 'p6', skillLevel: 60 })
    ];

    beforeEach(() => {
      const mockCacheService = require('../cacheService').cacheService;
      mockCacheService.get.mockResolvedValue(null);
      mockCacheService.set.mockResolvedValue(undefined);
    });

    it('Should generate multiple suggestions for valid player set', async () => {
      const mockPrisma = require('@prisma/client').PrismaClient.mock.results[0].value;
      mockPrisma.mvpPlayer.findMany.mockResolvedValue(mockPlayers);
      mockPrisma.aIModelParameters.findFirst.mockResolvedValue({
        skillWeights: { skillMatch: 0.5, preferenceMatch: 0.3, historicalCompatibility: 0.2 },
        version: 'v1.0.0'
      });

      const result = await AIPairingService.generateAISuggestions('test-session', ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], {
        maxSuggestions: 3,
        includeHistoricalData: true
      });

      expect(result.suggestions).toHaveLength(3);
      expect(result.suggestions.every(s => s.confidence >= 0.5)).toBe(true);
      expect(result.processingTime).toBeLessThan(1000);
      expect(result.algorithmVersion).toBe('v1.0.0');
    });

    it('Should handle insufficient players gracefully', async () => {
      await expect(
        AIPairingService.generateAISuggestions('test-session', ['p1', 'p2'], { maxSuggestions: 3 })
      ).rejects.toThrow('Need at least 4 players for AI pairing suggestions');
    });

    it('Should respect confidence threshold', async () => {
      const mockPrisma = require('@prisma/client').PrismaClient.mock.results[0].value;
      mockPrisma.mvpPlayer.findMany.mockResolvedValue(mockPlayers);
      mockPrisma.aIModelParameters.findFirst.mockResolvedValue({
        skillWeights: { skillMatch: 0.5, preferenceMatch: 0.3, historicalCompatibility: 0.2 },
        version: 'v1.0.0'
      });

      const result = await AIPairingService.generateAISuggestions('test-session', ['p1', 'p2', 'p3', 'p4'], {
        maxSuggestions: 5
      });

      expect(result.suggestions.length).toBeLessThanOrEqual(5);
      expect(result.suggestions.every(s => s.confidence >= 0.7)).toBe(true);
    });
  });

  describe('Performance Tests', () => {
    it('Should handle large session with 50 players within 2 seconds', async () => {
      const largePlayerSet = Array.from({ length: 50 }, (_, i) =>
        createMockPlayer({
          id: `p${i + 1}`,
          skillLevel: Math.floor(Math.random() * 100)
        })
      );

      const mockPrisma = require('@prisma/client').PrismaClient.mock.results[0].value;
      mockPrisma.mvpPlayer.findMany.mockResolvedValue(largePlayerSet);
      mockPrisma.aIModelParameters.findFirst.mockResolvedValue({
        skillWeights: { skillMatch: 0.5, preferenceMatch: 0.3, historicalCompatibility: 0.2 },
        version: 'v1.0.0'
      });

      const startTime = Date.now();
      const result = await AIPairingService.generateAISuggestions(
        'large-session',
        largePlayerSet.map(p => p.id),
        { maxSuggestions: 5 }
      );
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(2000);
      expect(result.suggestions).toHaveLength(5);
      expect(result.suggestions.every(s => s.confidence >= 0.6)).toBe(true);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('Should handle players with extreme skill differences', async () => {
      const extremePlayers = [
        createMockPlayer({ id: 'p1', skillLevel: 5 }),
        createMockPlayer({ id: 'p2', skillLevel: 95 }),
        createMockPlayer({ id: 'p3', skillLevel: 50 }),
        createMockPlayer({ id: 'p4', skillLevel: 50 })
      ];

      const mockPrisma = require('@prisma/client').PrismaClient.mock.results[0].value;
      mockPrisma.mvpPlayer.findMany.mockResolvedValue(extremePlayers);
      mockPrisma.aIModelParameters.findFirst.mockResolvedValue({
        skillWeights: { skillMatch: 0.5, preferenceMatch: 0.3, historicalCompatibility: 0.2 },
        version: 'v1.0.0'
      });

      const result = await AIPairingService.generateAISuggestions('extreme-session', ['p1', 'p2', 'p3', 'p4']);

      expect(result.suggestions).toBeDefined();
      expect(result.suggestions.length).toBeGreaterThan(0);
      // Should still generate suggestions even with poor matches
    });

    it('Should handle database connection failures gracefully', async () => {
      const mockPrisma = require('@prisma/client').PrismaClient.mock.results[0].value;
      mockPrisma.mvpPlayer.findMany.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        AIPairingService.generateAISuggestions('test-session', ['p1', 'p2', 'p3', 'p4'])
      ).rejects.toThrow('Database connection failed');
    });

    it('Should handle cache misses without errors', async () => {
      const mockCacheService = require('../cacheService').cacheService;
      mockCacheService.get.mockResolvedValue(null);
      mockCacheService.set.mockRejectedValue(new Error('Cache write failed'));

      const mockPrisma = require('@prisma/client').PrismaClient.mock.results[0].value;
      mockPrisma.mvpPlayer.findMany.mockResolvedValue([
        createMockPlayer({ id: 'p1' }),
        createMockPlayer({ id: 'p2' }),
        createMockPlayer({ id: 'p3' }),
        createMockPlayer({ id: 'p4' })
      ]);
      mockPrisma.aIModelParameters.findFirst.mockResolvedValue({
        skillWeights: { skillMatch: 0.5, preferenceMatch: 0.3, historicalCompatibility: 0.2 },
        version: 'v1.0.0'
      });

      // Should still work even if cache write fails
      const result = await AIPairingService.generateAISuggestions('test-session', ['p1', 'p2', 'p3', 'p4']);
      expect(result.suggestions).toBeDefined();
    });
  });

  describe('Privacy and Security', () => {
    it('Should not store personally identifiable information in pairing history', async () => {
      const mockPrisma = require('@prisma/client').PrismaClient.mock.results[0].value;
      mockPrisma.pairingHistory.create.mockResolvedValue({
        id: 'ph1',
        sessionId: 'test-session',
        playerId: 'p1',
        partnerId: 'p2',
        feedback: 5,
        aiSuggested: true,
        createdAt: new Date()
      });

      await AIPairingService.recordPairingFeedback('test-session', 'p1', 'p2', 5, true);

      const createCall = mockPrisma.pairingHistory.create.mock.calls[0][0].data;
      expect(createCall).not.toHaveProperty('playerName');
      expect(createCall).not.toHaveProperty('partnerName');
      expect(createCall).not.toHaveProperty('email');
      expect(createCall.playerId).toBe('p1');
      expect(createCall.partnerId).toBe('p2');
    });

    it('Should handle preference data securely', async () => {
      const playersWithPrefs = [
        createMockPlayer({
          id: 'p1',
          preferences: { singles: true, doubles: false, time: 'evenings' }
        }),
        createMockPlayer({
          id: 'p2',
          preferences: { singles: true, doubles: false, time: 'evenings' }
        }),
        createMockPlayer({ id: 'p3' }),
        createMockPlayer({ id: 'p4' })
      ];

      const mockPrisma = require('@prisma/client').PrismaClient.mock.results[0].value;
      mockPrisma.mvpPlayer.findMany.mockResolvedValue(playersWithPrefs);
      mockPrisma.aIModelParameters.findFirst.mockResolvedValue({
        skillWeights: { skillMatch: 0.5, preferenceMatch: 0.3, historicalCompatibility: 0.2 },
        version: 'v1.0.0'
      });

      const result = await AIPairingService.generateAISuggestions('test-session', ['p1', 'p2', 'p3', 'p4']);

      expect(result.suggestions).toBeDefined();
      // Preferences should be used in matching but not exposed in results
      result.suggestions.forEach(suggestion => {
        expect(suggestion.reason).not.toContain('singles');
        expect(suggestion.reason).not.toContain('evenings');
      });
    });
  });

  describe('Integration Tests', () => {
    it('Should integrate feedback loop correctly', async () => {
      const mockPrisma = require('@prisma/client').PrismaClient.mock.results[0].value;

      // First, generate suggestions
      mockPrisma.mvpPlayer.findMany.mockResolvedValue([
        createMockPlayer({ id: 'p1', pairingHistory: [] }),
        createMockPlayer({ id: 'p2', pairingHistory: [] }),
        createMockPlayer({ id: 'p3', pairingHistory: [] }),
        createMockPlayer({ id: 'p4', pairingHistory: [] })
      ]);
      mockPrisma.aIModelParameters.findFirst.mockResolvedValue({
        skillWeights: { skillMatch: 0.5, preferenceMatch: 0.3, historicalCompatibility: 0.2 },
        version: 'v1.0.0'
      });

      const initialResult = await AIPairingService.generateAISuggestions('test-session', ['p1', 'p2', 'p3', 'p4']);

      // Record feedback
      mockPrisma.pairingHistory.create.mockResolvedValue({
        id: 'ph1',
        sessionId: 'test-session',
        playerId: 'p1',
        partnerId: 'p2',
        feedback: 5,
        aiSuggested: true,
        createdAt: new Date()
      });

      await AIPairingService.recordPairingFeedback('test-session', 'p1', 'p2', 5, true);

      // Verify feedback was recorded
      expect(mockPrisma.pairingHistory.create).toHaveBeenCalledWith({
        data: {
          sessionId: 'test-session',
          playerId: 'p1',
          partnerId: 'p2',
          feedback: 5,
          aiSuggested: true,
          createdAt: expect.any(Date)
        }
      });
    });

    it('Should update skill levels based on match results', async () => {
      const mockPrisma = require('@prisma/client').PrismaClient.mock.results[0].value;
      const players = [
        { id: 'p1', winRate: 0.6, gamesPlayed: 20, skillLevel: 70 },
        { id: 'p2', winRate: 0.7, gamesPlayed: 25, skillLevel: 75 }
      ];

      mockPrisma.mvpPlayer.findMany.mockResolvedValue(players);
      mockPrisma.mvpPlayer.update.mockResolvedValue({});

      await AIPairingService.updatePlayerSkillLevels('test-session');

      expect(mockPrisma.mvpPlayer.update).toHaveBeenCalledTimes(2);
      players.forEach(player => {
        expect(mockPrisma.mvpPlayer.update).toHaveBeenCalledWith({
          where: { id: player.id },
          data: { skillLevel: expect.any(Number) }
        });
      });
    });
  });
});
  calculateSkillMatch: [
    {
      description: 'Should return perfect match for identical skill levels',
      input: {
        player1: { id: 'p1', name: 'Alice', skillLevel: 75 },
        player2: { id: 'p2', name: 'Bob', skillLevel: 75 }
      },
      expected: 1.0
    },
    {
      description: 'Should return high match for close skill levels',
      input: {
        player1: { id: 'p1', name: 'Alice', skillLevel: 70 },
        player2: { id: 'p2', name: 'Bob', skillLevel: 75 }
      },
      expected: 0.95 // 5 point difference, still very compatible
    },
    {
      description: 'Should return low match for very different skill levels',
      input: {
        player1: { id: 'p1', name: 'Alice', skillLevel: 20 },
        player2: { id: 'p2', name: 'Bob', skillLevel: 90 }
      },
      expected: 0.0 // 70 point difference, poor match
    },
    {
      description: 'Should handle missing skill levels gracefully',
      input: {
        player1: { id: 'p1', name: 'Alice', skillLevel: undefined },
        player2: { id: 'p2', name: 'Bob', skillLevel: 75 }
      },
      expected: 0.5 // Neutral score when skill level unknown
    }
  ],

  calculatePreferenceMatch: [
    {
      description: 'Should return perfect match for identical preferences',
      input: {
        player1: {
          id: 'p1',
          name: 'Alice',
          preferences: { singles: true, doubles: false, time: 'evenings', skillPreference: 'balanced' }
        },
        player2: {
          id: 'p2',
          name: 'Bob',
          preferences: { singles: true, doubles: false, time: 'evenings', skillPreference: 'balanced' }
        },
        weight: 0.3
      },
      expected: 1.0
    },
    {
      description: 'Should return partial match for some preference alignment',
      input: {
        player1: {
          id: 'p1',
          name: 'Alice',
          preferences: { singles: true, doubles: false, time: 'evenings' }
        },
        player2: {
          id: 'p2',
          name: 'Bob',
          preferences: { singles: false, doubles: true, time: 'evenings' }
        },
        weight: 0.3
      },
      expected: 0.333 // Only time preference matches (1/3)
    },
    {
      description: 'Should return neutral score when no preferences set',
      input: {
        player1: { id: 'p1', name: 'Alice', preferences: undefined },
        player2: { id: 'p2', name: 'Bob', preferences: undefined },
        weight: 0.3
      },
      expected: 0.5
    }
  ],

  calculateHistoricalCompatibility: [
    {
      description: 'Should return high compatibility for successful past pairings',
      input: {
        player1: {
          id: 'p1',
          name: 'Alice',
          pairingHistory: [
            { partnerId: 'p2', feedback: 5, outcome: 'win' },
            { partnerId: 'p2', feedback: 4, outcome: 'win' }
          ]
        },
        player2: { id: 'p2', name: 'Bob', pairingHistory: [] }
      },
      expected: 0.9 // High score for 4.5 average feedback
    },
    {
      description: 'Should return low compatibility for poor past pairings',
      input: {
        player1: {
          id: 'p1',
          name: 'Alice',
          pairingHistory: [
            { partnerId: 'p2', feedback: 1, outcome: 'loss' },
            { partnerId: 'p2', feedback: 2, outcome: 'loss' }
          ]
        },
        player2: { id: 'p2', name: 'Bob', pairingHistory: [] }
      },
      expected: 0.15 // Low score for 1.5 average feedback
    },
    {
      description: 'Should return neutral score for new pairings',
      input: {
        player1: { id: 'p1', name: 'Alice', pairingHistory: [] },
        player2: { id: 'p2', name: 'Bob', pairingHistory: [] }
      },
      expected: 0.5
    },
    {
      description: 'Should apply recency penalty for frequent pairings',
      input: {
        player1: {
          id: 'p1',
          name: 'Alice',
          pairingHistory: [
            { partnerId: 'p2', feedback: 5, outcome: 'win' },
            { partnerId: 'p2', feedback: 5, outcome: 'win' },
            { partnerId: 'p2', feedback: 5, outcome: 'win' },
            { partnerId: 'p2', feedback: 5, outcome: 'win' },
            { partnerId: 'p2', feedback: 5, outcome: 'win' }
          ]
        },
        player2: { id: 'p2', name: 'Bob', pairingHistory: [] }
      },
      expected: 0.75 // Perfect feedback but 0.25 recency penalty
    }
  ],

  scorePairing: [
    {
      description: 'Should calculate high confidence for well-matched players',
      input: {
        pairing: [
          { id: 'p1', name: 'Alice', skillLevel: 75, preferences: { singles: true }, pairingHistory: [] },
          { id: 'p2', name: 'Bob', skillLevel: 75, preferences: { singles: true }, pairingHistory: [] }
        ],
        modelParams: {
          skillWeights: { skillMatch: 0.5, preferenceMatch: 0.3, historicalCompatibility: 0.2 },
          version: 'v1.0.0'
        },
        options: { includeHistoricalData: false, preferenceWeight: 0.3 }
      },
      expected: {
        confidence: { min: 0.8, max: 1.0 },
        factors: {
          skillMatch: 1.0,
          preferenceMatch: 1.0,
          historicalCompatibility: 0.5
        }
      }
    },
    {
      description: 'Should calculate low confidence for poorly matched players',
      input: {
        pairing: [
          { id: 'p1', name: 'Alice', skillLevel: 20, preferences: { singles: true }, pairingHistory: [] },
          { id: 'p2', name: 'Bob', skillLevel: 90, preferences: { doubles: true }, pairingHistory: [] }
        ],
        modelParams: {
          skillWeights: { skillMatch: 0.5, preferenceMatch: 0.3, historicalCompatibility: 0.2 },
          version: 'v1.0.0'
        },
        options: { includeHistoricalData: false, preferenceWeight: 0.3 }
      },
      expected: {
        confidence: { min: 0.0, max: 0.3 },
        factors: {
          skillMatch: 0.0,
          preferenceMatch: 0.0,
          historicalCompatibility: 0.5
        }
      }
    }
  ],

  generateAISuggestions: [
    {
      description: 'Should generate multiple suggestions for valid player set',
      input: {
        sessionId: 'test-session',
        playerIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
        options: { maxSuggestions: 3, includeHistoricalData: true }
      },
      expected: {
        suggestionsCount: 3,
        allConfidencesAbove: 0.5,
        allPairingsUnique: true,
        processingTime: { max: 1000 } // Should complete within 1 second
      }
    },
    {
      description: 'Should handle insufficient players gracefully',
      input: {
        sessionId: 'test-session',
        playerIds: ['p1', 'p2'],
        options: { maxSuggestions: 3 }
      },
      expected: {
        shouldThrow: true,
        errorMessage: 'Need at least 4 players for AI pairing suggestions'
      }
    },
    {
      description: 'Should respect confidence threshold',
      input: {
        sessionId: 'test-session',
        playerIds: ['p1', 'p2', 'p3', 'p4'],
        options: { maxSuggestions: 5 }
      },
      expected: {
        allSuggestionsAboveThreshold: 0.7,
        maxSuggestions: 5
      }
    }
  ],

  generatePairingReason: [
    {
      description: 'Should generate detailed reason for high confidence pairing',
      input: {
        factors: { skillMatch: 1.0, preferenceMatch: 1.0, historicalCompatibility: 0.8 },
        confidence: 0.95
      },
      expected: {
        contains: ['Excellent skill level match', 'Strong preference alignment', '95% confidence'],
        length: { min: 50, max: 200 }
      }
    },
    {
      description: 'Should generate reason for mixed factors',
      input: {
        factors: { skillMatch: 0.6, preferenceMatch: 0.3, historicalCompatibility: 0.5 },
        confidence: 0.65
      },
      expected: {
        contains: ['Good skill level compatibility', '65% confidence'],
        notContains: ['Excellent', 'Strong']
      }
    }
  ]
};

/**
 * Performance Test Scenarios
 */
export const performanceTestScenarios = [
  {
    scenario: 'Large session with 50 players',
    setup: 'Create session with 50 active players with varied skill levels and preferences',
    test: 'Generate AI suggestions within 2 seconds',
    expected: {
      maxProcessingTime: 2000,
      minSuggestions: 5,
      minConfidence: 0.6
    }
  },
  {
    scenario: 'High frequency requests',
    setup: 'Simulate 10 concurrent AI suggestion requests',
    test: 'All requests complete within 5 seconds total',
    expected: {
      maxTotalTime: 5000,
      allRequestsSuccessful: true
    }
  },
  {
    scenario: 'Complex historical data',
    setup: 'Players with 20+ pairing history entries each',
    test: 'Generate suggestions with historical analysis within 3 seconds',
    expected: {
      maxProcessingTime: 3000,
      historicalFactorsIncluded: true
    }
  }
];

/**
 * Privacy and Security Test Scenarios
 */
export const privacyTestScenarios = [
  {
    scenario: 'Data anonymization verification',
    test: 'Ensure no personally identifiable information is stored in pairing history',
    expected: 'All pairing records contain only player IDs and anonymized data'
  },
  {
    scenario: 'Preference data protection',
    test: 'Verify preference data is encrypted and access-controlled',
    expected: 'Preference data requires explicit user consent for AI processing'
  },
  {
    scenario: 'Feedback data retention',
    test: 'Ensure feedback data is retained only for model improvement',
    expected: 'Feedback data automatically deleted after 365 days'
  },
  {
    scenario: 'Opt-out functionality',
    test: 'Verify users can opt-out of AI pairing suggestions',
    expected: 'Opted-out users never included in AI suggestions'
  }
];

/**
 * Integration Test Scenarios
 */
export const integrationTestScenarios = [
  {
    scenario: 'AI suggestions with real-time player updates',
    steps: [
      '1. Create session with 6 players',
      '2. Generate initial AI suggestions',
      '3. Have one player change status to RESTING',
      '4. Generate new AI suggestions',
      '5. Verify RESTING player excluded from suggestions',
      '6. Verify remaining suggestions are valid'
    ]
  },
  {
    scenario: 'Feedback loop integration',
    steps: [
      '1. Generate AI pairing suggestions',
      '2. User accepts suggestion and plays match',
      '3. User provides feedback (1-5 rating)',
      '4. System records feedback in pairing history',
      '5. Next AI suggestions incorporate feedback data',
      '6. Verify improved suggestions based on feedback'
    ]
  },
  {
    scenario: 'Skill level updates integration',
    steps: [
      '1. Generate AI suggestions with current skill levels',
      '2. Complete several matches with results',
      '3. System automatically updates player skill levels',
      '4. Generate new AI suggestions',
      '5. Verify suggestions reflect updated skill levels'
    ]
  }
];

/**
 * Edge Cases and Error Handling
 */
export const edgeCaseTests = [
  {
    description: 'Handle players with extreme skill differences',
    input: {
      players: [
        { id: 'p1', skillLevel: 5 },
        { id: 'p2', skillLevel: 95 },
        { id: 'p3', skillLevel: 50 },
        { id: 'p4', skillLevel: 50 }
      ]
    },
    expected: 'Still generates valid suggestions, though with lower confidence'
  },
  {
    description: 'Handle players with conflicting preferences',
    input: {
      players: [
        { id: 'p1', preferences: { singles: true, doubles: false } },
        { id: 'p2', preferences: { singles: false, doubles: true } },
        { id: 'p3', preferences: { singles: true, doubles: false } },
        { id: 'p4', preferences: { singles: false, doubles: true } }
      ]
    },
    expected: 'Generates suggestions prioritizing compatible preferences'
  },
  {
    description: 'Handle database connection failures',
    input: { simulateDbFailure: true },
    expected: 'Gracefully degrades to basic pairing algorithm'
  },
  {
    description: 'Handle cache misses',
    input: { clearCache: true },
    expected: 'Still generates suggestions, just slower on first request'
  }
];

/**
 * Manual Testing Checklist for AI Pairing
 */
export const manualTestingChecklist = [
  '✅ Generate AI suggestions for 4-8 players',
  '✅ Verify confidence scores are reasonable',
  '✅ Test explanation modal for suggestions',
  '✅ Submit feedback (1-5 stars) for pairings',
  '✅ Verify feedback affects future suggestions',
  '✅ Test with players who have pairing history',
  '✅ Test with players who have no history',
  '✅ Verify privacy settings are respected',
  '✅ Test performance with 20+ players',
  '✅ Test error handling for network issues',
  '✅ Verify manual override still works',
  '✅ Test skill level updates after matches',
  '✅ Verify cache performance improvements',
  '✅ Test concurrent suggestion requests'
];