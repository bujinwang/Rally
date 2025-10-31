/**
 * Tournament Bracket Generation Service
 *
 * Handles the creation and management of tournament brackets for different tournament formats:
 * - Single Elimination
 * - Double Elimination
 * - Round Robin
 * - Swiss System
 * - Mixed formats
 */
import { TournamentType, TournamentRoundType, TournamentRoundStatus } from './types/tournament';
interface TournamentPlayer {
    id: string;
    playerName: string;
    seed?: number;
    skillLevel?: string;
    winRate?: number;
}
interface BracketMatch {
    id: string;
    roundNumber: number;
    matchNumber: number;
    player1Id: string;
    player2Id: string;
    player1Name: string;
    player2Name: string;
    scheduledAt?: Date;
    courtName?: string;
}
interface TournamentBracket {
    rounds: BracketRound[];
    totalRounds: number;
    totalMatches: number;
    byePlayers: string[];
}
interface BracketRound {
    roundNumber: number;
    roundName: string;
    roundType: TournamentRoundType;
    matches: BracketMatch[];
    playersAdvancing: number;
    status: TournamentRoundStatus;
}
export declare class BracketService {
    /**
     * Generate tournament bracket based on tournament type and players
     */
    static generateBracket(tournamentId: string, tournamentType: TournamentType, players: TournamentPlayer[], options?: {
        maxRounds?: number;
        includeByes?: boolean;
        randomizeSeeds?: boolean;
    }): TournamentBracket;
    /**
     * Generate single elimination bracket
     */
    private static generateSingleEliminationBracket;
    /**
     * Generate double elimination bracket
     */
    private static generateDoubleEliminationBracket;
    /**
     * Generate round robin bracket
     */
    private static generateRoundRobinBracket;
    /**
     * Generate Swiss system bracket
     */
    private static generateSwissBracket;
    /**
     * Sort players by seeding for bracket generation
     */
    private static sortPlayersBySeeding;
    /**
     * Get round name based on round number and total rounds
     */
    private static getRoundName;
    /**
     * Simulate round winners for bracket progression
     */
    private static simulateRoundWinners;
    /**
     * Generate round robin matches for a round
     */
    private static generateRoundRobinMatches;
    /**
     * Generate Swiss system matches for a round
     */
    private static generateSwissMatches;
    /**
     * Validate bracket integrity
     */
    static validateBracket(bracket: TournamentBracket): {
        isValid: boolean;
        errors: string[];
        warnings: string[];
    };
    /**
     * Update bracket after match result
     */
    static updateBracketAfterMatch(bracket: TournamentBracket, matchId: string, winnerId: string): TournamentBracket;
}
export default BracketService;
//# sourceMappingURL=bracketService.d.ts.map