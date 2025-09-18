import { PrismaClient, MvpPlayer, PairingHistory, AIModelParameters } from '@prisma/client';
import { cacheService } from './cacheService';
import { PerformanceService } from './performanceService';

const prisma = new PrismaClient();

export interface PlayerWithAIData {
  id: string;
  name: string;
  skillLevel?: number;
  winRate: number;
  gamesPlayed: number;
  preferences?: any;
  pairingHistory: PairingHistory[];
}

export interface AIPairingSuggestion {
  pairing: [string, string]; // [player1Id, player2Id]
  confidence: number; // 0-1 score
  reason: string;
  factors: {
    skillMatch: number;
    preferenceMatch: number;
    historicalCompatibility: number;
  };
}

export interface AIPairingResult {
  suggestions: AIPairingSuggestion[];
  processingTime: number;
  algorithmVersion: string;
}

export class AIPairingService {
  private static readonly CACHE_TTL = 300; // 5 minutes
  private static readonly CONFIDENCE_THRESHOLD = 0.7;

  /**
   * Generate AI-powered pairing suggestions for a session
   */
  static async generateAISuggestions(
    sessionId: string,
    playerIds: string[],
    options: {
      maxSuggestions?: number;
      includeHistoricalData?: boolean;
      preferenceWeight?: number;
    } = {}
  ): Promise<AIPairingResult> {
    const startTime = Date.now();
    const {
      maxSuggestions = 5,
      includeHistoricalData = true,
      preferenceWeight = 0.3
    } = options;

    try {
      // Get active model parameters
      const modelParams = await this.getActiveModelParameters();

      // Fetch player data with AI fields
      const players = await this.getPlayersWithAIData(sessionId, playerIds);

      if (players.length < 4) {
        throw new Error('Need at least 4 players for AI pairing suggestions');
      }

      // Generate all possible pairings
      const possiblePairings = this.generatePossiblePairings(players);

      // Score each pairing using AI algorithm
      const scoredPairings = await Promise.all(
        possiblePairings.map(pairing => this.scorePairing(pairing, modelParams, {
          includeHistoricalData,
          preferenceWeight
        }))
      );

      // Sort by confidence score and filter
      const topSuggestions = scoredPairings
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, maxSuggestions)
        .filter(suggestion => suggestion.confidence >= this.CONFIDENCE_THRESHOLD);

      const result: AIPairingResult = {
        suggestions: topSuggestions,
        processingTime: Date.now() - startTime,
        algorithmVersion: modelParams?.version || 'v1.0.0'
      };

      // Cache results for performance
      const cacheKey = `ai-pairings:${sessionId}:${playerIds.sort().join(',')}`;
      await cacheService.set(cacheKey, result, this.CACHE_TTL);

      console.log(`🤖 AI pairing suggestions generated in ${result.processingTime}ms`);
      return result;

    } catch (error) {
      console.error('Error generating AI pairing suggestions:', error);
      throw error;
    }
  }

  /**
   * Get players with AI-relevant data
   */
  private static async getPlayersWithAIData(sessionId: string, playerIds: string[]): Promise<PlayerWithAIData[]> {
    const cacheKey = `players-ai-data:${sessionId}`;
    const cached = await cacheService.get<PlayerWithAIData[]>(cacheKey);

    if (cached) {
      // Filter to requested players only
      return cached.filter(player => playerIds.includes(player.id));
    }

    const players = await prisma.mvpPlayer.findMany({
      where: {
        sessionId,
        id: { in: playerIds },
        status: 'ACTIVE'
      },
      include: {
        pairingHistory: {
          include: {
            partner: true
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 10 // Last 10 pairings for context
        }
      }
    });

    const playersWithAIData: PlayerWithAIData[] = players.map(player => ({
      id: player.id,
      name: player.name,
      skillLevel: player.skillLevel || this.calculateSkillLevel(player),
      winRate: player.winRate,
      gamesPlayed: player.gamesPlayed,
      preferences: player.preferences,
      pairingHistory: player.pairingHistory
    }));

    // Cache for 5 minutes
    await cacheService.set(cacheKey, playersWithAIData, this.CACHE_TTL);

    return playersWithAIData;
  }

  /**
   * Calculate skill level if not set (fallback algorithm)
   */
  private static calculateSkillLevel(player: any): number {
    const baseSkill = 50; // Default skill level
    const winRateBonus = (player.winRate - 0.5) * 20; // ±10 based on win rate
    const experienceBonus = Math.min(player.gamesPlayed / 10, 10); // Up to +10 for experience

    return Math.max(0, Math.min(100, baseSkill + winRateBonus + experienceBonus));
  }

  /**
   * Generate all possible unique pairings from player list
   */
  private static generatePossiblePairings(players: PlayerWithAIData[]): Array<[PlayerWithAIData, PlayerWithAIData]> {
    const pairings: Array<[PlayerWithAIData, PlayerWithAIData]> = [];

    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        pairings.push([players[i], players[j]]);
      }
    }

    return pairings;
  }

  /**
   * Score a pairing using AI algorithm
   */
  private static async scorePairing(
    [player1, player2]: [PlayerWithAIData, PlayerWithAIData],
    modelParams: AIModelParameters | null,
    options: { includeHistoricalData: boolean; preferenceWeight: number }
  ): Promise<AIPairingSuggestion> {
    const factors = {
      skillMatch: this.calculateSkillMatch(player1, player2),
      preferenceMatch: this.calculatePreferenceMatch(player1, player2, options.preferenceWeight),
      historicalCompatibility: options.includeHistoricalData
        ? await this.calculateHistoricalCompatibility(player1, player2)
        : 0.5
    };

    // Use model weights if available, otherwise use defaults
    const weights = modelParams?.skillWeights as any || {
      skillMatch: 0.5,
      preferenceMatch: 0.3,
      historicalCompatibility: 0.2
    };

    const confidence = (
      factors.skillMatch * weights.skillMatch +
      factors.preferenceMatch * weights.preferenceMatch +
      factors.historicalCompatibility * weights.historicalCompatibility
    );

    const reason = this.generatePairingReason(factors, confidence);

    return {
      pairing: [player1.id, player2.id],
      confidence: Math.min(1, Math.max(0, confidence)),
      reason,
      factors
    };
  }

  /**
   * Calculate skill match score (0-1)
   */
  private static calculateSkillMatch(player1: PlayerWithAIData, player2: PlayerWithAIData): number {
    const skill1 = player1.skillLevel || 50;
    const skill2 = player2.skillLevel || 50;

    // Ideal skill difference for balanced games
    const idealDiff = 10;
    const actualDiff = Math.abs(skill1 - skill2);

    // Score decreases as difference increases
    const skillScore = Math.max(0, 1 - (actualDiff / 50));

    // Bonus for similar skill levels
    const similarityBonus = actualDiff <= idealDiff ? 0.1 : 0;

    return Math.min(1, skillScore + similarityBonus);
  }

  /**
   * Calculate preference match score (0-1)
   */
  private static calculatePreferenceMatch(
    player1: PlayerWithAIData,
    player2: PlayerWithAIData,
    weight: number
  ): number {
    if (!player1.preferences || !player2.preferences) {
      return 0.5; // Neutral score if no preferences
    }

    let matches = 0;
    let totalChecks = 0;

    // Check singles/doubles preference compatibility
    if (player1.preferences.singles !== undefined && player2.preferences.singles !== undefined) {
      totalChecks++;
      if (player1.preferences.singles === player2.preferences.singles) {
        matches++;
      }
    }

    // Check time preference compatibility
    if (player1.preferences.time && player2.preferences.time) {
      totalChecks++;
      if (player1.preferences.time === player2.preferences.time) {
        matches++;
      }
    }

    // Check skill preference
    if (player1.preferences.skillPreference && player2.preferences.skillPreference) {
      totalChecks++;
      if (player1.preferences.skillPreference === player2.preferences.skillPreference) {
        matches++;
      }
    }

    return totalChecks > 0 ? matches / totalChecks : 0.5;
  }

  /**
   * Calculate historical compatibility based on past pairings
   */
  private static async calculateHistoricalCompatibility(
    player1: PlayerWithAIData,
    player2: PlayerWithAIData
  ): Promise<number> {
    // Check if they've played together before
    const pastPairings = player1.pairingHistory.filter(
      history => history.partnerId === player2.id
    );

    if (pastPairings.length === 0) {
      return 0.5; // Neutral for new pairings
    }

    // Calculate average feedback score
    const feedbacks = pastPairings
      .map(p => p.feedback)
      .filter(f => f !== null) as number[];

    if (feedbacks.length === 0) {
      return 0.5; // No feedback available
    }

    const avgFeedback = feedbacks.reduce((sum, f) => sum + f, 0) / feedbacks.length;
    const normalizedScore = (avgFeedback - 1) / 4; // Convert 1-5 scale to 0-1

    // Slight preference for new pairings to encourage variety
    const recencyPenalty = Math.min(pastPairings.length * 0.05, 0.2);

    return Math.max(0, Math.min(1, normalizedScore - recencyPenalty));
  }

  /**
   * Generate human-readable reason for pairing suggestion
   */
  private static generatePairingReason(
    factors: AIPairingSuggestion['factors'],
    confidence: number
  ): string {
    const reasons: string[] = [];

    if (factors.skillMatch > 0.8) {
      reasons.push('Excellent skill level match');
    } else if (factors.skillMatch > 0.6) {
      reasons.push('Good skill level compatibility');
    }

    if (factors.preferenceMatch > 0.8) {
      reasons.push('Strong preference alignment');
    } else if (factors.preferenceMatch > 0.6) {
      reasons.push('Compatible preferences');
    }

    if (factors.historicalCompatibility > 0.7) {
      reasons.push('Successful past pairings');
    } else if (factors.historicalCompatibility < 0.3) {
      reasons.push('Fresh pairing opportunity');
    }

    if (reasons.length === 0) {
      reasons.push('Balanced overall compatibility');
    }

    return reasons.join(', ') + ` (${Math.round(confidence * 100)}% confidence)`;
  }

  /**
   * Get active AI model parameters
   */
  private static async getActiveModelParameters(): Promise<AIModelParameters | null> {
    try {
      const cacheKey = 'ai-model-params:active';
      const cached = await cacheService.get<AIModelParameters>(cacheKey);

      if (cached) {
        return cached;
      }

      const activeModel = await prisma.aIModelParameters.findFirst({
        where: { isActive: true }
      });

      if (activeModel) {
        await cacheService.set(cacheKey, activeModel, 3600); // Cache for 1 hour
      }

      return activeModel;
    } catch (error) {
      console.error('Error fetching AI model parameters:', error);
      return null;
    }
  }

  /**
   * Record pairing feedback for learning
   */
  static async recordPairingFeedback(
    sessionId: string,
    playerId: string,
    partnerId: string,
    feedback: number,
    aiSuggested: boolean = false
  ): Promise<void> {
    try {
      await prisma.pairingHistory.create({
        data: {
          sessionId,
          playerId,
          partnerId,
          feedback,
          aiSuggested,
          createdAt: new Date()
        }
      });

      // Invalidate relevant caches
      await cacheService.delete(`players-ai-data:${sessionId}`);

      console.log(`📝 Recorded pairing feedback: ${playerId} + ${partnerId} = ${feedback}/5`);
    } catch (error) {
      console.error('Error recording pairing feedback:', error);
      throw new Error('Failed to record pairing feedback');
    }
  }

  /**
   * Update player skill levels based on match results
   */
  static async updatePlayerSkillLevels(sessionId: string): Promise<void> {
    try {
      const players = await prisma.mvpPlayer.findMany({
        where: { sessionId },
        select: {
          id: true,
          winRate: true,
          gamesPlayed: true,
          skillLevel: true
        }
      });

      for (const player of players) {
        const newSkillLevel = this.calculateSkillLevel(player);
        if (newSkillLevel !== player.skillLevel) {
          await prisma.mvpPlayer.update({
            where: { id: player.id },
            data: { skillLevel: newSkillLevel }
          });
        }
      }

      // Clear cache
      await cacheService.delete(`players-ai-data:${sessionId}`);

      console.log(`🎯 Updated skill levels for ${players.length} players in session ${sessionId}`);
    } catch (error) {
      console.error('Error updating player skill levels:', error);
      throw new Error('Failed to update player skill levels');
    }
  }
}