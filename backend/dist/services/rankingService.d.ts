export interface RankingEntry {
    playerId: string;
    playerName: string;
    rating: number;
    rank: number;
    previousRank?: number;
    matchesPlayed: number;
    winRate: number;
    trend: 'up' | 'down' | 'stable';
    lastMatchDate?: Date;
}
export interface RankingHistory {
    playerId: string;
    rating: number;
    rank: number;
    recordedAt: Date;
    matchId?: string;
}
declare class RankingService {
    private readonly INITIAL_RATING;
    private readonly K_FACTOR;
    private readonly MIN_MATCHES_FOR_RANKING;
    /**
     * Calculate expected score for ELO rating system
     */
    private calculateExpectedScore;
    /**
     * Calculate new rating after a match
     */
    private calculateNewRating;
    /**
     * Update player ratings after a match
     */
    updateRatingsAfterMatch(matchId: string): Promise<void>;
    /**
     * Record rating history for a player
     */
    private recordRatingHistory;
    /**
     * Update rankings for all players
     */
    updateAllRankings(): Promise<void>;
    /**
     * Get current ranking for a player
     */
    getPlayerRank(playerId: string): Promise<number>;
    /**
     * Get ranking leaderboard
     */
    getRankingLeaderboard(limit?: number): Promise<RankingEntry[]>;
    /**
     * Get rating history for a player
     */
    getPlayerRatingHistory(playerId: string, limit?: number): Promise<RankingHistory[]>;
    /**
     * Get ranking statistics
     */
    getRankingStatistics(): Promise<{
        totalRankedPlayers: number;
        averageRating: number;
        highestRating: number;
        lowestRating: number;
        ratingDistribution: {
            range: string;
            count: number;
        }[];
    }>;
    /**
     * Initialize ranking for a new player
     */
    initializePlayerRanking(playerId: string): Promise<void>;
}
export declare const rankingService: RankingService;
export default rankingService;
//# sourceMappingURL=rankingService.d.ts.map