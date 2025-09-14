// Achievement Enums (matching Prisma schema)
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

// Base model interfaces (matching Prisma schema)
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
  source?: string;
}

export interface PlayerBadge {
  id: string;
  playerId: string;
  badgeId: string;
  earnedAt: Date;
  isActive: boolean;
}

export interface PlayerReward {
  id: string;
  playerId: string;
  playerAchievementId?: string;
  rewardType: RewardType;
  rewardValue: any;
  description: string;
  claimedAt?: Date;
  isClaimed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Achievement trigger data
export interface AchievementTrigger {
  type: AchievementTriggerType;
  source: string; // e.g., "match_win", "tournament_complete"
  data?: {
    wins?: number;
    matchesPlayed?: number;
    tournamentsWon?: number;
    tournamentsParticipated?: number;
    currentStreak?: number;
    perfectGames?: number;
    friendsAdded?: number;
    sessionsHosted?: number;
    currentSkillLevel?: number;
    minutesPlayed?: number;
    [key: string]: any;
  };
}

// Achievement progress update
export interface AchievementProgress {
  achievementId: string;
  playerId: string;
  progress: number;
  maxProgress: number;
  isCompleted: boolean;
  isNewCompletion: boolean;
  achievement: Achievement & {
    badge?: Badge | null;
  };
}

// Achievement reward data
export interface AchievementReward {
  type: RewardType;
  value: any;
  description: string;
}

// Achievement with badge
export interface AchievementWithBadge extends Achievement {
  badge?: Badge | null;
}

// Player achievement with details
export interface PlayerAchievementWithDetails extends PlayerAchievement {
  achievement: AchievementWithBadge;
  rewards: PlayerReward[];
}

// Player badge with details
export interface PlayerBadgeWithDetails extends PlayerBadge {
  badge: Badge;
}

// Achievement creation data
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

// Badge creation data
export interface CreateBadgeData {
  name: string;
  description: string;
  icon: string;
  color?: string;
  rarity?: BadgeRarity;
}

// Achievement statistics
export interface AchievementStats {
  totalAchievements: number;
  totalBadges: number;
  playerAchievements: number;
  playerBadges: number;
  completionRate: number;
}

// Achievement leaderboard entry
export interface AchievementLeaderboardEntry {
  playerId: string;
  playerName: string;
  totalPoints: number;
  achievementsEarned: number;
  badgesEarned: number;
  rank: number;
}