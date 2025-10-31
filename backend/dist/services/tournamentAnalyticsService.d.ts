export declare class TournamentAnalyticsService {
    /**
     * Calculate participation and completion metrics for a tournament
     */
    static calculateParticipationMetrics(tournamentId: string): Promise<{
        totalRegistered: any;
        participationRate: number;
        completionRate: number;
        noShowRate: number;
        matchesCompleted: any;
    }>;
    /**
     * Calculate bracket efficiency and performance analysis
     */
    static calculateBracketEfficiency(tournamentId: string): Promise<{
        totalMatches: number;
        completedMatches: number;
        bracketEfficiency: number;
        averageUpsets: number;
    }>;
    /**
     * Track player ranking changes from tournament results
     */
    static trackPlayerRankingChanges(tournamentId: string): Promise<any[]>;
    /**
     * Compare tournament formats effectiveness
     */
    static compareTournamentFormats(tournamentIds: string[]): Promise<any>;
}
//# sourceMappingURL=tournamentAnalyticsService.d.ts.map