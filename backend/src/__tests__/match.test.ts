import { PrismaClient } from '@prisma/client';
import { Match, CreateMatchInput } from '../types/match';

const prisma = new PrismaClient();

describe('Match Model', () => {
  let testSessionId: string;
  let testPlayer1Id: string;
  let testPlayer2Id: string;

  beforeAll(async () => {
    // Create test data
    const session = await prisma.mvpSession.create({
      data: {
        name: 'Test Session - Match Model',
        scheduledAt: new Date(),
        ownerName: 'Test Owner',
        shareCode: 'TEST123'
      }
    });
    testSessionId = session.id;

    const player1 = await prisma.mvpPlayer.create({
      data: {
        sessionId: testSessionId,
        name: 'Player 1'
      }
    });
    testPlayer1Id = player1.id;

    const player2 = await prisma.mvpPlayer.create({
      data: {
        sessionId: testSessionId,
        name: 'Player 2'
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

  describe('Match Creation', () => {
    it('should create a match with valid data', async () => {
      const matchData: CreateMatchInput = {
        sessionId: testSessionId,
        player1Id: testPlayer1Id,
        player2Id: testPlayer2Id,
        winnerId: testPlayer1Id,
        scoreType: '2-0',
        recordedBy: testPlayer1Id
      };

      const match = await prisma.match.create({
        data: matchData,
        include: {
          player1: true,
          player2: true,
          winner: true,
          recorder: true,
          session: true
        }
      });

      expect(match).toBeDefined();
      expect(match.sessionId).toBe(testSessionId);
      expect(match.player1Id).toBe(testPlayer1Id);
      expect(match.player2Id).toBe(testPlayer2Id);
      expect(match.winnerId).toBe(testPlayer1Id);
      expect(match.scoreType).toBe('2-0');
      expect(match.recordedBy).toBe(testPlayer1Id);
      expect(match.recordedAt).toBeInstanceOf(Date);
      expect(match.player1.name).toBe('Player 1');
      expect(match.player2.name).toBe('Player 2');
      expect(match.winner.name).toBe('Player 1');
    });

    it('should create a match with 2-1 score type', async () => {
      const matchData: CreateMatchInput = {
        sessionId: testSessionId,
        player1Id: testPlayer1Id,
        player2Id: testPlayer2Id,
        winnerId: testPlayer2Id,
        scoreType: '2-1',
        recordedBy: testPlayer2Id
      };

      const match = await prisma.match.create({
        data: matchData
      });

      expect(match.scoreType).toBe('2-1');
      expect(match.winnerId).toBe(testPlayer2Id);
    });
  });

  describe('Match Relationships', () => {
    let matchId: string;

    beforeAll(async () => {
      const match = await prisma.match.create({
        data: {
          sessionId: testSessionId,
          player1Id: testPlayer1Id,
          player2Id: testPlayer2Id,
          winnerId: testPlayer1Id,
          scoreType: '2-0',
          recordedBy: testPlayer1Id
        }
      });
      matchId = match.id;
    });

    it('should include player relationships', async () => {
      const match = await prisma.match.findUnique({
        where: { id: matchId },
        include: {
          player1: true,
          player2: true,
          winner: true,
          recorder: true
        }
      });

      expect(match?.player1.name).toBe('Player 1');
      expect(match?.player2.name).toBe('Player 2');
      expect(match?.winner.name).toBe('Player 1');
      expect(match?.recorder.name).toBe('Player 1');
    });

    it('should include session relationship', async () => {
      const match = await prisma.match.findUnique({
        where: { id: matchId },
        include: {
          session: true
        }
      });

      expect(match?.session.name).toBe('Test Session - Match Model');
    });
  });

  describe('Match Approval', () => {
    it('should allow approval of a match', async () => {
      const match = await prisma.match.create({
        data: {
          sessionId: testSessionId,
          player1Id: testPlayer1Id,
          player2Id: testPlayer2Id,
          winnerId: testPlayer1Id,
          scoreType: '2-0',
          recordedBy: testPlayer1Id
        }
      });

      const approvedMatch = await prisma.match.update({
        where: { id: match.id },
        data: {
          approvedBy: testPlayer2Id,
          approvedAt: new Date()
        },
        include: {
          approver: true
        }
      });

      expect(approvedMatch.approvedBy).toBe(testPlayer2Id);
      expect(approvedMatch.approvedAt).toBeInstanceOf(Date);
      expect(approvedMatch.approver?.name).toBe('Player 2');
    });
  });

  describe('Match Queries', () => {
    beforeAll(async () => {
      // Create multiple matches for testing queries
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
          }
        ]
      });
    });

    it('should find matches by session', async () => {
      const matches = await prisma.match.findMany({
        where: { sessionId: testSessionId }
      });

      expect(matches.length).toBeGreaterThanOrEqual(2);
      matches.forEach(match => {
        expect(match.sessionId).toBe(testSessionId);
      });
    });

    it('should find matches by player', async () => {
      const player1Matches = await prisma.match.findMany({
        where: {
          OR: [
            { player1Id: testPlayer1Id },
            { player2Id: testPlayer1Id }
          ]
        }
      });

      expect(player1Matches.length).toBeGreaterThanOrEqual(2);
    });

    it('should find matches by winner', async () => {
      const winnerMatches = await prisma.match.findMany({
        where: { winnerId: testPlayer1Id }
      });

      expect(winnerMatches.length).toBeGreaterThanOrEqual(1);
      winnerMatches.forEach(match => {
        expect(match.winnerId).toBe(testPlayer1Id);
      });
    });
  });
});