export interface PlayerStats {
    gamesPlayed: number;
    wins: number;
    losses: number;
    matchesPlayed: number;
    matchWins: number;
    matchLosses: number;
    totalSetsWon: number;
    totalSetsLost: number;
    totalPlayTime: number;
    winRate: number;
    matchWinRate: number;
    averageGameDuration: number;
    partnershipStats: PartnershipRecord[];
}
export interface PartnershipRecord {
    partnerName: string;
    gamesPlayed: number;
    wins: number;
    losses: number;
    winRate: number;
}
export interface SessionStatistics {
    sessionId: string;
    totalGames: number;
    totalMatches: number;
    averageGameDuration: number;
    longestMatch: number;
    shortestMatch: number;
    mostActivePlayer: string;
    topPartnership: {
        players: [string, string];
        winRate: number;
        gamesPlayed: number;
    };
}
/**
 * Update player statistics after a game is completed
 */
export declare function updatePlayerGameStatistics(sessionId: string, gameData: {
    team1Player1: string;
    team1Player2: string;
    team2Player1: string;
    team2Player2: string;
    winnerTeam: number;
    duration?: number;
    team1FinalScore: number;
    team2FinalScore: number;
}): Promise<void>;
/**
 * Update player statistics after a match is completed
 */
export declare function updatePlayerMatchStatistics(sessionId: string, matchData: {
    team1Player1: string;
    team1Player2: string;
    team2Player1: string;
    team2Player2: string;
    winnerTeam: number;
    duration?: number;
}): Promise<void>;
/**
 * Get comprehensive player statistics
 */
export declare function getPlayerStatistics(sessionId: string, playerName: string): Promise<PlayerStats | null>;
/**
 * Get session-wide statistics
 */
export declare function getSessionStatistics(sessionId: string): Promise<SessionStatistics>;
/**
 * Get leaderboard for a session
 */
export declare function getSessionLeaderboard(sessionId: string): Promise<{
    byWinRate: any[];
    byMatchWins: any[];
    byGamesPlayed: any[];
    byPartnership: any[];
}>;
//# sourceMappingURL=statisticsService.d.ts.map