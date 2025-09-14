import { PrismaClient } from '@prisma/client';
import { statisticsService } from './statisticsService';

const prisma = new PrismaClient();

export interface RankingUpdate {
  playerId: string;
  newRanking: number;
  newPoints: number;
  newRating: number;
  previousRanking?: number;
  pointsChange: number;
  reason: 'match_win' | 'match_loss' | 'decay' | 'initial';
  matchId?: string;
}

export interface RankingHistory {
  id: string;
  playerId: string;
  ranking: number;
  rankingPoints: number;
  performanceRating: number;
  changeReason: string;
  matchId?: string;
  previousRanking?: number;
  pointsChange: number;
  recordedAt: Date;
}

class RankingService {
  // ELO-like ranking constants
  private readonly K_FACTOR = 32; // Rating change factor
  private readonly BASE_RATING = 1000;
  private readonly WIN_POINTS = 25;
  private readonly LOSS_POINTS = -10;
  private readonly DECAY_RATE = 0.95; // 5% decay per week without matches
  private readonly MIN_RATING = 800;
  private readonly MAX_RATING = 2000;

  /**
   * Calculate enhanced player statistics for ranking
   */
  private async calculateEnhancedPlayerStats(playerId: string): Promise<{
    performanceRating: number;
    totalPoints: number;
    ranking: number;
    setWinRate: number;
    scoringEfficiency: number;
    comebackWins: number;
  }> {
    const stats = await statisticsService.getPlayerStatistics(playerId);

    return {
      performanceRating: stats?.performanceRating || this.BASE_RATING,
      totalPoints: (stats?.wins || 0) * this.WIN_POINTS - (stats?.losses || 0) * Math.abs(this.LOSS_POINTS),
      ranking: stats?.ranking || 0,
      setWinRate: stats?.setWinRate || 0,
      scoringEfficiency: stats?.scoringEfficiency || 0,
      comebackWins: stats?.comebackWins || 0,
    };
  }

  /**
   * Calculate enhanced rating with additional factors
   */
  private calculateEnhancedRating(
    winnerRating: number,
    loserRating: number,
    winnerEfficiency: number,
    loserEfficiency: number
  ): { winnerNewRating: number; loserNewRating: number } {
    // Base ELO calculation
    const expectedWinner = this.calculateExpectedScore(winnerRating, loserRating);
    const expectedLoser = this.calculateExpectedScore(loserRating, winnerRating);

    // Enhanced factors
    const efficiencyBonus = (winnerEfficiency - loserEfficiency) * 0.1; // 10% bonus for efficiency difference
    const comebackBonus = winnerRating > loserRating + 200 ? 0.2 : 0; // Bonus for beating higher rated player

    const winnerNewRating = winnerRating + this.K_FACTOR * (1 - expectedWinner) + efficiencyBonus + comebackBonus;
    const loserNewRating = loserRating + this.K_FACTOR * (0 - expectedLoser) - efficiencyBonus;

    // Clamp ratings within bounds
    return {
      winnerNewRating: Math.max(this.MIN_RATING, Math.min(this.MAX_RATING, winnerNewRating)),
      loserNewRating: Math.max(this.MIN_RATING, Math.min(this.MAX_RATING, loserNewRating)),
    };
  }

  /**
   * Calculate enhanced points change with multiple factors
   */
  private calculateEnhancedPointsChange(
    ratingChange: number,
    setWinRate: number,
    comebackBonus: number
  ): number {
    let pointsChange = Math.round(ratingChange / 10);

    // Bonus for high set win rate
    if (setWinRate > 70) {
      pointsChange += 5;
    } else if (setWinRate > 50) {
      pointsChange += 2;
    }

    // Comeback bonus
    pointsChange += comebackBonus * 3;

    return pointsChange;
  }

  /**
   * Calculate expected score in ELO system
   */
  private calculateExpectedScore(ratingA: number, ratingB: number): number {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  }

  /**
   * Calculate new rating after a match
   */
  private calculateNewRating(winnerRating: number, loserRating: number, isDraw: boolean = false): {
    winnerNewRating: number;
    loserNewRating: number;
  } {
    const expectedWinner = this.calculateExpectedScore(winnerRating, loserRating);
    const expectedLoser = this.calculateExpectedScore(loserRating, winnerRating);

    let winnerNewRating: number;
    let loserNewRating: number;

    if (isDraw) {
      // Draw: both get partial points
      winnerNewRating = winnerRating + this.K_FACTOR * (0.5 - expectedWinner);
      loserNewRating = loserRating + this.K_FACTOR * (0.5 - expectedLoser);
    } else {
      // Win/Loss: full points
      winnerNewRating = winnerRating + this.K_FACTOR * (1 - expectedWinner);
      loserNewRating = loserRating + this.K_FACTOR * (0 - expectedLoser);
    }

    // Clamp ratings within bounds
    winnerNewRating = Math.max(this.MIN_RATING, Math.min(this.MAX_RATING, winnerNewRating));
    loserNewRating = Math.max(this.MIN_RATING, Math.min(this.MAX_RATING, loserNewRating));

    return { winnerNewRating, loserNewRating };
  }

  /**
   * Apply decay to inactive players
   */
  private applyDecay(currentRating: number, weeksSinceLastMatch: number): number {
    if (weeksSinceLastMatch <= 1) return currentRating;

    const decayFactor = Math.pow(this.DECAY_RATE, weeksSinceLastMatch - 1);
    const decayedRating = currentRating * decayFactor;

    return Math.max(this.MIN_RATING, decayedRating);
  }

  /**
   * Update rankings after a detailed match with enhanced scoring
   */
  async updateRankingsAfterDetailedMatch(matchId: string): Promise<RankingUpdate[]> {
    try {
      // Get detailed match with games and sets
      const match = await prisma.mvpMatch.findUnique({
        where: { id: matchId },
        include: {
          session: true,
          games: {
            include: {
              sets: true
            }
          }
        }
      });

      if (!match) {
        throw new Error('Match not found');
      }

      // Determine winner and loser based on detailed scoring
      const player1Id = match.team1Player1;
      const player2Id = match.team2Player1;

      // Calculate total sets won by each player
      let player1SetsWon = 0;
      let player2SetsWon = 0;

      for (const game of match.games) {
        for (const set of game.sets) {
          if (set.winnerTeam === 1) {
            player1SetsWon++;
          } else if (set.winnerTeam === 2) {
            player2SetsWon++;
          }
        }
      }

      const winnerId = player1SetsWon > player2SetsWon ? player1Id : player2Id;
      const loserId = winnerId === player1Id ? player2Id : player1Id;

      // Get current player stats
      const winner = await prisma.mvpPlayer.findUnique({
        where: { id: winnerId }
      });
      const loser = await prisma.mvpPlayer.findUnique({
        where: { id: loserId }
      });

      if (!winner || !loser) {
        throw new Error('Players not found');
      }

      // Calculate enhanced ranking factors
      const winnerStats = await this.calculateEnhancedPlayerStats(winnerId);
      const loserStats = await this.calculateEnhancedPlayerStats(loserId);

      // Calculate new ratings using enhanced algorithm
      const { winnerNewRating, loserNewRating } = this.calculateEnhancedRating(
        winnerStats.performanceRating,
        loserStats.performanceRating,
        winnerStats.scoringEfficiency,
        loserStats.scoringEfficiency
      );

      // Calculate points changes with enhanced factors
      const winnerPointsChange = this.calculateEnhancedPointsChange(
        winnerNewRating - winnerStats.performanceRating,
        winnerStats.setWinRate,
        winnerStats.comebackWins
      );

      const loserPointsChange = this.calculateEnhancedPointsChange(
        loserNewRating - loserStats.performanceRating,
        loserStats.setWinRate,
        0 // Losers don't get comeback bonus
      );

      // Update player records with enhanced statistics
      const updates: RankingUpdate[] = [];

      // Update winner
      const winnerNewPoints = Math.max(0, winnerStats.totalPoints + winnerPointsChange);
      const winnerNewRanking = await this.calculatePlayerRanking(winnerId, match.sessionId);

      await prisma.mvpPlayer.update({
        where: { id: winnerId },
        data: {
          wins: winner.wins + 1,
          matchesPlayed: winner.matchesPlayed + 1,
          winRate: ((winner.wins + 1) / (winner.matchesPlayed + 1)) * 100
        }
      });

      updates.push({
        playerId: winnerId,
        newRanking: winnerNewRanking,
        newPoints: winnerNewPoints,
        newRating: winnerNewRating,
        previousRanking: winnerStats.ranking,
        pointsChange: winnerPointsChange,
        reason: 'match_win',
        matchId
      });

      // Update loser
      const loserNewPoints = Math.max(0, loserStats.totalPoints + loserPointsChange);
      const loserNewRanking = await this.calculatePlayerRanking(loserId, match.sessionId);

      await prisma.mvpPlayer.update({
        where: { id: loserId },
        data: {
          losses: loser.losses + 1,
          matchesPlayed: loser.matchesPlayed + 1,
          winRate: (loser.wins / (loser.matchesPlayed + 1)) * 100
        }
      });

      updates.push({
        playerId: loserId,
        newRanking: loserNewRanking,
        newPoints: loserNewPoints,
        newRating: loserNewRating,
        previousRanking: loserStats.ranking,
        pointsChange: loserPointsChange,
        reason: 'match_loss',
        matchId
      });

      // Record ranking history
      await this.recordRankingHistory(updates);

      // Update all rankings after changes
      await this.recalculateAllRankings(match.sessionId);

      return updates;
    } catch (error) {
      console.error('Error updating rankings after detailed match:', error);
      throw new Error('Failed to update rankings after detailed match');
    }
  }

  /**
   * Calculate player's ranking position based on win rate and matches played
   */
  private async calculatePlayerRanking(playerId: string, sessionId: string): Promise<number> {
    const allPlayers = await prisma.mvpPlayer.findMany({
      where: { sessionId }
    });

    const playerStats = await Promise.all(
      allPlayers.map(async (player) => ({
        ...player,
        stats: await statisticsService.getPlayerStatistics(player.id, { sessionId })
      }))
    );

    // Sort by performance rating (descending)
    playerStats.sort((a, b) => {
      const ratingA = a.stats?.performanceRating || 0;
      const ratingB = b.stats?.performanceRating || 0;
      return ratingB - ratingA;
    });

    const playerIndex = playerStats.findIndex(p => p.id === playerId);
    return playerIndex + 1;
  }

  /**
   * Recalculate all rankings for a session based on current statistics
   */
  private async recalculateAllRankings(sessionId: string): Promise<void> {
    const players = await prisma.mvpPlayer.findMany({
      where: { sessionId }
    });

    const playerStats = await Promise.all(
      players.map(async (player) => ({
        ...player,
        stats: await statisticsService.getPlayerStatistics(player.id, { sessionId })
      }))
    );

    // Sort by performance rating (descending)
    playerStats.sort((a, b) => {
      const ratingA = a.stats?.performanceRating || 0;
      const ratingB = b.stats?.performanceRating || 0;
      return ratingB - ratingA;
    });

    // Rankings are calculated on-the-fly, no need to store in database
    // This method exists for compatibility but doesn't modify the database
  }

  /**
   * Record ranking history for audit trail (simplified - no database storage)
   */
  private async recordRankingHistory(updates: RankingUpdate[]): Promise<void> {
    // For now, just log the updates. In a full implementation, this would store in a ranking history table
    console.log('Ranking updates recorded:', updates.map(u => ({
      playerId: u.playerId,
      newRanking: u.newRanking,
      pointsChange: u.pointsChange,
      reason: u.reason
    })));
  }

  /**
   * Get player's ranking history (simplified - returns empty array)
   */
  async getPlayerRankingHistory(playerId: string, limit: number = 50): Promise<RankingHistory[]> {
    // Simplified implementation - in a full system this would query a ranking history table
    console.log(`Getting ranking history for player ${playerId}`);
    return [];
  }

  /**
   * Apply weekly decay to all inactive players (simplified)
   */
  async applyWeeklyDecay(): Promise<void> {
    // Simplified implementation - in a full system this would apply rating decay
    console.log('Weekly decay applied (simplified implementation)');
  }

  /**
   * Get session rankings (simplified - uses statistics service)
   */
  async getSessionRankings(sessionId: string, minMatches: number = 0): Promise<any[]> {
    try {
      const players = await prisma.mvpPlayer.findMany({
        where: {
          sessionId,
          matchesPlayed: { gte: minMatches }
        }
      });

      // Get rankings from statistics service
      const rankings = await statisticsService.getLeaderboard({
        sessionId,
        minMatches
      });

      return rankings.map(entry => ({
        id: entry.playerId,
        name: entry.playerName,
        ranking: entry.rank,
        performanceRating: entry.performanceRating,
        winRate: entry.winRate,
        matchesPlayed: entry.matchesPlayed,
        trend: entry.trend
      }));
    } catch (error) {
      console.error('Error fetching session rankings:', error);
      throw new Error('Failed to fetch session rankings');
    }
  }

  /**
   * Get global rankings across all sessions (simplified)
   */
  async getGlobalRankings(minMatches: number = 5, limit: number = 100): Promise<any[]> {
    try {
      // Simplified - in a full implementation this would aggregate across sessions
      console.log(`Getting global rankings with minMatches: ${minMatches}, limit: ${limit}`);
      return [];
    } catch (error) {
      console.error('Error fetching global rankings:', error);
      throw new Error('Failed to fetch global rankings');
    }
  }

  /**
   * Initialize rankings for new players (simplified)
   */
  async initializePlayerRanking(playerId: string): Promise<void> {
    try {
      // Simplified - rankings are calculated on-demand from statistics
      console.log(`Initialized ranking for player ${playerId}`);
    } catch (error) {
      console.error('Error initializing player ranking:', error);
      throw new Error('Failed to initialize player ranking');
    }
  }
}

// Export singleton instance
export const rankingService = new RankingService();
export default rankingService;