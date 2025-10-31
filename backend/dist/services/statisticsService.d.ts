export interface PlayerStatistics {
    playerId: string;
    playerName: string;
    matchesPlayed: number;
    wins: number;
    losses: number;
    winRate: number;
    winStreak: number;
    currentStreak: number;
    averageScore: number;
    totalPointsScored: number;
    totalPointsConceded: number;
    bestWinStreak: number;
    recentForm: string[];
    performanceRating: number;
    ranking: number;
    setsWon: number;
    setsLost: number;
    setWinRate: number;
    averagePointsPerSet: number;
    bestSetScore: number;
    scoringEfficiency: number;
    comebackWins: number;
    dominantWins: number;
}
export interface SessionStatistics {
    sessionId: string;
    sessionName: string;
    totalMatches: number;
    totalPlayers: number;
    averageMatchesPerPlayer: number;
    topPerformers: LeaderboardEntry[];
    matchDistribution: {
        '2-0': number;
        '2-1': number;
    };
    sessionDuration: number;
    mostActivePlayer: string;
}
export interface LeaderboardEntry {
    rank: number;
    playerId: string;
    playerName: string;
    winRate: number;
    matchesPlayed: number;
    performanceRating: number;
    trend: 'up' | 'down' | 'stable';
}
export interface StatisticsFilters {
    sessionId?: string;
    playerId?: string;
    timeRange?: 'all' | 'week' | 'month' | 'session';
    minMatches?: number;
}
declare class StatisticsService {
    /**
     * Calculate comprehensive statistics for a player
     */
    getPlayerStatistics(playerId: string, filters?: StatisticsFilters): Promise<PlayerStatistics | null>;
    /**
     * Calculate win/loss streaks and recent form
     */
    private calculateStreaks;
    /**
     * Calculate performance rating (simplified ELO system)
     */
    private calculatePerformanceRating;
    /**
     * Generate leaderboard for a session or globally
     */
    getLeaderboard(filters?: StatisticsFilters): Promise<LeaderboardEntry[]>;
    /**
     * Calculate trend based on recent form
     */
    private calculateTrend;
    /**
     * Get session statistics
     */
    getSessionStatistics(sessionId: string): Promise<SessionStatistics | null>;
    /**
     * Get player comparison data
     */
    getPlayerComparison(playerIds: string[], filters?: StatisticsFilters): Promise<PlayerStatistics[]>;
    /**
     * Get performance trends over time
     */
    getPerformanceTrends(playerId: string, days?: number): Promise<{
        dates: string[];
        winRates: number[];
        matchesPlayed: number[];
    }>;
}
export declare const statisticsService: StatisticsService;
export default statisticsService;
//# sourceMappingURL=statisticsService.d.ts.map