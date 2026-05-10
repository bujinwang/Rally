import {
  calculateNewElo,
  findMostBalancedTeams,
  generatePlayerInsights,
} from '../smartInsightsService';

describe('SmartInsightsService', () => {
  describe('calculateNewElo', () => {
    it('winner gains rating, loser loses rating', () => {
      const { team1NewElo, team2NewElo } = calculateNewElo(1200, 1200, true);
      expect(team1NewElo).toBeGreaterThan(1200);
      expect(team2NewElo).toBeLessThan(1200);
      // Equal teams: winner should gain ~16, loser lose ~16
      expect(team1NewElo).toBe(1216);
      expect(team2NewElo).toBe(1184);
    });

    it('upset: underdog winning gains more', () => {
      const { team1NewElo, team2NewElo } = calculateNewElo(1000, 1400, true);
      expect(team1NewElo).toBeGreaterThan(1020); // big gain for underdog (~29 pts)
      expect(team2NewElo).toBeLessThan(1375); // big loss for favorite
    });

    it('expected win: favorite gains less', () => {
      const { team1NewElo, team2NewElo } = calculateNewElo(1400, 1000, true);
      expect(team1NewElo).toBeGreaterThan(1400);
      expect(team1NewElo).toBeLessThan(1420); // small gain
    });
  });

  describe('findMostBalancedTeams', () => {
    const players = [
      { name: 'A', elo: 1500, gamesPlayed: 10, recentForm: [] as ('W' | 'L')[], trend: 'stable' as const },
      { name: 'B', elo: 1300, gamesPlayed: 8, recentForm: [] as ('W' | 'L')[], trend: 'stable' as const },
      { name: 'C', elo: 1100, gamesPlayed: 5, recentForm: [] as ('W' | 'L')[], trend: 'stable' as const },
      { name: 'D', elo: 900, gamesPlayed: 3, recentForm: [] as ('W' | 'L')[], trend: 'stable' as const },
    ];

    it('produces balanced teams from 4 players', () => {
      const result = findMostBalancedTeams(players, []);
      expect(result).not.toBeNull();
      expect(result!.team1).toHaveLength(2);
      expect(result!.team2).toHaveLength(2);
      // Should snake-draft: highest+lowest vs middle two
      expect(result!.balanceScore).toBeGreaterThan(50);
    });

    it('penalizes repeated partnerships', () => {
      const history = [
        { team1Player1: 'A', team1Player2: 'D', team2Player1: 'B', team2Player2: 'C' },
        { team1Player1: 'A', team1Player2: 'D', team2Player1: 'B', team2Player2: 'C' },
        { team1Player1: 'A', team1Player2: 'D', team2Player1: 'B', team2Player2: 'C' },
      ];
      const result = findMostBalancedTeams(players, history);
      expect(result).not.toBeNull();
      // Balance score should be lower due to repeated A+D partnership
      expect(result!.balanceScore).toBeLessThan(80);
    });

    it('returns null for <4 players', () => {
      expect(findMostBalancedTeams(players.slice(0, 3), [])).toBeNull();
    });
  });

  describe('generatePlayerInsights', () => {
    it('generates tips for new players', () => {
      const insights = generatePlayerInsights('A', [
        { name: 'A', elo: 1200, gamesPlayed: 2, recentForm: ['W'], trend: 'stable' },
      ], {});
      expect(insights.some(i => i.title === 'Getting Started')).toBe(true);
    });

    it('detects dream team partnership', () => {
      const insights = generatePlayerInsights('A', [
        { name: 'A', elo: 1300, gamesPlayed: 10, recentForm: ['W','W','W','W','W','W','W','L','L','L'], trend: 'rising' },
      ], {
        'B': { gamesPlayed: 8, wins: 7, losses: 1, winRate: 0.875 },
      });
      expect(insights.some(i => i.title === 'Dream Team')).toBe(true);
    });

    it('detects tough partnership', () => {
      const insights = generatePlayerInsights('A', [
        { name: 'A', elo: 1100, gamesPlayed: 10, recentForm: ['L','L','L','L','L','W','W','W','W','W'], trend: 'falling' },
      ], {
        'C': { gamesPlayed: 5, wins: 1, losses: 4, winRate: 0.2 },
      });
      expect(insights.some(i => i.title === 'Tough Partnership')).toBe(true);
    });
  });
});
