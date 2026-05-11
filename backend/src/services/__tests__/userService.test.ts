// @ts-nocheck

const mockPrisma: Record<string, any> = {};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(function(this: any) {
    Object.assign(this, mockPrisma);
    return this;
  }),
}));

Object.assign(mockPrisma, {
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    aggregate: jest.fn(),
  },
  mvpPlayer: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
    aggregate: jest.fn(),
  },
  userSettings: {
    findUnique: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn(),
  },
});

import { UserService } from '../userService';

describe('UserService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getUserProfile', () => {
    it('returns own profile with email/phone', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1', name: 'Alice', email: 'a@b.com', phone: '555', avatarUrl: null, role: 'player',
        _count: { ownedSessions: 3, sessionPlayers: 10 },
      });
      mockPrisma.mvpPlayer.aggregate.mockResolvedValue({
        _sum: { gamesPlayed: 42, wins: 25, losses: 17 },
        _avg: { winRate: 0.6 },
      });

      const profile = await UserService.getUserProfile('u1', 'u1');
      expect(profile).toBeTruthy();
      expect(profile!.email).toBe('a@b.com'); // own profile shows email
      expect(profile!.stats.gamesPlayed).toBe(42);
      expect(profile!.stats.wins).toBe(25);
      expect(profile!.isOwnProfile).toBe(true);
    });

    it('hides email/phone for other user profile', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1', name: 'Alice', email: 'a@b.com', phone: '555', avatarUrl: null, role: 'player',
        _count: { ownedSessions: 1, sessionPlayers: 5 },
      });
      mockPrisma.mvpPlayer.aggregate.mockResolvedValue({
        _sum: { gamesPlayed: 10, wins: 5, losses: 5 },
        _avg: { winRate: 0.5 },
      });

      const profile = await UserService.getUserProfile('u1', 'u2');
      expect(profile!.email).toBeUndefined(); // not own profile
      expect(profile!.phone).toBeUndefined();
      expect(profile!.isOwnProfile).toBe(false);
    });

    it('returns null for unknown user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      expect(await UserService.getUserProfile('bad', 'u1')).toBeNull();
    });
  });

  describe('updateProfile', () => {
    it('updates allowed fields', async () => {
      mockPrisma.user.update.mockResolvedValue({ id: 'u1', name: 'NewName' });
      const user = await UserService.updateProfile('u1', { name: 'NewName', bio: 'Hello' });
      expect(user.name).toBe('NewName');
    });
  });

  describe('searchUsers', () => {
    it('searches by name or email', async () => {
      mockPrisma.user.findMany.mockResolvedValue([{ id: 'u1', name: 'Alice' }]);
      const users = await UserService.searchUsers('Alice');
      expect(users).toHaveLength(1);
    });

    it('respects limit', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      await UserService.searchUsers('test', 5);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );
    });
  });

  describe('getUserSettings', () => {
    it('returns existing settings', async () => {
      mockPrisma.userSettings.findUnique.mockResolvedValue({
        profileVisibility: 'friends', showEmail: false, showPhone: false, showStats: true, showLocation: true,
        friendRequests: true, messages: true, sessionInvites: true, matchResults: false, achievements: true,
      });
      const settings = await UserService.getUserSettings('u1');
      expect(settings.privacySettings.profileVisibility).toBe('friends');
      expect(settings.notificationSettings.matchResults).toBe(false);
    });

    it('creates default settings when none exist', async () => {
      mockPrisma.userSettings.findUnique.mockResolvedValue(null);
      mockPrisma.userSettings.create.mockResolvedValue({
        profileVisibility: 'public', showEmail: false, showPhone: false, showStats: true, showLocation: true,
        friendRequests: true, messages: true, sessionInvites: true, matchResults: true, achievements: true,
      });
      const settings = await UserService.getUserSettings('u1');
      expect(settings.privacySettings.profileVisibility).toBe('public');
      expect(settings.notificationSettings.friendRequests).toBe(true);
    });
  });

  describe('userExists', () => {
    it('returns true when user exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      expect(await UserService.userExists('u1')).toBe(true);
    });

    it('returns false when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      expect(await UserService.userExists('bad')).toBe(false);
    });
  });
});
