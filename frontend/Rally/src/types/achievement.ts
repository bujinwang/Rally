// Achievement Types for Frontend
export enum AchievementCategory {
  MATCH_PLAYING = 'MATCH_PLAYING',
  TOURNAMENT = 'TOURNAMENT',
  SOCIAL = 'SOCIAL',
  PROGRESSION = 'PROGRESSION',
  SPECIAL = 'SPECIAL'
}

export enum AchievementTriggerType {
  MATCH_WIN = 'MATCH_WIN',
  MATCH_PLAY = 'MATCH_PLAY',
  TOURNAMENT_WIN = 'TOURNAMENT_WIN',
  TOURNAMENT_PARTICIPATE = 'TOURNAMENT_PARTICIPATE',
  STREAK = 'STREAK',
  PERFECT_GAME = 'PERFECT_GAME',
  SOCIAL_FRIEND = 'SOCIAL_FRIEND',
  SESSION_HOST = 'SESSION_HOST',
  SKILL_LEVEL = 'SKILL_LEVEL',
  TIME_PLAYED = 'TIME_PLAYED',
  CUSTOM = 'CUSTOM'
}

export enum AchievementRarity {
  COMMON = 'COMMON',
  UNCOMMON = 'UNCOMMON',
  RARE = 'RARE',
  EPIC = 'EPIC',
  LEGENDARY = 'LEGENDARY'
}

export enum BadgeRarity {
  COMMON = 'COMMON',
  UNCOMMON = 'UNCOMMON',
  RARE = 'RARE',
  EPIC = 'EPIC',
  LEGENDARY = 'LEGENDARY'
}

export enum RewardType {
  POINTS = 'POINTS',
  BADGE = 'BADGE',
  TITLE = 'TITLE',
  AVATAR = 'AVATAR',
  BOOSTER = 'BOOSTER',
  UNLOCK = 'UNLOCK'
}

// Base model interfaces
export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon?: string;
  category: AchievementCategory;
  triggerType: AchievementTriggerType;
  triggerValue: any;
  points: number;
  badgeId?: string;
  isActive: boolean;
  rarity: AchievementRarity;
  maxProgress: number;
  createdAt: Date;
  updatedAt: Date;
  badge?: Badge | null;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  color?: string;
  rarity: BadgeRarity;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlayerAchievement {
  id: string;
  playerId: string;
  achievementId: string;
  progress: number;
  isCompleted: boolean;
  completedAt?: Date;
  earnedAt: Date;
  source: string;
  achievement: Achievement;
  rewards: PlayerReward[];
}

export interface PlayerBadge {
  id: string;
  playerId: string;
  badgeId: string;
  earnedAt: Date;
  isActive: boolean;
  badge: Badge;
}

export interface PlayerReward {
  id: string;
  playerId: string;
  playerAchievementId: string;
  rewardType: RewardType;
  rewardValue: any;
  description: string;
  isClaimed: boolean;
  claimedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  achievementName?: string;
}

export interface AchievementProgress {
  achievementId: string;
  playerId: string;
  progress: number;
  maxProgress: number;
  isCompleted: boolean;
  isNewCompletion: boolean;
  achievement: Achievement;
}

export interface AchievementTrigger {
  type: AchievementTriggerType;
  source: string;
  data?: any;
}

// API Response Types
export interface AchievementListResponse {
  success: boolean;
  data: Achievement[];
  count: number;
}

export interface PlayerAchievementsResponse {
  success: boolean;
  data: {
    achievements: PlayerAchievement[];
    badges: PlayerBadge[];
    totalAchievements: number;
    totalBadges: number;
  };
}

export interface AchievementTriggerResponse {
  success: boolean;
  data: AchievementProgress[];
  message: string;
}

export interface RewardClaimResponse {
  success: boolean;
  message: string;
}

// Form Types
export interface CreateAchievementData {
  name: string;
  description: string;
  category: AchievementCategory;
  triggerType: AchievementTriggerType;
  triggerValue: any;
  points?: number;
  badgeId?: string;
  rarity?: AchievementRarity;
  maxProgress?: number;
}

export interface CreateBadgeData {
  name: string;
  description: string;
  icon: string;
  color?: string;
  rarity?: BadgeRarity;
}