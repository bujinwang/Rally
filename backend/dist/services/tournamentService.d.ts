import { Tournament, TournamentPlayer, TournamentRound, TournamentMatch, TournamentGame, TournamentGameSet } from '@prisma/client';
interface TournamentInput {
    name: string;
    format: 'single_elimination' | 'round_robin';
    maxPlayers: number;
    organizer: string;
    startDate: Date;
}
export declare function createTournament(input: TournamentInput): Promise<any>;
export declare function generateBracket(tournamentId: string, players: TournamentPlayer[]): Promise<any[]>;
export declare function calculateSeeding(tournamentId: string, players: string[]): Promise<any>;
export declare function checkTournamentPermission(userId: string, tournamentId: string, action: string): Promise<boolean>;
export { Tournament, TournamentPlayer, TournamentRound, TournamentMatch, TournamentGame, TournamentGameSet };
//# sourceMappingURL=tournamentService.d.ts.map