export interface SimpleScheduledMatch {
    id: string;
    sessionId: string;
    title: string;
    description?: string;
    scheduledAt: Date;
    duration: number;
    location?: string;
    courtName?: string;
    player1Id: string;
    player2Id?: string;
    matchType: 'SINGLES' | 'DOUBLES';
    status: 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface CreateSimpleMatchData {
    sessionId: string;
    title: string;
    description?: string;
    scheduledAt: Date;
    duration?: number;
    location?: string;
    courtName?: string;
    player1Id: string;
    player2Id?: string;
    matchType: 'SINGLES' | 'DOUBLES';
    createdBy: string;
}
export declare class SimpleMatchScheduler {
    /**
     * Create a simple scheduled match using existing MVP models
     */
    static createScheduledMatch(data: CreateSimpleMatchData): Promise<SimpleScheduledMatch>;
    /**
     * Get scheduled matches for a session
     */
    static getScheduledMatchesForSession(sessionId: string): Promise<SimpleScheduledMatch[]>;
    /**
     * Get scheduled matches for a specific player
     */
    static getScheduledMatchesForPlayer(playerId: string): Promise<SimpleScheduledMatch[]>;
    /**
     * Cancel a scheduled match
     */
    static cancelScheduledMatch(matchId: string, cancelledBy: string): Promise<SimpleScheduledMatch>;
    /**
     * Check for basic scheduling conflicts
     */
    static checkBasicConflicts(sessionId: string, scheduledAt: Date, courtName?: string, playerIds?: string[]): Promise<boolean>;
}
//# sourceMappingURL=simpleMatchScheduler.d.ts.map