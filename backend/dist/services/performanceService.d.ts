export interface PerformanceMetrics {
    winRate: number;
    matchWinRate: number;
    currentStreak: number;
    bestStreak: number;
    skillLevel: number;
    totalMatches: number;
    totalWins: number;
    totalLosses: number;
    averageGameDuration: number;
}
export interface PerformanceTrend {
    period: string;
    matches: number;
    wins: number;
    losses: number;
    winRate: number;
    skillChange: number;
}
export interface AchievementDetectionResult {
    achieved: string[];
    pending: {
        id: string;
        progress: number;
        required: number;
    }[];
}
export declare class PerformanceService {
    /**
     * Calculate player performance metrics from match history
     * @param playerId - Player ID to calculate metrics for
     */
    static calculatePerformanceMetrics(playerId: string): Promise<PerformanceMetrics>;
    /**
     * Calculate current win/loss streak
     * @param playerId - Player ID
     */
    private static calculateCurrentStreak;
    /**
     * Get player's best streak
     * @param playerId - Player ID
     */
    private static getBestStreak;
    /**
     * ELO-like skill progression calculation
     * @param playerId - Player ID
     */
    static calculateSkillProgression(playerId: string): Promise<number>;
    /**
     * Get performance trends over time
     * @param playerId - Player ID
     * @param period - Time period ('weekly', 'monthly', 'all-time')
     */
    static getPerformanceTrends(playerId: string, period?: string): Promise<PerformanceTrend[]>;
    /**
     * Detect achievements based on performance
     * @param playerId - Player ID
     */
    static detectAchievements(playerId: string): Promise<AchievementDetectionResult>;
    /**
     * Update player performance records after a match
     * @param playerId - Player ID
     * @param matchOutcome - Win/loss outcome
     */
    static updatePerformanceRecord(playerId: string, matchOutcome: 'win' | 'loss'): Promise<void>;
}
//# sourceMappingURL=performanceService.d.ts.map