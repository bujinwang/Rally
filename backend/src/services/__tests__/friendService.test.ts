jest.mock('../../config/database', () => ({
  prisma: {
    mvpPlayer: { findUnique: jest.fn(), findMany: jest.fn() },
    friend: { findFirst: jest.fn(), create: jest.fn(), delete: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
    friendRequest: { findFirst: jest.fn(), create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn().mockResolvedValue([{}, {}]),
  },
}));

import { prisma } from '../../config/database';
import { FriendService } from '../friendService';

describe('FriendService', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── Send Friend Request ───────────────────────────────────

  describe('sendFriendRequest', () => {
    it('sends friend request successfully', async () => {
      (prisma.mvpPlayer.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'sender', name: 'David' })
        .mockResolvedValueOnce({ id: 'receiver', name: 'Kevin' });
      (prisma.friend.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.friendRequest.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.friendRequest.create as jest.Mock).mockResolvedValue({
        id: 'fr1', senderId: 'sender', receiverId: 'receiver', message: 'Hey!',
        status: 'PENDING', sentAt: new Date(), respondedAt: null,
        sender: { id: 'sender', name: 'David' },
        receiver: { id: 'receiver', name: 'Kevin' },
      });

      const result = await FriendService.sendFriendRequest({
        senderId: 'sender', receiverId: 'receiver', message: 'Hey!',
      });

      expect(result.status).toBe('PENDING');
      expect(result.sender.name).toBe('David');
    });

    it('throws when sender not found', async () => {
      (prisma.mvpPlayer.findUnique as jest.Mock).mockResolvedValueOnce(null);
      await expect(
        FriendService.sendFriendRequest({ senderId: 'bad', receiverId: 'r1' })
      ).rejects.toThrow('Sender or receiver not found');
    });

    it('throws when already friends', async () => {
      (prisma.mvpPlayer.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 's1' }).mockResolvedValueOnce({ id: 'r1' });
      (prisma.friend.findFirst as jest.Mock).mockResolvedValue({ id: 'f1', status: 'ACCEPTED' });

      await expect(
        FriendService.sendFriendRequest({ senderId: 's1', receiverId: 'r1' })
      ).rejects.toThrow('already exists or you are already friends');
    });

    it('throws when blocked', async () => {
      (prisma.mvpPlayer.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 's1' }).mockResolvedValueOnce({ id: 'r1' });
      (prisma.friend.findFirst as jest.Mock).mockResolvedValue({ id: 'f1', status: 'BLOCKED' });

      await expect(
        FriendService.sendFriendRequest({ senderId: 's1', receiverId: 'r1' })
      ).rejects.toThrow('Cannot send friend request to blocked user');
    });
  });

  // ── Respond to Request ─────────────────────────────────────

  describe('respondToFriendRequest', () => {
    it('accepts friend request', async () => {
      (prisma.friendRequest.findUnique as jest.Mock).mockResolvedValue({
        id: 'fr1', senderId: 's1', receiverId: 'r1', status: 'PENDING',
      });

      const result = await FriendService.respondToFriendRequest('fr1', 'r1', true);
      expect(result.success).toBe(true);
    });

    it('declines friend request', async () => {
      (prisma.friendRequest.findUnique as jest.Mock).mockResolvedValue({
        id: 'fr1', senderId: 's1', receiverId: 'r1', status: 'PENDING',
      });
      (prisma.friendRequest.update as jest.Mock).mockResolvedValue({
        id: 'fr1', status: 'DECLINED',
      });

      const result = await FriendService.respondToFriendRequest('fr1', 'r1', false);
      expect(result.success).toBe(true);
    });

    it('throws if not the receiver', async () => {
      (prisma.friendRequest.findUnique as jest.Mock).mockResolvedValue({
        id: 'fr1', senderId: 's1', receiverId: 'r1', status: 'PENDING',
      });

      await expect(
        FriendService.respondToFriendRequest('fr1', 'wrongUser', true)
      ).rejects.toThrow('not authorized');
    });

    it('throws if already responded', async () => {
      (prisma.friendRequest.findUnique as jest.Mock).mockResolvedValue({
        id: 'fr1', senderId: 's1', receiverId: 'r1', status: 'ACCEPTED',
      });

      await expect(
        FriendService.respondToFriendRequest('fr1', 'r1', true)
      ).rejects.toThrow('already been responded');
    });
  });

  // ── Get Friends ────────────────────────────────────────────

  describe('getFriends', () => {
    it('returns friends list', async () => {
      (prisma.friend.findMany as jest.Mock).mockResolvedValue([
        { id: 'f1', playerId: 'u1', friendId: 'u2', status: 'ACCEPTED',
          requestedAt: new Date(), acceptedAt: new Date(),
          player: { id: 'u1', name: 'David', status: 'ACTIVE' },
          friend: { id: 'u2', name: 'Kevin', status: 'ACTIVE' } },
      ]);

      const result = await FriendService.getFriends('u1');
      expect(result).toHaveLength(1);
      expect(result[0].friend.name).toBe('Kevin');
    });
  });

  // ── Block / Unblock ────────────────────────────────────────

  describe('blockUser', () => {
    it('blocks successfully', async () => {
      (prisma.friend.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.friendRequest.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.friend.create as jest.Mock).mockResolvedValue({ id: 'b1', status: 'BLOCKED' });

      const result = await FriendService.blockUser('u1', 'u2');
      expect(result.success).toBe(true);
    });
  });

  describe('unblockUser', () => {
    it('throws if not blocked', async () => {
      (prisma.friend.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(FriendService.unblockUser('u1', 'u2')).rejects.toThrow('not blocked');
    });
  });

  // ── Friend Stats ───────────────────────────────────────────

  describe('getFriendStats', () => {
    it('returns friend statistics', async () => {
      (prisma.friend.count as jest.Mock).mockResolvedValueOnce(10)  // total friends
        .mockResolvedValueOnce(3); // blocked
      (prisma.friendRequest.count as jest.Mock).mockResolvedValueOnce(2) // pending received
        .mockResolvedValueOnce(1); // pending sent

      const stats = await FriendService.getFriendStats('u1');
      expect(stats.totalFriends).toBe(10);
      expect(stats.pendingRequests).toBe(2);
      expect(stats.sentRequests).toBe(1);
      expect(stats.blockedUsers).toBe(3);
    });
  });

  // ── Are Friends ────────────────────────────────────────────

  describe('areFriends', () => {
    it('returns true when friends', async () => {
      (prisma.friend.findFirst as jest.Mock).mockResolvedValue({ id: 'f1' });
      const result = await FriendService.areFriends('u1', 'u2');
      expect(result).toBe(true);
    });

    it('returns false when not friends', async () => {
      (prisma.friend.findFirst as jest.Mock).mockResolvedValue(null);
      const result = await FriendService.areFriends('u1', 'u2');
      expect(result).toBe(false);
    });
  });
});
