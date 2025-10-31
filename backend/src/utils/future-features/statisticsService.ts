// Comprehensive Statistics Service for Enhanced Live Games
// Handles detailed player statistics for both individual games and matches

import { prisma } from '../config/database';

export interface PlayerStats {
  // Basic Stats
  gamesPlayed: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
  matchWins: number;
  matchLosses: number;
  
  // Advanced Stats
  totalSetsWon: number;
  totalSetsLost: number;
  totalPlayTime: number;
  winRate: number;
  matchWinRate: number;
  averageGameDuration: number;
  
  // Partnership Stats
  partnershipStats: PartnershipRecord[];
}

export interface PartnershipRecord {
  partnerName: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface SessionStatistics {
  sessionId: string;
  totalGames: number;
  totalMatches: number;
  averageGameDuration: number;
  longestMatch: number;
  shortestMatch: number;
  mostActivePlayer: string;
  topPartnership: {
    players: [string, string];
    winRate: number;
    gamesPlayed: number;
  };
}

/**
 * Update player statistics after a game is completed
 */
export async function updatePlayerGameStatistics(
  sessionId: string,
  gameData: {
    team1Player1: string;
    team1Player2: string;
    team2Player1: string;
    team2Player2: string;
    winnerTeam: number;
    duration?: number;
    team1FinalScore: number;
    team2FinalScore: number;
  }
): Promise<void> {
  const { team1Player1, team1Player2, team2Player1, team2Player2, winnerTeam, duration } = gameData;
  const allPlayers = [team1Player1, team1Player2, team2Player1, team2Player2];
  const winners = winnerTeam === 1 ? [team1Player1, team1Player2] : [team2Player1, team2Player2];
  const losers = winnerTeam === 1 ? [team2Player1, team2Player2] : [team1Player1, team1Player2];

  // Update basic game statistics for all players
  await prisma.mvpPlayer.updateMany({
    where: {
      sessionId,
      name: { in: allPlayers }
    },
    data: {
      gamesPlayed: { increment: 1 }
    }
  });

  // Update winners
  await prisma.mvpPlayer.updateMany({
    where: {
      sessionId,
      name: { in: winners }
    },
    data: {
      wins: { increment: 1 },
      totalSetsWon: { increment: winnerTeam === 1 ? gameData.team1FinalScore : gameData.team2FinalScore },
      totalSetsLost: { increment: winnerTeam === 1 ? gameData.team2FinalScore : gameData.team1FinalScore }
    }
  });

  // Update losers
  await prisma.mvpPlayer.updateMany({
    where: {
      sessionId,
      name: { in: losers }
    },
    data: {
      losses: { increment: 1 },
      totalSetsWon: { increment: winnerTeam === 1 ? gameData.team2FinalScore : gameData.team1FinalScore },
      totalSetsLost: { increment: winnerTeam === 1 ? gameData.team1FinalScore : gameData.team2FinalScore }
    }
  });

  // Update play time if duration is available
  if (duration) {
    await prisma.mvpPlayer.updateMany({
      where: {
        sessionId,
        name: { in: allPlayers }
      },
      data: {
        totalPlayTime: { increment: duration }
      }
    });
  }

  // Update partnership statistics
  await updatePartnershipStatistics(sessionId, team1Player1, team1Player2, winnerTeam === 1);
  await updatePartnershipStatistics(sessionId, team2Player1, team2Player2, winnerTeam === 2);

  // Recalculate performance metrics for all involved players
  for (const playerName of allPlayers) {
    await recalculatePlayerMetrics(sessionId, playerName);
  }
  
  // Update rest counters for all resting players
  await updateRestCounters(sessionId);
}

/**
 * Update rest counters for all resting players after a game completes
 */
async function updateRestCounters(sessionId: string): Promise<void> {
  // Decrement rest games remaining for all resting players
  await prisma.mvpPlayer.updateMany({
    where: {
      sessionId,
      status: 'RESTING',
      restGamesRemaining: { gt: 0 }
    },
    data: {
      restGamesRemaining: { decrement: 1 }
    }
  });

  // Auto-activate players whose rest period has ended
  await prisma.mvpPlayer.updateMany({
    where: {
      sessionId,
      status: 'RESTING',
      restGamesRemaining: { lte: 0 }
    },
    data: {
      status: 'ACTIVE',
      restRequestedAt: null,
      restRequestedBy: null
    }
  });
}

/**
 * Update player statistics after a match is completed
 */
export async function updatePlayerMatchStatistics(
  sessionId: string,
  matchData: {
    team1Player1: string;
    team1Player2: string;
    team2Player1: string;
    team2Player2: string;
    winnerTeam: number;
    duration?: number;
  }
): Promise<void> {
  const { team1Player1, team1Player2, team2Player1, team2Player2, winnerTeam, duration } = matchData;
  const allPlayers = [team1Player1, team1Player2, team2Player1, team2Player2];
  const winners = winnerTeam === 1 ? [team1Player1, team1Player2] : [team2Player1, team2Player2];
  const losers = winnerTeam === 1 ? [team2Player1, team2Player2] : [team1Player1, team1Player2];

  // Update match statistics for all players
  await prisma.mvpPlayer.updateMany({
    where: {
      sessionId,
      name: { in: allPlayers }
    },
    data: {
      matchesPlayed: { increment: 1 }
    }
  });

  // Update match winners
  await prisma.mvpPlayer.updateMany({
    where: {
      sessionId,
      name: { in: winners }
    },
    data: {
      matchWins: { increment: 1 }
    }
  });

  // Update match losers
  await prisma.mvpPlayer.updateMany({
    where: {
      sessionId,
      name: { in: losers }
    },
    data: {
      matchLosses: { increment: 1 }
    }
  });

  // Update total play time if duration is available
  if (duration) {
    await prisma.mvpPlayer.updateMany({
      where: {
        sessionId,
        name: { in: allPlayers }
      },
      data: {
        totalPlayTime: { increment: duration }
      }
    });
  }

  // Recalculate performance metrics for all involved players
  for (const playerName of allPlayers) {
    await recalculatePlayerMetrics(sessionId, playerName);
  }
}

/**
 * Update partnership statistics for a player pair
 */
async function updatePartnershipStatistics(
  sessionId: string,
  player1Name: string,
  player2Name: string,
  won: boolean
): Promise<void> {
  const players = await prisma.mvpPlayer.findMany({
    where: {
      sessionId,
      name: { in: [player1Name, player2Name] }
    }
  });

  for (const player of players) {
    const partnerName = player.name === player1Name ? player2Name : player1Name;
    const currentStats = (player.partnershipStats as any) || {};
    
    if (!currentStats[partnerName]) {
      currentStats[partnerName] = {
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        winRate: 0
      };
    }

    currentStats[partnerName].gamesPlayed += 1;
    if (won) {
      currentStats[partnerName].wins += 1;
    } else {
      currentStats[partnerName].losses += 1;
    }
    
    currentStats[partnerName].winRate = 
      currentStats[partnerName].gamesPlayed > 0 
        ? currentStats[partnerName].wins / currentStats[partnerName].gamesPlayed 
        : 0;

    await prisma.mvpPlayer.update({
      where: { id: player.id },
      data: {
        partnershipStats: currentStats
      }
    });
  }
}

/**
 * Recalculate performance metrics for a player
 */
async function recalculatePlayerMetrics(sessionId: string, playerName: string): Promise<void> {
  const player = await prisma.mvpPlayer.findFirst({
    where: { sessionId, name: playerName }
  });

  if (!player) return;

  const winRate = player.gamesPlayed > 0 ? player.wins / player.gamesPlayed : 0;
  const matchWinRate = player.matchesPlayed > 0 ? player.matchWins / player.matchesPlayed : 0;
  const averageGameDuration = player.gamesPlayed > 0 ? player.totalPlayTime / player.gamesPlayed : 0;

  await prisma.mvpPlayer.update({
    where: { id: player.id },
    data: {
      winRate,
      matchWinRate,
      averageGameDuration
    }
  });
}

/**
 * Get comprehensive player statistics
 */
export async function getPlayerStatistics(sessionId: string, playerName: string): Promise<PlayerStats | null> {
  const player = await prisma.mvpPlayer.findFirst({
    where: { sessionId, name: playerName }
  });

  if (!player) return null;

  const partnershipStats = (player.partnershipStats as any) || {};
  const partnershipRecords: PartnershipRecord[] = Object.entries(partnershipStats).map(
    ([partnerName, stats]: [string, any]) => ({
      partnerName,
      gamesPlayed: stats.gamesPlayed,
      wins: stats.wins,
      losses: stats.losses,
      winRate: stats.winRate
    })
  );

  return {
    gamesPlayed: player.gamesPlayed,
    wins: player.wins,
    losses: player.losses,
    matchesPlayed: player.matchesPlayed,
    matchWins: player.matchWins,
    matchLosses: player.matchLosses,
    totalSetsWon: player.totalSetsWon,
    totalSetsLost: player.totalSetsLost,
    totalPlayTime: player.totalPlayTime,
    winRate: player.winRate,
    matchWinRate: player.matchWinRate,
    averageGameDuration: player.averageGameDuration,
    partnershipStats: partnershipRecords
  };
}

/**
 * Get session-wide statistics
 */
export async function getSessionStatistics(sessionId: string): Promise<SessionStatistics> {
  const session = await prisma.mvpSession.findUnique({
    where: { id: sessionId },
    include: {
      players: true,
      games: {
        where: { status: 'COMPLETED' }
      },
      matches: {
        where: { status: 'COMPLETED' }
      }
    }
  });

  if (!session) {
    throw new Error('Session not found');
  }

  const totalGames = session.games.length;
  const totalMatches = session.matches.length;
  
  const averageGameDuration = totalGames > 0 
    ? session.games.reduce((sum, game) => sum + (game.duration || 0), 0) / totalGames
    : 0;

  const matchDurations = session.matches
    .map(match => match.duration || 0)
    .filter(duration => duration > 0);

  const longestMatch = matchDurations.length > 0 ? Math.max(...matchDurations) : 0;
  const shortestMatch = matchDurations.length > 0 ? Math.min(...matchDurations) : 0;

  // Find most active player (most games played)
  const mostActivePlayer = session.players.reduce((prev, current) => 
    current.gamesPlayed > prev.gamesPlayed ? current : prev
  ).name;

  // Find top partnership (highest win rate with minimum 3 games)
  let topPartnership: SessionStatistics['topPartnership'] = {
    players: ['', ''],
    winRate: 0,
    gamesPlayed: 0
  };

  for (const player of session.players) {
    const partnerships = (player.partnershipStats as any) || {};
    for (const [partnerName, stats] of Object.entries(partnerships) as [string, any][]) {
      if (stats.gamesPlayed >= 3 && stats.winRate > topPartnership.winRate) {
        topPartnership = {
          players: [player.name, partnerName],
          winRate: stats.winRate,
          gamesPlayed: stats.gamesPlayed
        };
      }
    }
  }

  return {
    sessionId,
    totalGames,
    totalMatches,
    averageGameDuration,
    longestMatch,
    shortestMatch,
    mostActivePlayer,
    topPartnership
  };
}

/**
 * Get leaderboard for a session
 */
export async function getSessionLeaderboard(sessionId: string): Promise<{
  byWinRate: any[];
  byMatchWins: any[];
  byGamesPlayed: any[];
  byPartnership: any[];
}> {
  const players = await prisma.mvpPlayer.findMany({
    where: { sessionId },
    orderBy: { gamesPlayed: 'desc' }
  });

  const byWinRate = players
    .filter(p => p.gamesPlayed >= 3)
    .sort((a, b) => b.winRate - a.winRate)
    .map(p => ({
      name: p.name,
      winRate: p.winRate,
      gamesPlayed: p.gamesPlayed,
      wins: p.wins,
      losses: p.losses
    }));

  const byMatchWins = players
    .filter(p => p.matchesPlayed > 0)
    .sort((a, b) => b.matchWins - a.matchWins)
    .map(p => ({
      name: p.name,
      matchWins: p.matchWins,
      matchLosses: p.matchLosses,
      matchWinRate: p.matchWinRate,
      matchesPlayed: p.matchesPlayed
    }));

  const byGamesPlayed = players
    .sort((a, b) => b.gamesPlayed - a.gamesPlayed)
    .map(p => ({
      name: p.name,
      gamesPlayed: p.gamesPlayed,
      totalPlayTime: p.totalPlayTime,
      averageGameDuration: p.averageGameDuration
    }));

  // Extract top partnerships
  const partnerships: any[] = [];
  for (const player of players) {
    const partnershipStats = (player.partnershipStats as any) || {};
    for (const [partnerName, stats] of Object.entries(partnershipStats) as [string, any][]) {
      if (stats.gamesPlayed >= 3) {
        partnerships.push({
          players: [player.name, partnerName].sort(),
          gamesPlayed: stats.gamesPlayed,
          wins: stats.wins,
          losses: stats.losses,
          winRate: stats.winRate
        });
      }
    }
  }

  const byPartnership = partnerships
    .filter((p, index, arr) => 
      arr.findIndex(p2 => 
        p2.players[0] === p.players[0] && p2.players[1] === p.players[1]
      ) === index
    )
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, 10);

  return {
    byWinRate,
    byMatchWins,
    byGamesPlayed,
    byPartnership
  };
}