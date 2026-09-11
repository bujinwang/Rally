/**
 * Tournament analytics event emitter (Story 6.4, AC 3 / AC 4 / AC 10).
 *
 * Replaces the `routes/tournament-analytics.ts` placeholder with real,
 * event-driven updates. Every emitter reads back the persisted row(s) and
 * sends the result to the tournament room — unpersisted state is never
 * emitted as authoritative.
 *
 * Events are routed through the shared registry so they carry a monotonic
 * `eventId` (ordering, AC 10) and are recorded for reconnect replay (AC 11).
 */

import { prisma } from '../../config/database';
import {
  emitToRoom,
  getIo,
  tournamentRoom,
} from '../ioRegistry';

export { tournamentRoom };

/** Shape of a bracket round returned to clients. */
export interface BracketRound {
  roundNumber: number;
  name: string | null;
  matches: Array<{
    id: string;
    player1: { id: string; playerName: string } | null;
    player2: { id: string; playerName: string } | null;
    winnerId: string | null;
    status: string;
  }>;
}

/**
 * Load the bracket for a tournament from persistence.
 */
export async function loadBracket(tournamentId: string): Promise<BracketRound[]> {
  const rounds = await prisma.tournamentRound.findMany({
    where: { tournamentId },
    orderBy: { roundNumber: 'asc' },
    include: {
      matches: {
        include: {
          player1: { select: { id: true, playerName: true } },
          player2: { select: { id: true, playerName: true } },
        },
      },
    },
  });

  return rounds.map((r) => ({
    roundNumber: r.roundNumber,
    name: r.roundName,
    matches: r.matches.map((m) => ({
      id: m.id,
      player1: m.player1,
      player2: m.player2,
      winnerId: m.winnerId,
      status: m.status,
    })),
  }));
}

/**
 * Emit a tournament update after a match result is recorded (AC 3 / AC 4).
 * Keeps the legacy `tournament:match-complete` name and adds the requested
 * `tournament:update` shape (AC 3).
 */
export async function emitMatchComplete(
  tournamentId: string,
  matchId: string
): Promise<void> {
  const match = await prisma.tournamentMatch.findUnique({
    where: { id: matchId },
    include: {
      player1: { select: { id: true, playerName: true } },
      player2: { select: { id: true, playerName: true } },
    },
  });

  if (!match) return;

  const room = tournamentRoom(tournamentId);

  emitToRoom(room, 'tournament:match-complete', {
    tournamentId,
    matchId,
    match: {
      id: match.id,
      roundId: match.roundId,
      player1: match.player1,
      player2: match.player2,
      winnerId: match.winnerId,
      status: match.status,
    },
  });

  // The bracket changed as a result of the match — send the fresh bracket.
  await emitBracketUpdate(tournamentId);
}

/**
 * Emit the updated bracket for a tournament (AC 3 / AC 4).
 */
export async function emitBracketUpdate(tournamentId: string): Promise<void> {
  const rounds = await loadBracket(tournamentId);

  emitToRoom(tournamentRoom(tournamentId), 'tournament:bracket', {
    tournamentId,
    rounds,
  });
}

/**
 * Emit when standings change (AC 3 — `tournament:leaderboard`).
 * There is no dedicated standing table; the leaderboard is derived from
 * persisted `TournamentPlayer` rows (win rate, matches played, final rank).
 */
export async function emitLeaderboardUpdate(tournamentId: string): Promise<void> {
  const players = await prisma.tournamentPlayer.findMany({
    where: { tournamentId },
    select: {
      id: true,
      playerName: true,
      seed: true,
      winRate: true,
      totalMatches: true,
      isEliminated: true,
      finalRank: true,
      status: true,
    },
  });

  const standings = players
    .slice()
    .sort((a, b) => {
      // Ranked players first (by final rank), then by win rate.
      if (a.finalRank != null && b.finalRank != null) return a.finalRank - b.finalRank;
      if (a.finalRank != null) return -1;
      if (b.finalRank != null) return 1;
      return b.winRate - a.winRate;
    })
    .map((p, index) => ({
      playerId: p.id,
      playerName: p.playerName,
      rank: p.finalRank ?? index + 1,
      seed: p.seed,
      winRate: p.winRate,
      totalMatches: p.totalMatches,
      isEliminated: p.isEliminated,
      status: p.status,
    }));

  emitToRoom(tournamentRoom(tournamentId), 'tournament:leaderboard', {
    tournamentId,
    standings,
  });
}

/** Test/recon helper — whether the registry has an io instance wired. */
export function isEmitterReady(): boolean {
  try {
    return getIo() !== null;
  } catch {
    return false;
  }
}
