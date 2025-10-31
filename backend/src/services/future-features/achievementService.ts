import { PrismaClient } from '@prisma/client';
import {
  AchievementTrigger,
  AchievementProgress,
  AchievementReward,
  AchievementTriggerType,
  AchievementCategory,
  CreateAchievementData,
  CreateBadgeData,
  Achievement,
  Badge,
  PlayerAchievement,
  PlayerBadge,
  PlayerReward
} from '../types/achievement';

const prisma = new PrismaClient();

export class AchievementService {
  /**
   * Get all active achievements
   */
  async getActiveAchievements(): Promise<(Achievement & { badge?: Badge | null })[]> {
    // Using raw SQL since Prisma client hasn't been regenerated yet
    const achievements = await prisma.$queryRaw`
      SELECT a.*, b.id as badge_id, b.name as badge_name, b.description as badge_description,
             b.icon as badge_icon, b.color as badge_color, b.rarity as badge_rarity
      FROM achievements a
      LEFT JOIN badges b ON a.badge_id = b.id
      WHERE a.is_active = true
      ORDER BY a.created_at DESC
    ` as any[];

    return achievements.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      icon: row.icon,
      category: row.category as AchievementCategory,
      triggerType: row.trigger_type as AchievementTriggerType,
      triggerValue: JSON.parse(row.trigger_value || '{}'),
      points: row.points,
      badgeId: row.badge_id,
      isActive: row.is_active,
      rarity: row.rarity,
      maxProgress: row.max_progress,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      badge: row.badge_id ? {
        id: row.badge_id,
        name: row.badge_name,
        description: row.badge_description,
        icon: row.badge_icon,
        color: row.badge_color,
        rarity: row.badge_rarity,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      } : null
    }));
  }

  /**
   * Get achievements by category
   */
  async getAchievementsByCategory(category: AchievementCategory): Promise<(Achievement & { badge?: Badge | null })[]> {
    const achievements = await prisma.$queryRaw`
      SELECT a.*, b.id as badge_id, b.name as badge_name, b.description as badge_description,
             b.icon as badge_icon, b.color as badge_color, b.rarity as badge_rarity
      FROM achievements a
      LEFT JOIN badges b ON a.badge_id = b.id
      WHERE a.category = ${category} AND a.is_active = true
      ORDER BY a.created_at DESC
    ` as any[];

    return achievements.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      icon: row.icon,
      category: row.category as AchievementCategory,
      triggerType: row.trigger_type as AchievementTriggerType,
      triggerValue: JSON.parse(row.trigger_value || '{}'),
      points: row.points,
      badgeId: row.badge_id,
      isActive: row.is_active,
      rarity: row.rarity,
      maxProgress: row.max_progress,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      badge: row.badge_id ? {
        id: row.badge_id,
        name: row.badge_name,
        description: row.badge_description,
        icon: row.badge_icon,
        color: row.badge_color,
        rarity: row.badge_rarity,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      } : null
    }));
  }

  /**
   * Get player achievements
   */
  async getPlayerAchievements(playerId: string): Promise<any[]> {
    const results = await prisma.$queryRaw`
      SELECT pa.*, a.name as achievement_name, a.description as achievement_description,
             a.icon as achievement_icon, a.category, a.trigger_type, a.points,
             a.rarity, a.max_progress, b.name as badge_name, b.icon as badge_icon,
             pr.id as reward_id, pr.reward_type, pr.reward_value, pr.description as reward_description,
             pr.is_claimed, pr.claimed_at
      FROM player_achievements pa
      JOIN achievements a ON pa.achievement_id = a.id
      LEFT JOIN badges b ON a.badge_id = b.id
      LEFT JOIN player_rewards pr ON pa.id = pr.player_achievement_id
      WHERE pa.player_id = ${playerId}
      ORDER BY pa.earned_at DESC
    ` as any[];

    // Group by achievement
    const achievementMap = new Map();

    results.forEach(row => {
      if (!achievementMap.has(row.achievement_id)) {
        achievementMap.set(row.achievement_id, {
          id: row.id,
          playerId: row.player_id,
          achievementId: row.achievement_id,
          progress: row.progress,
          isCompleted: row.is_completed,
          completedAt: row.completed_at ? new Date(row.completed_at) : null,
          earnedAt: new Date(row.earned_at),
          source: row.source,
          achievement: {
            id: row.achievement_id,
            name: row.achievement_name,
            description: row.achievement_description,
            icon: row.achievement_icon,
            category: row.category,
            triggerType: row.trigger_type,
            triggerValue: {},
            points: row.points,
            isActive: true,
            rarity: row.rarity,
            maxProgress: row.max_progress,
            createdAt: new Date(),
            updatedAt: new Date(),
            badge: row.badge_name ? {
              id: '',
              name: row.badge_name,
              description: '',
              icon: row.badge_icon,
              rarity: 'COMMON',
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date()
            } : null
          },
          rewards: []
        });
      }

      if (row.reward_id) {
        achievementMap.get(row.achievement_id).rewards.push({
          id: row.reward_id,
          rewardType: row.reward_type,
          rewardValue: JSON.parse(row.reward_value || '{}'),
          description: row.reward_description,
          isClaimed: row.is_claimed,
          claimedAt: row.claimed_at ? new Date(row.claimed_at) : null
        });
      }
    });

    return Array.from(achievementMap.values());
  }

  /**
   * Get player badges
   */
  async getPlayerBadges(playerId: string): Promise<any[]> {
    const results = await prisma.$queryRaw`
      SELECT pb.*, b.name, b.description, b.icon, b.color, b.rarity
      FROM player_badges pb
      JOIN badges b ON pb.badge_id = b.id
      WHERE pb.player_id = ${playerId}
      ORDER BY pb.earned_at DESC
    ` as any[];

    return results.map(row => ({
      id: row.id,
      playerId: row.player_id,
      badgeId: row.badge_id,
      earnedAt: new Date(row.earned_at),
      isActive: row.is_active,
      badge: {
        id: row.badge_id,
        name: row.name,
        description: row.description,
        icon: row.icon,
        color: row.color,
        rarity: row.rarity,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }));
  }

  /**
   * Check and update achievements based on trigger
   */
  async checkAndUpdateAchievements(
    playerId: string,
    trigger: AchievementTrigger
  ): Promise<AchievementProgress[]> {
    const achievements = await this.getActiveAchievements();
    const progressUpdates: AchievementProgress[] = [];

    for (const achievement of achievements) {
      if (achievement.triggerType === trigger.type) {
        const progress = await this.updateAchievementProgress(
          playerId,
          achievement.id,
          trigger
        );

        if (progress) {
          progressUpdates.push(progress);
        }
      }
    }

    return progressUpdates;
  }

  /**
   * Update specific achievement progress
   */
  private async updateAchievementProgress(
    playerId: string,
    achievementId: string,
    trigger: AchievementTrigger
  ): Promise<AchievementProgress | null> {
    // Get achievement details
    const achievementResult = await prisma.$queryRaw`
      SELECT * FROM achievements WHERE id = ${achievementId}
    ` as any[];

    if (achievementResult.length === 0) return null;

    const achievement = achievementResult[0];

    // Get or create player achievement record
    let playerAchievementResult = await prisma.$queryRaw`
      SELECT * FROM player_achievements
      WHERE player_id = ${playerId} AND achievement_id = ${achievementId}
    ` as any[];

    let playerAchievement: any;

    if (playerAchievementResult.length === 0) {
      // Create new player achievement
      const newId = crypto.randomUUID();
      await prisma.$queryRaw`
        INSERT INTO player_achievements (id, player_id, achievement_id, progress, earned_at)
        VALUES (${newId}, ${playerId}, ${achievementId}, 0, NOW())
      `;

      playerAchievement = {
        id: newId,
        player_id: playerId,
        achievement_id: achievementId,
        progress: 0,
        is_completed: false,
        completed_at: null,
        earned_at: new Date(),
        source: null
      };
    } else {
      playerAchievement = playerAchievementResult[0];
    }

    // Calculate new progress based on trigger
    const newProgress = this.calculateProgress(
      playerAchievement.progress,
      JSON.parse(achievement.trigger_value || '{}'),
      trigger
    );

    // Check if achievement is completed
    const isCompleted = newProgress >= achievement.max_progress;

    // Update player achievement
    await prisma.$queryRaw`
      UPDATE player_achievements
      SET progress = ${Math.min(newProgress, achievement.max_progress)},
          is_completed = ${isCompleted},
          completed_at = ${isCompleted ? 'NOW()' : null},
          source = ${trigger.source}
      WHERE id = ${playerAchievement.id}
    `;

    // If newly completed, create rewards
    if (isCompleted && !playerAchievement.is_completed) {
      await this.createAchievementRewards(playerId, achievementId, achievement);
    }

    // Get updated achievement with badge
    const updatedAchievement = await this.getAchievementWithBadge(achievementId);

    return {
      achievementId,
      playerId,
      progress: Math.min(newProgress, achievement.max_progress),
      maxProgress: achievement.max_progress,
      isCompleted,
      isNewCompletion: isCompleted && !playerAchievement.is_completed,
      achievement: updatedAchievement,
    };
  }

  /**
   * Get achievement with badge details
   */
  private async getAchievementWithBadge(achievementId: string): Promise<Achievement & { badge?: Badge | null }> {
    const result = await prisma.$queryRaw`
      SELECT a.*, b.id as badge_id, b.name as badge_name, b.description as badge_description,
             b.icon as badge_icon, b.color as badge_color, b.rarity as badge_rarity
      FROM achievements a
      LEFT JOIN badges b ON a.badge_id = b.id
      WHERE a.id = ${achievementId}
    ` as any[];

    if (result.length === 0) throw new Error('Achievement not found');

    const row = result[0];
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      icon: row.icon,
      category: row.category as AchievementCategory,
      triggerType: row.trigger_type as AchievementTriggerType,
      triggerValue: JSON.parse(row.trigger_value || '{}'),
      points: row.points,
      badgeId: row.badge_id,
      isActive: row.is_active,
      rarity: row.rarity,
      maxProgress: row.max_progress,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      badge: row.badge_id ? {
        id: row.badge_id,
        name: row.badge_name,
        description: row.badge_description,
        icon: row.badge_icon,
        color: row.badge_color,
        rarity: row.badge_rarity,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      } : null
    };
  }

  /**
   * Calculate progress based on trigger type and value
   */
  private calculateProgress(
    currentProgress: number,
    triggerConfig: any,
    trigger: AchievementTrigger
  ): number {
    switch (trigger.type) {
      case AchievementTriggerType.MATCH_WIN:
        return currentProgress + (trigger.data?.wins || 1);

      case AchievementTriggerType.MATCH_PLAY:
        return currentProgress + (trigger.data?.matchesPlayed || 1);

      case AchievementTriggerType.TOURNAMENT_WIN:
        return currentProgress + (trigger.data?.tournamentsWon || 1);

      case AchievementTriggerType.TOURNAMENT_PARTICIPATE:
        return currentProgress + (trigger.data?.tournamentsParticipated || 1);

      case AchievementTriggerType.STREAK:
        return Math.max(currentProgress, trigger.data?.currentStreak || 0);

      case AchievementTriggerType.PERFECT_GAME:
        return currentProgress + (trigger.data?.perfectGames || 1);

      case AchievementTriggerType.SOCIAL_FRIEND:
        return currentProgress + (trigger.data?.friendsAdded || 1);

      case AchievementTriggerType.SESSION_HOST:
        return currentProgress + (trigger.data?.sessionsHosted || 1);

      case AchievementTriggerType.SKILL_LEVEL:
        return trigger.data?.currentSkillLevel || currentProgress;

      case AchievementTriggerType.TIME_PLAYED:
        return currentProgress + (trigger.data?.minutesPlayed || 0);

      default:
        return currentProgress;
    }
  }

  /**
   * Create rewards when achievement is completed
   */
  private async createAchievementRewards(
    playerId: string,
    achievementId: string,
    achievement: any
  ): Promise<void> {
    const rewards: AchievementReward[] = [];

    // Points reward
    if (achievement.points > 0) {
      rewards.push({
        type: 'POINTS' as any,
        value: achievement.points,
        description: `${achievement.points} achievement points`,
      });
    }

    // Badge reward
    if (achievement.badge_id) {
      rewards.push({
        type: 'BADGE' as any,
        value: achievement.badge_id,
        description: `Unlocked badge: ${achievement.badge_name || 'Unknown Badge'}`,
      });
    }

    // Create reward records
    for (const reward of rewards) {
      await prisma.$queryRaw`
        INSERT INTO player_rewards (id, player_id, player_achievement_id, reward_type, reward_value, description, created_at)
        VALUES (${crypto.randomUUID()}, ${playerId}, ${achievementId}, ${reward.type}, ${JSON.stringify(reward.value)}, ${reward.description}, NOW())
      `;
    }
  }

  /**
   * Claim a reward
   */
  async claimReward(playerId: string, rewardId: string): Promise<boolean> {
    const rewardResult = await prisma.$queryRaw`
      SELECT * FROM player_rewards
      WHERE id = ${rewardId} AND player_id = ${playerId} AND is_claimed = false
    ` as any[];

    if (rewardResult.length === 0) return false;

    await prisma.$queryRaw`
      UPDATE player_rewards
      SET is_claimed = true, claimed_at = NOW()
      WHERE id = ${rewardId}
    `;

    return true;
  }

  /**
   * Get player rewards (claimed and unclaimed)
   */
  async getPlayerRewards(playerId: string): Promise<any[]> {
    const results = await prisma.$queryRaw`
      SELECT pr.*, pa.achievement_id, a.name as achievement_name
      FROM player_rewards pr
      LEFT JOIN player_achievements pa ON pr.player_achievement_id = pa.id
      LEFT JOIN achievements a ON pa.achievement_id = a.id
      WHERE pr.player_id = ${playerId}
      ORDER BY pr.created_at DESC
    ` as any[];

    return results.map(row => ({
      id: row.id,
      playerId: row.player_id,
      playerAchievementId: row.player_achievement_id,
      rewardType: row.reward_type,
      rewardValue: JSON.parse(row.reward_value || '{}'),
      description: row.description,
      claimedAt: row.claimed_at ? new Date(row.claimed_at) : null,
      isClaimed: row.is_claimed,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      achievementName: row.achievement_name
    }));
  }

  /**
   * Create a new achievement (admin function)
   */
  async createAchievement(data: CreateAchievementData): Promise<any> {
    const achievementId = crypto.randomUUID();

    await prisma.$queryRaw`
      INSERT INTO achievements (id, name, description, category, trigger_type, trigger_value, points, badge_id, rarity, max_progress, created_at, updated_at)
      VALUES (${achievementId}, ${data.name}, ${data.description}, ${data.category}, ${data.triggerType}, ${JSON.stringify(data.triggerValue)}, ${data.points || 0}, ${data.badgeId || null}, ${data.rarity || 'COMMON'}, ${data.maxProgress || 1}, NOW(), NOW())
    `;

    return await this.getAchievementWithBadge(achievementId);
  }

  /**
   * Create a new badge (admin function)
   */
  async createBadge(data: CreateBadgeData): Promise<any> {
    const badgeId = crypto.randomUUID();

    await prisma.$queryRaw`
      INSERT INTO badges (id, name, description, icon, color, rarity, created_at, updated_at)
      VALUES (${badgeId}, ${data.name}, ${data.description}, ${data.icon}, ${data.color || null}, ${data.rarity || 'COMMON'}, NOW(), NOW())
    `;

    return {
      id: badgeId,
      name: data.name,
      description: data.description,
      icon: data.icon,
      color: data.color,
      rarity: data.rarity || 'COMMON',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
}

export const achievementService = new AchievementService();