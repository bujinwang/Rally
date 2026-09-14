/**
 * Story 6.7 T03 — tournament bracket service facade.
 *
 * These are **pure generation tests**: `generateBracket` delegates to the pure
 * engine and touches no database (design §1 D3), so AC 9 (correctness) and AC 13
 * (determinism) can be asserted here without a DB. Persistence, progression and
 * correction are covered against the real schema in
 * `bracket/__tests__/correction.test.ts`.
 *
 * The assertions below replace the pre-6.7 ones that encoded the old *defective*
 * behaviour (e.g. "seed 1 vs seed 2 in round 1", a 5-round Swiss bracket for any
 * field, a 5-round double elimination). Each corrected expectation is annotated.
 */

import tournamentBracketService, {
  BracketError,
} from '../tournamentBracketService';
import type { BracketGenerationOptions, PlayerSeed } from '../tournamentBracketService';

function makePlayer(id: string, seed: number, skill = 'intermediate'): PlayerSeed {
  return { id, name: `Player ${id}`, seed, skillLevel: skill };
}

function options(
  tournamentType: BracketGenerationOptions['tournamentType'],
  players: PlayerSeed[],
): BracketGenerationOptions {
  return { tournamentId: 't1', players, tournamentType, randomizeSeeding: false };
}

function playersOf(count: number): PlayerSeed[] {
  return Array.from({ length: count }, (_, index) => makePlayer(`p${index + 1}`, index + 1));
}

describe('tournamentBracketService.generateBracket', () => {
  describe('SINGLE_ELIMINATION', () => {
    it('8 players → 3 rounds with 4/2/1 matches', async () => {
      const bracket = await tournamentBracketService.generateBracket(
        options('SINGLE_ELIMINATION', playersOf(8)),
      );
      expect(bracket.totalRounds).toBe(3);
      expect(bracket.bracket).toHaveLength(3);
      expect(bracket.bracket[0]).toHaveLength(4);
      expect(bracket.bracket[1]).toHaveLength(2);
      expect(bracket.bracket[2]).toHaveLength(1);
    });

    it('5 players → 3 rounds with 4 round-1 matches and 3 byes', async () => {
      const bracket = await tournamentBracketService.generateBracket(
        options('SINGLE_ELIMINATION', playersOf(5)),
      );
      expect(bracket.totalRounds).toBe(3);
      expect(bracket.bracket[0]).toHaveLength(4);
      expect(bracket.byePlayers).toHaveLength(3);
    });

    it('2 players → 1 round, 1 match', async () => {
      const bracket = await tournamentBracketService.generateBracket(
        options('SINGLE_ELIMINATION', [makePlayer('p1', 1), makePlayer('p2', 2)]),
      );
      expect(bracket.totalRounds).toBe(1);
      expect(bracket.bracket[0]).toHaveLength(1);
    });

    it('seeds the field so the top two seeds can only meet in the final', async () => {
      const bracket = await tournamentBracketService.generateBracket(
        options('SINGLE_ELIMINATION', playersOf(8)),
      );
      const pairs = bracket.bracket[0].map((match) => `${match.player1Name} v ${match.player2Name}`);
      // Standard bracket seeding — NOT the old `1v2 3v4 5v6 7v8` degenerate order.
      expect(new Set(pairs)).toEqual(
        new Set([
          'Player p1 v Player p8',
          'Player p4 v Player p5',
          'Player p2 v Player p7',
          'Player p3 v Player p6',
        ]),
      );
      // Seed 1 and seed 2 sit in opposite halves.
      const indexOfSeed = (name: string) =>
        bracket.bracket[0].findIndex((match) => match.player1Name === name || match.player2Name === name);
      const seed1Half = indexOfSeed('Player p1') < 2 ? 0 : 1;
      const seed2Half = indexOfSeed('Player p2') < 2 ? 0 : 1;
      expect(seed1Half).not.toBe(seed2Half);
    });

    it('populates format, totalMatches and byePlayers', async () => {
      const bracket = await tournamentBracketService.generateBracket(
        options('SINGLE_ELIMINATION', playersOf(8)),
      );
      expect(bracket.format).toBe('SINGLE_ELIMINATION');
      expect(bracket.totalMatches).toBe(7);
      expect(bracket.totalPlayers).toBe(8);
      expect(bracket.byePlayers).toEqual([]);
    });

    it('is deterministic across two runs, including the randomized path', async () => {
      const deterministic = options('SINGLE_ELIMINATION', playersOf(16));
      const first = await tournamentBracketService.generateBracket(deterministic);
      const second = await tournamentBracketService.generateBracket(deterministic);
      expect(second).toEqual(first);

      const randomized = { ...options('SINGLE_ELIMINATION', playersOf(16)), randomizeSeeding: true };
      const randomizedFirst = await tournamentBracketService.generateBracket(randomized);
      const randomizedSecond = await tournamentBracketService.generateBracket(randomized);
      expect(randomizedSecond).toEqual(randomizedFirst);
    });
  });

  describe('DOUBLE_ELIMINATION', () => {
    it('8 players → winners + losers + grand final (2n − 2 = 14 matches)', async () => {
      const bracket = await tournamentBracketService.generateBracket(
        options('DOUBLE_ELIMINATION', playersOf(8)),
      );
      // 3 winners rounds + 4 losers rounds + 1 grand final (the old generator
      // produced a 5-round, 10-match bracket — not a double elimination).
      expect(bracket.totalRounds).toBe(8);
      expect(bracket.totalMatches).toBe(14);
      expect(bracket.bracket[bracket.bracket.length - 1][0].bracket).toBe('GRAND_FINAL');
    });

    it('surfaces a non-power-of-two field as an actionable 400 (handoff #5)', async () => {
      await expect(
        tournamentBracketService.generateBracket(options('DOUBLE_ELIMINATION', playersOf(6))),
      ).rejects.toMatchObject({ code: 'BRACKET_GENERATION_FAILED', statusCode: 400 });
    });
  });

  describe('ROUND_ROBIN', () => {
    it('6 players → 5 rounds', async () => {
      const bracket = await tournamentBracketService.generateBracket(
        options('ROUND_ROBIN', playersOf(6)),
      );
      expect(bracket.totalRounds).toBe(5);
      expect(bracket.bracket).toHaveLength(5);
    });

    it('odd field (5 players) → 5 rounds and no synthetic BYE player', async () => {
      const bracket = await tournamentBracketService.generateBracket(
        options('ROUND_ROBIN', playersOf(5)),
      );
      expect(bracket.totalRounds).toBe(5);
      bracket.bracket.forEach((round) => {
        round.forEach((match) => {
          expect(match.player1Id).not.toBe('BYE');
          expect(match.player2Id).not.toBe('BYE');
        });
      });
    });

    it('4 players → 2 matches per round', async () => {
      const bracket = await tournamentBracketService.generateBracket(
        options('ROUND_ROBIN', playersOf(4)),
      );
      bracket.bracket.forEach((round) => {
        expect(round).toHaveLength(2);
      });
    });

    it('every unordered pair plays exactly once', async () => {
      const bracket = await tournamentBracketService.generateBracket(
        options('ROUND_ROBIN', playersOf(6)),
      );
      const pairs = new Set(
        bracket.bracket
          .flat()
          .map((match) => [match.player1Id, match.player2Id].sort().join('|')),
      );
      expect(pairs.size).toBe((6 * 5) / 2); // 15 distinct pairings
    });
  });

  describe('SWISS', () => {
    it('16 players → ceil(log2 n) = 4 rounds (was a fixed 5)', async () => {
      const bracket = await tournamentBracketService.generateBracket(options('SWISS', playersOf(16)));
      expect(bracket.totalRounds).toBe(4);
    });

    it('round 1 pairs every player at most once', async () => {
      const bracket = await tournamentBracketService.generateBracket(options('SWISS', playersOf(12)));
      const seen = new Set<string>();
      for (const match of bracket.bracket[0]) {
        if (match.player1Id) {
          expect(seen.has(match.player1Id)).toBe(false);
          seen.add(match.player1Id);
        }
        if (match.player2Id) {
          expect(seen.has(match.player2Id)).toBe(false);
          seen.add(match.player2Id);
        }
      }
    });
  });

  it('throws for an unsupported tournament type', async () => {
    await expect(
      tournamentBracketService.generateBracket({
        tournamentId: 't1',
        players: [makePlayer('p1', 1)],
        tournamentType: 'INVALID' as BracketGenerationOptions['tournamentType'],
      }),
    ).rejects.toThrow('Unsupported tournament type');
  });

  it('raises a BracketError carrying an HTTP status for a bad format', async () => {
    await expect(
      tournamentBracketService.generateBracket({
        tournamentId: 't1',
        players: [makePlayer('p1', 1)],
        tournamentType: 'INVALID' as BracketGenerationOptions['tournamentType'],
      }),
    ).rejects.toBeInstanceOf(BracketError);
  });
});
