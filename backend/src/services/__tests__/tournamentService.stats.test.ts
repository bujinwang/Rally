/**
 * Story 6.11 follow-up — `getTournamentStats` producer contract.
 *
 * `frontend/Rally/src/services/tournamentApi.ts` declares `TournamentStats` and
 * `TournamentDetailScreen` renders it. That type used to declare `totalGames`,
 * `totalSets`, `currentRound` and `tournamentProgress` — none of which this
 * function has ever returned — while omitting `maxPlayers`, `completionRate` and
 * `status`, which it always returns. The screen read `tournamentProgress` and
 * rendered `Math.round(undefined)`, i.e. the literal string **"NaN%"**.
 *
 * The existing `/tournaments/:id/stats` route test (`routes/__tests__/
 * tournaments.test.ts:144`) **mocks this function** and only asserts a 200 — so
 * the real field set was never pinned and the drift went unnoticed. These tests
 * exercise the real Postgres schema and pin the contract from the producer side.
 */

import { prisma } from '../../config/database';
import { getTournamentStats } from '../tournamentService';

jest.setTimeout(60000);

const createdTournamentIds: string[] = [];
let sequence = 0;

function uniqueSuffix(): string {
  sequence += 1;
  return `${Date.now()}-${process.pid}-${sequence}`;
}

async function createTournament(opts: { maxPlayers?: number; status?: string } = {}): Promise<string> {
  const suffix = uniqueSuffix();
  const tournament = await prisma.tournament.create({
    data: {
      name: `6.11 Stats ${suffix}`,
      organizer: `6.11 Stats Organizer ${suffix}`,
      startDate: new Date(Date.now() + 86400000),
      registrationDeadline: new Date(Date.now() + 3600000),
      maxPlayers: opts.maxPlayers ?? 16,
      status: (opts.status ?? 'REGISTRATION_OPEN') as never,
    },
  });
  createdTournamentIds.push(tournament.id);
  return tournament.id;
}

async function createRound(tournamentId: string, roundNumber: number): Promise<string> {
  const round = await prisma.tournamentRound.create({
    data: {
      tournamentId,
      roundNumber,
      roundName: `Round ${roundNumber}`,
      matchesRequired: 1,
    },
  });
  return round.id;
}

async function createMatch(opts: {
  tournamentId: string;
  roundId: string | null;
  matchNumber: number;
  status?: string;
}): Promise<void> {
  await prisma.tournamentMatch.create({
    data: {
      tournamentId: opts.tournamentId,
      roundId: opts.roundId,
      matchNumber: opts.matchNumber,
      status: (opts.status ?? 'SCHEDULED') as never,
    },
  });
}

afterAll(async () => {
  for (const id of createdTournamentIds) {
    // Tournament → rounds and matches cascade; delete children first anyway so a
    // `Restrict` FK on a player slot can never block teardown.
    await prisma.tournamentMatch.deleteMany({ where: { tournamentId: id } }).catch(() => undefined);
    await prisma.tournamentRound.deleteMany({ where: { tournamentId: id } }).catch(() => undefined);
    await prisma.tournament.delete({ where: { id } }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// The contract the frontend type must mirror
// ---------------------------------------------------------------------------

/**
 * The exact field set. `TournamentStats` in `tournamentApi.ts` mirrors this list,
 * and a compile-time exhaustiveness check there ties the two together — so drift
 * on either side is a build error, not a silent `undefined` at runtime.
 */
const EXPECTED_KEYS = [
  'totalPlayers',
  'maxPlayers',
  'totalMatches',
  'completedMatches',
  'completionRate',
  'status',
].sort();

describe('getTournamentStats — field set', () => {
  it('returns exactly these six fields, and no others', async () => {
    const tournamentId = await createTournament();

    const stats = await getTournamentStats(tournamentId);

    expect(Object.keys(stats).sort()).toEqual(EXPECTED_KEYS);
  });

  it('does NOT return the four fields the frontend type used to declare', async () => {
    const tournamentId = await createTournament();

    const stats = await getTournamentStats(tournamentId) as Record<string, unknown>;

    // Named individually so a regression is obvious in the failure output rather
    // than showing up as an opaque array mismatch.
    for (const phantom of ['totalGames', 'totalSets', 'currentRound', 'tournamentProgress']) {
      expect(stats).not.toHaveProperty(phantom);
    }
  });
});

// ---------------------------------------------------------------------------
// completionRate semantics — it is a percentage, not a ratio
// ---------------------------------------------------------------------------

describe('getTournamentStats — completionRate', () => {
  it('is a percentage (0–100), not a ratio', async () => {
    const tournamentId = await createTournament();
    const roundId = await createRound(tournamentId, 1);
    await createMatch({ tournamentId, roundId, matchNumber: 1, status: 'COMPLETED' });
    await createMatch({ tournamentId, roundId, matchNumber: 2, status: 'SCHEDULED' });

    const stats = await getTournamentStats(tournamentId);

    // 1 of 2 completed. A ratio would be 0.5; the frontend renders this with a
    // literal `%` after `Math.round`, so 0.5 would display as "1%".
    expect(stats.totalMatches).toBe(2);
    expect(stats.completedMatches).toBe(1);
    expect(stats.completionRate).toBe(50);
  });

  it('is 0 — not NaN — when there are no matches at all', async () => {
    const tournamentId = await createTournament();

    const stats = await getTournamentStats(tournamentId);

    // The divide-by-zero branch. `Math.round(0)` renders "0%"; the old code
    // rendered "NaN%" because the field did not exist.
    expect(stats.totalMatches).toBe(0);
    expect(stats.completionRate).toBe(0);
    expect(Number.isFinite(stats.completionRate)).toBe(true);
  });

  it('is 100 when every match is complete', async () => {
    const tournamentId = await createTournament();
    const roundId = await createRound(tournamentId, 1);
    await createMatch({ tournamentId, roundId, matchNumber: 1, status: 'COMPLETED' });
    await createMatch({ tournamentId, roundId, matchNumber: 2, status: 'COMPLETED' });

    const stats = await getTournamentStats(tournamentId);

    expect(stats.completionRate).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Pass-through fields
// ---------------------------------------------------------------------------

describe('getTournamentStats — pass-through', () => {
  it('reports maxPlayers and status straight from the tournament row', async () => {
    const tournamentId = await createTournament({ maxPlayers: 32, status: 'IN_PROGRESS' });

    const stats = await getTournamentStats(tournamentId);

    expect(stats.maxPlayers).toBe(32);
    expect(stats.status).toBe('IN_PROGRESS');
    expect(stats.totalPlayers).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// KNOWN GAP — round-less matches are invisible to these numbers
// ---------------------------------------------------------------------------

describe('getTournamentStats — round-less matches are excluded (KNOWN GAP)', () => {
  /**
   * `getTournamentStats` derives both counts by folding over
   * `tournament.rounds[].matches` (`services/tournamentService.ts:392-395`), so a
   * match whose `roundId` is NULL is never counted.
   *
   * That is reachable: `services/bracket/persistence.ts:279` writes
   * `roundId: roundIdByNumber.get(match.round) ?? null`, so any bracket match
   * whose round number has no `tournament_rounds` row is persisted **without a
   * round** — and then silently disappears from Total Matches, Completed, and the
   * Progress percentage.
   *
   * Pinned rather than fixed: changing the number a user sees is a product call,
   * and the alternative (count all matches for the tournament) would change
   * `completionRate` for existing tournaments. Flagged in 6.11.design.md §9.
   */
  it('a match with a NULL roundId does not count toward totalMatches', async () => {
    const tournamentId = await createTournament();
    const roundId = await createRound(tournamentId, 1);
    await createMatch({ tournamentId, roundId, matchNumber: 1, status: 'COMPLETED' });
    await createMatch({ tournamentId, roundId, matchNumber: 2, status: 'SCHEDULED' });
    // Third match, deliberately round-less.
    await createMatch({ tournamentId, roundId: null, matchNumber: 3, status: 'COMPLETED' });

    const dbCount = await prisma.tournamentMatch.count({ where: { tournamentId } });
    const stats = await getTournamentStats(tournamentId);

    // The rows really are in the database…
    expect(dbCount).toBe(3);
    // …but only the two round-scoped ones are reported.
    expect(stats.totalMatches).toBe(2);
    expect(stats.completedMatches).toBe(1);
    expect(stats.completionRate).toBe(50);
  });
});
