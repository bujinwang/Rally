// @ts-nocheck

const mockPrisma: Record<string, any> = {};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(function(this: any) {
    Object.assign(this, mockPrisma);
    return this;
  }),
}));

// Mock crypto.randomUUID for deterministic IDs
const originalCrypto = global.crypto;
global.crypto = { randomUUID: () => 'test-uuid-123' } as any;

Object.assign(mockPrisma, {
  $queryRaw: jest.fn(),
});

import { FriendsService } from '../friendsService';

const service = new FriendsService();

describe('FriendsService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('sendFriendRequest', () => {
    it('sends a friend request', async () => {
      // Check existing friendship — none
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);
      // Check existing request — none
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);
      // INSERT friend request
      mockPrisma.$queryRaw.mockResolvedValueOnce(undefined);
      // SELECT created request with names
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { id: 'r1', sender_id: 'u1', receiver_id: 'u2', message: 'Hi', status: 'PENDING', sent_at: '2026-01-01', sender_name: 'Alice', receiver_name: 'Bob' },
      ]);

      const result = await service.sendFriendRequest({ senderId: 'u1', receiverId: 'u2', message: 'Hi' });
      expect(result).toBeTruthy();
      expect(result!.status).toBe('PENDING');
      expect(result!.sender.name).toBe('Alice');
    });

    it('throws when already friends', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ id: 'f1' }]);
      await expect(
        service.sendFriendRequest({ senderId: 'u1', receiverId: 'u2' }),
      ).rejects.toThrow('already friends');
    });

    it('throws when pending request exists', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]); // no friendship
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ id: 'r1' }]); // pending request
      await expect(
        service.sendFriendRequest({ senderId: 'u1', receiverId: 'u2' }),
      ).rejects.toThrow('pending friend request');
    });
  });

  describe('respondToFriendRequest', () => {
    it('accepts a friend request', async () => {
      // Find pending request
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ id: 'r1', sender_id: 'u1', receiver_id: 'u2' }]);
      // UPDATE status
      mockPrisma.$queryRaw.mockResolvedValueOnce(undefined);
      // INSERT friendship
      mockPrisma.$queryRaw.mockResolvedValueOnce(undefined);
      // SELECT updated request
      mockPrisma.$queryRaw.mockResolvedValueOnce([{
        id: 'r1', sender_id: 'u1', receiver_id: 'u2', message: null, status: 'ACCEPTED',
        sent_at: '2026-01-01', responded_at: '2026-01-02',
        sender_name: 'Alice', receiver_name: 'Bob',
      }]);

      const result = await service.respondToFriendRequest('r1', 'u1', 'u2', true);
      expect(result).toBeTruthy();
      expect(result!.status).toBe('ACCEPTED');
    });

    it('throws when request not found', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);
      await expect(
        service.respondToFriendRequest('bad', 'u1', 'u2', true),
      ).rejects.toThrow('not found');
    });
  });

  describe('getFriendRequests', () => {
    it('returns received requests', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{
        id: 'r1', sender_id: 'u1', receiver_id: 'u2', message: null, status: 'PENDING',
        sent_at: '2026-01-01', responded_at: null, sender_name: 'Alice', receiver_name: 'Bob',
      }]);
      const requests = await service.getFriendRequests('u2', 'received');
      expect(requests).toHaveLength(1);
    });
  });

  describe('getFriends', () => {
    it('returns friends list', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{
        id: 'f1', player_id: 'u1', friend_id: 'u2', status: 'ACCEPTED',
        player_name: 'Alice', player_session: 's1',
        friend_name: 'Bob', friend_session: 's2',
        accepted_at: '2026-01-01',
      }]);
      const friends = await service.getFriends('u1');
      expect(friends).toHaveLength(1);
      expect(friends[0].friendName).toBe('Bob');
    });
  });

  describe('removeFriend', () => {
    it('removes a friend', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ id: 'f1' }]);
      mockPrisma.$queryRaw.mockResolvedValueOnce(undefined);
      const result = await service.removeFriend('u1', 'u2');
      expect(result.success).toBe(true);
    });

    it('throws when friendship not found', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);
      await expect(service.removeFriend('u1', 'u2')).rejects.toThrow('not found');
    });
  });

  describe('blockUser', () => {
    it('blocks a user', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]); // no existing friendship
      mockPrisma.$queryRaw.mockResolvedValueOnce(undefined); // INSERT blocked
      const result = await service.blockUser('u1', 'u2');
      expect(result.success).toBe(true);
    });
  });

  describe('unblockUser', () => {
    it('unblocks a user', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ id: 'b1' }]); // blocked
      mockPrisma.$queryRaw.mockResolvedValueOnce(undefined); // DELETE
      const result = await service.unblockUser('u1', 'u2');
      expect(result.success).toBe(true);
    });
  });

  describe('getBlockedUsers', () => {
    it('returns blocked users', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: 'b1', friend_id: 'u2', name: 'Bob' }]);
      const users = await service.getBlockedUsers('u1');
      expect(users).toHaveLength(1);
    });
  });

  describe('areFriends', () => {
    it('returns true for friends', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: 'f1' }]);
      expect(await service.areFriends('u1', 'u2')).toBe(true);
    });

    it('returns false for non-friends', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      expect(await service.areFriends('u1', 'u2')).toBe(false);
    });
  });

  describe('getFriendStats', () => {
    it('returns friend statistics', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ count: 5 }])  // friends
        .mockResolvedValueOnce([{ count: 2 }])  // pending received
        .mockResolvedValueOnce([{ count: 1 }]); // pending sent

      const stats = await service.getFriendStats('u1');
      expect(stats.friendsCount).toBe(5);
      expect(stats.pendingRequestsCount).toBe(2);
      expect(stats.sentRequestsCount).toBe(1);
    });
  });
});
