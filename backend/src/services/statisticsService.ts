import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface PlayerStatistics {
  playerId: string;
  playerName: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  winStreak: number;
  currentStreak: number;
  averageScore: number;
  totalPointsScored: number;
  totalPointsConceded: number;
  bestWinStreak: number;
  recentForm: string[]; // Last 5 matches: 'W', 'L'
  performanceRating: number;
  ranking: number;
  // Enhanced statistics for detailed scoring
  setsWon: number;
  setsLost: number;
  setWinRate: number;
  averagePointsPerSet: number;
  bestSetScore: number;
  scoringEfficiency: number; // Points won per set
  comebackWins: number; // Matches won after being behind
  dominantWins: number; // Matches won without losing a set
}

export interface SessionStatistics {
  sessionId: string;
  sessionName: string;
  totalMatches: number;
  totalPlayers: number;
  averageMatchesPerPlayer: number;
  topPerformers: LeaderboardEntry[];
  matchDistribution: {
    '2-0': number;
    '2-1': number;
  };
  sessionDuration: number; // in minutes
  mostActivePlayer: string;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  playerName: string;
  winRate: number;
  matchesPlayed: number;
  performanceRating: number;
  trend: 'up' | 'down' | 'stable';
}

export interface StatisticsFilters {
  sessionId?: string;
  playerId?: string;
  timeRange?: 'all' | 'week' | 'month' | 'session';
  minMatches?: number;
}

class StatisticsService {
  /**
   * Calculate comprehensive statistics for a player
   */
  async getPlayerStatistics(playerId: string, filters: StatisticsFilters = {}): Promise<PlayerStatistics | null> {
    try {
      // Get player basic info
      const player = await prisma.mvpPlayer.findUnique({
        where: { id: playerId }
      });

      if (!player) return null;

      // Get matches for this player
      let matchWhereClause: any = {
        OR: [
          { team1Player1: playerId },
          { team1Player2: playerId },
          { team2Player1: playerId },
          { team2Player2: playerId }
        ]
      };

      if (filters.sessionId) {
        matchWhereClause.sessionId = filters.sessionId;
      }

      const matches = await prisma.mvpMatch.findMany({
        where: matchWhereClause,
        orderBy: { createdAt: 'desc' },
        include: {
          games: {
            include: {
              sets: true
            }
          }
        }
      });

      // Filter by time range if specified
      let filteredMatches = matches;
      if (filters.timeRange && filters.timeRange !== 'all') {
        const now = new Date();
        const timeLimit = new Date();

        switch (filters.timeRange) {
          case 'week':
            timeLimit.setDate(now.getDate() - 7);
            break;
          case 'month':
            timeLimit.setMonth(now.getMonth() - 1);
            break;
          case 'session':
            // Already filtered by sessionId above
            break;
        }

        if (filters.timeRange !== 'session') {
          filteredMatches = matches.filter(match => match.createdAt >= timeLimit);
        }
      }

      // Calculate statistics
      const matchesPlayed = filteredMatches.length;
      const wins = filteredMatches.filter(match => {
        const isTeam1 = match.team1Player1 === playerId || match.team1Player2 === playerId;
        return (isTeam1 && match.winnerTeam === 1) || (!isTeam1 && match.winnerTeam === 2);
      }).length;
      const losses = matchesPlayed - wins;
      const winRate = matchesPlayed > 0 ? (wins / matchesPlayed) * 100 : 0;

      // Calculate streaks and recent form
      const { winStreak, currentStreak, recentForm } = this.calculateStreaks(filteredMatches, playerId);

      // Calculate scoring statistics (simplified for MVP)
      const totalPointsScored = wins * 2; // Simplified: 2 points per win
      const totalPointsConceded = losses * 2;
      const averageScore = matchesPlayed > 0 ? totalPointsScored / matchesPlayed : 0;

      // Performance rating (simple ELO-like system)
      const performanceRating = this.calculatePerformanceRating(winRate, matchesPlayed, winStreak);

      // Calculate enhanced statistics from detailed match data
      let setsWon = 0;
      let setsLost = 0;
      let totalPointsInSets = 0;
      let bestSetScore = 0;
      let comebackWins = 0;
      let dominantWins = 0;

      for (const match of filteredMatches) {
        if (match.games && match.games.length > 0) {
          for (const game of match.games) {
            if (game.sets && game.sets.length > 0) {
              for (const set of game.sets) {
                const isTeam1 = match.team1Player1 === playerId || match.team1Player2 === playerId;
                const playerScore = isTeam1 ? set.team1Score : set.team2Score;
                const opponentScore = isTeam1 ? set.team2Score : set.team1Score;
                const isWinner = (isTeam1 && set.winnerTeam === 1) || (!isTeam1 && set.winnerTeam === 2);

                if (isWinner) {
                  setsWon++;
                  if (playerScore > bestSetScore) bestSetScore = playerScore;
                } else {
                  setsLost++;
                }

                totalPointsInSets += playerScore;

                // Check for comeback win (was behind but won)
                if (playerScore > opponentScore && opponentScore >= 10) {
                  comebackWins++;
                }

                // Check for dominant win (won without opponent scoring much)
                if (playerScore >= 21 && opponentScore <= 5) {
                  dominantWins++;
                }
              }
            }
          }
        }
      }

      const totalSets = setsWon + setsLost;
      const setWinRate = totalSets > 0 ? (setsWon / totalSets) * 100 : 0;
      const averagePointsPerSet = totalSets > 0 ? totalPointsInSets / totalSets : 0;
      const scoringEfficiency = totalSets > 0 ? totalPointsInSets / totalSets : 0;

      return {
        playerId,
        playerName: player.name,
        matchesPlayed,
        wins,
        losses,
        winRate,
        winStreak,
        currentStreak,
        averageScore,
        totalPointsScored,
        totalPointsConceded,
        bestWinStreak: winStreak, // Could be tracked separately in DB
        recentForm,
        performanceRating,
        ranking: 0, // Will be set when generating leaderboards
        // Enhanced statistics
        setsWon,
        setsLost,
        setWinRate,
        averagePointsPerSet,
        bestSetScore,
        scoringEfficiency,
        comebackWins,
        dominantWins,
      };
    } catch (error) {
      console.error('Error calculating player statistics:', error);
      throw new Error('Failed to calculate player statistics');
    }
  }

  /**
   * Calculate win/loss streaks and recent form
   */
  private calculateStreaks(matches: any[], playerId: string): {
    winStreak: number;
    currentStreak: number;
    recentForm: string[];
  } {
    // Sort matches by creation date (most recent first)
    const sortedMatches = matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    let winStreak = 0;
    let currentStreak = 0;
    let currentStreakType: 'win' | 'loss' | null = null;
    const recentForm: string[] = [];

    for (const match of sortedMatches) {
      const isTeam1 = match.team1Player1 === playerId || match.team1Player2 === playerId;
      const isWinner = (isTeam1 && match.winnerTeam === 1) || (!isTeam1 && match.winnerTeam === 2);

      // Track recent form (last 5 matches)
      if (recentForm.length < 5) {
        recentForm.push(isWinner ? 'W' : 'L');
      }

      // Calculate current streak
      if (currentStreakType === null) {
        currentStreakType = isWinner ? 'win' : 'loss';
        currentStreak = 1;
      } else if ((isWinner && currentStreakType === 'win') || (!isWinner && currentStreakType === 'loss')) {
        currentStreak++;
      } else {
        break; // Streak ended
      }

      // Track best win streak
      if (isWinner) {
        winStreak++;
      } else {
        winStreak = 0;
      }
    }

    return { winStreak, currentStreak, recentForm };
  }

  /**
   * Calculate performance rating (simplified ELO system)
   */
  private calculatePerformanceRating(winRate: number, matchesPlayed: number, winStreak: number): number {
    if (matchesPlayed === 0) return 1000; // Base rating

    // Base rating from win rate
    let rating = 1000 + (winRate - 50) * 10;

    // Bonus for experience
    rating += Math.min(matchesPlayed * 2, 200);

    // Bonus for streaks
    rating += winStreak * 5;

    return Math.round(rating);
  }

  /**
   * Generate leaderboard for a session or globally
   */
  async getLeaderboard(filters: StatisticsFilters = {}): Promise<LeaderboardEntry[]> {
    try {
      // Get all players based on filters
      let whereClause: any = {};

      if (filters.sessionId) {
        whereClause.sessionId = filters.sessionId;
      }

      if (filters.minMatches) {
        whereClause.matchesPlayed = { gte: filters.minMatches };
      }

      const players = await prisma.mvpPlayer.findMany({
        where: whereClause
      });

      // Calculate statistics for each player
      const playerStats: PlayerStatistics[] = [];
      for (const player of players) {
        const stats = await this.getPlayerStatistics(player.id, filters);
        if (stats && stats.matchesPlayed >= (filters.minMatches || 0)) {
          playerStats.push(stats);
        }
      }

      // Sort by performance rating (descending)
      playerStats.sort((a, b) => b.performanceRating - a.performanceRating);

      // Assign rankings and calculate trends
      const leaderboard: LeaderboardEntry[] = playerStats.map((stats, index) => ({
        rank: index + 1,
        playerId: stats.playerId,
        playerName: stats.playerName,
        winRate: stats.winRate,
        matchesPlayed: stats.matchesPlayed,
        performanceRating: stats.performanceRating,
        trend: this.calculateTrend(stats.recentForm)
      }));

      return leaderboard;
    } catch (error) {
      console.error('Error generating leaderboard:', error);
      throw new Error('Failed to generate leaderboard');
    }
  }

  /**
   * Calculate trend based on recent form
   */
  private calculateTrend(recentForm: string[]): 'up' | 'down' | 'stable' {
    if (recentForm.length < 3) return 'stable';

    const recentWins = recentForm.slice(0, 3).filter(result => result === 'W').length;
    const olderWins = recentForm.slice(3).filter(result => result === 'W').length;

    if (recentWins > olderWins) return 'up';
    if (recentWins < olderWins) return 'down';
    return 'stable';
  }

  /**
   * Get session statistics
   */
  async getSessionStatistics(sessionId: string): Promise<SessionStatistics | null> {
    try {
      const session = await prisma.mvpSession.findUnique({
        where: { id: sessionId },
        include: {
          players: true,
          matches: true
        }
      });

      if (!session) return null;

      const totalMatches = session.matches.length;
      const totalPlayers = session.players.length;
      const averageMatchesPerPlayer = totalPlayers > 0 ? totalMatches / totalPlayers : 0;

      // Get top performers
      const topPerformers = await this.getLeaderboard({ sessionId, minMatches: 1 });
      const top5Performers = topPerformers.slice(0, 5);

      // Calculate match distribution
      const matchDistribution = {
        '2-0': session.matches.filter(m => m.winnerTeam === 1 || m.winnerTeam === 2).length,
        '2-1': 0 // Simplified for MVP
      };

      // Calculate session duration (simplified)
      const sessionDuration = totalMatches * 15; // Assume 15 minutes per match

      // Find most active player
      const playerMatchCounts = session.players.map(player => ({
        name: player.name,
        count: session.matches.filter(m =>
          m.team1Player1 === player.id || m.team1Player2 === player.id ||
          m.team2Player1 === player.id || m.team2Player2 === player.id
        ).length
      }));

      const mostActivePlayer = playerMatchCounts.reduce((max, player) =>
        player.count > max.count ? player : max,
        { name: '', count: 0 }
      ).name;

      return {
        sessionId,
        sessionName: session.name || 'Badminton Session',
        totalMatches,
        totalPlayers,
        averageMatchesPerPlayer,
        topPerformers: top5Performers,
        matchDistribution,
        sessionDuration,
        mostActivePlayer
      };
    } catch (error) {
      console.error('Error calculating session statistics:', error);
      throw new Error('Failed to calculate session statistics');
    }
  }

  /**
   * Get player comparison data
   */
  async getPlayerComparison(playerIds: string[], filters: StatisticsFilters = {}): Promise<PlayerStatistics[]> {
    const comparisons: PlayerStatistics[] = [];

    for (const playerId of playerIds) {
      const stats = await this.getPlayerStatistics(playerId, filters);
      if (stats) {
        comparisons.push(stats);
      }
    }

    return comparisons;
  }

  /**
   * Get performance trends over time
   */
  async getPerformanceTrends(playerId: string, days: number = 30): Promise<{
    dates: string[];
    winRates: number[];
    matchesPlayed: number[];
  }> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - days);

      // Get matches within date range
      const matches = await prisma.mvpMatch.findMany({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate
          },
          OR: [
            { team1Player1: playerId },
            { team1Player2: playerId },
            { team2Player1: playerId },
            { team2Player2: playerId }
          ]
        },
        orderBy: { createdAt: 'asc' }
      });

      // Group by date and calculate daily stats
      const dailyStats: Record<string, { wins: number; total: number }> = {};

      for (const match of matches) {
        const date = match.createdAt.toISOString().split('T')[0];
        if (!dailyStats[date]) {
          dailyStats[date] = { wins: 0, total: 0 };
        }

        dailyStats[date].total++;

        const isTeam1 = match.team1Player1 === playerId || match.team1Player2 === playerId;
        const isWinner = (isTeam1 && match.winnerTeam === 1) || (!isTeam1 && match.winnerTeam === 2);

        if (isWinner) {
          dailyStats[date].wins++;
        }
      }

      // Convert to arrays
      const dates = Object.keys(dailyStats).sort();
      const winRates = dates.map(date => {
        const stats = dailyStats[date];
        return stats.total > 0 ? (stats.wins / stats.total) * 100 : 0;
      });
      const matchesPlayed = dates.map(date => dailyStats[date].total);

      return { dates, winRates, matchesPlayed };
    } catch (error) {
      console.error('Error calculating performance trends:', error);
      throw new Error('Failed to calculate performance trends');
    }
  }
}

// Export singleton instance
export const statisticsService = new StatisticsService();
export default statisticsService;