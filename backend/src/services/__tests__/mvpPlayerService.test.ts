// @ts-nocheck

// Build mock before jest.mock hoist — jest hoists the factory call,
// but the factory reference to the variable declared above works because
// jest.mock is hoisted as `jest.mock(module, factory)`, the factory is a 
// closure that captures `mockPrisma` by reference, resolving at call time.
const mockPrisma: Record<string, any> = {};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(function(this: any) {
    Object.assign(this, mockPrisma);
    return this;
  }),
}));

// Now populate mockPrisma (after jest.mock hoist but before import)
Object.assign(mockPrisma, {
  mvpSession: { findUnique: jest.fn() },
  mvpPlayer: {
    create: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
  mvpGame: { findMany: jest.fn() },
});

import { MvpPlayerService } from '../mvpPlayerService';

describe('MvpPlayerService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('createPlayer', () => {
    const validData = { sessionId: 's1', name: 'Alice', deviceId: 'dev1' };

    it('creates a player when session is active and has space', async () => {
      mockPrisma.mvpSession.findUnique.mockResolvedValue({ id: 's1', status: 'ACTIVE', maxPlayers: 8 });
      mockPrisma.mvpPlayer.count.mockResolvedValue(2);
      mockPrisma.mvpPlayer.findFirst.mockResolvedValue(null);
      mockPrisma.mvpPlayer.create.mockResolvedValue({ id: 'p1', sessionId: 's1', name: 'Alice', status: 'ACTIVE' });

      const player = await MvpPlayerService.createPlayer(validData);
      expect(player.id).toBe('p1');
      expect(player.name).toBe('Alice');
    });

    it('throws when session not found', async () => {
      mockPrisma.mvpSession.findUnique.mockResolvedValue(null);
      await expect(MvpPlayerService.createPlayer(validData)).rejects.toThrow('Session not found');
    });

    it('throws when session is full', async () => {
      mockPrisma.mvpSession.findUnique.mockResolvedValue({ id: 's1', status: 'ACTIVE', maxPlayers: 4 });
      mockPrisma.mvpPlayer.count.mockResolvedValue(4);
      await expect(MvpPlayerService.createPlayer(validData)).rejects.toThrow('Session is full');
    });

    it('throws when duplicate name exists', async () => {
      mockPrisma.mvpSession.findUnique.mockResolvedValue({ id: 's1', status: 'ACTIVE', maxPlayers: 8 });
      mockPrisma.mvpPlayer.count.mockResolvedValue(2);
      mockPrisma.mvpPlayer.findFirst.mockResolvedValueOnce({ id: 'existing', name: 'Alice' });
      await expect(MvpPlayerService.createPlayer(validData)).rejects.toThrow('already exists');
    });

    it('trims player name', async () => {
      mockPrisma.mvpSession.findUnique.mockResolvedValue({ id: 's1', status: 'ACTIVE', maxPlayers: 8 });
      mockPrisma.mvpPlayer.count.mockResolvedValue(0);
      mockPrisma.mvpPlayer.findFirst.mockResolvedValue(null);
      mockPrisma.mvpPlayer.create.mockResolvedValue({ id: 'p1', name: 'Alice' });
      await MvpPlayerService.createPlayer({ ...validData, name: '  Alice  ' });
      expect(mockPrisma.mvpPlayer.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ name: 'Alice' }) }),
      );
    });
  });

  describe('getPlayerById', () => {
    it('returns player with session info', async () => {
      mockPrisma.mvpPlayer.findUnique.mockResolvedValue({
        id: 'p1', name: 'Alice', session: { id: 's1', name: 'Test', shareCode: 'ABC', status: 'ACTIVE' },
      });
      const player = await MvpPlayerService.getPlayerById('p1');
      expect(player).toBeTruthy();
    });

    it('returns null for unknown', async () => {
      mockPrisma.mvpPlayer.findUnique.mockResolvedValue(null);
      expect(await MvpPlayerService.getPlayerById('bad')).toBeNull();
    });
  });

  describe('getPlayersBySession', () => {
    it('returns players', async () => {
      mockPrisma.mvpPlayer.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
      expect(await MvpPlayerService.getPlayersBySession('s1')).toHaveLength(2);
    });
  });

  describe('updatePlayerStatus', () => {
    it('updates as owner', async () => {
      mockPrisma.mvpPlayer.findUnique.mockResolvedValue({
        id: 'p1', deviceId: 'dev2', session: { ownerDeviceId: 'dev1' },
      });
      mockPrisma.mvpGame.findMany.mockResolvedValue([]);
      mockPrisma.mvpPlayer.update.mockResolvedValue({ id: 'p1', status: 'LEFT' });
      const player = await MvpPlayerService.updatePlayerStatus('p1', { status: 'LEFT' }, 'dev1');
      expect(player.status).toBe('LEFT');
    });

    it('throws when unauthorized', async () => {
      mockPrisma.mvpPlayer.findUnique.mockResolvedValue({
        id: 'p1', deviceId: 'dev3', session: { ownerDeviceId: 'dev2' },
      });
      await expect(
        MvpPlayerService.updatePlayerStatus('p1', { status: 'LEFT' }, 'dev1'),
      ).rejects.toThrow('Unauthorized');
    });
  });

  describe('removePlayer', () => {
    it('removes player', async () => {
      mockPrisma.mvpPlayer.findUnique.mockResolvedValue({
        id: 'p2', name: 'Bob', session: { ownerDeviceId: 'dev1', ownerName: 'David' },
      });
      mockPrisma.mvpGame.findMany.mockResolvedValue([]);
      await MvpPlayerService.removePlayer('p2', 'dev1');
      expect(mockPrisma.mvpPlayer.delete).toHaveBeenCalled();
    });

    it('throws when not owner', async () => {
      mockPrisma.mvpPlayer.findUnique.mockResolvedValue({
        id: 'p2', name: 'Bob', session: { ownerDeviceId: 'dev2' },
      });
      await expect(MvpPlayerService.removePlayer('p2', 'dev1')).rejects.toThrow('Unauthorized');
    });
  });

  describe('addPlayerByOrganizer', () => {
    it('adds player', async () => {
      mockPrisma.mvpSession.findUnique.mockResolvedValue({ id: 's1', status: 'ACTIVE', maxPlayers: 8, ownerDeviceId: 'dev1' });
      mockPrisma.mvpPlayer.count.mockResolvedValue(1);
      mockPrisma.mvpPlayer.findFirst.mockResolvedValue(null);
      mockPrisma.mvpPlayer.create.mockResolvedValue({ id: 'p1', name: 'Charlie', status: 'ACTIVE' });
      const player = await MvpPlayerService.addPlayerByOrganizer('s1', 'Charlie', 'dev1');
      expect(player.name).toBe('Charlie');
    });
  });

  describe('managePlayerRest', () => {
    it('sets RESTING with count', async () => {
      mockPrisma.mvpPlayer.findUnique.mockResolvedValue({
        id: 'p1', deviceId: 'dev1', session: { ownerDeviceId: 'dev1' },
      });
      mockPrisma.mvpGame.findMany.mockResolvedValue([]);
      mockPrisma.mvpPlayer.update.mockResolvedValue({ id: 'p1', status: 'RESTING', restGamesRemaining: 2 });
      const player = await MvpPlayerService.managePlayerRest('p1', { gamesCount: 2, requestedBy: 'David' }, 'dev1');
      expect(player.status).toBe('RESTING');
    });

    it('returns to ACTIVE when count=0', async () => {
      mockPrisma.mvpPlayer.findUnique.mockResolvedValue({
        id: 'p1', deviceId: 'dev1', session: { ownerDeviceId: 'dev1' },
      });
      mockPrisma.mvpPlayer.update.mockResolvedValue({ id: 'p1', status: 'ACTIVE', restGamesRemaining: 0 });
      const player = await MvpPlayerService.managePlayerRest('p1', { gamesCount: 0, requestedBy: 'David' }, 'dev1');
      expect(player.status).toBe('ACTIVE');
    });
  });

  describe('getPlayerByDeviceId', () => {
    it('finds by session+device', async () => {
      mockPrisma.mvpPlayer.findFirst.mockResolvedValue({ id: 'p1' });
      expect(await MvpPlayerService.getPlayerByDeviceId('s1', 'dev1')).toBeTruthy();
    });

    it('returns null when not found', async () => {
      mockPrisma.mvpPlayer.findFirst.mockResolvedValue(null);
      expect(await MvpPlayerService.getPlayerByDeviceId('s1', 'bad')).toBeNull();
    });
  });

  describe('getRestStatusBySession', () => {
    it('returns RESTING players', async () => {
      mockPrisma.mvpPlayer.findMany.mockResolvedValue([
        { id: 'p1', name: 'Alice', status: 'RESTING', restGamesRemaining: 2 },
      ]);
      const players = await MvpPlayerService.getRestStatusBySession('s1');
      expect(players).toHaveLength(1);
    });
  });
});
