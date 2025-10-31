import { AchievementTrigger, AchievementProgress, AchievementCategory, CreateAchievementData, CreateBadgeData, Achievement, Badge } from '../types/achievement';
export declare class AchievementService {
    /**
     * Get all active achievements
     */
    getActiveAchievements(): Promise<(Achievement & {
        badge?: Badge | null;
    })[]>;
    /**
     * Get achievements by category
     */
    getAchievementsByCategory(category: AchievementCategory): Promise<(Achievement & {
        badge?: Badge | null;
    })[]>;
    /**
     * Get player achievements
     */
    getPlayerAchievements(playerId: string): Promise<any[]>;
    /**
     * Get player badges
     */
    getPlayerBadges(playerId: string): Promise<any[]>;
    /**
     * Check and update achievements based on trigger
     */
    checkAndUpdateAchievements(playerId: string, trigger: AchievementTrigger): Promise<AchievementProgress[]>;
    /**
     * Update specific achievement progress
     */
    private updateAchievementProgress;
    /**
     * Get achievement with badge details
     */
    private getAchievementWithBadge;
    /**
     * Calculate progress based on trigger type and value
     */
    private calculateProgress;
    /**
     * Create rewards when achievement is completed
     */
    private createAchievementRewards;
    /**
     * Claim a reward
     */
    claimReward(playerId: string, rewardId: string): Promise<boolean>;
    /**
     * Get player rewards (claimed and unclaimed)
     */
    getPlayerRewards(playerId: string): Promise<any[]>;
    /**
     * Create a new achievement (admin function)
     */
    createAchievement(data: CreateAchievementData): Promise<any>;
    /**
     * Create a new badge (admin function)
     */
    createBadge(data: CreateBadgeData): Promise<any>;
}
export declare const achievementService: AchievementService;
//# sourceMappingURL=achievementService.d.ts.map