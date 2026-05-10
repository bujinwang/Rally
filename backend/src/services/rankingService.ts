import { prisma } from '../config/database';

/**
 * Ranking service for Rally sessions.
 * Tracks player performance across sessions and generates leaderboards.
 */

export interface RankingEntry {
  playerName: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  matchesPlayed: number;
  matchWins: number;
  matchLosses: number;
  matchWinRate: number;
  totalPlayTime: number;
  rating: number;
}

/**
 * Get player rating history (ELO trend over time).
 */
export async function getPlayerRatingHistory(playerId: string, limit = 50) {
  const player = await prisma.mvpPlayer.findUnique({
    where: { id: playerId },
  });

  if (!player) return [];

  // Get all sessions this player participated in, ordered by date
  const sessions = await prisma.mvpSession.findMany({
    where: {
      players: { some: { name: player.name } },
      status: { in: ['ACTIVE', 'COMPLETED'] },
    },
    include: {
      players: {
        where: { name: player.name },
        select: { winRate: true, gamesPlayed: true, wins: true, losses: true },
      },
    },
    orderBy: { scheduledAt: 'asc' },
    take: limit,
  });

  return sessions.map(s => ({
    date: s.scheduledAt.toISOString(),
    sessionName: s.name,
    winRate: s.players[0]?.winRate || 0,
    gamesPlayed: s.players[0]?.gamesPlayed || 0,
    rating: Math.round(1200 + ((s.players[0]?.winRate || 0.5) - 0.5) * 400 * Math.log10(Math.max(s.players[0]?.gamesPlayed || 5, 5))),
  }));
}

/**
 * Get session rankings — players ordered by a composite rating.
 */
export async function getSessionRankings(sessionId: string, minMatches = 0) {
  const players = await prisma.mvpPlayer.findMany({
    where: {
      sessionId,
      status: { not: 'LEFT' },
      gamesPlayed: { gte: minMatches },
    },
    orderBy: [{ winRate: 'desc' }, { wins: 'desc' }],
  });

  return players.map(p => ({
    playerId: p.id,
    playerName: p.name,
    gamesPlayed: p.gamesPlayed,
    wins: p.wins,
    losses: p.losses,
    winRate: p.winRate,
    matchesPlayed: p.matchesPlayed,
    matchWins: p.matchWins,
    matchLosses: p.matchLosses,
    matchWinRate: p.matchWinRate,
    totalPlayTime: p.totalPlayTime,
    rating: Math.round(1200 + ((p.winRate || 0.5) - 0.5) * 400 * Math.log10(Math.max(p.gamesPlayed || 5, 5))),
  }));
}

/**
 * Get global rankings across all sessions.
 */
export async function getGlobalRankings(minMatches = 5, limit = 100) {
  // Aggregate all players across sessions by name
  const players = await prisma.mvpPlayer.findMany({
    where: {
      gamesPlayed: { gte: minMatches },
      status: { not: 'LEFT' },
    },
    orderBy: [{ winRate: 'desc' }, { wins: 'desc' }],
    take: limit * 2, // Get extra to dedupe by name
  });

  // Deduplicate by name, keeping the best stats
  const seen = new Map<string, RankingEntry>();
  for (const p of players) {
    if (seen.has(p.name)) continue;
    seen.set(p.name, {
      playerName: p.name,
      gamesPlayed: p.gamesPlayed,
      wins: p.wins,
      losses: p.losses,
      winRate: p.winRate,
      matchesPlayed: p.matchesPlayed,
      matchWins: p.matchWins,
      matchLosses: p.matchLosses,
      matchWinRate: p.matchWinRate,
      totalPlayTime: p.totalPlayTime,
      rating: Math.round(1200 + ((p.winRate || 0.5) - 0.5) * 400 * Math.log10(Math.max(p.gamesPlayed || 5, 5))),
    });
  }

  return Array.from(seen.values())
    .sort((a, b) => b.rating - a.rating)
    .slice(0, limit);
}

/**
 * Update rankings after a match completes.
 */
export async function updateRankingsAfterMatch(matchId: string, _winnerTeam: number) {
  // Look up the match to find its session
  const match = await prisma.mvpMatch.findUnique({
    where: { id: matchId },
    select: { sessionId: true },
  });
  if (!match) return [];
  return getSessionRankings(match.sessionId);
}

/**
 * Initialize a new player's ranking.
 */
export async function initializePlayerRanking(playerId: string) {
  await prisma.mvpPlayer.update({
    where: { id: playerId },
    data: {
      winRate: 0,
      matchWinRate: 0,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
    },
  });
}

/**
 * Apply weekly decay to inactive players (reduces rating for players who haven't played).
 */
export async function applyWeeklyDecay() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14); // Players inactive for 2 weeks

  const inactivePlayers = await prisma.mvpPlayer.findMany({
    where: {
      status: 'ACTIVE',
      updatedAt: { lt: cutoff },
      gamesPlayed: { gt: 0 },
    },
  });

  let decayed = 0;
  for (const player of inactivePlayers) {
    // Reduce win rate by 5% toward 50% (regression to mean)
    const newWinRate = player.winRate * 0.95 + 0.5 * 0.05;
    await prisma.mvpPlayer.update({
      where: { id: player.id },
      data: { winRate: newWinRate },
    });
    decayed++;
  }

  return { decayedCount: decayed, message: `Applied decay to ${decayed} inactive players` };
}
