/**
 * Session lifecycle + gameplay event emitters (Story 6.4, AC 4 / AC 7 / AC 10).
 *
 * All emitters in this module are server-authoritative: they re-read the
 * persisted row and emit only what the database now contains. Nothing is
 * emitted before the write commits.
 *
 * Every event is routed through `emitToRoom`, which stamps a monotonic
 * `eventId` for ordering (AC 10) and records it for reconnect replay (AC 11).
 *
 * Room convention (AC 14): `session:${shareCode}`.
 */

import { prisma } from '../../config/database';
import { emitToRoom, getIoOrNull, sessionRoom } from '../ioRegistry';

export { sessionRoom };

const PLAYER_SELECT = {
  id: true,
  name: true,
  deviceId: true,
  userId: true,
  role: true,
  status: true,
  gamesPlayed: true,
  wins: true,
  losses: true,
  joinedAt: true,
} as const;

/**
 * Emit the full session snapshot after a mutation committed (AC 4).
 *
 * Keeps the legacy `mvp-session-updated` event name (AC 5) and emits it
 * EXACTLY ONCE, to the canonical `session:${shareCode}` room only (AC 14).
 *
 * There is deliberately NO legacy kebab-room (`session-${shareCode}`)
 * mirror here: a joining client is placed in BOTH rooms (see
 * `config/socket.ts` `join-session`), so mirroring the snapshot to the
 * legacy room delivered every authoritative event to the client twice and
 * violated AC 8 ("no duplicate events delivered"). The legacy route layer
 * in `routes/mvpSessions.ts` emits its own events straight to the kebab
 * room, so it is unaffected by removing the mirror.
 */
export async function emitSessionSnapshot(shareCode: string): Promise<boolean> {
  const session = await prisma.mvpSession.findUnique({
    where: { shareCode },
    include: {
      players: {
        select: PLAYER_SELECT,
        orderBy: { joinedAt: 'asc' },
      },
    },
  });

  if (!session) return false;

  const payload = {
    session,
    timestamp: new Date().toISOString(),
  };

  if (!getIoOrNull()) return false;

  // Canonical room only — emitting to a second room would double-deliver
  // to clients that joined both (AC 8).
  emitToRoom(sessionRoom(shareCode), 'mvp-session-updated', payload);

  return true;
}

/**
 * Emit a player-status change (rotation) after the status write committed.
 * Emits the refreshed snapshot plus a typed `statusChanged` descriptor so
 * clients can react without diffing the whole session (AC 4).
 */
export async function emitPlayerStatusChanged(
  shareCode: string,
  playerId: string,
  newStatus: string
): Promise<void> {
  const player = await prisma.mvpPlayer.findUnique({
    where: { id: playerId },
    select: { id: true, name: true, status: true },
  });

  if (!player) return;

  await emitSessionSnapshot(shareCode);

  emitToRoom(sessionRoom(shareCode), 'session:player-status-changed', {
    shareCode,
    playerId: player.id,
    playerName: player.name,
    status: player.status ?? newStatus,
  });
}

/**
 * Emit a score line after the score write committed (AC 4).
 * Scores live on `MvpGame` (team1FinalScore / team2FinalScore); the value is
 * read back from persistence — never echoed from the request.
 */
export async function emitScoreUpdated(
  shareCode: string,
  gameId: string
): Promise<void> {
  const game = await prisma.mvpGame.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      matchId: true,
      gameNumber: true,
      team1Player1: true,
      team1Player2: true,
      team2Player1: true,
      team2Player2: true,
      team1FinalScore: true,
      team2FinalScore: true,
      winnerTeam: true,
    },
  });

  if (!game) return;

  await emitSessionSnapshot(shareCode);

  emitToRoom(sessionRoom(shareCode), 'session:score-updated', {
    shareCode,
    gameId: game.id,
    matchId: game.matchId,
    gameNumber: game.gameNumber,
    team1FinalScore: game.team1FinalScore,
    team2FinalScore: game.team2FinalScore,
    winnerTeam: game.winnerTeam,
  });
}

/**
 * Emit that a player joined after the row committed (AC 4).
 */
export async function emitPlayerJoined(
  shareCode: string,
  playerId: string
): Promise<void> {
  const player = await prisma.mvpPlayer.findUnique({
    where: { id: playerId },
    select: PLAYER_SELECT,
  });

  if (!player) return;

  await emitSessionSnapshot(shareCode);

  emitToRoom(sessionRoom(shareCode), 'session:player-joined', {
    shareCode,
    player,
  });
}

/**
 * Emit that a player left after the row committed (AC 4).
 */
export async function emitPlayerLeft(
  shareCode: string,
  playerId: string
): Promise<void> {
  await emitSessionSnapshot(shareCode);

  emitToRoom(sessionRoom(shareCode), 'session:player-left', {
    shareCode,
    playerId,
  });
}

/**
 * Invalidate the HTTP cache for a session (AC 7 — cache and socket state
 * must agree on invalidation). Best-effort: a cache outage never breaks
 * the real-time path.
 */
export async function invalidateSessionCache(shareCode: string): Promise<void> {
  try {
    const { cacheService } = await import('../../services/cacheService');
    await cacheService.invalidateSession(shareCode);
  } catch {
    /* cache is best-effort — never block the real-time path */
  }
}
