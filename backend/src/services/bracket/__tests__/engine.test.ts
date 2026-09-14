/**
 * Story 6.7 T02 — bracket engine tests (design §7 items 1–4).
 *
 * These assert the *properties* the story requires rather than the incidental
 * output of one implementation, so they stay meaningful if the generator is
 * refactored. Every claim the story makes about the old generators being broken
 * has a corresponding assertion here that the new engine satisfies it.
 */
import * as fs from 'fs';
import * as path from 'path';

import {
  generateDoubleElimination,
  generateRoundRobin,
  generateSingleElimination,
  generateSwiss,
  getBracketRoundName,
  getRoundName,
  hashStringToSeed,
  isPowerOfTwo,
  losersRoundCounts,
  mulberry32,
  nextPowerOfTwo,
  roundRobinRounds,
  seededShuffle,
  sortPlayersForSeeding,
  standardSeedingOrder,
  validateBracket,
} from '../engine';
import type { BracketGenerationOptions, PlayerSeed, TournamentBracket } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Players whose id is `p<seed>` and whose seed is that same number. */
function seededPlayers(count: number): PlayerSeed[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
    seed: index + 1,
  }));
}

function options(
  players: PlayerSeed[],
  tournamentType: BracketGenerationOptions['tournamentType'],
  extra: Partial<BracketGenerationOptions> = {},
): BracketGenerationOptions {
  return { tournamentId: 't1', players, tournamentType, ...extra };
}

/** Numeric part of a `p<n>` id, for deterministic winner selection. */
function seedOf(id: string | null): number {
  if (!id) return Number.POSITIVE_INFINITY;
  const digits = id.replace(/\D/g, '');
  return digits ? Number(digits) : Number.POSITIVE_INFINITY;
}

/** Deep clone of a plain bracket object, for mutation in negative tests. */
function clone(bracket: TournamentBracket): TournamentBracket {
  return JSON.parse(JSON.stringify(bracket)) as TournamentBracket;
}

/**
 * Unordered key for a pairing, ordered by *numeric* id.
 *
 * A plain `.sort()` on `p5`/`p13` compares lexicographically and puts `p13`
 * first, which would make two-digit fields look like they had wrong pairings.
 */
function pairKey(a: string, b: string): string {
  return seedOf(a) <= seedOf(b) ? `${a}|${b}` : `${b}|${a}`;
}

/** Round-1 matches paired as an unordered `Set` of `a|b` keys. */
function roundOnePairSet(bracket: TournamentBracket): Set<string> {
  return new Set(
    bracket.bracket[0].map((match) => pairKey(match.player1Id ?? 'EMPTY', match.player2Id ?? 'EMPTY')),
  );
}

/** Every pairing in a bracket, as unordered keys. */
function allPairKeys(bracket: TournamentBracket): string[] {
  return bracket.bracket
    .flat()
    .filter((match) => match.player1Id !== null && match.player2Id !== null)
    .map((match) => pairKey(match.player1Id as string, match.player2Id as string));
}

/**
 * Remove comments before scanning for forbidden calls, so documentation that
 * *mentions* a forbidden API is not mistaken for a use of it.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const ALL_FIELD_SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 15, 16, 17, 31, 32, 64];

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

describe('numeric helpers', () => {
  it('nextPowerOfTwo rounds up to a power of two', () => {
    expect(nextPowerOfTwo(1)).toBe(1);
    expect(nextPowerOfTwo(2)).toBe(2);
    expect(nextPowerOfTwo(3)).toBe(4);
    expect(nextPowerOfTwo(4)).toBe(4);
    expect(nextPowerOfTwo(5)).toBe(8);
    expect(nextPowerOfTwo(17)).toBe(32);
    expect(nextPowerOfTwo(64)).toBe(64);
    expect(nextPowerOfTwo(65)).toBe(128);
  });

  it('isPowerOfTwo accepts only positive powers of two', () => {
    for (const value of [1, 2, 4, 8, 16, 64]) expect(isPowerOfTwo(value)).toBe(true);
    for (const value of [0, -1, 3, 5, 6, 15, 17, 1.5]) expect(isPowerOfTwo(value)).toBe(false);
  });
});

describe('getRoundName', () => {
  it('names rounds relative to the bracket size, not by absolute round number', () => {
    // 8-player bracket: 3 rounds.
    expect(getRoundName(1, 3)).toBe('Quarter Finals');
    expect(getRoundName(2, 3)).toBe('Semi Finals');
    expect(getRoundName(3, 3)).toBe('Finals');
  });

  it('handles a 2-player bracket and larger fields', () => {
    expect(getRoundName(1, 1)).toBe('Finals');
    expect(getRoundName(1, 2)).toBe('Semi Finals');
    expect(getRoundName(1, 4)).toBe('Round of 16');
    expect(getRoundName(2, 4)).toBe('Quarter Finals');
    expect(getRoundName(1, 6)).toBe('Round of 64');
    expect(getRoundName(4, 6)).toBe('Quarter Finals');
    expect(getRoundName(6, 6)).toBe('Finals');
  });

  it('degrades safely out of range', () => {
    expect(getRoundName(5, 3)).toBe('Round 5');
    expect(getRoundName(0, 3)).toBe('Round 0');
  });

  it('names losers and grand-final rounds', () => {
    expect(getBracketRoundName('WINNERS', 1, 3)).toBe('Quarter Finals');
    expect(getBracketRoundName('LOSERS', 2, 3)).toBe('Losers Round 2');
    expect(getBracketRoundName('GRAND_FINAL', 8, 3)).toBe('Grand Final');
  });
});

// ---------------------------------------------------------------------------
// Seeding (design §1 D3) — the defect the story names first
// ---------------------------------------------------------------------------

describe('standard seeding', () => {
  it('pairs seed s with seed size+1-s in round 1', () => {
    for (const size of [2, 4, 8, 16, 32, 64]) {
      const order = standardSeedingOrder(size);
      expect(order).toHaveLength(size);
      expect(new Set(order).size).toBe(size);
      for (let i = 0; i < size; i += 2) {
        expect(order[i] + order[i + 1]).toBe(size + 1);
      }
    }
  });

  it('keeps the top two seeds in opposite halves so they can only meet in the final', () => {
    for (const size of [2, 4, 8, 16, 32, 64]) {
      const order = standardSeedingOrder(size);
      const rounds = Math.log2(size);
      const positionOfSeed1 = order.indexOf(1);
      const positionOfSeed2 = order.indexOf(2);
      expect(positionOfSeed1).not.toBe(positionOfSeed2);
      // At every level below the final they must be in different sub-brackets.
      for (let level = 1; level < rounds; level += 1) {
        const groupSize = Math.pow(2, level);
        expect(Math.floor(positionOfSeed1 / groupSize)).not.toBe(
          Math.floor(positionOfSeed2 / groupSize),
        );
      }
    }
  });

  it('rejects a non-power-of-two size rather than silently mis-seeding', () => {
    expect(() => standardSeedingOrder(6)).toThrow(/power of two/);
  });

  it('produces the standard pairing set for 8 players (1v8 4v5 3v6 2v7)', () => {
    const bracket = generateSingleElimination(options(seededPlayers(8), 'SINGLE_ELIMINATION'));
    expect(roundOnePairSet(bracket)).toEqual(
      new Set(['p1|p8', 'p4|p5', 'p3|p6', 'p2|p7']),
    );
  });

  it('produces the standard pairing set for 16 players', () => {
    const bracket = generateSingleElimination(options(seededPlayers(16), 'SINGLE_ELIMINATION'));
    expect(roundOnePairSet(bracket)).toEqual(
      new Set([
        'p1|p16', 'p8|p9', 'p4|p13', 'p5|p12',
        'p2|p15', 'p7|p10', 'p3|p14', 'p6|p11',
      ]),
    );
  });

  it('does NOT reproduce the old degenerate 1v2 3v4 5v6 7v8 pairing', () => {
    const bracket = generateSingleElimination(options(seededPlayers(8), 'SINGLE_ELIMINATION'));
    expect(roundOnePairSet(bracket)).not.toEqual(
      new Set(['p1|p2', 'p3|p4', 'p5|p6', 'p7|p8']),
    );
  });
});

describe('sortPlayersForSeeding', () => {
  it('orders by seed, then winRate desc, then totalMatches desc, then name asc', () => {
    const players: PlayerSeed[] = [
      { id: 'c', name: 'Charlie', seed: 3 },
      { id: 'a', name: 'Alice', seed: 1 },
      { id: 'b', name: 'Bob', seed: 2, winRate: 0.9 },
      { id: 'e', name: 'Eve', seed: 2, winRate: 0.9, totalMatches: 10 },
      { id: 'd', name: 'Dave', seed: 2, winRate: 0.9, totalMatches: 10 },
    ];
    expect(sortPlayersForSeeding(players).map((p) => p.id)).toEqual(['a', 'd', 'e', 'b', 'c']);
  });

  it('is a total order: identical names still sort deterministically by id', () => {
    const players: PlayerSeed[] = [
      { id: 'z', name: 'Same' },
      { id: 'a', name: 'Same' },
      { id: 'm', name: 'Same' },
    ];
    expect(sortPlayersForSeeding(players).map((p) => p.id)).toEqual(['a', 'm', 'z']);
  });

  it('does not mutate its input', () => {
    const players = seededPlayers(4);
    const before = JSON.stringify(players);
    sortPlayersForSeeding(players);
    expect(JSON.stringify(players)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// AC 9 — correctness matrix
// ---------------------------------------------------------------------------

describe('AC 9 — single-elimination correctness matrix', () => {
  it.each(ALL_FIELD_SIZES)('n=%i produces a structurally valid bracket', (n) => {
    const bracket = generateSingleElimination(options(seededPlayers(n), 'SINGLE_ELIMINATION'));

    // ceil(log2 n) rounds.
    expect(bracket.totalRounds).toBe(Math.ceil(Math.log2(n)));
    expect(bracket.bracket).toHaveLength(bracket.totalRounds);
    expect(bracket.totalPlayers).toBe(n);

    // Round sizes 2^(R-r).
    bracket.bracket.forEach((roundMatches, index) => {
      expect(roundMatches).toHaveLength(Math.pow(2, bracket.totalRounds - (index + 1)));
    });

    // Zero bye-vs-bye matches in round 1 (the phantom-match defect).
    for (const match of bracket.bracket[0]) {
      expect(match.player1Id === null && match.player2Id === null).toBe(false);
    }

    // n-1 real matches.
    expect(bracket.totalMatches - bracket.byePlayers.length).toBe(n - 1);
    expect(bracket.totalMatches).toBe(nextPowerOfTwo(n) - 1);

    // Byes go to the highest seeds, in seed order.
    const byeCount = nextPowerOfTwo(n) - n;
    expect(bracket.byePlayers).toEqual(
      Array.from({ length: byeCount }, (_, index) => `p${index + 1}`),
    );

    // Every non-bye slot holds a distinct player, and every player appears.
    const placed = bracket.bracket[0].flatMap((match) =>
      [match.player1Id, match.player2Id].filter((id): id is string => id !== null),
    );
    expect(new Set(placed).size).toBe(placed.length);
    expect(new Set(placed).size).toBe(n);

    // The engine's own validator agrees.
    const result = validateBracket(bracket);
    expect(result.errors).toEqual([]);
    expect(result.isValid).toBe(true);
  });

  it('a bye match holds exactly one player and is already advanced', () => {
    const bracket = generateSingleElimination(options(seededPlayers(5), 'SINGLE_ELIMINATION'));
    const byeMatches = bracket.bracket[0].filter((match) => match.status === 'BYE');
    expect(byeMatches).toHaveLength(3);
    for (const match of byeMatches) {
      const filled = [match.player1Id, match.player2Id].filter((id) => id !== null);
      expect(filled).toHaveLength(1);
      expect(match.winnerId).toBe(filled[0]);
    }
    // The 4v5 match is the only real first-round match.
    const realMatches = bracket.bracket[0].filter((match) => match.status !== 'BYE');
    expect(realMatches).toHaveLength(1);
    expect([realMatches[0].player1Id, realMatches[0].player2Id].sort()).toEqual(['p4', 'p5']);
  });

  it('rejects a field smaller than 2', () => {
    expect(() => generateSingleElimination(options(seededPlayers(1), 'SINGLE_ELIMINATION'))).toThrow(
      /at least 2 players/,
    );
    expect(() => generateSingleElimination(options([], 'SINGLE_ELIMINATION'))).toThrow(
      /at least 2 players/,
    );
  });
});

// ---------------------------------------------------------------------------
// AC 13 — determinism
// ---------------------------------------------------------------------------

describe('AC 13 — determinism', () => {
  it('same inputs + same seed produce deep-equal brackets', () => {
    for (const type of [
      'SINGLE_ELIMINATION',
      'DOUBLE_ELIMINATION',
      'ROUND_ROBIN',
      'SWISS',
    ] as const) {
      const n = type === 'DOUBLE_ELIMINATION' ? 16 : 9;
      const generate = {
        SINGLE_ELIMINATION: generateSingleElimination,
        DOUBLE_ELIMINATION: generateDoubleElimination,
        ROUND_ROBIN: generateRoundRobin,
        SWISS: generateSwiss,
      }[type];

      const first = generate(options(seededPlayers(n), type, { seed: 4242 }));
      const second = generate(options(seededPlayers(n), type, { seed: 4242 }));
      expect(second).toEqual(first);
    }
  });

  it('derives a stable seed from tournamentId when none is given', () => {
    const first = generateSingleElimination(options(seededPlayers(8), 'SINGLE_ELIMINATION'));
    const second = generateSingleElimination(options(seededPlayers(8), 'SINGLE_ELIMINATION'));
    expect(second).toEqual(first);
  });

  it('randomizeSeeding is deterministic for a fixed seed (old code used Math.random)', () => {
    const build = () =>
      generateSingleElimination(
        options(seededPlayers(8), 'SINGLE_ELIMINATION', { randomizeSeeding: true, seed: 20260914 }),
      );
    expect(build()).toEqual(build());

    const other = generateSingleElimination(
      options(seededPlayers(8), 'SINGLE_ELIMINATION', { randomizeSeeding: true, seed: 1 }),
    );
    expect(other).not.toEqual(build());
  });

  it('randomizeSeeding still produces a valid bracket', () => {
    for (const n of [5, 8, 9, 16]) {
      const bracket = generateSingleElimination(
        options(seededPlayers(n), 'SINGLE_ELIMINATION', { randomizeSeeding: true, seed: 7 }),
      );
      expect(validateBracket(bracket).errors).toEqual([]);
    }
  });

  it('contains no Math.random anywhere under services/bracket/', () => {
    const directory = path.join(__dirname, '..');
    const files = fs.readdirSync(directory).filter((name) => name.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = stripComments(fs.readFileSync(path.join(directory, file), 'utf8'));
      expect(`${file}:${source.includes('Math.random')}`).toBe(`${file}:false`);
    }
  });
});

describe('seededShuffle', () => {
  it('is deterministic, returns a permutation, and does not mutate the input', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    const before = items.slice();
    const first = seededShuffle(items, 99);
    const second = seededShuffle(items, 99);
    expect(first).toEqual(second);
    expect(items).toEqual(before);
    expect(first.slice().sort()).toEqual(before.slice().sort());
  });

  it('different seeds give different orders', () => {
    const items = Array.from({ length: 16 }, (_, i) => i);
    expect(seededShuffle(items, 1)).not.toEqual(seededShuffle(items, 2));
  });

  it('handles empty and single-element inputs', () => {
    expect(seededShuffle([], 5)).toEqual([]);
    expect(seededShuffle(['only'], 5)).toEqual(['only']);
  });
});

describe('PRNG', () => {
  it('mulberry32 is reproducible and stays in [0, 1)', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    for (let i = 0; i < 100; i += 1) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('hashStringToSeed is stable and varies with input', () => {
    expect(hashStringToSeed('tournament-a')).toBe(hashStringToSeed('tournament-a'));
    expect(hashStringToSeed('tournament-a')).not.toBe(hashStringToSeed('tournament-b'));
    expect(hashStringToSeed('')).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Double elimination
// ---------------------------------------------------------------------------

describe('double elimination', () => {
  it.each([2, 4, 8, 16, 32])('n=%i has 2n-2 matches, a full losers bracket and a grand final', (n) => {
    const bracket = generateDoubleElimination(options(seededPlayers(n), 'DOUBLE_ELIMINATION'));
    const winnersRounds = Math.log2(n);

    expect(bracket.totalMatches).toBe(2 * n - 2);
    expect(bracket.totalRounds).toBe(winnersRounds + losersRoundCounts(winnersRounds).length + 1);

    // Winners bracket sizing.
    for (let index = 0; index < winnersRounds; index += 1) {
      expect(bracket.bracket[index]).toHaveLength(n / Math.pow(2, index + 1));
      expect(bracket.bracket[index].every((m) => m.bracket === 'WINNERS')).toBe(true);
    }

    // Losers bracket: correct sizing, and no empty round (the old bracket had
    // 2 rounds where 4 were required for n=8).
    const expectedLosers = losersRoundCounts(winnersRounds);
    for (let losersRound = 1; losersRound <= expectedLosers.length; losersRound += 1) {
      const roundMatches = bracket.bracket[winnersRounds + losersRound - 1];
      expect(roundMatches.length).toBeGreaterThan(0);
      expect(roundMatches).toHaveLength(expectedLosers[losersRound - 1]);
      expect(roundMatches.every((m) => m.bracket === 'LOSERS')).toBe(true);
    }

    // Grand final.
    const finalRound = bracket.bracket[bracket.bracket.length - 1];
    expect(finalRound).toHaveLength(1);
    expect(finalRound[0].bracket).toBe('GRAND_FINAL');

    // Losers bracket holds n-2 matches.
    const losersMatches = bracket.bracket
      .slice(winnersRounds, winnersRounds + expectedLosers.length)
      .flat();
    expect(losersMatches).toHaveLength(n - 2);

    const result = validateBracket(bracket);
    expect(result.errors).toEqual([]);
    expect(result.isValid).toBe(true);
  });

  it('beats the measured old baseline of 10 matches for n=8', () => {
    const bracket = generateDoubleElimination(options(seededPlayers(8), 'DOUBLE_ELIMINATION'));
    expect(bracket.totalMatches).toBe(14);
    expect(bracket.totalMatches).not.toBe(10);
    expect(bracket.bracket).toHaveLength(8);
  });

  it('links the grand final to the winners final and the losers final', () => {
    const bracket = generateDoubleElimination(options(seededPlayers(8), 'DOUBLE_ELIMINATION'));
    const final = bracket.bracket[bracket.bracket.length - 1][0];
    expect(final.feedMatch1Id).toBe('t1-WINNERS-R3-M1');
    expect(final.feedMatch2Id).toBe('t1-LOSERS-R7-M1');
  });

  it('rejects a non-power-of-two field with an actionable message', () => {
    expect(() =>
      generateDoubleElimination(options(seededPlayers(6), 'DOUBLE_ELIMINATION')),
    ).toThrow(/power-of-two field/);
  });

  it('losersRoundCounts sums to n-2 and has 2k-2 rounds', () => {
    for (const n of [2, 4, 8, 16, 32, 64]) {
      const k = Math.log2(n);
      const counts = losersRoundCounts(k);
      expect(counts).toHaveLength(2 * k - 2);
      expect(counts.reduce((sum, value) => sum + value, 0)).toBe(n - 2);
    }
  });
});

// ---------------------------------------------------------------------------
// Round robin
// ---------------------------------------------------------------------------

describe('round robin', () => {
  it.each([4, 5, 6, 7, 8, 9, 16])('n=%i plays every unordered pair exactly once', (n) => {
    const bracket = generateRoundRobin(options(seededPlayers(n), 'ROUND_ROBIN'));

    const pairs = allPairKeys(bracket);
    expect(pairs).toHaveLength((n * (n - 1)) / 2);
    expect(new Set(pairs).size).toBe(pairs.length);

    // Every possible pair is present.
    const expected = new Set<string>();
    for (let i = 1; i <= n; i += 1) {
      for (let j = i + 1; j <= n; j += 1) expected.add(`p${i}|p${j}`);
    }
    expect(new Set(pairs)).toEqual(expected);

    expect(bracket.totalMatches).toBe((n * (n - 1)) / 2);
    expect(bracket.totalRounds).toBe(n % 2 === 0 ? n - 1 : n);
    expect(bracket.byePlayers).toEqual([]);
    expect(validateBracket(bracket).errors).toEqual([]);
  });

  it('does not reproduce the old oscillating rotation (n=8 had only 6 distinct pairs)', () => {
    const bracket = generateRoundRobin(options(seededPlayers(8), 'ROUND_ROBIN'));
    const pairs = new Set(allPairKeys(bracket));
    expect(pairs.size).toBe(28);
    expect(pairs.size).not.toBe(6);
  });

  it('roundRobinRounds returns a complete schedule for even and odd fields', () => {
    for (const n of [2, 3, 4, 5, 9]) {
      const ids = Array.from({ length: n }, (_, i) => `p${i + 1}`);
      const schedule = roundRobinRounds(ids);
      const pairs = schedule.flat().map(([a, b]) => pairKey(a, b));
      expect(new Set(pairs).size).toBe((n * (n - 1)) / 2);
    }
  });
});

// ---------------------------------------------------------------------------
// Swiss
// ---------------------------------------------------------------------------

describe('swiss', () => {
  it('derives the round count from the field size instead of always running 5', () => {
    const cases: Array<[number, number]> = [
      [2, 1],
      [4, 2],
      [5, 3],
      [8, 3],
      [16, 4],
      [32, 5],
      [64, 6],
    ];
    for (const [n, expectedRounds] of cases) {
      const bracket = generateSwiss(options(seededPlayers(n), 'SWISS'));
      expect(bracket.totalRounds).toBe(expectedRounds);
    }
    // The old generator ran 5 rounds even for 2 players.
    expect(generateSwiss(options(seededPlayers(2), 'SWISS')).totalRounds).not.toBe(5);
  });

  it('honours an explicit swissRounds override', () => {
    const bracket = generateSwiss(options(seededPlayers(8), 'SWISS', { swissRounds: 7 }));
    expect(bracket.totalRounds).toBe(7);
  });

  it('pairs the whole field in round 1 with at most one bye', () => {
    for (const n of [4, 5, 6, 7, 8, 9]) {
      const bracket = generateSwiss(options(seededPlayers(n), 'SWISS'));
      const firstRound = bracket.bracket[0];
      const placed = firstRound.flatMap((match) =>
        [match.player1Id, match.player2Id].filter((id): id is string => id !== null),
      );
      expect(new Set(placed).size).toBe(n);
      expect(bracket.byePlayers).toHaveLength(n % 2 === 0 ? 0 : 1);
      expect(validateBracket(bracket).errors).toEqual([]);
    }
  });

  it('leaves later rounds undecided rather than inventing pairings', () => {
    const bracket = generateSwiss(options(seededPlayers(8), 'SWISS'));
    for (const roundMatches of bracket.bracket.slice(1)) {
      for (const match of roundMatches) {
        expect(match.player1Id).toBeNull();
        expect(match.player2Id).toBeNull();
        expect(match.status).toBe('PENDING');
      }
    }
  });

  it('pairs strongest against weakest in round 1', () => {
    const bracket = generateSwiss(options(seededPlayers(8), 'SWISS'));
    expect(roundOnePairSet(bracket)).toEqual(
      new Set(['p1|p8', 'p2|p7', 'p3|p6', 'p4|p5']),
    );
  });
});

// ---------------------------------------------------------------------------
// validateBracket — it must actually catch the failure modes
// ---------------------------------------------------------------------------

describe('validateBracket', () => {
  const validEight = () =>
    generateSingleElimination(options(seededPlayers(8), 'SINGLE_ELIMINATION'));

  it('accepts every generated format', () => {
    expect(validateBracket(validEight()).isValid).toBe(true);
    expect(
      validateBracket(generateRoundRobin(options(seededPlayers(6), 'ROUND_ROBIN'))).isValid,
    ).toBe(true);
    expect(validateBracket(generateSwiss(options(seededPlayers(6), 'SWISS'))).isValid).toBe(true);
    expect(
      validateBracket(generateDoubleElimination(options(seededPlayers(8), 'DOUBLE_ELIMINATION')))
        .isValid,
    ).toBe(true);
  });

  it('catches a bye-vs-bye round-1 match', () => {
    const bracket = clone(validEight());
    bracket.bracket[0][0].player1Id = null;
    bracket.bracket[0][0].player2Id = null;
    const result = validateBracket(bracket);
    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/bye-vs-bye/);
  });

  it('catches a duplicated player', () => {
    const bracket = clone(validEight());
    bracket.bracket[0][1].player1Id = bracket.bracket[0][0].player1Id;
    const result = validateBracket(bracket);
    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/more than one round 1 slot/);
  });

  it('catches a wrong round size and a wrong totalMatches', () => {
    const bracket = clone(validEight());
    bracket.bracket[1].push({ ...bracket.bracket[1][0], id: 'extra', match: 99 });
    const result = validateBracket(bracket);
    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/round 2 has 3 matches, expected 2/);
  });

  it('catches a missing feed link', () => {
    const bracket = clone(validEight());
    bracket.bracket[1][0].feedMatch1Id = 'does-not-exist';
    const result = validateBracket(bracket);
    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/does not exist/);
  });

  it('catches a feed link that does not point backwards', () => {
    const bracket = clone(validEight());
    bracket.bracket[0][0].feedMatch1Id = bracket.bracket[1][0].id;
    const result = validateBracket(bracket);
    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/not before round/);
  });

  it('catches a winner that is not one of the two players', () => {
    const bracket = clone(validEight());
    bracket.bracket[0][0].winnerId = 'ghost';
    bracket.bracket[0][0].status = 'COMPLETED';
    const result = validateBracket(bracket);
    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/not one of its two players/);
  });

  it('catches COMPLETED without a winner', () => {
    const bracket = clone(validEight());
    bracket.bracket[0][0].status = 'COMPLETED';
    bracket.bracket[0][0].winnerId = null;
    const result = validateBracket(bracket);
    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/no winnerId/);
  });

  it('catches an empty losers-bracket round', () => {
    const bracket = clone(
      generateDoubleElimination(options(seededPlayers(8), 'DOUBLE_ELIMINATION')),
    );
    const winnersRounds = 3;
    bracket.bracket[winnersRounds] = [];
    const result = validateBracket(bracket);
    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/losers round 1 is empty/);
  });

  it('catches a repeated round-robin pairing', () => {
    const bracket = clone(generateRoundRobin(options(seededPlayers(4), 'ROUND_ROBIN')));
    bracket.bracket[1][0].player1Id = bracket.bracket[0][0].player1Id;
    bracket.bracket[1][0].player2Id = bracket.bracket[0][0].player2Id;
    const result = validateBracket(bracket);
    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/occurs 2 times/);
  });

  it('reports byes as a warning, not an error', () => {
    const bracket = generateSingleElimination(options(seededPlayers(5), 'SINGLE_ELIMINATION'));
    const result = validateBracket(bracket);
    expect(result.isValid).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/3 player\(s\) have a bye/);
  });
});
