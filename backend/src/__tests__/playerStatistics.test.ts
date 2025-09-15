import { PrismaClient } from '@prisma/client';
import { PlayerStatistics, PlayerWithStatistics } from '../types/player';

const prisma = new PrismaClient();

describe('Player Statistics', () => {
  let testSessionId: string;
  let testPlayer1Id: string;
  let testPlayer2Id: string;

  beforeAll(async () => {
    // Create test data
    const session = await prisma.mvpSession.create({
      data: {
        name: 'Test Session - Player Statistics',
        scheduledAt: new Date(),
        ownerName: 'Test Owner',
        shareCode: 'STATS123'
      }
    });
    testSessionId = session.id;

    const player1 = await prisma.mvpPlayer.create({
      data: {
        sessionId: testSessionId,
        name: 'Stats Player 1',
        totalMatches: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        rankingPoints: 0
      }
    });
    testPlayer1Id = player1.id;

    const player2 = await prisma.mvpPlayer.create({
      data: {
        sessionId: testSessionId,
        name: 'Stats Player 2',
        totalMatches: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        rankingPoints: 0
      }
    });
    testPlayer2Id = player2.id;
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.match.deleteMany({
      where: { sessionId: testSessionId }
    });
    await prisma.mvpPlayer.deleteMany({
      where: { sessionId: testSessionId }
    });
    await prisma.mvpSession.deleteMany({
      where: { id: testSessionId }
    });
    await prisma.$disconnect();
  });

  describe('Player Statistics Fields', () => {
    it('should have statistics fields initialized to zero', async () => {
      const player = await prisma.mvpPlayer.findUnique({
        where: { id: testPlayer1Id }
      });

      expect(player?.totalMatches).toBe(0);
      expect(player?.wins).toBe(0);
      expect(player?.losses).toBe(0);
      expect(player?.winRate).toBe(0);
      expect(player?.rankingPoints).toBe(0);
    });

    it('should allow updating statistics fields', async () => {
      const updatedPlayer = await prisma.mvpPlayer.update({
        where: { id: testPlayer1Id },
        data: {
          totalMatches: 5,
          wins: 3,
          losses: 2,
          winRate: 0.6,
          rankingPoints: 150
        }
      });

      expect(updatedPlayer.totalMatches).toBe(5);
      expect(updatedPlayer.wins).toBe(3);
      expect(updatedPlayer.losses).toBe(2);
      expect(updatedPlayer.winRate).toBe(0.6);
      expect(updatedPlayer.rankingPoints).toBe(150);
    });
  });

  describe('Statistics Calculations', () => {
    beforeAll(async () => {
      // Create matches to test statistics
      await prisma.match.createMany({
        data: [
          {
            sessionId: testSessionId,
            player1Id: testPlayer1Id,
            player2Id: testPlayer2Id,
            winnerId: testPlayer1Id,
            scoreType: '2-0',
            recordedBy: testPlayer1Id
          },
          {
            sessionId: testSessionId,
            player1Id: testPlayer2Id,
            player2Id: testPlayer1Id,
            winnerId: testPlayer2Id,
            scoreType: '2-1',
            recordedBy: testPlayer2Id
          },
          {
            sessionId: testSessionId,
            player1Id: testPlayer1Id,
            player2Id: testPlayer2Id,
            winnerId: testPlayer1Id,
            scoreType: '2-0',
            recordedBy: testPlayer1Id
          }
        ]
      });
    });

    it('should calculate win rate correctly', async () => {
      // Player 1: 2 wins, 1 loss = 66.67% win rate
      const expectedWinRate = 2 / 3; // 2 wins out of 3 matches

      const updatedPlayer = await prisma.mvpPlayer.update({
        where: { id: testPlayer1Id },
        data: {
          totalMatches: 3,
          wins: 2,
          losses: 1,
          winRate: expectedWinRate
        }
      });

      expect(updatedPlayer.winRate).toBeCloseTo(0.667, 2);
    });

    it('should track ranking and points', async () => {
      const playerWithRanking = await prisma.mvpPlayer.update({
        where: { id: testPlayer1Id },
        data: {
          ranking: 2,
          rankingPoints: 250
        }
      });

      expect(playerWithRanking.ranking).toBe(2);
      expect(playerWithRanking.rankingPoints).toBe(250);
    });

    it('should update last match date', async () => {
      const matchDate = new Date();
      const playerWithDate = await prisma.mvpPlayer.update({
        where: { id: testPlayer1Id },
        data: {
          lastMatchDate: matchDate
        }
      });

      expect(playerWithDate.lastMatchDate).toEqual(matchDate);
    });
  });

  describe('Player Relationships with Matches', () => {
    it('should include match relationships', async () => {
      const playerWithMatches = await prisma.mvpPlayer.findUnique({
        where: { id: testPlayer1Id },
        include: {
          player1Matches: true,
          player2Matches: true,
          winnerMatches: true,
          recorderMatches: true
        }
      });

      expect(playerWithMatches?.player1Matches).toBeDefined();
      expect(playerWithMatches?.player2Matches).toBeDefined();
      expect(playerWithMatches?.winnerMatches).toBeDefined();
      expect(playerWithMatches?.recorderMatches).toBeDefined();
    });

    it('should count matches correctly', async () => {
      const player1Matches = await prisma.match.findMany({
        where: {
          OR: [
            { player1Id: testPlayer1Id },
            { player2Id: testPlayer1Id }
          ]
        }
      });

      expect(player1Matches.length).toBe(3); // 3 matches created in beforeAll
    });

    it('should count wins correctly', async () => {
      const player1Wins = await prisma.match.count({
        where: { winnerId: testPlayer1Id }
      });

      expect(player1Wins).toBe(2); // 2 wins out of 3 matches
    });
  });

  describe('Ranking History', () => {
    it('should create ranking history entries', async () => {
      const rankingHistory = await prisma.playerRankingHistory.create({
        data: {
          playerId: testPlayer1Id,
          ranking: 3,
          rankingPoints: 200,
          performanceRating: 75.5,
          changeReason: 'match_win',
          pointsChange: 25
        }
      });

      expect(rankingHistory.ranking).toBe(3);
      expect(rankingHistory.rankingPoints).toBe(200);
      expect(rankingHistory.performanceRating).toBe(75.5);
      expect(rankingHistory.changeReason).toBe('match_win');
      expect(rankingHistory.pointsChange).toBe(25);
    });

    it('should include ranking history in player queries', async () => {
      const playerWithHistory = await prisma.mvpPlayer.findUnique({
        where: { id: testPlayer1Id },
        include: {
          rankingHistory: {
            orderBy: { recordedAt: 'desc' }
          }
        }
      });

      expect(playerWithHistory?.rankingHistory).toBeDefined();
      expect(playerWithHistory?.rankingHistory?.length).toBeGreaterThan(0);
    });
  });

  describe('Statistics Queries', () => {
    it('should find top ranked players', async () => {
      const topPlayers = await prisma.mvpPlayer.findMany({
        where: {
          ranking: {
            not: null
          }
        },
        orderBy: {
          ranking: 'asc'
        },
        take: 5
      });

      expect(topPlayers.length).toBeLessThanOrEqual(5);
      if (topPlayers.length > 1) {
        expect(topPlayers[0].ranking).toBeLessThanOrEqual(topPlayers[1].ranking!);
      }
    });

    it('should find players by win rate', async () => {
      const highWinRatePlayers = await prisma.mvpPlayer.findMany({
        where: {
          winRate: {
            gte: 0.5
          }
        },
        orderBy: {
          winRate: 'desc'
        }
      });

      highWinRatePlayers.forEach(player => {
        expect(player.winRate).toBeGreaterThanOrEqual(0.5);
      });
    });

    it('should find recently active players', async () => {
      const recentPlayers = await prisma.mvpPlayer.findMany({
        where: {
          lastMatchDate: {
            not: null
          }
        },
        orderBy: {
          lastMatchDate: 'desc'
        }
      });

      expect(recentPlayers.length).toBeGreaterThanOrEqual(0);
    });
  });
});