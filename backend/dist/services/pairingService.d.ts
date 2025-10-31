export interface PlayerForPairing {
    id: string;
    name: string;
    status: 'ACTIVE' | 'RESTING' | 'LEFT';
    gamesPlayed: number;
    wins: number;
    losses: number;
}
export interface Pairing {
    id: string;
    court: number;
    players: {
        id: string;
        name: string;
        position: 'left' | 'right';
    }[];
    createdAt: Date;
}
export interface PairingResult {
    pairings: Pairing[];
    fairnessScore: number;
    oddPlayerOut?: string;
    generatedAt: Date;
}
export declare class PairingService {
    /**
      * Get active players for pairing (excludes RESTING and LEFT players)
      */
    static getActivePlayersForPairing(sessionId: string): Promise<PlayerForPairing[]>;
    /**
      * Generate fair pairings using a simple algorithm
      * Prioritizes players with fewer games played
      */
    static generatePairings(sessionId: string, algorithm?: 'fair' | 'random'): Promise<PairingResult>;
    /**
     * Invalidate player cache when players change
     */
    static invalidatePlayerCache(sessionId: string): Promise<void>;
    /**
     * Optimized pairing algorithm with better performance
     */
    private static createOptimizedPairsFromList;
    /**
     * Round-robin pairing for large groups
     */
    private static createRoundRobinPairings;
    /**
     * Create pairs from a sorted list of players
     */
    private static createPairsFromList;
    /**
     * Calculate fairness score based on games played distribution
     */
    private static calculateFairnessScore;
    /**
     * Validate that a pairing doesn't have duplicate players or invalid configurations
     */
    static validatePairing(pairing: Pairing, existingPairings: Pairing[]): {
        valid: boolean;
        errors: string[];
    };
    /**
     * Update player game counts after a pairing is used
     */
    static updatePlayerGameCounts(pairings: Pairing[]): Promise<void>;
}
//# sourceMappingURL=pairingService.d.ts.map