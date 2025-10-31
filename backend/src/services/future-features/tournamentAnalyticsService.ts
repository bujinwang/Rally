import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class TournamentAnalyticsService {
  /**
   * Calculate participation and completion metrics for a tournament
   */
  static async calculateParticipationMetrics(tournamentId: string) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        players: true,
        matches: true,
        analytics: true,
      },
    });

    if (!tournament) {
      throw new Error('Tournament not found');
    }

    const totalRegistered = tournament.players.length;
    const totalMatchesScheduled = tournament.maxPlayers - 1; // For single elimination
    const totalMatchesCompleted = tournament.matches.filter(m => m.status === 'COMPLETED').length;

    const completionRate = totalMatchesCompleted / Math.max(1, totalMatchesScheduled);
    const participationRate = totalRegistered / tournament.maxPlayers;
    const noShowRate = 0; // Calculate based on withdrawals if tracked

    // Update or create analytics record
    await prisma.tournamentAnalytics.upsert({
      where: { tournamentId },
      update: {
        totalParticipants: totalRegistered,
        completionRate,
        avgMatchDuration: 0, // Calculate from matches
        bracketEfficiency: 0, // To be calculated in separate method
      },
      create: {
        tournamentId,
        totalParticipants: totalRegistered,
        completionRate,
        avgMatchDuration: 0,
        bracketEfficiency: 0,
      },
    });

    return {
      totalRegistered,
      participationRate,
      completionRate,
      noShowRate,
      matchesCompleted: totalMatchesCompleted,
    };
  }

  /**
   * Calculate bracket efficiency and performance analysis
   */
  static async calculateBracketEfficiency(tournamentId: string) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        rounds: {
          include: {
            matches: true,
          },
        },
        players: true,
      },
    });

    if (!tournament) {
      throw new Error('Tournament not found');
    }

    let totalMatches = 0;
    let completedMatches = 0;
    let averageUpsets = 0;
    let bracketEfficiency = 0;

    tournament.rounds.forEach(round => {
      totalMatches += round.matches.length;
      completedMatches += round.matches.filter(m => m.status === 'COMPLETED').length;

      // Simple upset calculation: lower seed wins
      round.matches.forEach(match => {
        if (match.winnerId) {
          const winner = tournament.players.find(p => p.id === match.winnerId);
          const loser = tournament.players.find(p => p.id === (match.player1Id === match.winnerId ? match.player2Id : match.player1Id));
          if (winner && loser && (winner.seed || 999) < (loser.seed || 999)) {
            averageUpsets += 1;
          }
        }
      });
    });

    averageUpsets = averageUpsets / Math.max(1, completedMatches);
    bracketEfficiency = completedMatches / Math.max(1, totalMatches);

    // Update analytics
    await prisma.tournamentAnalytics.update({
      where: { tournamentId },
      data: {
        bracketEfficiency,
        avgMatchDuration: 45, // Placeholder; calculate from match durations
      },
    });

    return {
      totalMatches,
      completedMatches,
      bracketEfficiency,
      averageUpsets,
    };
  }

  /**
   * Track player ranking changes from tournament results
   */
  static async trackPlayerRankingChanges(tournamentId: string) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        players: {
          include: {
            player1Matches: true,
            player2Matches: true,
          },
        },
      },
    });

    if (!tournament) {
      throw new Error('Tournament not found');
    }

    const changes: any[] = [];

    tournament.players.forEach(player => {
      const wins = player.player1Matches.filter(m => m.winnerId === player.id).length +
                   player.player2Matches.filter(m => m.winnerId === player.id).length;
      const total = player.player1Matches.length + player.player2Matches.length;
      const winRate = total > 0 ? wins / total : 0;
      const pointsGained = wins * 10; // Simple points system

      changes.push({
        playerId: player.id,
        finalRank: player.finalRank,
        wins,
        totalMatches: total,
        winRate,
        pointsGained,
      });
    });

    // Sort by performance for ranking
    const rankedChanges = changes.sort((a, b) => (b.winRate - a.winRate) || (a.finalRank || 999) - (b.finalRank || 999));

    // Update player analytics if integrated
    // For now, return the changes

    return rankedChanges;
  }

  /**
   * Compare tournament formats effectiveness
   */
  static async compareTournamentFormats(tournamentIds: string[]) {
    const tournaments = await prisma.tournament.findMany({
      where: { id: { in: tournamentIds } },
      include: {
        analytics: true,
        players: true,
      },
    });

    const comparisons: any = {};

    tournaments.forEach(t => {
      const format = t.tournamentType;
      if (!comparisons[format]) {
        comparisons[format] = [];
      }
      comparisons[format].push({
        id: t.id,
        completionRate: t.analytics?.completionRate || 0,
        avgMatchDuration: t.analytics?.avgMatchDuration || 0,
        bracketEfficiency: t.analytics?.bracketEfficiency || 0,
        participants: t.players.length,
      });
    });

    // Calculate averages per format
    Object.keys(comparisons).forEach(format => {
      const stats = comparisons[format];
      const avgCompletion = stats.reduce((sum: number, s: any) => sum + s.completionRate, 0) / stats.length;
      const avgDuration = stats.reduce((sum: number, s: any) => sum + s.avgMatchDuration, 0) / stats.length;
      const avgEfficiency = stats.reduce((sum: number, s: any) => sum + s.bracketEfficiency, 0) / stats.length;
      const avgParticipants = stats.reduce((sum: number, s: any) => sum + s.participants, 0) / stats.length;

      comparisons[format] = {
        averageCompletionRate: avgCompletion,
        averageMatchDuration: avgDuration,
        averageBracketEfficiency: avgEfficiency,
        averageParticipants: avgParticipants,
        count: stats.length,
      };
    });

    return comparisons;
  }
}