import request from 'supertest';
import express from 'express';

jest.mock('../../middleware/auth', () => ({
  authenticateToken: (_r: any, _s: any, n: any) => n(),
  getCurrentUser: () => null,
}));

jest.mock('../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    userSettings: { findUnique: jest.fn(), upsert: jest.fn() },
    friend: { findFirst: jest.fn() },
    mvpPlayer: { aggregate: jest.fn() },
  },
}));

jest.mock('../../utils/fileUpload', () => ({
  upload: { single: () => (_r: any, _s: any, n: any) => n() },
  deleteFile: jest.fn(),
}));

import { prisma } from '../../config/database';
import { deleteFile } from '../../utils/fileUpload';
import usersRouter from '../users';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = { id: 'user1', email: 'user1@example.com', role: 'PLAYER' };
  if (req.headers['x-file'] === '1') req.file = { filename: 'avatar-123.png' };
  next();
});
app.use(usersRouter);

const userFindUnique = prisma.user.findUnique as jest.Mock;
const userUpdate = prisma.user.update as jest.Mock;
const userFindMany = prisma.user.findMany as jest.Mock;
const settingsFindUnique = prisma.userSettings.findUnique as jest.Mock;
const settingsUpsert = prisma.userSettings.upsert as jest.Mock;
const friendFindFirst = prisma.friend.findFirst as jest.Mock;
const playerAggregate = prisma.mvpPlayer.aggregate as jest.Mock;
const deleteFileMock = deleteFile as jest.Mock;

const baseUser = {
  id: 'user2',
  name: 'Kevin',
  email: 'kevin@example.com',
  phone: '+6591234567',
  avatarUrl: null,
  role: 'PLAYER',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  _count: { ownedSessions: 3, sessionPlayers: 2 },
};

const emptyAggregate = {
  _sum: {
    gamesPlayed: 10,
    wins: 6,
    losses: 4,
    matchesPlayed: 5,
    matchWins: 3,
    matchLosses: 2,
  },
  _avg: { winRate: 60 },
};

describe('User Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    playerAggregate.mockResolvedValue(emptyAggregate);
  });

  // ── GET /users/:userId/profile ──────────────────────────────
  describe('GET /users/:userId/profile', () => {
    it('returns 404 when user does not exist', async () => {
      userFindUnique.mockResolvedValue(null);

      const res = await request(app).get('/users/missing/profile').expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns own profile with email and phone', async () => {
      userFindUnique.mockResolvedValue({ ...baseUser, id: 'user1' });
      settingsFindUnique.mockResolvedValue(null);

      const res = await request(app).get('/users/user1/profile').expect(200);

      expect(res.body.data.profile.isOwnProfile).toBe(true);
      expect(res.body.data.profile.email).toBe('kevin@example.com');
      expect(res.body.data.profile.stats.totalSessions).toBe(5);
      expect(res.body.data.profile.stats.winRate).toBe(60);
    });

    it('hides email and phone on another public profile', async () => {
      userFindUnique.mockResolvedValue(baseUser);
      settingsFindUnique.mockResolvedValue({ profileVisibility: 'public' });

      const res = await request(app).get('/users/user2/profile').expect(200);

      expect(res.body.data.profile.isOwnProfile).toBe(false);
      expect(res.body.data.profile.email).toBeUndefined();
      expect(res.body.data.profile.phone).toBeUndefined();
    });

    it('returns 403 for a private profile', async () => {
      userFindUnique.mockResolvedValue(baseUser);
      settingsFindUnique.mockResolvedValue({ profileVisibility: 'private' });

      const res = await request(app).get('/users/user2/profile').expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 for friends-only profile when not friends', async () => {
      userFindUnique.mockResolvedValue(baseUser);
      settingsFindUnique.mockResolvedValue({ profileVisibility: 'friends' });
      friendFindFirst.mockResolvedValue(null);

      const res = await request(app).get('/users/user2/profile').expect(403);
      expect(res.body.error.message).toContain('friends');
    });

    it('allows friends-only profile when friendship exists', async () => {
      userFindUnique.mockResolvedValue(baseUser);
      settingsFindUnique.mockResolvedValue({ profileVisibility: 'friends' });
      friendFindFirst.mockResolvedValue({ id: 'f1', status: 'ACCEPTED' });

      const res = await request(app).get('/users/user2/profile').expect(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 500 on unexpected error', async () => {
      userFindUnique.mockRejectedValue(new Error('db down'));

      const res = await request(app).get('/users/user2/profile').expect(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  // ── PUT /users/:userId/profile ──────────────────────────────
  describe('PUT /users/:userId/profile', () => {
    it('returns 403 when updating another user', async () => {
      const res = await request(app)
        .put('/users/user2/profile')
        .send({ name: 'Hacker' })
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(userUpdate).not.toHaveBeenCalled();
    });

    it('updates own profile', async () => {
      userUpdate.mockResolvedValue({ id: 'user1', name: 'David', email: 'user1@example.com' });

      const res = await request(app)
        .put('/users/user1/profile')
        .send({ name: 'David', skillLevel: 'advanced' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(userUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user1' } }),
      );
    });

    it('returns 400 for invalid payload', async () => {
      const res = await request(app)
        .put('/users/user1/profile')
        .send({ name: 'X' })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(userUpdate).not.toHaveBeenCalled();
    });

    it('returns 500 on unexpected error', async () => {
      userUpdate.mockRejectedValue(new Error('db down'));

      const res = await request(app)
        .put('/users/user1/profile')
        .send({ name: 'David' })
        .expect(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  // ── GET /users/:userId/settings ─────────────────────────────
  describe('GET /users/:userId/settings', () => {
    it('returns 403 for another user', async () => {
      const res = await request(app).get('/users/user2/settings').expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('returns stored settings', async () => {
      settingsFindUnique.mockResolvedValue({
        profileVisibility: 'private',
        showEmail: true,
        showPhone: false,
        showStats: true,
        showLocation: false,
        friendRequests: false,
        messages: true,
        sessionInvites: true,
        matchResults: false,
        achievements: true,
      });

      const res = await request(app).get('/users/user1/settings').expect(200);
      expect(res.body.data.settings.privacySettings.profileVisibility).toBe('private');
      expect(res.body.data.settings.notificationSettings.messages).toBe(true);
    });

    it('returns defaults when no record exists', async () => {
      settingsFindUnique.mockResolvedValue(null);

      const res = await request(app).get('/users/user1/settings').expect(200);
      expect(res.body.data.settings.privacySettings.profileVisibility).toBe('public');
      expect(res.body.data.settings.privacySettings.showEmail).toBe(false);
      expect(res.body.data.settings.notificationSettings.friendRequests).toBe(true);
    });

    it('returns 500 on unexpected error', async () => {
      settingsFindUnique.mockRejectedValue(new Error('db down'));
      await request(app).get('/users/user1/settings').expect(500);
    });
  });

  // ── PUT /users/:userId/settings ─────────────────────────────
  describe('PUT /users/:userId/settings', () => {
    it('returns 403 for another user', async () => {
      await request(app)
        .put('/users/user2/settings')
        .send({ privacySettings: { showEmail: true } })
        .expect(403);
    });

    it('upserts settings', async () => {
      settingsUpsert.mockResolvedValue({ id: 'set1' });

      const res = await request(app)
        .put('/users/user1/settings')
        .send({
          privacySettings: { profileVisibility: 'friends', showEmail: true },
          notificationSettings: { messages: false },
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(settingsUpsert).toHaveBeenCalledTimes(1);
      const args = settingsUpsert.mock.calls[0][0];
      expect(args.where).toEqual({ userId: 'user1' });
      expect(args.update.profileVisibility).toBe('friends');
    });

    it('returns 400 for invalid visibility value', async () => {
      const res = await request(app)
        .put('/users/user1/settings')
        .send({ privacySettings: { profileVisibility: 'everyone' } })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(settingsUpsert).not.toHaveBeenCalled();
    });

    it('returns 500 on unexpected error', async () => {
      settingsUpsert.mockRejectedValue(new Error('db down'));
      await request(app)
        .put('/users/user1/settings')
        .send({ privacySettings: { showEmail: true } })
        .expect(500);
    });
  });

  // ── GET /users/search ───────────────────────────────────────
  describe('GET /users/search', () => {
    it('returns 400 when q is missing', async () => {
      const res = await request(app).get('/users/search').expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('searches users and clamps the limit to 50', async () => {
      userFindMany.mockResolvedValue([{ id: 'user2', name: 'Kevin', avatarUrl: null, role: 'PLAYER' }]);

      const res = await request(app).get('/users/search?q=kev&limit=100').expect(200);

      expect(res.body.data.count).toBe(1);
      expect(userFindMany.mock.calls[0][0].take).toBe(50);
    });

    it('returns 500 on unexpected error', async () => {
      userFindMany.mockRejectedValue(new Error('db down'));
      await request(app).get('/users/search?q=kev').expect(500);
    });
  });

  // ── POST /users/:userId/avatar ──────────────────────────────
  describe('POST /users/:userId/avatar', () => {
    it('returns 403 for another user', async () => {
      await request(app).post('/users/user2/avatar').expect(403);
    });

    it('returns 400 when no file is uploaded', async () => {
      const res = await request(app).post('/users/user1/avatar').expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('stores the new avatar and deletes the old one', async () => {
      userFindUnique.mockResolvedValue({ avatarUrl: '/uploads/avatars/old.png' });
      userUpdate.mockResolvedValue({ id: 'user1', name: 'David', avatarUrl: '/uploads/avatars/avatar-123.png' });

      const res = await request(app)
        .post('/users/user1/avatar')
        .set('x-file', '1')
        .expect(200);

      expect(deleteFileMock).toHaveBeenCalledWith('/uploads/avatars/old.png');
      expect(userUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { avatarUrl: '/uploads/avatars/avatar-123.png' } }),
      );
      expect(res.body.data.avatarUrl).toBe('/uploads/avatars/avatar-123.png');
    });

    it('skips deletion when there is no previous avatar', async () => {
      userFindUnique.mockResolvedValue({ avatarUrl: null });
      userUpdate.mockResolvedValue({ id: 'user1', avatarUrl: '/uploads/avatars/avatar-123.png' });

      await request(app).post('/users/user1/avatar').set('x-file', '1').expect(200);
      expect(deleteFileMock).not.toHaveBeenCalled();
    });

    it('returns 500 on unexpected error', async () => {
      userFindUnique.mockResolvedValue({ avatarUrl: null });
      userUpdate.mockRejectedValue(new Error('db down'));

      await request(app).post('/users/user1/avatar').set('x-file', '1').expect(500);
    });
  });

  // ── DELETE /users/:userId/avatar ────────────────────────────
  describe('DELETE /users/:userId/avatar', () => {
    it('returns 403 for another user', async () => {
      await request(app).delete('/users/user2/avatar').expect(403);
    });

    it('returns 404 when there is no avatar', async () => {
      userFindUnique.mockResolvedValue({ avatarUrl: null });
      const res = await request(app).delete('/users/user1/avatar').expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('deletes the avatar and clears the field', async () => {
      userFindUnique.mockResolvedValue({ avatarUrl: '/uploads/avatars/old.png' });
      userUpdate.mockResolvedValue({ id: 'user1', avatarUrl: null });

      const res = await request(app).delete('/users/user1/avatar').expect(200);

      expect(deleteFileMock).toHaveBeenCalledWith('/uploads/avatars/old.png');
      expect(userUpdate).toHaveBeenCalledWith({ where: { id: 'user1' }, data: { avatarUrl: null } });
      expect(res.body.message).toContain('deleted');
    });

    it('returns 500 on unexpected error', async () => {
      userFindUnique.mockRejectedValue(new Error('db down'));
      await request(app).delete('/users/user1/avatar').expect(500);
    });
  });
});
