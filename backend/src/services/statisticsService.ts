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

      // Get matches for this player using new Match model
      let matchWhereClause: any = {
        OR: [
          { player1Id: playerId },
          { player2Id: playerId }
        ]
      };

      if (filters.sessionId) {
        matchWhereClause.sessionId = filters.sessionId;
      }

      const matches = await prisma.match.findMany({
        where: matchWhereClause,
        orderBy: { recordedAt: 'desc' },
        include: {
          player1: true,
          player2: true,
          winner: true
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
          filteredMatches = matches.filter(match => match.recordedAt >= timeLimit);
        }
      }

      // Calculate statistics using new Match model
      const matchesPlayed = filteredMatches.length;
      const wins = filteredMatches.filter(match => match.winnerId === playerId).length;
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

      // Calculate enhanced statistics from match data (simplified for new Match model)
      let comebackWins = 0;
      let dominantWins = 0;

      for (const match of filteredMatches) {
        const isWinner = match.winnerId === playerId;
        const isPlayer1 = match.player1Id === playerId;

        if (isWinner) {
          // For 2-0 wins, count as dominant
          if (match.scoreType === '2-0') {
            dominantWins++;
          }
          // For 2-1 wins, count as comeback (came back from losing first set)
          else if (match.scoreType === '2-1') {
            comebackWins++;
          }
        }
      }

      // Simplified calculations for new Match model
      const setWinRate = winRate; // Use overall win rate as proxy
      const averagePointsPerSet = 2; // Simplified: average sets per match
      const scoringEfficiency = winRate / 100; // Efficiency based on win rate
      const setsWon = wins * 2; // Simplified: 2 sets per win
      const setsLost = losses * 2; // Simplified: 2 sets per loss
      const bestSetScore = 21; // Default for badminton
      const totalPointsInSets = (setsWon + setsLost) * 21; // Simplified calculation

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
    // Sort matches by recorded date (most recent first)
    const sortedMatches = matches.sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());

    let winStreak = 0;
    let currentStreak = 0;
    let currentStreakType: 'win' | 'loss' | null = null;
    const recentForm: string[] = [];

    for (const match of sortedMatches) {
      const isWinner = match.winnerId === playerId;

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
        // For new Match model, we'll filter by actual match count later
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
          players: true
        }
      });

      if (!session) return null;

      // Get matches for this session using new Match model
      const sessionMatches = await prisma.match.findMany({
        where: { sessionId }
      });

      const totalMatches = sessionMatches.length;
      const totalPlayers = session.players.length;
      const averageMatchesPerPlayer = totalPlayers > 0 ? totalMatches / totalPlayers : 0;

      // Get top performers
      const topPerformers = await this.getLeaderboard({ sessionId, minMatches: 1 });
      const top5Performers = topPerformers.slice(0, 5);

      // Calculate match distribution
      const matchDistribution = {
        '2-0': sessionMatches.filter(m => m.scoreType === '2-0').length,
        '2-1': sessionMatches.filter(m => m.scoreType === '2-1').length
      };

      // Calculate session duration (simplified)
      const sessionDuration = totalMatches * 15; // Assume 15 minutes per match

      // Find most active player
      const playerMatchCounts = await Promise.all(
        session.players.map(async (player) => ({
          name: player.name,
          count: await prisma.match.count({
            where: {
              sessionId,
              OR: [
                { player1Id: player.id },
                { player2Id: player.id }
              ]
            }
          })
        }))
      );

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

      // Get matches within date range using new Match model
      const matches = await prisma.match.findMany({
        where: {
          recordedAt: {
            gte: startDate,
            lte: endDate
          },
          OR: [
            { player1Id: playerId },
            { player2Id: playerId }
          ]
        },
        orderBy: { recordedAt: 'asc' }
      });

      // Group by date and calculate daily stats
      const dailyStats: Record<string, { wins: number; total: number }> = {};

      for (const match of matches) {
        const date = match.recordedAt.toISOString().split('T')[0];
        if (!dailyStats[date]) {
          dailyStats[date] = { wins: 0, total: 0 };
        }

        dailyStats[date].total++;

        const isWinner = match.winnerId === playerId;

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

  async getPlayerStreaks(playerId: string): Promise<{
    currentStreak: { type: 'W' | 'L'; count: number };
    bestWinStreak: number;
    bestLossStreak: number;
    recentForm: string[];
  }> {
    const matches = await prisma.match.findMany({
      where: { OR: [{ player1Id: playerId }, { player2Id: playerId }] },
      orderBy: { recordedAt: 'desc' }
    });

    let bestWin = 0, bestLoss = 0, currentWin = 0, currentLoss = 0;
    const recentForm: string[] = [];
    let currentType: 'W' | 'L' = 'W';

    for (const m of matches) {
      const won = m.winnerId === playerId;
      recentForm.push(won ? 'W' : 'L');
      if (recentForm.length === 1) currentType = won ? 'W' : 'L';
      if (won) { currentWin++; currentLoss = 0; if (currentWin > bestWin) bestWin = currentWin; }
      else { currentLoss++; currentWin = 0; if (currentLoss > bestLoss) bestLoss = currentLoss; }
    }

    return {
      currentStreak: { type: currentType, count: currentType === 'W' ? currentWin : currentLoss },
      bestWinStreak: bestWin,
      bestLossStreak: bestLoss,
      recentForm: recentForm.slice(0, 10)
    };
  }

  async getPlayerPercentiles(playerId: string): Promise<{
    winRate: number; winRatePercentile: number;
    gamesPlayed: number; gamesPlayedPercentile: number;
    totalPlayersCompared: number;
  }> {
    const player = await prisma.mvpPlayer.findUnique({ where: { id: playerId } });
    if (!player) throw new Error('Player not found');

    const allPlayers = await prisma.mvpPlayer.findMany({
      where: { gamesPlayed: { gt: 0 } },
      select: { id: true, wins: true, gamesPlayed: true }
    });

    const pRate = player.gamesPlayed > 0 ? player.wins / player.gamesPlayed : 0;
    const total = allPlayers.length;
    const belowWR = allPlayers.filter(p => (p.gamesPlayed > 0 ? p.wins / p.gamesPlayed : 0) < pRate).length;
    const belowGP = allPlayers.filter(p => p.gamesPlayed < player.gamesPlayed).length;

    return {
      winRate: Math.round(pRate * 100),
      winRatePercentile: total > 0 ? Math.round((belowWR / total) * 100) : 0,
      gamesPlayed: player.gamesPlayed,
      gamesPlayedPercentile: total > 0 ? Math.round((belowGP / total) * 100) : 0,
      totalPlayersCompared: total
    };
  }

  async getSessionHeatmap(sessionId: string): Promise<{
    courts: Array<{ name: string; gamesPlayed: number; totalDuration: number }>;
    hourlyActivity: Array<{ hour: number; games: number }>;
  }> {
    const games = await prisma.mvpGame.findMany({
      where: { sessionId, status: 'COMPLETED' }
    });

    const courtMap: Record<string, { games: number; duration: number }> = {};
    for (const g of games) {
      const name = (g as any).courtName || 'Court 1';
      if (!courtMap[name]) courtMap[name] = { games: 0, duration: 0 };
      courtMap[name].games++;
      if (g.startTime && g.endTime) {
        courtMap[name].duration += (g.endTime.getTime() - g.startTime.getTime()) / 60000;
      }
    }

    const hourMap: Record<number, number> = {};
    for (let h = 0; h < 24; h++) hourMap[h] = 0;
    for (const g of games) {
      if (g.startTime) hourMap[g.startTime.getHours()]++;
    }

    return {
      courts: Object.entries(courtMap).map(([name, d]) => ({ name, gamesPlayed: d.games, totalDuration: Math.round(d.duration) })),
      hourlyActivity: Object.entries(hourMap).map(([h, g]) => ({ hour: parseInt(h), games: g }))
    };
  }

  async getHeadToHead(p1Id: string, p2Id: string): Promise<{
    player1: { id: string; name: string; wins: number };
    player2: { id: string; name: string; wins: number };
    totalMatches: number;
    recentMatches: Array<{ winner: string; score: string; date: string }>;
  }> {
    const [p1, p2] = await Promise.all([
      prisma.mvpPlayer.findUnique({ where: { id: p1Id } }),
      prisma.mvpPlayer.findUnique({ where: { id: p2Id } })
    ]);

    const matches = await prisma.match.findMany({
      where: { OR: [{ player1Id: p1Id, player2Id: p2Id }, { player1Id: p2Id, player2Id: p1Id }] },
      orderBy: { recordedAt: 'desc' }
    });

    let p1w = 0, p2w = 0;
    const recent = matches.slice(0, 5).map(m => {
      const isP1 = m.winnerId === p1Id;
      if (isP1) p1w++; else p2w++;
      return { winner: isP1 ? (p1?.name || 'P1') : (p2?.name || 'P2'), score: m.scoreType || 'N/A', date: m.recordedAt.toISOString().split('T')[0] };
    });

    return {
      player1: { id: p1Id, name: p1?.name || 'Player 1', wins: p1w },
      player2: { id: p2Id, name: p2?.name || 'Player 2', wins: p2w },
      totalMatches: matches.length,
      recentMatches: recent
    };
  }
}

// Export singleton instance
export const statisticsService = new StatisticsService();
export default statisticsService;