export declare class AnalyticsService {
    /**
     * Calculate and update player analytics for a specific player
     */
    static updatePlayerAnalytics(playerId: string): Promise<void>;
    /**
     * Calculate and update session analytics
     */
    static updateSessionAnalytics(sessionId: string): Promise<void>;
    /**
     * Calculate and update tournament analytics
     */
    static updateTournamentAnalytics(tournamentId: string): Promise<void>;
    /**
     * Get session analytics dashboard data
     */
    static getSessionAnalyticsDashboard(startDate?: Date, endDate?: Date, filters?: any): Promise<any>;
    /**
     * Get session attendance trends over time
     */
    static getSessionTrends(startDate?: Date, endDate?: Date, filters?: any): Promise<any>;
    /**
     * Get participation analysis
     */
    static getParticipationAnalysis(startDate?: Date, endDate?: Date, filters?: any): Promise<any>;
    /**
     * Get geographic distribution of sessions and players
     */
    static getGeographicDistribution(startDate?: Date, endDate?: Date, filters?: any): Promise<any>;
    /**
     * Get session type popularity analytics
     */
    static getSessionTypeAnalytics(startDate?: Date, endDate?: Date, filters?: any): Promise<any>;
    /**
     * Get peak usage patterns
     */
    static getPeakUsagePatterns(startDate?: Date, endDate?: Date, filters?: any): Promise<any>;
    /**
     * Export analytics data
     */
    static exportAnalyticsData(startDate?: Date, endDate?: Date, format?: 'json' | 'csv'): Promise<any>;
    /**
     * Convert analytics data to CSV format with injection protection
     */
    private static convertToCSV;
    /**
     * Sanitize CSV field to prevent injection attacks
     */
    private static sanitizeCSVField;
    /**
     * Track analytics event
     */
    static trackAnalyticsEvent(type: string, entityId: string, userId?: string, data?: any): Promise<void>;
    /**
     * Generate system-wide analytics for a specific date
     */
    static generateSystemAnalytics(date?: Date): Promise<void>;
    /**
     * Get player leaderboard
     */
    static getPlayerLeaderboard(limit?: number): Promise<any[]>;
    /**
     * Get player performance trends
     */
    static getPlayerPerformanceTrends(playerId: string, days?: number): Promise<any>;
    private static getPlayerName;
    private static calculateSkillRating;
    private static calculateCurrentStreak;
    private static getBestStreak;
    private static calculateAverageGameDuration;
    private static calculateHoursPlayed;
}
//# sourceMappingURL=analyticsService.d.ts.map