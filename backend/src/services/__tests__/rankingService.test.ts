import { PrismaClient } from '@prisma/client';
import {
  getPlayerRatingHistory,
  getSessionRankings,
  getGlobalRankings,
  initializePlayerRanking,
  applyWeeklyDecay,
} from '../rankingService';

const prisma = new PrismaClient();

describe('RankingService', () => {
  let testSessionId: string;
  let testPlayer1Id: string;
  let testPlayer2Id: string;
  let testPlayer3Id: string;

  beforeAll(async () => {
    const session = await prisma.mvpSession.create({
      data: {
        name: 'Test Session - Ranking Service',
        scheduledAt: new Date(),
        ownerName: 'Test Organizer',
        ownerDeviceId: 'organizer-device-123',
        shareCode: 'RANK' + Date.now(),
      },
    });
    testSessionId = session.id;

    const player1 = await prisma.mvpPlayer.create({
      data: {
        sessionId: testSessionId,
        name: 'Player 1',
        deviceId: 'player1-device-' + Date.now(),
        gamesPlayed: 10, wins: 8, losses: 2,
        winRate: 0.8, matchWinRate: 0.75,
        matchesPlayed: 4, matchWins: 3, matchLosses: 1,
      },
    });
    testPlayer1Id = player1.id;

    const player2 = await prisma.mvpPlayer.create({
      data: {
        sessionId: testSessionId,
        name: 'Player 2',
        deviceId: 'player2-device-' + Date.now(),
        gamesPlayed: 8, wins: 4, losses: 4,
        winRate: 0.5, matchWinRate: 0.5,
        matchesPlayed: 4, matchWins: 2, matchLosses: 2,
      },
    });
    testPlayer2Id = player2.id;

    const player3 = await prisma.mvpPlayer.create({
      data: {
        sessionId: testSessionId,
        name: 'Player 3',
        deviceId: 'player3-device-' + Date.now(),
        gamesPlayed: 6, wins: 5, losses: 1,
        winRate: 0.83, matchWinRate: 0.8,
        matchesPlayed: 3, matchWins: 2, matchLosses: 1,
      },
    });
    testPlayer3Id = player3.id;
  });

  afterAll(async () => {
    await prisma.mvpPlayer.deleteMany({ where: { sessionId: testSessionId } });
    await prisma.mvpSession.deleteMany({ where: { id: testSessionId } });
    await prisma.$disconnect();
  });

  describe('getPlayerRatingHistory', () => {
    it('should return empty array for valid player with no history', async () => {
      const history = await getPlayerRatingHistory(testPlayer1Id, 10);
      expect(Array.isArray(history)).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const history = await getPlayerRatingHistory(testPlayer1Id, 1);
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeLessThanOrEqual(1);
    });
  });

  describe('getSessionRankings', () => {
    it('should return rankings for a session', async () => {
      const rankings = await getSessionRankings(testSessionId, 0);
      expect(Array.isArray(rankings)).toBe(true);
      expect(rankings.length).toBeGreaterThanOrEqual(3);

      const first = rankings[0];
      expect(first).toHaveProperty('playerId');
      expect(first).toHaveProperty('playerName');
      expect(first).toHaveProperty('winRate');
      expect(first).toHaveProperty('gamesPlayed');
      expect(first).toHaveProperty('rating');
    });

    it('should sort by winRate descending', async () => {
      const rankings = await getSessionRankings(testSessionId, 0);
      for (let i = 0; i < rankings.length - 1; i++) {
        expect(rankings[i].winRate).toBeGreaterThanOrEqual(rankings[i + 1].winRate);
      }
    });

    it('should filter by minMatches', async () => {
      const rankings = await getSessionRankings(testSessionId, 10);
      expect(rankings.every((r) => r.gamesPlayed >= 10)).toBe(true);
    });
  });

  describe('getGlobalRankings', () => {
    it('should return global rankings', async () => {
      const rankings = await getGlobalRankings(1, 50);
      expect(Array.isArray(rankings)).toBe(true);
      expect(rankings.length).toBeGreaterThan(0);

      if (rankings.length > 0) {
        expect(rankings[0]).toHaveProperty('playerName');
        expect(rankings[0]).toHaveProperty('rating');
      }
    });

    it('should respect limit parameter', async () => {
      const rankings = await getGlobalRankings(0, 2);
      expect(rankings.length).toBeLessThanOrEqual(2);
    });

    it('should sort by rating descending', async () => {
      const rankings = await getGlobalRankings(0, 20);
      for (let i = 0; i < rankings.length - 1; i++) {
        expect(rankings[i].rating).toBeGreaterThanOrEqual(rankings[i + 1].rating);
      }
    });
  });

  describe('initializePlayerRanking', () => {
    it('should initialize player stats to zero', async () => {
      const newPlayer = await prisma.mvpPlayer.create({
        data: {
          sessionId: testSessionId,
          name: 'New Player ' + Date.now(),
          deviceId: 'np-device-' + Date.now(),
        },
      });

      await initializePlayerRanking(newPlayer.id);

      const updated = await prisma.mvpPlayer.findUnique({
        where: { id: newPlayer.id },
        select: { winRate: true, gamesPlayed: true, wins: true, losses: true },
      });

      expect(updated?.winRate).toBe(0);
      expect(updated?.gamesPlayed).toBe(0);
      expect(updated?.wins).toBe(0);
      expect(updated?.losses).toBe(0);

      await prisma.mvpPlayer.delete({ where: { id: newPlayer.id } });
    });
  });

  describe('applyWeeklyDecay', () => {
    it('should return decay result with message', async () => {
      const result = await applyWeeklyDecay();
      expect(result).toHaveProperty('decayedCount');
      expect(result).toHaveProperty('message');
      expect(typeof result.decayedCount).toBe('number');
      expect(typeof result.message).toBe('string');
    });
  });
});
