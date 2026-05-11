// @ts-nocheck
import tournamentBracketService from '../tournamentBracketService';

interface TestPlayer {
  id: string;
  name: string;
  seed?: number;
  skillLevel?: string;
}

const makePlayer = (id: string, seed: number, skill = 'intermediate'): TestPlayer => ({
  id, name: `Player ${id}`, seed, skillLevel: skill,
});

describe('TournamentBracketService — generateBracket', () => {
  const baseOptions = (type: string, players: TestPlayer[]) => ({
    tournamentId: 't1',
    players,
    tournamentType: type as any,
    randomizeSeeding: false,
  });

  describe('SINGLE_ELIMINATION', () => {
    it('8 players → 3 rounds, 4/2/1 matches', async () => {
      const players = Array.from({ length: 8 }, (_, i) => makePlayer(`p${i+1}`, i+1));
      const bracket = await tournamentBracketService.generateBracket(
        baseOptions('SINGLE_ELIMINATION', players),
      );
      expect(bracket.totalRounds).toBe(3);
      expect(bracket.bracket).toHaveLength(3);
      expect(bracket.bracket[0]).toHaveLength(4);
      expect(bracket.bracket[1]).toHaveLength(2);
      expect(bracket.bracket[2]).toHaveLength(1);
    });

    it('5 players → byes filled in first round', async () => {
      const players = Array.from({ length: 5 }, (_, i) => makePlayer(`p${i+1}`, i+1));
      const bracket = await tournamentBracketService.generateBracket(
        baseOptions('SINGLE_ELIMINATION', players),
      );
      expect(bracket.totalRounds).toBe(3);
      // 5 players → 8 slots in first round → 4 matches
      expect(bracket.bracket[0]).toHaveLength(4);
    });

    it('2 players → 1 round, 1 match', async () => {
      const players = [makePlayer('p1', 1), makePlayer('p2', 2)];
      const bracket = await tournamentBracketService.generateBracket(
        baseOptions('SINGLE_ELIMINATION', players),
      );
      expect(bracket.totalRounds).toBe(1);
      expect(bracket.bracket[0]).toHaveLength(1);
    });

    it('randomizes seeding when requested', async () => {
      const players = Array.from({ length: 8 }, (_, i) => makePlayer(`p${i+1}`, i+1));
      const opts = { ...baseOptions('SINGLE_ELIMINATION', players), randomizeSeeding: true };
      const bracket = await tournamentBracketService.generateBracket(opts);
      expect(bracket.totalRounds).toBe(3);
    });
  });

  describe('DOUBLE_ELIMINATION', () => {
    it('generates winners + losers bracket', async () => {
      const players = Array.from({ length: 8 }, (_, i) => makePlayer(`p${i+1}`, i+1));
      const bracket = await tournamentBracketService.generateBracket(
        baseOptions('DOUBLE_ELIMINATION', players),
      );
      expect(bracket.totalRounds).toBe(5); // 3 winners + 2 losers
      expect(bracket.bracket.length).toBeGreaterThan(3);
    });
  });

  describe('ROUND_ROBIN', () => {
    it('N players → N-1 rounds (even)', async () => {
      const players = Array.from({ length: 6 }, (_, i) => makePlayer(`p${i+1}`, i+1));
      const bracket = await tournamentBracketService.generateBracket(
        baseOptions('ROUND_ROBIN', players),
      );
      expect(bracket.totalRounds).toBe(5);
      expect(bracket.bracket).toHaveLength(5);
    });

    it('odd number → adds BYE player', async () => {
      const players = Array.from({ length: 5 }, (_, i) => makePlayer(`p${i+1}`, i+1));
      const bracket = await tournamentBracketService.generateBracket(
        baseOptions('ROUND_ROBIN', players),
      );
      expect(bracket.totalRounds).toBe(5); // 6 players - 1
      // BYE matches should be excluded
      bracket.bracket.forEach(round => {
        round.forEach(match => {
          expect(match.player1Id).not.toBe('BYE');
          expect(match.player2Id).not.toBe('BYE');
        });
      });
    });

    it('each round has correct match count', async () => {
      const players = Array.from({ length: 4 }, (_, i) => makePlayer(`p${i+1}`, i+1));
      const bracket = await tournamentBracketService.generateBracket(
        baseOptions('ROUND_ROBIN', players),
      );
      bracket.bracket.forEach(round => {
        expect(round.length).toBe(2); // 4/2 = 2 matches per round
      });
    });
  });

  describe('SWISS', () => {
    it('generates 5-7 rounds', async () => {
      const players = Array.from({ length: 16 }, (_, i) => makePlayer(`p${i+1}`, i+1));
      const bracket = await tournamentBracketService.generateBracket(
        baseOptions('SWISS', players),
      );
      expect(bracket.totalRounds).toBeGreaterThanOrEqual(5);
      expect(bracket.totalRounds).toBeLessThanOrEqual(7);
    });

    it('no player appears twice in same round', async () => {
      const players = Array.from({ length: 12 }, (_, i) => makePlayer(`p${i+1}`, i+1));
      const bracket = await tournamentBracketService.generateBracket(
        baseOptions('SWISS', players),
      );
      bracket.bracket.forEach(round => {
        const ids = new Set<string>();
        round.forEach(match => {
          expect(ids.has(match.player1Id!)).toBe(false);
          ids.add(match.player1Id!);
          if (match.player2Id) {
            expect(ids.has(match.player2Id)).toBe(false);
            ids.add(match.player2Id);
          }
        });
      });
    });
  });

  describe('sortPlayersForBracket (via seeding)', () => {
    it('sorts by seed ascending', async () => {
      const players = [makePlayer('p3', 3), makePlayer('p1', 1), makePlayer('p2', 2)];
      const bracket = await tournamentBracketService.generateBracket(
        baseOptions('SINGLE_ELIMINATION', players),
      );
      // Seed 1 and 2 should be matched in first round (standard bracket)
      const firstMatch = bracket.bracket[0][0];
      expect(firstMatch.player1Name).toBe('Player p1'); // seed 1
      expect(firstMatch.player2Name).toBe('Player p2'); // seed 2
    });
  });

  it('throws for unsupported tournament type', async () => {
    await expect(
      tournamentBracketService.generateBracket({
        tournamentId: 't1',
        players: [makePlayer('p1', 1)],
        tournamentType: 'INVALID' as any,
      }),
    ).rejects.toThrow('Unsupported tournament type');
  });
});
