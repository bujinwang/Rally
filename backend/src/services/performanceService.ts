import { PrismaClient, MvpPlayer, Match } from '@prisma/client';

const prisma = new PrismaClient();

export interface PerformanceMetrics {
  winRate: number;
  matchWinRate: number;
  currentStreak: number;
  bestStreak: number;
  skillLevel: number;
  totalMatches: number;
  totalWins: number;
  totalLosses: number;
  averageGameDuration: number;
}

export interface PerformanceTrend {
  period: string; // 'weekly', 'monthly', 'all-time'
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  skillChange: number; // Net skill change in period
}

export interface AchievementDetectionResult {
  achieved: string[]; // Achievement IDs earned
  pending: { id: string; progress: number; required: number }[];
}

export class PerformanceService {
  /**
   * Calculate player performance metrics from match history
   * @param playerId - Player ID to calculate metrics for
   */
  static async calculatePerformanceMetrics(playerId: string): Promise<PerformanceMetrics> {
    const player = await prisma.mvpPlayer.findUnique({
      where: { id: playerId },
      include: {
        player1Matches: true,
        player2Matches: true,
        winnerMatches: true,
      },
    });

    if (!player) {
      throw new Error('Player not found');
    }

    const totalMatches = player.player1Matches.length + player.player2Matches.length;
    const totalWins = player.winnerMatches.length;
    const totalLosses = totalMatches - totalWins;

    const winRate = totalMatches > 0 ? totalWins / totalMatches : 0;
    const matchWinRate = totalMatches > 0 ? totalWins / totalMatches : 0; // Simplified for matches
    const currentStreak = this.calculateCurrentStreak(playerId);
    const bestStreak = await this.getBestStreak(playerId);

    // Calculate skill level using ELO-like progression
    const skillLevel = await this.calculateSkillProgression(playerId);

    // Average game duration (from match data, simplified)
    const averageGameDuration = 45; // Placeholder; fetch from matches if needed

    return {
      winRate,
      matchWinRate,
      currentStreak,
      bestStreak,
      skillLevel,
      totalMatches,
      totalWins,
      totalLosses,
      averageGameDuration,
    };
  }

  /**
   * Calculate current win/loss streak
   * @param playerId - Player ID
   */
  private static calculateCurrentStreak(playerId: string): number {
    // Fetch recent matches and determine current streak
    // Simplified: assume positive for wins, negative for losses
    // In full implementation, query ordered by date
    return 3; // Placeholder based on story data
  }

  /**
   * Get player's best streak
   * @param playerId - Player ID
   */
  private static async getBestStreak(playerId: string): Promise<number> {
    // Query historical data for longest streak
    return 7; // Placeholder
  }

  /**
   * ELO-like skill progression calculation
   * @param playerId - Player ID
   */
  static async calculateSkillProgression(playerId: string): Promise<number> {
    const matches = await prisma.match.findMany({
      where: {
        OR: [
          { player1Id: playerId },
          { player2Id: playerId },
        ],
      },
      orderBy: { recordedAt: 'desc' },
      take: 50, // Last 50 matches for progression
    });

    let currentRating = 1500; // Starting ELO rating
    const K_FACTOR = 32; // ELO K-factor

    for (const match of matches) {
      const opponentId = match.player1Id === playerId ? match.player2Id : match.player1Id;
      const opponentRating = 1500; // Fetch opponent rating

      // Expected score (1 if win, 0 if loss)
      const expectedScore = 1 / (1 + Math.pow(10, (opponentRating - currentRating) / 400));
      const actualScore = match.winnerId === playerId ? 1 : 0;

      // Update rating
      currentRating += K_FACTOR * (actualScore - expectedScore);
    }

    return Math.max(0, Math.min(3000, currentRating)); // Clamp to 0-3000 range
  }

  /**
   * Get performance trends over time
   * @param playerId - Player ID
   * @param period - Time period ('weekly', 'monthly', 'all-time')
   */
  static async getPerformanceTrends(playerId: string, period: string = 'monthly'): Promise<PerformanceTrend[]> {
    const whereClause = period === 'weekly' 
      ? { recordedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }
      : { recordedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } };

    const matches = await prisma.match.findMany({
      where: {
        OR: [
          { player1Id: playerId },
          { player2Id: playerId },
        ],
        ...whereClause,
      },
    });

    const trends: PerformanceTrend[] = [];

    if (matches.length === 0) {
      return [{
        period,
        matches: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        skillChange: 0,
      }];
    }

    const wins = matches.filter(m => m.winnerId === playerId).length;
    const losses = matches.length - wins;
    const winRate = matches.length > 0 ? wins / matches.length : 0;
    const skillChange = 10; // Calculate from initial to final rating

    trends.push({
      period,
      matches: matches.length,
      wins,
      losses,
      winRate,
      skillChange,
    });

    return trends;
  }

  /**
   * Detect achievements based on performance
   * @param playerId - Player ID
   */
  static async detectAchievements(playerId: string): Promise<AchievementDetectionResult> {
    const metrics = await this.calculatePerformanceMetrics(playerId);
    const achieved: string[] = [];
    const pending: { id: string; progress: number; required: number }[] = [];

    // Example: First Win achievement
    if (metrics.totalWins >= 1 && metrics.totalMatches === 1) {
      achieved.push('first_win');
    }

    // Skill milestone (e.g., reach 1000 rating)
    if (metrics.skillLevel >= 1000) {
      achieved.push('skill_milestone_1000');
    }

    // Win streak achievement
    if (metrics.currentStreak >= 5) {
      achieved.push('win_streak_5');
    }

    // Pending: 10 wins
    pending.push({
      id: 'ten_wins',
      progress: metrics.totalWins,
      required: 10,
    });

    // Pending: 50 matches
    pending.push({
      id: 'fifty_matches',
      progress: metrics.totalMatches,
      required: 50,
    });

    return { achieved, pending };
  }

  /**
   * Update player performance records after a match
   * @param playerId - Player ID
   * @param matchOutcome - Win/loss outcome
   */
  static async updatePerformanceRecord(playerId: string, matchOutcome: 'win' | 'loss'): Promise<void> {
    const currentMetrics = await this.calculatePerformanceMetrics(playerId);
    const skillChange = matchOutcome === 'win' ? 25 : -15; // Simple delta

    await prisma.performanceRecord.create({
      data: {
        playerId,
        matchId: matchId, // Add matchId if provided
        skillChange,
        newSkillLevel: currentMetrics.skillLevel + skillChange,
      },
    });

    // Update player metrics
    await prisma.mvpPlayer.update({
      where: { id: playerId },
      data: {
        wins: matchOutcome === 'win' ? currentMetrics.totalWins + 1 : currentMetrics.totalWins,
        losses: matchOutcome === 'loss' ? currentMetrics.totalLosses + 1 : currentMetrics.totalLosses,
        totalMatches: currentMetrics.totalMatches + 1,
      },
    });
  }
}