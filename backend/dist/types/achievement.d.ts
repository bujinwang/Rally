export declare enum AchievementCategory {
    MATCH_PLAYING = "MATCH_PLAYING",
    TOURNAMENT = "TOURNAMENT",
    SOCIAL = "SOCIAL",
    PROGRESSION = "PROGRESSION",
    SPECIAL = "SPECIAL"
}
export declare enum AchievementTriggerType {
    MATCH_WIN = "MATCH_WIN",
    MATCH_PLAY = "MATCH_PLAY",
    TOURNAMENT_WIN = "TOURNAMENT_WIN",
    TOURNAMENT_PARTICIPATE = "TOURNAMENT_PARTICIPATE",
    STREAK = "STREAK",
    PERFECT_GAME = "PERFECT_GAME",
    SOCIAL_FRIEND = "SOCIAL_FRIEND",
    SESSION_HOST = "SESSION_HOST",
    SKILL_LEVEL = "SKILL_LEVEL",
    TIME_PLAYED = "TIME_PLAYED",
    CUSTOM = "CUSTOM"
}
export declare enum AchievementRarity {
    COMMON = "COMMON",
    UNCOMMON = "UNCOMMON",
    RARE = "RARE",
    EPIC = "EPIC",
    LEGENDARY = "LEGENDARY"
}
export declare enum BadgeRarity {
    COMMON = "COMMON",
    UNCOMMON = "UNCOMMON",
    RARE = "RARE",
    EPIC = "EPIC",
    LEGENDARY = "LEGENDARY"
}
export declare enum RewardType {
    POINTS = "POINTS",
    BADGE = "BADGE",
    TITLE = "TITLE",
    AVATAR = "AVATAR",
    BOOSTER = "BOOSTER",
    UNLOCK = "UNLOCK"
}
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
export interface AchievementTrigger {
    type: AchievementTriggerType;
    source: string;
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
export interface AchievementReward {
    type: RewardType;
    value: any;
    description: string;
}
export interface AchievementWithBadge extends Achievement {
    badge?: Badge | null;
}
export interface PlayerAchievementWithDetails extends PlayerAchievement {
    achievement: AchievementWithBadge;
    rewards: PlayerReward[];
}
export interface PlayerBadgeWithDetails extends PlayerBadge {
    badge: Badge;
}
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
export interface AchievementStats {
    totalAchievements: number;
    totalBadges: number;
    playerAchievements: number;
    playerBadges: number;
    completionRate: number;
}
export interface AchievementLeaderboardEntry {
    playerId: string;
    playerName: string;
    totalPoints: number;
    achievementsEarned: number;
    badgesEarned: number;
    rank: number;
}
//# sourceMappingURL=achievement.d.ts.map