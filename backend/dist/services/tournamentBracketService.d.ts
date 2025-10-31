export interface BracketMatch {
    id: string;
    round: number;
    match: number;
    player1Id?: string;
    player2Id?: string;
    player1Name?: string;
    player2Name?: string;
    winnerId?: string;
    winnerName?: string;
    score?: string;
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BYE';
    court?: string;
    scheduledTime?: Date;
}
export interface TournamentBracket {
    tournamentId: string;
    totalRounds: number;
    totalPlayers: number;
    bracket: BracketMatch[][];
    currentRound: number;
    isComplete: boolean;
}
export interface BracketGenerationOptions {
    tournamentId: string;
    players: Array<{
        id: string;
        name: string;
        seed?: number;
        skillLevel?: string;
    }>;
    tournamentType: 'SINGLE_ELIMINATION' | 'DOUBLE_ELIMINATION' | 'ROUND_ROBIN' | 'SWISS';
    randomizeSeeding?: boolean;
}
declare class TournamentBracketService {
    /**
     * Generate tournament bracket based on tournament type
     */
    generateBracket(options: BracketGenerationOptions): Promise<TournamentBracket>;
    /**
     * Generate single elimination bracket
     */
    private generateSingleEliminationBracket;
    /**
     * Generate double elimination bracket
     */
    private generateDoubleEliminationBracket;
    /**
     * Generate round robin bracket
     */
    private generateRoundRobinBracket;
    /**
     * Generate Swiss system bracket
     */
    private generateSwissBracket;
    /**
     * Sort players for bracket generation
     */
    private sortPlayersForBracket;
    /**
     * Update match result and advance bracket
     */
    updateMatchResult(tournamentId: string, matchId: string, winnerId: string, score?: string): Promise<void>;
    /**
     * Advance winner to next round
     */
    private advanceWinnerToNextRound;
    /**
     * Complete tournament
     */
    private completeTournament;
    /**
     * Get current bracket state
     */
    getBracketState(tournamentId: string): Promise<TournamentBracket | null>;
}
export declare const tournamentBracketService: TournamentBracketService;
export default tournamentBracketService;
//# sourceMappingURL=tournamentBracketService.d.ts.map