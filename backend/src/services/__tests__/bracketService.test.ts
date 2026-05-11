// @ts-nocheck
import { BracketService } from '../bracketService';
import { TournamentType } from '@prisma/client';

interface TournamentPlayer {
  id: string;
  playerName: string;
  seed?: number;
  skillLevel?: string;
  winRate?: number;
}

const makePlayer = (id: string, seed: number, skill = 'INTERMEDIATE', winRate = 0.5): TournamentPlayer => ({
  id, playerName: `Player ${id}`, seed, skillLevel: skill, winRate,
});

describe('BracketService', () => {
  describe('generateBracket — SINGLE_ELIMINATION', () => {
    it('generates bracket for 8 players (power of 2)', () => {
      const players = Array.from({ length: 8 }, (_, i) => makePlayer(`p${i+1}`, i+1));
      const bracket = BracketService.generateBracket('t1', TournamentType.SINGLE_ELIMINATION, players);
      expect(bracket.totalRounds).toBe(3);
      expect(bracket.rounds).toHaveLength(3);
      expect(bracket.rounds[0].matches).toHaveLength(4);
      expect(bracket.rounds[1].matches).toHaveLength(2);
      expect(bracket.rounds[2].matches).toHaveLength(1);
    });

    it('generates bracket for 5 players (byes needed)', () => {
      const players = Array.from({ length: 5 }, (_, i) => makePlayer(`p${i+1}`, i+1));
      const bracket = BracketService.generateBracket('t1', TournamentType.SINGLE_ELIMINATION, players);
      expect(bracket.totalRounds).toBe(3);
    });

    it('first match has correct player names', () => {
      const players = [makePlayer('p1', 1), makePlayer('p2', 2)];
      const bracket = BracketService.generateBracket('t1', TournamentType.SINGLE_ELIMINATION, players);
      expect(bracket.rounds[0].matches[0].player1Name).toBe('Player p1');
      expect(bracket.rounds[0].matches[0].player2Name).toBe('Player p2');
    });

    it('generates correct round names (Final, Semi-Final, Quarter-Final)', () => {
      const players = Array.from({ length: 8 }, (_, i) => makePlayer(`p${i+1}`, i+1));
      const bracket = BracketService.generateBracket('t1', TournamentType.SINGLE_ELIMINATION, players);
      expect(bracket.rounds[2].roundName).toBe('Final');
      expect(bracket.rounds[1].roundName).toBe('Semi-Final');
      expect(bracket.rounds[0].roundName).toBe('Quarter-Final');
    });

    it('16 players → 15 total matches', () => {
      const players = Array.from({ length: 16 }, (_, i) => makePlayer(`p${i+1}`, i+1));
      const bracket = BracketService.generateBracket('t1', TournamentType.SINGLE_ELIMINATION, players);
      expect(bracket.totalMatches).toBe(15);
    });
  });

  describe('generateBracket — DOUBLE_ELIMINATION', () => {
    it('generates winners + losers rounds', () => {
      const players = Array.from({ length: 8 }, (_, i) => makePlayer(`p${i+1}`, i+1));
      const bracket = BracketService.generateBracket('t1', TournamentType.DOUBLE_ELIMINATION, players);
      expect(bracket.rounds.length).toBeGreaterThan(3);
    });
  });

  describe('generateBracket — ROUND_ROBIN', () => {
    it('generates N-1 rounds for N even players', () => {
      const players = Array.from({ length: 6 }, (_, i) => makePlayer(`p${i+1}`, i+1));
      const bracket = BracketService.generateBracket('t1', TournamentType.ROUND_ROBIN, players);
      expect(bracket.totalRounds).toBe(5);
      expect(bracket.rounds).toHaveLength(5);
    });

    it('each round has correct number of matches', () => {
      const players = Array.from({ length: 4 }, (_, i) => makePlayer(`p${i+1}`, i+1));
      const bracket = BracketService.generateBracket('t1', TournamentType.ROUND_ROBIN, players);
      bracket.rounds.forEach(round => {
        expect(round.matches.length).toBe(2);
      });
    });
  });

  describe('generateBracket — SWISS', () => {
    it('generates at least 5 rounds for 16 players', () => {
      const players = Array.from({ length: 16 }, (_, i) => makePlayer(`p${i+1}`, i+1));
      const bracket = BracketService.generateBracket('t1', TournamentType.SWISS, players);
      expect(bracket.totalRounds).toBeGreaterThanOrEqual(5);
    });

    it('each round has at most players/2 matches', () => {
      const players = Array.from({ length: 8 }, (_, i) => makePlayer(`p${i+1}`, i+1));
      const bracket = BracketService.generateBracket('t1', TournamentType.SWISS, players);
      bracket.rounds.forEach(round => {
        expect(round.matches.length).toBeLessThanOrEqual(4);
      });
    });
  });

  describe('validateBracket', () => {
    it('validates a clean bracket', () => {
      const players = Array.from({ length: 8 }, (_, i) => makePlayer(`p${i+1}`, i+1));
      const bracket = BracketService.generateBracket('t1', TournamentType.SINGLE_ELIMINATION, players);
      const result = BracketService.validateBracket(bracket);
      expect(result.isValid).toBe(true);
    });

    it('reports bye warnings', () => {
      const players = Array.from({ length: 5 }, (_, i) => makePlayer(`p${i+1}`, i+1));
      const bracket = BracketService.generateBracket('t1', TournamentType.SINGLE_ELIMINATION, players);
      const result = BracketService.validateBracket(bracket);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  it('throws for unsupported tournament type', () => {
    expect(() =>
      BracketService.generateBracket('t1', 'INVALID_TYPE' as any, [makePlayer('p1', 1)]),
    ).toThrow();
  });
});
