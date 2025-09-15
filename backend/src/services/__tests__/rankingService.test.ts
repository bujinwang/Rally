import { PrismaClient } from '@prisma/client';
import { rankingService } from '../rankingService';

const prisma = new PrismaClient();

describe('RankingService', () => {
  let testSessionId: string;
  let testPlayer1Id: string;
  let testPlayer2Id: string;
  let testPlayer3Id: string;

  beforeAll(async () => {
    // Create test data
    const session = await prisma.mvpSession.create({
      data: {
        name: 'Test Session - Ranking Service',
        scheduledAt: new Date(),
        ownerName: 'Test Organizer',
        ownerDeviceId: 'organizer-device-123',
        shareCode: 'RANK123'
      }
    });
    testSessionId = session.id;

    const player1 = await prisma.mvpPlayer.create({
      data: {
        sessionId: testSessionId,
        name: 'Player 1',
        deviceId: 'player1-device',
        rankingPoints: 1200,
        gamesPlayed: 5
      }
    });
    testPlayer1Id = player1.id;

    const player2 = await prisma.mvpPlayer.create({
      data: {
        sessionId: testSessionId,
        name: 'Player 2',
        deviceId: 'player2-device',
        rankingPoints: 1150,
        gamesPlayed: 5
      }
    });
    testPlayer2Id = player2.id;

    const player3 = await prisma.mvpPlayer.create({
      data: {
        sessionId: testSessionId,
        name: 'Player 3',
        deviceId: 'player3-device',
        rankingPoints: 1250,
        gamesPlayed: 5
      }
    });
    testPlayer3Id = player3.id;
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.playerRankingHistory.deleteMany({
      where: {
        playerId: { in: [testPlayer1Id, testPlayer2Id, testPlayer3Id] }
      }
    });
    await prisma.mvpPlayer.deleteMany({
      where: { sessionId: testSessionId }
    });
    await prisma.mvpSession.deleteMany({
      where: { id: testSessionId }
    });
    await prisma.$disconnect();
  });

  describe('calculateExpectedScore', () => {
    it('should calculate expected score correctly', () => {
      const expectedScore = rankingService['calculateExpectedScore'](1200, 1150);
      expect(expectedScore).toBeCloseTo(0.529, 3);
    });

    it('should return 0.5 for equal ratings', () => {
      const expectedScore = rankingService['calculateExpectedScore'](1200, 1200);
      expect(expectedScore).toBe(0.5);
    });
  });

  describe('calculateNewRating', () => {
    it('should increase rating for a win', () => {
      const newRating = rankingService['calculateNewRating'](1200, 0.5, 1);
      expect(newRating).toBeGreaterThan(1200);
    });

    it('should decrease rating for a loss', () => {
      const newRating = rankingService['calculateNewRating'](1200, 0.5, 0);
      expect(newRating).toBeLessThan(1200);
    });
  });

  describe('getPlayerRank', () => {
    it('should return player rank', async () => {
      const rank = await rankingService.getPlayerRank(testPlayer1Id);
      expect(typeof rank).toBe('number');
    });

    it('should return 0 for non-existent player', async () => {
      const rank = await rankingService.getPlayerRank('non-existent-player');
      expect(rank).toBe(0);
    });
  });

  describe('getRankingLeaderboard', () => {
    it('should return leaderboard with correct structure', async () => {
      const leaderboard = await rankingService.getRankingLeaderboard(10);

      expect(Array.isArray(leaderboard)).toBe(true);
      expect(leaderboard.length).toBeGreaterThan(0);

      const firstEntry = leaderboard[0];
      expect(firstEntry).toHaveProperty('playerId');
      expect(firstEntry).toHaveProperty('playerName');
      expect(firstEntry).toHaveProperty('rating');
      expect(firstEntry).toHaveProperty('rank');
      expect(firstEntry).toHaveProperty('matchesPlayed');
      expect(firstEntry).toHaveProperty('winRate');
      expect(firstEntry).toHaveProperty('trend');
    });

    it('should respect limit parameter', async () => {
      const leaderboard = await rankingService.getRankingLeaderboard(2);
      expect(leaderboard.length).toBeLessThanOrEqual(2);
    });

    it('should sort by rating descending', async () => {
      const leaderboard = await rankingService.getRankingLeaderboard(10);

      for (let i = 0; i < leaderboard.length - 1; i++) {
        expect(leaderboard[i].rating).toBeGreaterThanOrEqual(leaderboard[i + 1].rating);
      }
    });
  });

  describe('getPlayerRatingHistory', () => {
    beforeAll(async () => {
      // Add some rating history
      await prisma.playerRankingHistory.createMany({
        data: [
          {
            playerId: testPlayer1Id,
            ranking: 1,
            rankingPoints: 1200,
            performanceRating: 1200,
            recordedAt: new Date(Date.now() - 86400000), // 1 day ago
            changeReason: 'initial',
            pointsChange: 0
          },
          {
            playerId: testPlayer1Id,
            ranking: 1,
            rankingPoints: 1216,
            performanceRating: 1216,
            recordedAt: new Date(),
            changeReason: 'match_win',
            matchId: 'test-match-1',
            pointsChange: 16
          }
        ]
      });
    });

    it('should return rating history', async () => {
      const history = await rankingService.getPlayerRatingHistory(testPlayer1Id, 10);

      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);

      const firstEntry = history[0];
      expect(firstEntry).toHaveProperty('playerId');
      expect(firstEntry).toHaveProperty('rating');
      expect(firstEntry).toHaveProperty('rank');
      expect(firstEntry).toHaveProperty('recordedAt');
    });

    it('should respect limit parameter', async () => {
      const history = await rankingService.getPlayerRatingHistory(testPlayer1Id, 1);
      expect(history.length).toBe(1);
    });

    it('should sort by recordedAt descending', async () => {
      const history = await rankingService.getPlayerRatingHistory(testPlayer1Id, 10);

      for (let i = 0; i < history.length - 1; i++) {
        expect(history[i].recordedAt.getTime()).toBeGreaterThanOrEqual(history[i + 1].recordedAt.getTime());
      }
    });
  });

  describe('getRankingStatistics', () => {
    it('should return ranking statistics', async () => {
      const stats = await rankingService.getRankingStatistics();

      expect(stats).toHaveProperty('totalRankedPlayers');
      expect(stats).toHaveProperty('averageRating');
      expect(stats).toHaveProperty('highestRating');
      expect(stats).toHaveProperty('lowestRating');
      expect(stats).toHaveProperty('ratingDistribution');

      expect(typeof stats.totalRankedPlayers).toBe('number');
      expect(typeof stats.averageRating).toBe('number');
      expect(typeof stats.highestRating).toBe('number');
      expect(typeof stats.lowestRating).toBe('number');
      expect(Array.isArray(stats.ratingDistribution)).toBe(true);
    });
  });

  describe('initializePlayerRanking', () => {
    it('should initialize player ranking', async () => {
      const newPlayer = await prisma.mvpPlayer.create({
        data: {
          sessionId: testSessionId,
          name: 'New Player',
          deviceId: 'new-player-device'
        }
      });

      await rankingService.initializePlayerRanking(newPlayer.id);

      const updatedPlayer = await prisma.mvpPlayer.findUnique({
        where: { id: newPlayer.id },
        select: { rankingPoints: true }
      });

      expect(updatedPlayer?.rankingPoints).toBe(1200); // INITIAL_RATING

      // Clean up
      await prisma.playerRankingHistory.deleteMany({
        where: { playerId: newPlayer.id }
      });
      await prisma.mvpPlayer.delete({
        where: { id: newPlayer.id }
      });
    });
  });

  describe('updateAllRankings', () => {
    it('should update all player rankings', async () => {
      await rankingService.updateAllRankings();

      const players = await prisma.mvpPlayer.findMany({
        where: { id: { in: [testPlayer1Id, testPlayer2Id, testPlayer3Id] } },
        select: { id: true, ranking: true, rankingPoints: true }
      });

      // Check that rankings are assigned
      players.forEach(player => {
        expect(player.ranking).toBeGreaterThan(0);
      });

      // Check that higher rated players have better rankings
      const sortedPlayers = players.sort((a, b) => (b.rankingPoints || 0) - (a.rankingPoints || 0));
      for (let i = 0; i < sortedPlayers.length - 1; i++) {
        expect(sortedPlayers[i].ranking).toBeLessThanOrEqual(sortedPlayers[i + 1].ranking || 0);
      }
    });
  });
});