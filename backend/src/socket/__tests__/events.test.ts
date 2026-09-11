/**
 * Domain event emitter tests (Story 6.4, AC 3 / AC 4 / AC 5 / AC 7 / AC 10).
 *
 * Verifies that session + tournament emitters read back persisted state,
 * emit to the correct canonical room exactly once (no legacy-room mirror —
 * AC 8, no duplicate events), and never emit for a row that does not exist.
 */
import { setIo, resetIo, clearEventBuffer, sessionRoom, tournamentRoom } from '../ioRegistry';

const findUniqueSession = jest.fn();
const findUniquePlayer = jest.fn();
const findUniqueGame = jest.fn();
const findManyRounds = jest.fn();
const findManyPlayers = jest.fn();
const findUniqueMatch = jest.fn();
const invalidateSession = jest.fn();

jest.mock('../../config/database', () => ({
  prisma: {
    mvpSession: { findUnique: (...a: unknown[]) => findUniqueSession(...a) },
    mvpPlayer: { findUnique: (...a: unknown[]) => findUniquePlayer(...a) },
    mvpGame: { findUnique: (...a: unknown[]) => findUniqueGame(...a) },
    mvpMatch: { findUnique: jest.fn() },
    tournamentRound: { findMany: (...a: unknown[]) => findManyRounds(...a) },
    tournamentPlayer: { findMany: (...a: unknown[]) => findManyPlayers(...a) },
    tournamentMatch: { findUnique: (...a: unknown[]) => findUniqueMatch(...a) },
  },
}));

jest.mock('../../services/cacheService', () => ({
  cacheService: { invalidateSession: (...a: unknown[]) => invalidateSession(...a) },
}));

import {
  emitSessionSnapshot,
  emitPlayerStatusChanged,
  emitScoreUpdated,
  emitPlayerJoined,
  emitPlayerLeft,
  invalidateSessionCache,
} from '../events/sessionEvents';
import {
  emitMatchComplete,
  emitBracketUpdate,
  emitLeaderboardUpdate,
  loadBracket,
} from '../events/tournamentAnalytics';

function makeFakeIo() {
  const emitted: Array<{ room: string; event: string; payload: any }> = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: any) => {
        emitted.push({ room, event, payload });
      },
    }),
  };
  return { io: io as any, emitted };
}

const SESSION = {
  id: 'sess-1',
  shareCode: 'ABC123',
  players: [{ id: 'p1', name: 'Ann', status: 'ACTIVE' }],
};

describe('Session + tournament emitters (Story 6.4, AC 4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetIo();
    clearEventBuffer();
  });

  afterEach(() => {
    resetIo();
    clearEventBuffer();
  });

  describe('emitSessionSnapshot', () => {
    it('emits the persisted snapshot exactly ONCE to the canonical room only (AC 5 / AC 8)', async () => {
      const { io, emitted } = makeFakeIo();
      setIo(io);
      findUniqueSession.mockResolvedValue(SESSION);

      const ok = await emitSessionSnapshot('ABC123');

      expect(ok).toBe(true);

      // AC 8 — no duplicate events delivered: exactly one emission total.
      expect(emitted).toHaveLength(1);

      const [only] = emitted;
      expect(only.room).toBe(sessionRoom('ABC123'));
      expect(only.event).toBe('mvp-session-updated');
      expect(only.payload.session).toEqual(SESSION);

      // Regression guard: the legacy kebab room must NEVER receive the
      // snapshot (a joining client is in both rooms, so mirroring there
      // is what caused the duplicate-delivery defect).
      expect(emitted.some((e) => e.room === 'session-ABC123')).toBe(false);
    });

    it('returns false and emits nothing when the session is gone (never emits unpersisted state)', async () => {
      const { io, emitted } = makeFakeIo();
      setIo(io);
      findUniqueSession.mockResolvedValue(null);

      const ok = await emitSessionSnapshot('MISSING');

      expect(ok).toBe(false);
      expect(emitted).toHaveLength(0);
    });

    it('returns false when no io instance is registered', async () => {
      findUniqueSession.mockResolvedValue(SESSION);
      expect(await emitSessionSnapshot('ABC123')).toBe(false);
    });
  });

  describe('emitPlayerStatusChanged (AC 4 — rotation)', () => {
    it('emits a typed status event plus the refreshed snapshot', async () => {
      const { io, emitted } = makeFakeIo();
      setIo(io);
      findUniqueSession.mockResolvedValue(SESSION);
      findUniquePlayer.mockResolvedValue({ id: 'p1', name: 'Ann', status: 'RESTING' });

      await emitPlayerStatusChanged('ABC123', 'p1', 'RESTING');

      const statusEvent = emitted.find((e) => e.event === 'session:player-status-changed');
      expect(statusEvent).toBeDefined();
      expect(statusEvent!.payload).toMatchObject({
        shareCode: 'ABC123',
        playerId: 'p1',
        status: 'RESTING',
      });
      expect(emitted.some((e) => e.event === 'mvp-session-updated')).toBe(true);
    });

    it('emits nothing when the player row does not exist', async () => {
      const { io, emitted } = makeFakeIo();
      setIo(io);
      findUniquePlayer.mockResolvedValue(null);

      await emitPlayerStatusChanged('ABC123', 'ghost', 'RESTING');

      expect(emitted).toHaveLength(0);
    });
  });

  describe('emitScoreUpdated (AC 4 — scoring)', () => {
    it('reads scores back from the persisted game', async () => {
      const { io, emitted } = makeFakeIo();
      setIo(io);
      findUniqueSession.mockResolvedValue(SESSION);
      findUniqueGame.mockResolvedValue({
        id: 'g1',
        matchId: 'm1',
        gameNumber: 2,
        team1Player1: 'A',
        team1Player2: 'B',
        team2Player1: 'C',
        team2Player2: 'D',
        team1FinalScore: 21,
        team2FinalScore: 19,
        winnerTeam: 1,
      });

      await emitScoreUpdated('ABC123', 'g1');

      const scoreEvent = emitted.find((e) => e.event === 'session:score-updated');
      expect(scoreEvent).toBeDefined();
      expect(scoreEvent!.payload).toMatchObject({
        shareCode: 'ABC123',
        gameId: 'g1',
        team1FinalScore: 21,
        team2FinalScore: 19,
        winnerTeam: 1,
      });
      // Snapshot must be refreshed alongside the score event.
      expect(emitted.some((e) => e.event === 'mvp-session-updated')).toBe(true);
    });

    it('emits nothing for a missing game', async () => {
      const { io, emitted } = makeFakeIo();
      setIo(io);
      findUniqueGame.mockResolvedValue(null);

      await emitScoreUpdated('ABC123', 'nope');

      expect(emitted).toHaveLength(0);
    });
  });

  describe('emitPlayerJoined / emitPlayerLeft', () => {
    it('emits player-joined with the persisted player', async () => {
      const { io, emitted } = makeFakeIo();
      setIo(io);
      findUniqueSession.mockResolvedValue(SESSION);
      findUniquePlayer.mockResolvedValue({ id: 'p2', name: 'Bo', status: 'ACTIVE' });

      await emitPlayerJoined('ABC123', 'p2');

      const joined = emitted.find((e) => e.event === 'session:player-joined');
      expect(joined!.payload).toMatchObject({ shareCode: 'ABC123' });
      expect(joined!.payload.player).toMatchObject({ id: 'p2', name: 'Bo' });
    });

    it('emits player-left with the player id', async () => {
      const { io, emitted } = makeFakeIo();
      setIo(io);
      findUniqueSession.mockResolvedValue(SESSION);

      await emitPlayerLeft('ABC123', 'p2');

      const left = emitted.find((e) => e.event === 'session:player-left');
      expect(left!.payload).toMatchObject({ shareCode: 'ABC123', playerId: 'p2' });
    });
  });

  describe('invalidateSessionCache (AC 7 — cache/socket consistency)', () => {
    it('invalidates the session cache domain', async () => {
      invalidateSession.mockResolvedValue(undefined);
      await invalidateSessionCache('ABC123');
      expect(invalidateSession).toHaveBeenCalledWith('ABC123');
    });

    it('swallows cache errors so the real-time path never breaks (AC 7)', async () => {
      invalidateSession.mockRejectedValue(new Error('cache down'));
      await expect(invalidateSessionCache('ABC123')).resolves.toBeUndefined();
    });
  });

  describe('tournament emitters (AC 3 — placeholder replaced)', () => {
    it('loadBracket returns the mapped rounds', async () => {
      findManyRounds.mockResolvedValue([
        {
          roundNumber: 1,
          roundName: 'Quarter Finals',
          matches: [
            {
              id: 'm1',
              player1: { id: 'a', playerName: 'A' },
              player2: { id: 'b', playerName: 'B' },
              winnerId: null,
              status: 'SCHEDULED',
            },
          ],
        },
      ]);

      const rounds = await loadBracket('t1');

      expect(rounds).toHaveLength(1);
      expect(rounds[0]).toMatchObject({ roundNumber: 1, name: 'Quarter Finals' });
      expect(rounds[0].matches[0]).toMatchObject({ id: 'm1', status: 'SCHEDULED' });
    });

    it('emitBracketUpdate sends the bracket to the tournament room', async () => {
      const { io, emitted } = makeFakeIo();
      setIo(io);
      findManyRounds.mockResolvedValue([]);

      await emitBracketUpdate('t1');

      expect(emitted).toHaveLength(1);
      expect(emitted[0].room).toBe(tournamentRoom('t1'));
      expect(emitted[0].event).toBe('tournament:bracket');
    });

    it('emitMatchComplete sends match-complete and a fresh bracket (AC 3)', async () => {
      const { io, emitted } = makeFakeIo();
      setIo(io);
      findUniqueMatch.mockResolvedValue({
        id: 'm1',
        roundId: 'r1',
        player1: { id: 'a', playerName: 'A' },
        player2: { id: 'b', playerName: 'B' },
        winnerId: 'a',
        status: 'COMPLETED',
      });
      findManyRounds.mockResolvedValue([]);

      await emitMatchComplete('t1', 'm1');

      const events = emitted.map((e) => e.event);
      expect(events).toContain('tournament:match-complete');
      expect(events).toContain('tournament:bracket');
      expect(emitted.every((e) => e.room === tournamentRoom('t1'))).toBe(true);
    });

    it('emitMatchComplete emits nothing for a missing match', async () => {
      const { io, emitted } = makeFakeIo();
      setIo(io);
      findUniqueMatch.mockResolvedValue(null);

      await emitMatchComplete('t1', 'ghost');

      expect(emitted).toHaveLength(0);
    });

    it('emitLeaderboardUpdate derives standings from tournament players (AC 3)', async () => {
      const { io, emitted } = makeFakeIo();
      setIo(io);
      findManyPlayers.mockResolvedValue([
        { id: 'p2', playerName: 'Bo', seed: 2, winRate: 0.9, totalMatches: 5, isEliminated: false, finalRank: null, status: 'ACTIVE' },
        { id: 'p1', playerName: 'Ann', seed: 1, winRate: 0.6, totalMatches: 5, isEliminated: false, finalRank: 1, status: 'ACTIVE' },
      ]);

      await emitLeaderboardUpdate('t1');

      const lb = emitted.find((e) => e.event === 'tournament:leaderboard');
      expect(lb).toBeDefined();
      expect(lb!.room).toBe(tournamentRoom('t1'));
      // Ranked player (finalRank=1) sorts ahead of the unranked one.
      expect(lb!.payload.standings[0]).toMatchObject({ playerId: 'p1', rank: 1 });
    });
  });
});
