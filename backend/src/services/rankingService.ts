import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface RankingEntry {
  playerId: string;
  playerName: string;
  rating: number;
  rank: number;
  previousRank?: number;
  matchesPlayed: number;
  winRate: number;
  trend: 'up' | 'down' | 'stable';
  lastMatchDate?: Date;
}

export interface RankingHistory {
  playerId: string;
  rating: number;
  rank: number;
  recordedAt: Date;
  matchId?: string;
}

class RankingService {
  private readonly INITIAL_RATING = 1200;
  private readonly K_FACTOR = 32; // ELO K-factor for rating changes
  private readonly MIN_MATCHES_FOR_RANKING = 3;

  /**
   * Calculate expected score for ELO rating system
   */
  private calculateExpectedScore(ratingA: number, ratingB: number): number {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  }

  /**
   * Calculate new rating after a match
   */
  private calculateNewRating(currentRating: number, expectedScore: number, actualScore: number): number {
    return Math.round(currentRating + this.K_FACTOR * (actualScore - expectedScore));
  }

  /**
   * Update player ratings after a match
   */
  async updateRatingsAfterMatch(matchId: string): Promise<void> {
    try {
      // Get match details
      const match = await prisma.match.findUnique({
        where: { id: matchId },
        include: {
          player1: true,
          player2: true,
          winner: true
        }
      });

      if (!match) {
        throw new Error('Match not found');
      }

      // Get current ratings
      const player1Rating = match.player1.rankingPoints || this.INITIAL_RATING;
      const player2Rating = match.player2.rankingPoints || this.INITIAL_RATING;

      // Calculate expected scores
      const expectedScore1 = this.calculateExpectedScore(player1Rating, player2Rating);
      const expectedScore2 = this.calculateExpectedScore(player2Rating, player1Rating);

      // Determine actual scores (1 for win, 0 for loss)
      const actualScore1 = match.winnerId === match.player1Id ? 1 : 0;
      const actualScore2 = match.winnerId === match.player2Id ? 1 : 0;

      // Calculate new ratings
      const newRating1 = this.calculateNewRating(player1Rating, expectedScore1, actualScore1);
      const newRating2 = this.calculateNewRating(player2Rating, expectedScore2, actualScore2);

      // Update player ratings in database
      await prisma.mvpPlayer.update({
        where: { id: match.player1Id },
        data: {
          rankingPoints: newRating1,
          lastMatchDate: match.recordedAt
        }
      });

      await prisma.mvpPlayer.update({
        where: { id: match.player2Id },
        data: {
          rankingPoints: newRating2,
          lastMatchDate: match.recordedAt
        }
      });

      // Record rating history
      await this.recordRatingHistory(match.player1Id, newRating1, match.recordedAt, matchId);
      await this.recordRatingHistory(match.player2Id, newRating2, match.recordedAt, matchId);

      // Update rankings for all players
      await this.updateAllRankings();

    } catch (error) {
      console.error('Error updating ratings after match:', error);
      throw error;
    }
  }

  /**
   * Record rating history for a player
   */
  private async recordRatingHistory(
    playerId: string,
    rating: number,
    recordedAt: Date,
    matchId?: string
  ): Promise<void> {
    try {
      // Get current rank for this player
      const currentRank = await this.getPlayerRank(playerId);

      await prisma.playerRankingHistory.create({
        data: {
          playerId,
          ranking: currentRank,
          rankingPoints: rating,
          performanceRating: rating, // Use rating as performance rating for now
          recordedAt,
          matchId,
          changeReason: matchId ? 'match_win' : 'initial',
          pointsChange: 0, // Will be calculated later if needed
          previousRanking: null // Will be set if we track changes
        }
      });
    } catch (error) {
      console.error('Error recording rating history:', error);
      // Don't throw - rating history is not critical
    }
  }

  /**
   * Update rankings for all players
   */
  async updateAllRankings(): Promise<void> {
    try {
      // Get all players ordered by rating
      const players = await prisma.mvpPlayer.findMany({
        orderBy: { rankingPoints: 'desc' },
        where: {
          gamesPlayed: { gte: this.MIN_MATCHES_FOR_RANKING }
        }
      });

      // Update rankings
      for (let i = 0; i < players.length; i++) {
        const rank = i + 1;
        await prisma.mvpPlayer.update({
          where: { id: players[i].id },
          data: { ranking: rank }
        });
      }
    } catch (error) {
      console.error('Error updating all rankings:', error);
      throw error;
    }
  }

  /**
   * Get current ranking for a player
   */
  async getPlayerRank(playerId: string): Promise<number> {
    try {
      const player = await prisma.mvpPlayer.findUnique({
        where: { id: playerId },
        select: { ranking: true }
      });

      return player?.ranking || 0;
    } catch (error) {
      console.error('Error getting player rank:', error);
      return 0;
    }
  }

  /**
   * Get ranking leaderboard
   */
  async getRankingLeaderboard(limit: number = 50): Promise<RankingEntry[]> {
    try {
      const players = await prisma.mvpPlayer.findMany({
        where: {
          gamesPlayed: { gte: this.MIN_MATCHES_FOR_RANKING }
        },
        orderBy: { rankingPoints: 'desc' },
        take: limit,
        select: {
          id: true,
          name: true,
          rankingPoints: true,
          ranking: true,
          gamesPlayed: true,
          wins: true,
          losses: true,
          lastMatchDate: true
        }
      });

      const leaderboard: RankingEntry[] = players.map(player => ({
        playerId: player.id,
        playerName: player.name,
        rating: player.rankingPoints || this.INITIAL_RATING,
        rank: player.ranking || 0,
        matchesPlayed: player.gamesPlayed,
        winRate: player.gamesPlayed > 0 ? (player.wins / player.gamesPlayed) * 100 : 0,
        trend: 'stable', // Will be calculated based on recent performance
        lastMatchDate: player.lastMatchDate || undefined
      }));

      // Calculate trends based on recent rating changes
      for (let i = 0; i < leaderboard.length; i++) {
        const player = leaderboard[i];
        const recentHistory = await this.getPlayerRatingHistory(player.playerId, 5);

        if (recentHistory.length >= 2) {
          const currentRating = recentHistory[0].rating;
          const previousRating = recentHistory[recentHistory.length - 1].rating;

          if (currentRating > previousRating) {
            player.trend = 'up';
          } else if (currentRating < previousRating) {
            player.trend = 'down';
          } else {
            player.trend = 'stable';
          }
        }
      }

      return leaderboard;
    } catch (error) {
      console.error('Error getting ranking leaderboard:', error);
      throw error;
    }
  }

  /**
   * Get rating history for a player
   */
  async getPlayerRatingHistory(playerId: string, limit: number = 10): Promise<RankingHistory[]> {
    try {
      const history = await prisma.playerRankingHistory.findMany({
        where: { playerId },
        orderBy: { recordedAt: 'desc' },
        take: limit,
        select: {
          playerId: true,
          rankingPoints: true,
          ranking: true,
          recordedAt: true,
          matchId: true
        }
      });

      return history.map(entry => ({
        playerId: entry.playerId,
        rating: entry.rankingPoints,
        rank: entry.ranking,
        recordedAt: entry.recordedAt,
        matchId: entry.matchId || undefined
      }));
    } catch (error) {
      console.error('Error getting player rating history:', error);
      return [];
    }
  }

  /**
   * Get ranking statistics
   */
  async getRankingStatistics(): Promise<{
    totalRankedPlayers: number;
    averageRating: number;
    highestRating: number;
    lowestRating: number;
    ratingDistribution: { range: string; count: number }[];
  }> {
    try {
      const players = await prisma.mvpPlayer.findMany({
        where: {
          gamesPlayed: { gte: this.MIN_MATCHES_FOR_RANKING }
        },
        select: { rankingPoints: true }
      });

      if (players.length === 0) {
        return {
          totalRankedPlayers: 0,
          averageRating: this.INITIAL_RATING,
          highestRating: this.INITIAL_RATING,
          lowestRating: this.INITIAL_RATING,
          ratingDistribution: []
        };
      }

      const ratings = players.map(p => p.rankingPoints || this.INITIAL_RATING);
      const averageRating = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
      const highestRating = Math.max(...ratings);
      const lowestRating = Math.min(...ratings);

      // Calculate rating distribution
      const distribution = [
        { range: '800-999', count: ratings.filter(r => r >= 800 && r < 1000).length },
        { range: '1000-1199', count: ratings.filter(r => r >= 1000 && r < 1200).length },
        { range: '1200-1399', count: ratings.filter(r => r >= 1200 && r < 1400).length },
        { range: '1400-1599', count: ratings.filter(r => r >= 1400 && r < 1600).length },
        { range: '1600+', count: ratings.filter(r => r >= 1600).length }
      ];

      return {
        totalRankedPlayers: players.length,
        averageRating: Math.round(averageRating),
        highestRating,
        lowestRating,
        ratingDistribution: distribution
      };
    } catch (error) {
      console.error('Error getting ranking statistics:', error);
      throw error;
    }
  }

  /**
   * Initialize ranking for a new player
   */
  async initializePlayerRanking(playerId: string): Promise<void> {
    try {
      await prisma.mvpPlayer.update({
        where: { id: playerId },
        data: {
          rankingPoints: this.INITIAL_RATING,
          ranking: null // Will be set when rankings are updated
        }
      });

      // Record initial rating history
      await this.recordRatingHistory(playerId, this.INITIAL_RATING, new Date());
    } catch (error) {
      console.error('Error initializing player ranking:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const rankingService = new RankingService();
export default rankingService;