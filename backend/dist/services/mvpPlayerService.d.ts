import { MvpPlayer } from '@prisma/client';
export interface CreatePlayerData {
    sessionId: string;
    name: string;
    deviceId?: string;
}
export interface UpdatePlayerStatusData {
    status: 'ACTIVE' | 'RESTING' | 'LEFT';
}
export interface RestManagementData {
    gamesCount: number;
    requestedBy: string;
}
export declare class MvpPlayerService {
    /**
     * Create a new player and add to session
     */
    static createPlayer(data: CreatePlayerData): Promise<MvpPlayer>;
    /**
     * Get player by ID with session info
     */
    static getPlayerById(playerId: string): Promise<MvpPlayer | null>;
    /**
     * Get all players in a session
     */
    static getPlayersBySession(sessionId: string): Promise<MvpPlayer[]>;
    /**
     * Update player status
     */
    static updatePlayerStatus(playerId: string, data: UpdatePlayerStatusData, deviceId?: string): Promise<MvpPlayer>;
    /**
     * Remove player from session (organizer only)
     */
    static removePlayer(playerId: string, ownerDeviceId: string): Promise<void>;
    /**
     * Add player by organizer (bypasses some restrictions)
     */
    static addPlayerByOrganizer(sessionId: string, playerName: string, ownerDeviceId: string): Promise<MvpPlayer>;
    /**
     * Manage player rest status
     */
    static managePlayerRest(playerId: string, data: RestManagementData, deviceId?: string): Promise<MvpPlayer>;
    /**
     * Get player status by device ID
     */
    static getPlayerByDeviceId(sessionId: string, deviceId: string): Promise<MvpPlayer | null>;
    /**
     * Get rest status for all players in session
     */
    static getRestStatusBySession(sessionId: string): Promise<Array<{
        id: string;
        name: string;
        status: string;
        restGamesRemaining: number;
        restRequestedAt: Date | null;
        restRequestedBy: string | null;
    }>>;
    /**
     * Check if player is currently in an active game
     */
    private static isPlayerInActiveGame;
    /**
     * Get player name by ID (helper method)
     */
    private static getPlayerName;
}
//# sourceMappingURL=mvpPlayerService.d.ts.map