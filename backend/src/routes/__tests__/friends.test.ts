import request from 'supertest';
import express from 'express';

jest.mock('../../middleware/auth', () => ({ authenticateToken: (_r: any, _s: any, n: any) => n() }));
jest.mock('../../utils/validation', () => ({ validate: () => (_r: any, _s: any, n: any) => n() }));
jest.mock('../../services/friendService', () => ({
  FriendService: {
    sendFriendRequest: jest.fn(),
    respondToFriendRequest: jest.fn(),
    getFriendRequests: jest.fn(),
    getFriends: jest.fn(),
    removeFriend: jest.fn(),
    blockUser: jest.fn(),
    unblockUser: jest.fn(),
    getBlockedUsers: jest.fn(),
    getFriendStats: jest.fn(),
    areFriends: jest.fn(),
    getFriendSuggestions: jest.fn(),
  },
}));
jest.mock('../../utils/notificationHelper', () => ({ notifyDevice: jest.fn().mockResolvedValue(undefined) }));

import { FriendService } from '../../services/friendService';
import friendsRouter from '../friends';

const app = express();
app.use(express.json());
// Mock auth user on all requests
app.use((req: any, _res, next) => { req.user = { id: 'user1', email: 'a@b.com', role: 'player' }; next(); });
app.use('/friends', friendsRouter);

describe('Friend Routes', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('POST /friends/requests', () => {
    it('sends friend request', async () => {
      (FriendService.sendFriendRequest as jest.Mock).mockResolvedValue({
        id: 'fr1', senderId: 'user1', receiverId: 'user2', status: 'PENDING',
        sender: { id: 'user1', name: 'David', avatarUrl: null },
        receiver: { id: 'user2', name: 'Kevin', avatarUrl: null },
      });

      const res = await request(app)
        .post('/friends/requests')
        .send({ receiverId: 'user2', message: 'Hey!' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('PENDING');
    });

    it('rejects self-request', async () => {
      const res = await request(app)
        .post('/friends/requests')
        .send({ receiverId: 'user1' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /friends/requests/:requestId', () => {
    it('accepts friend request', async () => {
      (FriendService.respondToFriendRequest as jest.Mock).mockResolvedValue({ success: true, senderId: 'user2' });

      const res = await request(app)
        .put('/friends/requests/fr1')
        .send({ accept: true })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('declines friend request', async () => {
      (FriendService.respondToFriendRequest as jest.Mock).mockResolvedValue({ success: true });

      const res = await request(app)
        .put('/friends/requests/fr1')
        .send({ accept: false })
        .expect(200);

      expect(res.body.message).toContain('declined');
    });

    it('validates accept is boolean', async () => {
      const res = await request(app)
        .put('/friends/requests/fr1')
        .send({ accept: 'yes' })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /friends/requests', () => {
    it('returns received requests by default', async () => {
      (FriendService.getFriendRequests as jest.Mock).mockResolvedValue([{ id: 'fr1', status: 'PENDING' }]);
      const res = await request(app).get('/friends/requests').expect(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('supports type=sent', async () => {
      (FriendService.getFriendRequests as jest.Mock).mockResolvedValue([]);
      await request(app).get('/friends/requests?type=sent').expect(200);
      expect(FriendService.getFriendRequests).toHaveBeenCalledWith('user1', 'sent');
    });
  });

  describe('GET /friends', () => {
    it('returns friends list', async () => {
      (FriendService.getFriends as jest.Mock).mockResolvedValue([
        { id: 'f1', friend: { id: 'user2', name: 'Kevin', avatarUrl: null, status: 'ACTIVE' } },
      ]);

      const res = await request(app).get('/friends').expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.count).toBe(1);
    });
  });

  describe('DELETE /friends/:friendId', () => {
    it('removes friend', async () => {
      (FriendService.removeFriend as jest.Mock).mockResolvedValue({ success: true, message: 'Friend removed' });
      const res = await request(app).delete('/friends/user2').expect(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /friends/block/:targetUserId', () => {
    it('blocks user', async () => {
      (FriendService.blockUser as jest.Mock).mockResolvedValue({ success: true });
      const res = await request(app).post('/friends/block/user2').expect(200);
      expect(res.body.success).toBe(true);
    });

    it('rejects self-block', async () => {
      const res = await request(app).post('/friends/block/user1').expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /friends/block/:targetUserId', () => {
    it('unblocks user', async () => {
      (FriendService.unblockUser as jest.Mock).mockResolvedValue({ success: true });
      const res = await request(app).delete('/friends/block/user2').expect(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /friends/blocked', () => {
    it('returns blocked users', async () => {
      (FriendService.getBlockedUsers as jest.Mock).mockResolvedValue([{ id: 'b1', userId: 'user2', name: 'Kevin' }]);
      const res = await request(app).get('/friends/blocked').expect(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /friends/stats', () => {
    it('returns friend statistics', async () => {
      (FriendService.getFriendStats as jest.Mock).mockResolvedValue({ totalFriends: 10, pendingRequests: 2, sentRequests: 1, blockedUsers: 3 });
      const res = await request(app).get('/friends/stats').expect(200);
      expect(res.body.data.totalFriends).toBe(10);
    });
  });

  describe('GET /friends/check/:otherUserId', () => {
    it('returns friendship status', async () => {
      (FriendService.areFriends as jest.Mock).mockResolvedValue(true);
      const res = await request(app).get('/friends/check/user2').expect(200);
      expect(res.body.data.areFriends).toBe(true);
    });
  });

  describe('GET /friends/suggestions', () => {
    it('returns friend suggestions', async () => {
      (FriendService.getFriendSuggestions as jest.Mock).mockResolvedValue([{ id: 'u3', name: 'Jie', mutualFriends: 3 }]);
      const res = await request(app).get('/friends/suggestions').expect(200);
      expect(res.body.data).toHaveLength(1);
    });
  });
});
