/**
 * Story 6.7 T03 — persistence, progression and correction (AC 3, AC 12, AC 16).
 *
 * These tests run against the **real Postgres schema** (the shared
 * `badminton_group` database), not a permissive mock: the whole point of the
 * correction work is that the *nullable* `player1Id` / `player2Id` slots and the
 * `feedMatch1Id` / `feedMatch2Id` self-relations behave correctly once persisted.
 * A mock that cannot represent the real constraint cannot prove the constraint
 * (design §0.1), so every assertion here reads the **persisted rows back**.
 *
 * Coverage:
 *   - persistBracket: structural integrity + the synthetic-id → cuid feed remap
 *     (T02 handoff #1) + `format` / `totalMatches` / `byePlayers` (handoff #2).
 *   - Full progression to completion (champion, `COMPLETED`, `finalRank`).
 *   - Idempotency — re-applying a result is a no-op and never double-fills a slot.
 *   - The three corruption modes QA reproduced: stale winner, same-upstream
 *     slots, double-record.
 *   - The `DOWNSTREAM_COMPLETED` guard and its `cascade` un-finalisation.
 *
 * Every fixture is namespaced with a unique suffix and torn down in `afterAll`.
 */

import { prisma } from '../../../config/database';
import { generateDoubleElimination, generateSingleElimination } from '../engine';
import {
  BracketError,
  applyResult,
  clearDerivedDownstream,
  correctResult,
  getBracketState,
  persistBracket,
} from '../persistence';
import type { PlayerSeed } from '../types';

jest.setTimeout(60000);

const createdTournamentIds: string[] = [];
let sequence = 0;

/** A unique, collision-free suffix for fixture names (concurrent suites share the DB). */
function uniqueSuffix(): string {
  sequence += 1;
  return `${Date.now()}-${process.pid}-${sequence}`;
}

interface Fixture {
  tournamentId: string;
  players: PlayerSeed[];
  /** `TournamentPlayer.id` → seed (1 = strongest). */
  seedOf: Map<string, number>;
}

async function createTournament(
  playerCount: number,
  tournamentType: 'SINGLE_ELIMINATION' | 'DOUBLE_ELIMINATION' = 'SINGLE_ELIMINATION',
): Promise<Fixture> {
  const suffix = uniqueSuffix();
  const tournament = await prisma.tournament.create({
    data: {
      name: `T03-correction-${suffix}`,
      organizer: 'T03-test-organizer',
      startDate: new Date(),
      registrationDeadline: new Date(),
      maxPlayers: playerCount,
      tournamentType,
    },
  });
  createdTournamentIds.push(tournament.id);

  const players: PlayerSeed[] = [];
  const seedOf = new Map<string, number>();
  for (let index = 1; index <= playerCount; index += 1) {
    const row = await prisma.tournamentPlayer.create({
      data: {
        tournamentId: tournament.id,
        playerName: `P${index}-${suffix}`,
        seed: index,
      },
    });
    players.push({ id: row.id, name: row.playerName, seed: index });
    seedOf.set(row.id, index);
  }

  return { tournamentId: tournament.id, players, seedOf };
}

async function persistSingleElimination(fixture: Fixture): Promise<void> {
  const bracket = generateSingleElimination({
    tournamentId: fixture.tournamentId,
    players: fixture.players,
    tournamentType: 'SINGLE_ELIMINATION',
  });
  await persistBracket(bracket);
}

async function loadMatches(tournamentId: string) {
  return prisma.tournamentMatch.findMany({
    where: { tournamentId },
    include: { round: true },
    orderBy: [{ round: { roundNumber: 'asc' } }, { matchNumber: 'asc' }],
  });
}

type MatchRow = Awaited<ReturnType<typeof loadMatches>>[number];

/** The winner when the stronger (lower) seed always wins. */
function lowerSeedWins(player1Id: string, player2Id: string, seedOf: Map<string, number>): string {
  const seed1 = seedOf.get(player1Id) ?? Number.POSITIVE_INFINITY;
  const seed2 = seedOf.get(player2Id) ?? Number.POSITIVE_INFINITY;
  return seed1 <= seed2 ? player1Id : player2Id;
}

/** Play every playable match in the earliest round that still has one. */
async function playNextRound(tournamentId: string, seedOf: Map<string, number>): Promise<number> {
  const matches = await loadMatches(tournamentId);
  const playable = matches.filter(
    (match) => match.player1Id && match.player2Id && match.status !== 'COMPLETED',
  );
  if (playable.length === 0) return 0;

  const earliestRound = playable[0].round?.roundNumber;
  const inRound = playable.filter((match) => match.round?.roundNumber === earliestRound);
  for (const match of inRound) {
    await applyResult(match.id, lowerSeedWins(match.player1Id as string, match.player2Id as string, seedOf));
  }
  return inRound.length;
}

/** Drive the bracket to completion (bounded, so a bug can never hang the suite). */
async function playThrough(tournamentId: string, seedOf: Map<string, number>): Promise<void> {
  for (let guard = 0; guard < 64; guard += 1) {
    const played = await playNextRound(tournamentId, seedOf);
    if (played === 0) return;
  }
  throw new Error('playThrough did not terminate — bracket progression is stuck');
}

/** The subset of a match row that progression is allowed to change. */
function stateOf(match: MatchRow) {
  return {
    id: match.id,
    player1Id: match.player1Id,
    player2Id: match.player2Id,
    winnerId: match.winnerId,
    status: match.status,
  };
}

afterAll(async () => {
  for (const id of createdTournamentIds) {
    await prisma.tournamentAnalytics.deleteMany({ where: { tournamentId: id } }).catch(() => undefined);
    await prisma.tournamentFeedback.deleteMany({ where: { tournamentId: id } }).catch(() => undefined);
    await prisma.tournament.delete({ where: { id } }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

describe('persistBracket — structural integrity (AC 3, nullable-slot path)', () => {
  it('resolves every feed link to a real stored row (synthetic-id remap, handoff #1)', async () => {
    const fixture = await createTournament(8);
    await persistSingleElimination(fixture);

    const matches = await loadMatches(fixture.tournamentId);
    expect(matches).toHaveLength(7); // 8-player single elimination

    const storedIds = new Set(matches.map((match) => match.id));
    const withFeeds = matches.filter((match) => match.feedMatch1Id || match.feedMatch2Id);
    expect(withFeeds).toHaveLength(3); // round 2 (2 matches) + the final (1)

    for (const match of withFeeds) {
      for (const feed of [match.feedMatch1Id, match.feedMatch2Id]) {
        if (!feed) continue;
        // Resolves to a row in THIS tournament — not a dangling synthetic id.
        expect(storedIds.has(feed)).toBe(true);
        expect(feed).not.toContain('-WINNERS-R');
      }
    }

    // Round 1 has no feeders at all.
    const round1 = matches.filter((match) => match.round?.roundNumber === 1);
    expect(round1.every((match) => !match.feedMatch1Id && !match.feedMatch2Id)).toBe(true);
  });

  it('persists future-round placeholders as PENDING with null slots', async () => {
    const fixture = await createTournament(8);
    await persistSingleElimination(fixture);

    const state = await getBracketState(fixture.tournamentId);
    expect(state).not.toBeNull();
    expect(state?.bracket[1]).toHaveLength(2);
    for (const match of state?.bracket[1] ?? []) {
      expect(match.player1Id).toBeNull();
      expect(match.player2Id).toBeNull();
      expect(match.status).toBe('PENDING');
    }
  });

  it('populates format, totalMatches and byePlayers (handoff #2)', async () => {
    const fixture = await createTournament(5);
    await persistSingleElimination(fixture);

    const state = await getBracketState(fixture.tournamentId);
    expect(state).not.toBeNull();
    expect(state?.format).toBe('SINGLE_ELIMINATION');
    expect(state?.totalMatches).toBe(7); // padded to 8 slots → 7 match nodes
    expect(state?.totalPlayers).toBe(5);
    expect(state?.byePlayers).toHaveLength(3); // 8 − 5
    // Byes go to the top seeds, highest seed first.
    expect(state?.byePlayers.map((id) => fixture.seedOf.get(id))).toEqual([1, 2, 3]);
  });

  it('remaps feed links across bracket sides (double elimination, handoff #1)', async () => {
    const fixture = await createTournament(8, 'DOUBLE_ELIMINATION');
    const bracket = generateDoubleElimination({
      tournamentId: fixture.tournamentId,
      players: fixture.players,
      tournamentType: 'DOUBLE_ELIMINATION',
    });
    await persistBracket(bracket);

    const matches = await loadMatches(fixture.tournamentId);
    expect(matches).toHaveLength(14); // 2n − 2

    const storedIds = new Set(matches.map((match) => match.id));
    for (const match of matches) {
      for (const feed of [match.feedMatch1Id, match.feedMatch2Id]) {
        if (!feed) continue;
        // Every cross-side feed link resolves to a real stored row (never a
        // synthetic `…-R<n>-M<m>` id).
        expect(storedIds.has(feed)).toBe(true);
        expect(feed).not.toMatch(/-R\d+-M\d+$/);
      }
    }

    const state = await getBracketState(fixture.tournamentId);
    const grandFinal = state?.bracket[(state?.bracket.length ?? 0) - 1][0];
    expect(grandFinal?.bracket).toBe('GRAND_FINAL');
    expect(grandFinal?.feedMatch1Id).not.toBeNull();
    expect(grandFinal?.feedMatch2Id).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Progression
// ---------------------------------------------------------------------------

describe('progression (AC 3, AC 11)', () => {
  it('plays an 8-player bracket to completion', async () => {
    const fixture = await createTournament(8);
    await persistSingleElimination(fixture);
    await playThrough(fixture.tournamentId, fixture.seedOf);

    const state = await getBracketState(fixture.tournamentId);
    expect(state?.isComplete).toBe(true);

    const result = await prisma.tournamentResult.findUnique({
      where: { tournamentId: fixture.tournamentId },
    });
    expect(result).not.toBeNull();

    // Lower-seed-wins ⇒ seed 1 takes the title.
    const championId = fixture.players[0].id;
    expect(result?.winnerId).toBe(championId);

    const tournament = await prisma.tournament.findUnique({ where: { id: fixture.tournamentId } });
    expect(tournament?.status).toBe('COMPLETED');

    const champion = await prisma.tournamentPlayer.findUnique({ where: { id: championId } });
    expect(champion?.finalRank).toBe(1);
  });

  it('rejects a result for a placeholder match or a non-occupant winner', async () => {
    const fixture = await createTournament(8);
    await persistSingleElimination(fixture);

    const matches = await loadMatches(fixture.tournamentId);
    const round2 = matches.filter((match) => match.round?.roundNumber === 2)[0];
    const round1 = matches.filter((match) => match.round?.roundNumber === 1)[0];

    // A round-2 placeholder has no players yet.
    await expect(applyResult(round2.id, 'someone')).rejects.toMatchObject({
      code: 'MATCH_NOT_READY',
      statusCode: 400,
    });

    // A winner who is not one of the two occupants is refused.
    await expect(applyResult(round1.id, 'not-a-player')).rejects.toMatchObject({
      code: 'INVALID_WINNER',
      statusCode: 400,
    });
  });
});

// ---------------------------------------------------------------------------
// Idempotency (corruption mode iii — double-record)
// ---------------------------------------------------------------------------

describe('idempotency — recording the same result twice', () => {
  it('is a no-op and never places one player in both slots', async () => {
    const fixture = await createTournament(8);
    await persistSingleElimination(fixture);
    await playNextRound(fixture.tournamentId, fixture.seedOf); // round 1

    const matches = await loadMatches(fixture.tournamentId);
    const semifinal = matches.filter((match) => match.round?.roundNumber === 2)[0];
    const winner = lowerSeedWins(
      semifinal.player1Id as string,
      semifinal.player2Id as string,
      fixture.seedOf,
    );

    await applyResult(semifinal.id, winner);
    const afterFirst = await loadMatches(fixture.tournamentId);

    // Record the exact same result again.
    await applyResult(semifinal.id, winner);
    const afterSecond = await loadMatches(fixture.tournamentId);

    expect(afterSecond.map(stateOf)).toEqual(afterFirst.map(stateOf));

    // Corruption mode (iii): the same player must never occupy both slots.
    for (const match of afterSecond) {
      if (match.player1Id && match.player2Id) {
        expect(match.player1Id).not.toBe(match.player2Id);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Correction (AC 12)
// ---------------------------------------------------------------------------

describe('correctResult — the three QA-reproduced corruption modes', () => {
  it('mode (i): a corrected result removes the stale winner downstream', async () => {
    const fixture = await createTournament(8);
    await persistSingleElimination(fixture);
    await playNextRound(fixture.tournamentId, fixture.seedOf); // round 1

    const matches = await loadMatches(fixture.tournamentId);
    const semifinal = matches.filter((match) => match.round?.roundNumber === 2)[0];
    const finalMatch = matches.filter((match) => match.round?.roundNumber === 3)[0];

    const staleWinner = lowerSeedWins(
      semifinal.player1Id as string,
      semifinal.player2Id as string,
      fixture.seedOf,
    );
    const trueWinner =
      semifinal.player1Id === staleWinner ? (semifinal.player2Id as string) : (semifinal.player1Id as string);

    await applyResult(semifinal.id, staleWinner);
    let final = (await loadMatches(fixture.tournamentId)).find((m) => m.id === finalMatch.id);
    expect([final?.player1Id, final?.player2Id]).toContain(staleWinner);

    const correction = await correctResult(semifinal.id, trueWinner, 'recorded the wrong player');
    expect(correction.recomputed).toBe(true);
    expect(correction.previousWinnerId).toBe(staleWinner);
    expect(correction.winnerId).toBe(trueWinner);
    expect(correction.clearedDownstreamMatchIds).toContain(finalMatch.id);

    final = (await loadMatches(fixture.tournamentId)).find((m) => m.id === finalMatch.id);
    // The stale winner is gone; the true winner is in the final.
    expect([final?.player1Id, final?.player2Id]).not.toContain(staleWinner);
    expect([final?.player1Id, final?.player2Id]).toContain(trueWinner);

    // Audit trail (AC 12).
    const corrected = (await loadMatches(fixture.tournamentId)).find((m) => m.id === semifinal.id);
    expect(corrected?.correctionReason).toBe('recorded the wrong player');
    expect(corrected?.correctedAt).not.toBeNull();
  });

  it('mode (ii): a match is never filled from a single upstream match', async () => {
    const fixture = await createTournament(8);
    await persistSingleElimination(fixture);

    // Structurally, a match's two declared feeders are always different matches.
    for (const match of await loadMatches(fixture.tournamentId)) {
      if (match.feedMatch1Id && match.feedMatch2Id) {
        expect(match.feedMatch1Id).not.toBe(match.feedMatch2Id);
      }
    }

    await playThrough(fixture.tournamentId, fixture.seedOf);

    const played = await loadMatches(fixture.tournamentId);
    for (const match of played) {
      if (match.player1Id && match.player2Id) {
        expect(match.player1Id).not.toBe(match.player2Id);
        // The two occupants arrived from two different feeders.
        if (match.feedMatch1Id && match.feedMatch2Id) {
          const feeder1 = played.find((m) => m.id === match.feedMatch1Id);
          const feeder2 = played.find((m) => m.id === match.feedMatch2Id);
          expect(feeder1?.winnerId).not.toBe(feeder2?.winnerId);
        }
      }
    }
  });

  it('guard: refuses a correction with completed downstream matches unless cascade, then un-finalises', async () => {
    const fixture = await createTournament(8);
    await persistSingleElimination(fixture);
    await playThrough(fixture.tournamentId, fixture.seedOf); // fully complete

    const matches = await loadMatches(fixture.tournamentId);
    const first = matches.filter((match) => match.round?.roundNumber === 1)[0];
    const other =
      first.player1Id === first.winnerId ? (first.player2Id as string) : (first.player1Id as string);

    // Without cascade the correction is refused with an actionable error.
    await expect(correctResult(first.id, other, 'wrong')).rejects.toMatchObject({
      code: 'DOWNSTREAM_COMPLETED',
      statusCode: 409,
    });

    // With cascade the downstream results are voided and the tournament reverts.
    const correction = await correctResult(first.id, other, 'wrong', true);
    expect(correction.cascade).toBe(true);
    expect(correction.clearedDownstreamMatchIds.length).toBeGreaterThan(0);

    const result = await prisma.tournamentResult.findUnique({
      where: { tournamentId: fixture.tournamentId },
    });
    expect(result).toBeNull();

    const tournament = await prisma.tournament.findUnique({ where: { id: fixture.tournamentId } });
    expect(tournament?.status).toBe('IN_PROGRESS');

    const final = (await loadMatches(fixture.tournamentId)).find(
      (match) => match.round?.roundNumber === 3,
    );
    expect(final?.winnerId).toBeNull();
  });

  it('clearDerivedDownstream voids a subtree and re-projects', async () => {
    const fixture = await createTournament(8);
    await persistSingleElimination(fixture);
    await playThrough(fixture.tournamentId, fixture.seedOf); // fully complete

    const matches = await loadMatches(fixture.tournamentId);
    const first = matches.filter((match) => match.round?.roundNumber === 1)[0];
    const finalMatch = matches.filter((match) => match.round?.roundNumber === 3)[0];
    // The semifinal this round-1 match feeds (downstream of `first`).
    const fedSemifinal = matches.find(
      (match) => match.feedMatch1Id === first.id || match.feedMatch2Id === first.id,
    );

    const cleared = await clearDerivedDownstream(fixture.tournamentId, first.id);
    expect(cleared).toContain(fedSemifinal?.id);
    expect(cleared).toContain(finalMatch.id);
    // The corrected match itself is not downstream of itself.
    expect(cleared).not.toContain(first.id);

    const final = (await loadMatches(fixture.tournamentId)).find((m) => m.id === finalMatch.id);
    expect(final?.winnerId).toBeNull();

    const result = await prisma.tournamentResult.findUnique({
      where: { tournamentId: fixture.tournamentId },
    });
    expect(result).toBeNull();
  });
});

describe('BracketError', () => {
  it('carries a code and an HTTP status', () => {
    const error = new BracketError('X', 409, 'boom');
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('X');
    expect(error.statusCode).toBe(409);
    expect(error.name).toBe('BracketError');
  });
});
