// Mock Prisma for raw SQL — must be accessible through the class mock
const mockQueryRaw = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $queryRaw: mockQueryRaw,
  })),
}));

import { achievementService } from '../achievementService';

describe('achievementService', () => {
  beforeEach(() => {
    mockQueryRaw.mockReset();
  });

  const svc = achievementService as any;

  describe('getActiveAchievements', () => {
    it('returns active achievements with badges', async () => {
      mockQueryRaw.mockResolvedValueOnce([
        {
          id: 'a1', name: 'First Win', description: 'Win your first match',
          icon: 'trophy', category: 'MATCHES', trigger_type: 'MATCH_WIN',
          trigger_value: '{"wins":1}', points: 10, badge_id: 'b1',
          badge_name: 'Winner', badge_description: 'First win badge',
          badge_icon: 'star', badge_color: 'gold', badge_rarity: 'COMMON',
          is_active: true, rarity: 'COMMON', max_progress: 1,
          created_at: new Date(), updated_at: new Date(),
        },
      ]);

      const achievements = await svc.getActiveAchievements();
      expect(achievements).toHaveLength(1);
      expect(achievements[0].name).toBe('First Win');
      expect(achievements[0].badge.name).toBe('Winner');
    });

    it('returns empty array when no achievements', async () => {
      mockQueryRaw.mockResolvedValueOnce([]);
      const achievements = await svc.getActiveAchievements();
      expect(achievements).toEqual([]);
    });
  });

  describe('getAchievementsByCategory', () => {
    it('filters by category', async () => {
      mockQueryRaw.mockResolvedValueOnce([
        {
          id: 'a1', name: 'Match King', description: 'Play 100 matches',
          icon: 'gamepad', category: 'MATCHES', trigger_type: 'MATCH_PLAY',
          trigger_value: '{}', points: 50, badge_id: null,
          badge_name: null, badge_description: null,
          badge_icon: null, badge_color: null, badge_rarity: null,
          is_active: true, rarity: 'RARE', max_progress: 100,
          created_at: new Date(), updated_at: new Date(),
        },
      ]);

      const achievements = await svc.getAchievementsByCategory('MATCHES');
      expect(achievements).toHaveLength(1);
      expect(achievements[0].badge).toBeNull();
    });
  });

  describe('getPlayerAchievements', () => {
    it('groups rewards under achievements', async () => {
      mockQueryRaw.mockResolvedValueOnce([
        {
          id: 'pa1', player_id: 'p1', achievement_id: 'a1',
          progress: 5, is_completed: false, completed_at: null,
          earned_at: new Date(), source: 'match',
          achievement_name: 'Match Player', achievement_description: 'Play matches',
          achievement_icon: 'gamepad', category: 'MATCHES', trigger_type: 'MATCH_PLAY',
          points: 10, rarity: 'COMMON', max_progress: 10,
          badge_name: null, badge_icon: null,
          reward_id: 'r1', reward_type: 'POINTS', reward_value: '{"amount":5}',
          reward_description: '5 bonus points', is_claimed: false, claimed_at: null,
        },
      ]);

      const playerAchievements = await svc.getPlayerAchievements('p1');
      expect(playerAchievements).toHaveLength(1);
      expect(playerAchievements[0].rewards).toHaveLength(1);
      expect(playerAchievements[0].rewards[0].rewardType).toBe('POINTS');
    });
  });

  describe('getPlayerBadges', () => {
    it('returns player badges', async () => {
      mockQueryRaw.mockResolvedValueOnce([
        {
          id: 'pb1', player_id: 'p1', badge_id: 'b1', earned_at: new Date(),
          is_active: true, name: 'Winner', description: 'First win',
          icon: 'star', color: 'gold', rarity: 'COMMON',
        },
      ]);

      const badges = await svc.getPlayerBadges('p1');
      expect(badges).toHaveLength(1);
      expect(badges[0].badge.name).toBe('Winner');
    });
  });

  describe('claimReward', () => {
    it('claims unclaimed reward', async () => {
      mockQueryRaw
        .mockResolvedValueOnce([{ id: 'r1', player_id: 'p1', is_claimed: false }])
        .mockResolvedValueOnce(undefined);

      const result = await svc.claimReward('p1', 'r1');
      expect(result).toBe(true);
    });

    it('returns false for already claimed or non-existent', async () => {
      mockQueryRaw.mockResolvedValueOnce([]);
      const result = await svc.claimReward('p1', 'r1');
      expect(result).toBe(false);
    });
  });

  describe('getPlayerRewards', () => {
    it('returns all player rewards', async () => {
      mockQueryRaw.mockResolvedValueOnce([
        {
          id: 'r1', player_id: 'p1', player_achievement_id: 'pa1',
          reward_type: 'POINTS', reward_value: '{"amount":10}',
          description: '10 bonus points', claimed_at: null, is_claimed: false,
          created_at: new Date(), updated_at: new Date(),
          achievement_name: 'Match Player',
        },
      ]);

      const rewards = await svc.getPlayerRewards('p1');
      expect(rewards).toHaveLength(1);
      expect(rewards[0].description).toBe('10 bonus points');
    });
  });

  describe('createBadge', () => {
    it('creates a new badge', async () => {
      mockQueryRaw.mockResolvedValueOnce(undefined);

      const badge = await svc.createBadge({
        name: 'Champion', description: 'Tournament champion', icon: 'crown',
        color: 'purple', rarity: 'EPIC',
      });

      expect(badge.name).toBe('Champion');
      expect(badge.rarity).toBe('EPIC');
      expect(badge.color).toBe('purple');
    });
  });
});
