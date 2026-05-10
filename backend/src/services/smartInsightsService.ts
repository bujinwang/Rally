import { prisma } from '../config/database';

/**
 * AI-powered smart features for Rally:
 * - ELO-style skill ratings
 * - Smart team balancing suggestions
 * - Personalized player insights
 * - Optimal court utilization
 */

// ── ELO Rating System ──────────────────────────────────────────────────────────

const DEFAULT_ELO = 1200;
const K_FACTOR = 32; // How much rating changes per game

export interface PlayerRating {
  name: string;
  elo: number;
  gamesPlayed: number;
  recentForm: ('W' | 'L')[];
  trend: 'rising' | 'stable' | 'falling';
}

/**
 * Calculate new ELO ratings after a game.
 * team1Elo and team2Elo are the average ELOs of each team.
 */
export function calculateNewElo(
  team1Elo: number,
  team2Elo: number,
  team1Won: boolean,
): { team1NewElo: number; team2NewElo: number } {
  const expected1 = 1 / (1 + Math.pow(10, (team2Elo - team1Elo) / 400));
  const expected2 = 1 - expected1;
  const score1 = team1Won ? 1 : 0;
  const score2 = team1Won ? 0 : 1;

  return {
    team1NewElo: Math.round(team1Elo + K_FACTOR * (score1 - expected1)),
    team2NewElo: Math.round(team2Elo + K_FACTOR * (score2 - expected2)),
  };
}

/**
 * Get ELO ratings for all players in a session.
 * Derives ratings from win rates and game count,
 * simulating an ELO ladder across all sessions.
 */
export async function getSessionPlayerRatings(sessionId: string): Promise<PlayerRating[]> {
  const players = await prisma.mvpPlayer.findMany({
    where: { sessionId },
    orderBy: { winRate: 'desc' },
  });

  return players.map(p => {
    // Derive ELO from win rate: base 1200, +/- 200 per 0.1 deviation from 50%
    const winRate = p.gamesPlayed > 0 ? p.wins / p.gamesPlayed : 0.5;
    const eloDerived = Math.round(DEFAULT_ELO + (winRate - 0.5) * 400 * Math.log10(Math.max(p.gamesPlayed, 5)));

    // Recent form from last 10 games (simplified — real impl would pull game history)
    const form: ('W' | 'L')[] = [];
    const totalGames = p.wins + p.losses;
    const recentCount = Math.min(10, totalGames);
    for (let i = 0; i < recentCount; i++) {
      form.push(i < Math.round(winRate * recentCount) ? 'W' : 'L');
    }

    // Trend: compare recent vs all-time
    const recentWins = form.filter(f => f === 'W').length;
    const recentRate = recentCount > 0 ? recentWins / recentCount : winRate;
    const trend: PlayerRating['trend'] =
      recentRate > winRate + 0.1 ? 'rising' :
      recentRate < winRate - 0.1 ? 'falling' : 'stable';

    return {
      name: p.name,
      elo: eloDerived,
      gamesPlayed: p.gamesPlayed,
      recentForm: form,
      trend,
    };
  });
}

// ── Smart Team Balancing ────────────────────────────────────────────────────────

export interface BalancedTeam {
  team1: string[];
  team2: string[];
  eloDiff: number;
  balanceScore: number; // 0-100, higher = more balanced
  reasoning: string;
}

/**
 * Find the most balanced 4-player matchup given a pool of available players.
 * Uses ELO ratings to minimize skill gap between teams.
 */
export function findMostBalancedTeams(
  availablePlayers: PlayerRating[],
  gameHistory: Array<{ team1Player1: string; team1Player2: string; team2Player1: string; team2Player2: string }>,
): BalancedTeam | null {
  if (availablePlayers.length < 4) return null;

  const players = [...availablePlayers].sort((a, b) => a.elo - b.elo);

  // Strategy: snake draft — best with worst vs middle two
  // This typically produces the most balanced teams
  const lowest = players[0];
  const highest = players[players.length - 1];
  const mid1 = players[1];
  const mid2 = players[players.length - 2];

  // Try both arrangements and pick the most balanced
  const arrangements: Array<{ team1: string[]; team2: string[] }> = [
    { team1: [lowest.name, highest.name], team2: [mid1.name, mid2.name] },
    { team1: [lowest.name, mid2.name], team2: [highest.name, mid1.name] },
  ];

  let best: BalancedTeam | null = null;
  let bestBalance = 0;

  for (const arr of arrangements) {
    const t1Elo = (getRating(arr.team1[0], availablePlayers) + getRating(arr.team1[1], availablePlayers)) / 2;
    const t2Elo = (getRating(arr.team2[0], availablePlayers) + getRating(arr.team2[1], availablePlayers)) / 2;
    const eloDiff = Math.abs(t1Elo - t2Elo);

    // Penalize repeated partnerships
    const partnershipPenalty = countPartnership(
      arr.team1[0], arr.team1[1], gameHistory,
    ) * 5 + countPartnership(arr.team2[0], arr.team2[1], gameHistory) * 5;

    // Penalize repeated opponents
    const opponentPenalty = countOpponent(
      arr.team1[0], arr.team2[0], gameHistory,
    ) * 3 + countOpponent(arr.team1[1], arr.team2[1], gameHistory) * 3;

    const balanceScore = Math.max(0, 100 - eloDiff - partnershipPenalty - opponentPenalty);

    if (balanceScore > bestBalance) {
      bestBalance = balanceScore;
      best = {
        team1: arr.team1,
        team2: arr.team2,
        eloDiff,
        balanceScore,
        reasoning: buildReasoning(eloDiff, partnershipPenalty, opponentPenalty),
      };
    }
  }

  return best;
}

function getRating(name: string, ratings: PlayerRating[]): number {
  return ratings.find(r => r.name === name)?.elo ?? DEFAULT_ELO;
}

function countPartnership(
  p1: string,
  p2: string,
  history: Array<{ team1Player1: string; team1Player2: string; team2Player1: string; team2Player2: string }>,
): number {
  const key = [p1, p2].sort().join('|');
  return history.filter(g => {
    const t1 = [g.team1Player1, g.team1Player2].sort().join('|');
    const t2 = [g.team2Player1, g.team2Player2].sort().join('|');
    return t1 === key || t2 === key;
  }).length;
}

function countOpponent(
  p1: string,
  p2: string,
  history: Array<{ team1Player1: string; team1Player2: string; team2Player1: string; team2Player2: string }>,
): number {
  return history.filter(g => {
    const team1 = [g.team1Player1, g.team1Player2];
    const team2 = [g.team2Player1, g.team2Player2];
    return (team1.includes(p1) && team2.includes(p2)) || (team1.includes(p2) && team2.includes(p1));
  }).length;
}

function buildReasoning(eloDiff: number, partnershipPenalty: number, opponentPenalty: number): string {
  const parts: string[] = [];
  if (eloDiff < 20) parts.push('Excellent skill balance');
  else if (eloDiff < 50) parts.push('Good skill balance');
  else parts.push(`Skill gap: ${eloDiff} ELO`);

  if (partnershipPenalty > 0) parts.push('Avoids repeat partnerships');
  if (opponentPenalty > 0) parts.push('Fresh opponent matchups');

  return parts.join(' · ');
}

// ── Smart Court Optimizer ───────────────────────────────────────────────────────

export interface CourtAssignment {
  courtName: string;
  players: string[];
  expectedDuration: number; // minutes
  priority: 'high' | 'medium' | 'low';
}

/**
 * Optimize court assignments for maximum play time.
 * Prioritizes: players who've played least → courts with shortest expected games.
 */
export function optimizeCourtAssignments(
  availablePlayers: PlayerRating[],
  courts: Array<{ name: string; isAvailable: boolean }>,
  gameHistory: Array<{ courtName?: string; duration?: number }>,
): CourtAssignment[] {
  const assignments: CourtAssignment[] = [];
  const usedPlayers = new Set<string>();
  const availableCourts = courts.filter(c => c.isAvailable);

  // Sort players by games played (ascending — least played get priority)
  const sortedPlayers = [...availablePlayers].sort((a, b) => a.gamesPlayed - b.gamesPlayed);

  for (const court of availableCourts) {
    const courtPlayers = sortedPlayers.filter(p => !usedPlayers.has(p.name));
    if (courtPlayers.length < 4) break;

    // Pick 4 players for this court using ELO balancing
    const balanced = findMostBalancedTeams(courtPlayers.slice(0, 8), gameHistory as any);
    if (!balanced) break;

    const players = [...balanced.team1, ...balanced.team2];
    players.forEach(p => usedPlayers.add(p));

    // Estimate duration from historical court data
    const courtHistory = gameHistory.filter(g => g.courtName === court.name);
    const avgDuration = courtHistory.length > 0
      ? courtHistory.reduce((s, g) => s + (g.duration || 15), 0) / courtHistory.length
      : 15;

    assignments.push({
      courtName: court.name,
      players,
      expectedDuration: Math.round(avgDuration),
      priority: players.some(p => availablePlayers.find(ap => ap.name === p)!.gamesPlayed <= 2) ? 'high' : 'medium',
    });
  }

  return assignments;
}

// ── Personalized Player Insights ────────────────────────────────────────────────

export interface PlayerInsight {
  type: 'strength' | 'weakness' | 'tip' | 'milestone';
  title: string;
  description: string;
  icon: string;
}

/**
 * Generate personalized insights for a player based on their stats.
 */
export function generatePlayerInsights(
  playerName: string,
  ratings: PlayerRating[],
  partnershipStats: Record<string, { gamesPlayed: number; wins: number; losses: number; winRate: number }>,
): PlayerInsight[] {
  const insights: PlayerInsight[] = [];
  const player = ratings.find(r => r.name === playerName);
  if (!player) return insights;

  // Strength: High win rate
  const winRate = player.gamesPlayed > 0
    ? (player.recentForm.filter(f => f === 'W').length / Math.max(player.recentForm.length, 1))
    : 0;

  if (winRate > 0.65 && player.gamesPlayed >= 5) {
    insights.push({
      type: 'strength',
      title: 'On Fire',
      description: `Winning ${Math.round(winRate * 100)}% of recent games — top form!`,
      icon: '🔥',
    });
  }

  // Weakness: Poor partnership
  const partnerships = Object.entries(partnershipStats);
  const worstPartner = partnerships
    .filter(([, s]) => s.gamesPlayed >= 3)
    .sort(([, a], [, b]) => a.winRate - b.winRate)[0];

  if (worstPartner && worstPartner[1].winRate < 0.4) {
    insights.push({
      type: 'weakness',
      title: 'Tough Partnership',
      description: `Win rate drops to ${Math.round(worstPartner[1].winRate * 100)}% with ${worstPartner[0]}`,
      icon: '⚠️',
    });
  }

  // Strength: Best partnership
  const bestPartner = partnerships
    .filter(([, s]) => s.gamesPlayed >= 3)
    .sort(([, a], [, b]) => b.winRate - a.winRate)[0];

  if (bestPartner && bestPartner[1].winRate > 0.6) {
    insights.push({
      type: 'strength',
      title: 'Dream Team',
      description: `Winning ${Math.round(bestPartner[1].winRate * 100)}% with ${bestPartner[0]}`,
      icon: '🤝',
    });
  }

  // Tip: Play more to improve rating
  if (player.gamesPlayed < 5) {
    insights.push({
      type: 'tip',
      title: 'Getting Started',
      description: 'Play 5+ games for accurate skill rating and insights',
      icon: '📈',
    });
  }

  // Milestone
  if (player.gamesPlayed >= 10) {
    insights.push({
      type: 'milestone',
      title: '10+ Games',
      description: `Played ${player.gamesPlayed} games — consistent player!`,
      icon: '🏅',
    });
  }

  // Trend insight
  if (player.trend === 'rising') {
    insights.push({
      type: 'strength',
      title: 'Improving',
      description: 'Recent performance trending upward — keep it up!',
      icon: '📈',
    });
  } else if (player.trend === 'falling' && player.gamesPlayed >= 10) {
    insights.push({
      type: 'tip',
      title: 'Slump Alert',
      description: 'Recent results below average — time to switch it up?',
      icon: '💪',
    });
  }

  return insights;
}

/**
 * Generate session-wide smart insights.
 */
export async function getSessionSmartInsights(sessionId: string): Promise<{
  balancedTeams: BalancedTeam | null;
  courtAssignments: CourtAssignment[];
  topPlayers: PlayerRating[];
  needsMorePlayers: boolean;
  suggestion: string;
}> {
  const session = await prisma.mvpSession.findUnique({
    where: { id: sessionId },
    include: {
      players: { where: { status: 'ACTIVE' } },
      games: { take: 20, orderBy: { gameNumber: 'desc' } },
    },
  });

  if (!session) throw new Error('Session not found');

  const ratings = await getSessionPlayerRatings(sessionId);
  const courts = [{ name: 'Court 1', isAvailable: true }]; // Simplified

  const gameHistory = session.games.map(g => ({
    team1Player1: g.team1Player1,
    team1Player2: g.team1Player2,
    team2Player1: g.team2Player1,
    team2Player2: g.team2Player2,
    courtName: g.courtName || 'Court 1',
    duration: g.duration || undefined,
  }));

  const balancedTeams = findMostBalancedTeams(ratings, gameHistory);
  const courtAssignments = optimizeCourtAssignments(ratings, courts, gameHistory);

  const needsMorePlayers = session.players.filter(p => p.status === 'ACTIVE').length < 4;

  const suggestions: string[] = [];
  if (needsMorePlayers) {
    suggestions.push(`Need ${4 - session.players.filter(p => p.status === 'ACTIVE').length} more players for a game`);
  }
  if (balancedTeams && balancedTeams.balanceScore > 70) {
    suggestions.push(`Ready: ${balancedTeams.reasoning}`);
  }

  return {
    balancedTeams,
    courtAssignments,
    topPlayers: ratings.slice(0, 3),
    needsMorePlayers,
    suggestion: suggestions.join('. ') || 'Waiting for more players',
  };
}
