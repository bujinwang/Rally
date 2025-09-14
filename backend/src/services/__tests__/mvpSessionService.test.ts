import { MvpSessionService } from '../mvpSessionService';
import { prisma } from '../../config/database';

// Mock the database
jest.mock('../../config/database', () => ({
  prisma: {
    mvpSession: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('MvpSessionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSession', () => {
    it('should create a new session successfully', async () => {
      const sessionData = {
        name: 'Test Session',
        scheduledAt: new Date(),
        ownerName: 'Test Owner',
        maxPlayers: 10,
      };

      const mockSession = {
        id: 'session-1',
        ...sessionData,
        shareCode: 'ABC123',
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.mvpSession.create.mockResolvedValue(mockSession);
      mockPrisma.mvpSession.findUnique.mockResolvedValue(null); // No existing share code

      const result = await MvpSessionService.createSession(sessionData);

      expect(result).toEqual(mockSession);
      expect(mockPrisma.mvpSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: sessionData.name,
          ownerName: sessionData.ownerName,
          shareCode: expect.any(String),
          status: 'ACTIVE',
        }),
      });
    });

    it('should throw error if session creation fails', async () => {
      const sessionData = {
        name: 'Test Session',
        scheduledAt: new Date(),
        ownerName: 'Test Owner',
      };

      mockPrisma.mvpSession.create.mockRejectedValue(new Error('Database error'));

      await expect(MvpSessionService.createSession(sessionData)).rejects.toThrow('Failed to create session');
    });
  });

  describe('getSessionByShareCode', () => {
    it('should return session with players when requested', async () => {
      const mockSession = {
        id: 'session-1',
        name: 'Test Session',
        shareCode: 'ABC123',
        players: [
          { id: 'player-1', name: 'Player 1', status: 'ACTIVE' },
        ],
      };

      mockPrisma.mvpSession.findUnique.mockResolvedValue(mockSession);

      const result = await MvpSessionService.getSessionByShareCode('ABC123', true);

      expect(result).toEqual(mockSession);
      expect(mockPrisma.mvpSession.findUnique).toHaveBeenCalledWith({
        where: { shareCode: 'ABC123' },
        include: {
          players: {
            select: expect.any(Object),
            orderBy: { joinedAt: 'asc' },
          },
        },
      });
    });

    it('should return null if session not found', async () => {
      mockPrisma.mvpSession.findUnique.mockResolvedValue(null);

      const result = await MvpSessionService.getSessionByShareCode('NONEXISTENT');

      expect(result).toBeNull();
    });
  });

  describe('getActiveSessions', () => {
    it('should return active sessions with pagination', async () => {
      const mockSessions = [
        { id: 'session-1', name: 'Session 1', status: 'ACTIVE' },
        { id: 'session-2', name: 'Session 2', status: 'ACTIVE' },
      ];

      mockPrisma.mvpSession.findMany.mockResolvedValue(mockSessions);

      const result = await MvpSessionService.getActiveSessions(10, 0);

      expect(result).toEqual(mockSessions);
      expect(mockPrisma.mvpSession.findMany).toHaveBeenCalledWith({
        where: { status: 'ACTIVE' },
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
        take: 10,
        skip: 0,
      });
    });
  });

  describe('updateSession', () => {
    it('should update session successfully', async () => {
      const updateData = { name: 'Updated Name', maxPlayers: 15 };
      const mockSession = {
        id: 'session-1',
        name: 'Updated Name',
        maxPlayers: 15,
      };

      mockPrisma.mvpSession.findUnique.mockResolvedValue({
        id: 'session-1',
        ownerDeviceId: 'device-123',
      });
      mockPrisma.mvpSession.update.mockResolvedValue(mockSession);

      const result = await MvpSessionService.updateSession('ABC123', updateData, 'device-123');

      expect(result).toEqual(mockSession);
      expect(mockPrisma.mvpSession.update).toHaveBeenCalledWith({
        where: { shareCode: 'ABC123' },
        data: updateData,
      });
    });

    it('should throw error for unauthorized update', async () => {
      mockPrisma.mvpSession.findUnique.mockResolvedValue({
        id: 'session-1',
        ownerDeviceId: 'device-123',
      });

      await expect(
        MvpSessionService.updateSession('ABC123', { name: 'New Name' }, 'wrong-device')
      ).rejects.toThrow('Unauthorized: Only session owner can update');
    });
  });

  describe('terminateSession', () => {
    it('should terminate session successfully', async () => {
      const mockSession = {
        id: 'session-1',
        status: 'CANCELLED',
      };

      mockPrisma.mvpSession.findUnique.mockResolvedValue({
        id: 'session-1',
        ownerDeviceId: 'device-123',
      });
      mockPrisma.mvpSession.update.mockResolvedValue(mockSession);

      const result = await MvpSessionService.terminateSession('ABC123', 'device-123');

      expect(result).toEqual(mockSession);
      expect(mockPrisma.mvpSession.update).toHaveBeenCalledWith({
        where: { shareCode: 'ABC123' },
        data: { status: 'CANCELLED' },
      });
    });

    it('should throw error for unauthorized termination', async () => {
      mockPrisma.mvpSession.findUnique.mockResolvedValue({
        id: 'session-1',
        ownerDeviceId: 'device-123',
      });

      await expect(
        MvpSessionService.terminateSession('ABC123', 'wrong-device')
      ).rejects.toThrow('Unauthorized: Only session owner can terminate');
    });
  });
});