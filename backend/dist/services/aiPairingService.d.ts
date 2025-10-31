import { PairingHistory } from '@prisma/client';
export interface PlayerWithAIData {
    id: string;
    name: string;
    skillLevel?: number;
    winRate: number;
    gamesPlayed: number;
    preferences?: any;
    pairingHistory: PairingHistory[];
}
export interface AIPairingSuggestion {
    pairing: [string, string];
    confidence: number;
    reason: string;
    factors: {
        skillMatch: number;
        preferenceMatch: number;
        historicalCompatibility: number;
    };
}
export interface AIPairingResult {
    suggestions: AIPairingSuggestion[];
    processingTime: number;
    algorithmVersion: string;
}
export declare class AIPairingService {
    private static readonly CACHE_TTL;
    private static readonly CONFIDENCE_THRESHOLD;
    /**
     * Generate AI-powered pairing suggestions for a session
     */
    static generateAISuggestions(sessionId: string, playerIds: string[], options?: {
        maxSuggestions?: number;
        includeHistoricalData?: boolean;
        preferenceWeight?: number;
    }): Promise<AIPairingResult>;
    /**
     * Get players with AI-relevant data
     */
    private static getPlayersWithAIData;
    /**
     * Calculate skill level if not set (fallback algorithm)
     */
    private static calculateSkillLevel;
    /**
     * Generate all possible unique pairings from player list
     */
    private static generatePossiblePairings;
    /**
     * Score a pairing using AI algorithm
     */
    private static scorePairing;
    /**
     * Calculate skill match score (0-1)
     */
    private static calculateSkillMatch;
    /**
     * Calculate preference match score (0-1)
     */
    private static calculatePreferenceMatch;
    /**
     * Calculate historical compatibility based on past pairings
     */
    private static calculateHistoricalCompatibility;
    /**
     * Generate human-readable reason for pairing suggestion
     */
    private static generatePairingReason;
    /**
     * Get active AI model parameters
     */
    private static getActiveModelParameters;
    /**
     * Record pairing feedback for learning
     */
    static recordPairingFeedback(sessionId: string, playerId: string, partnerId: string, feedback: number, aiSuggested?: boolean): Promise<void>;
    /**
     * Update player skill levels based on match results
     */
    static updatePlayerSkillLevels(sessionId: string): Promise<void>;
}
//# sourceMappingURL=aiPairingService.d.ts.map