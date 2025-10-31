export interface ChallengeData {
    challengerId: string;
    challengedId: string;
    challengeType?: string;
    message?: string;
    sessionId?: string;
    matchFormat?: string;
    scoringSystem?: string;
    bestOfGames?: number;
    scheduledAt?: Date;
}
export interface ChallengeResponse {
    challengeId: string;
    challengerId: string;
    challengedId: string;
    status: string;
    message?: string;
}
export declare class ChallengesService {
    /**
     * Create a new challenge
     */
    createChallenge(data: ChallengeData): Promise<{
        id: any;
        challengerId: any;
        challengedId: any;
        challengeType: any;
        message: any;
        sessionId: any;
        matchFormat: any;
        scoringSystem: any;
        bestOfGames: any;
        status: any;
        sentAt: Date;
        scheduledAt: Date | null;
        challenger: {
            id: any;
            name: any;
        };
        challenged: {
            id: any;
            name: any;
        };
    } | null>;
    /**
     * Respond to a challenge
     */
    respondToChallenge(challengeId: string, userId: string, accept: boolean): Promise<{
        id: any;
        challengerId: any;
        challengedId: any;
        challengeType: any;
        message: any;
        sessionId: any;
        matchFormat: any;
        scoringSystem: any;
        bestOfGames: any;
        status: any;
        sentAt: Date;
        respondedAt: Date | null;
        scheduledAt: Date | null;
        challenger: {
            id: any;
            name: any;
        };
        challenged: {
            id: any;
            name: any;
        };
    } | null>;
    /**
     * Get challenges for a user
     */
    getUserChallenges(userId: string, type?: 'sent' | 'received' | 'all'): Promise<{
        id: any;
        challengerId: any;
        challengedId: any;
        challengeType: any;
        message: any;
        sessionId: any;
        matchFormat: any;
        scoringSystem: any;
        bestOfGames: any;
        status: any;
        sentAt: Date;
        respondedAt: Date | null;
        scheduledAt: Date | null;
        challenger: {
            id: any;
            name: any;
        };
        challenged: {
            id: any;
            name: any;
        };
    }[]>;
    /**
     * Cancel a challenge
     */
    cancelChallenge(challengeId: string, userId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * Mark challenge as completed
     */
    completeChallenge(challengeId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * Get challenge statistics
     */
    getChallengeStats(userId: string): Promise<{
        sentCount: number;
        receivedCount: number;
        acceptedCount: number;
        completedCount: number;
    }>;
    /**
     * Get pending challenges count for a user
     */
    getPendingChallengesCount(userId: string): Promise<number>;
    /**
     * Get active challenges (pending or accepted)
     */
    getActiveChallenges(userId: string): Promise<{
        id: any;
        challengerId: any;
        challengedId: any;
        challengeType: any;
        message: any;
        sessionId: any;
        matchFormat: any;
        scoringSystem: any;
        bestOfGames: any;
        status: any;
        sentAt: Date;
        respondedAt: Date | null;
        scheduledAt: Date | null;
        challenger: {
            id: any;
            name: any;
        };
        challenged: {
            id: any;
            name: any;
        };
    }[]>;
}
export declare const challengesService: ChallengesService;
//# sourceMappingURL=challengesService.d.ts.map