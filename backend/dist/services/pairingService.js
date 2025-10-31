"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PairingService = void 0;
const client_1 = require("@prisma/client");
const cacheService_1 = require("./cacheService");
const performanceService_1 = require("./performanceService");
const performanceService = new performanceService_1.PerformanceService();
const prisma = new client_1.PrismaClient();
class PairingService {
    /**
      * Get active players for pairing (excludes RESTING and LEFT players)
      */
    static async getActivePlayersForPairing(sessionId) {
        try {
            // Check cache first
            const cacheKey = `players:active:${sessionId}`;
            const cachedPlayers = await cacheService_1.cacheService.get(cacheKey);
            if (cachedPlayers) {
                console.log('✅ Active players cache hit');
                // performanceService.recordCacheHit(); // Cache stats not implemented
                return cachedPlayers;
            }
            console.log('📡 Active players cache miss, querying database');
            // performanceService.recordCacheMiss(); // Cache stats not implemented
            const players = await prisma.mvpPlayer.findMany({
                where: {
                    sessionId,
                    status: 'ACTIVE' // Only include ACTIVE players
                },
                select: {
                    id: true,
                    name: true,
                    status: true,
                    gamesPlayed: true,
                    wins: true,
                    losses: true
                },
                orderBy: {
                    gamesPlayed: 'asc' // Prioritize players with fewer games
                }
            });
            const result = players.map(player => ({
                id: player.id,
                name: player.name,
                status: player.status,
                gamesPlayed: player.gamesPlayed,
                wins: player.wins,
                losses: player.losses
            }));
            // Cache the result for 30 seconds (players change frequently)
            await cacheService_1.cacheService.set(cacheKey, result, 30);
            console.log('💾 Active players cached');
            return result;
        }
        catch (error) {
            console.error('Error fetching active players for pairing:', error);
            throw new Error('Failed to fetch players for pairing');
        }
    }
    /**
      * Generate fair pairings using a simple algorithm
      * Prioritizes players with fewer games played
      */
    static async generatePairings(sessionId, algorithm = 'fair') {
        const startTime = Date.now();
        try {
            const activePlayers = await this.getActivePlayersForPairing(sessionId);
            if (activePlayers.length < 4) {
                throw new Error('Need at least 4 active players to generate pairings');
            }
            let pairings = [];
            let oddPlayerOut;
            if (algorithm === 'random') {
                // Simple random pairing
                const shuffled = [...activePlayers].sort(() => Math.random() - 0.5);
                pairings = this.createOptimizedPairsFromList(shuffled);
            }
            else {
                // Fair pairing based on games played
                const sortedByGames = [...activePlayers].sort((a, b) => a.gamesPlayed - b.gamesPlayed);
                pairings = this.createOptimizedPairsFromList(sortedByGames);
            }
            // Handle odd number of players
            if (activePlayers.length % 2 !== 0) {
                // Remove the last player from the last pairing and mark as odd player out
                const lastPairing = pairings[pairings.length - 1];
                if (lastPairing.players.length === 2) {
                    const removedPlayer = lastPairing.players.pop();
                    if (removedPlayer) {
                        oddPlayerOut = removedPlayer.id;
                    }
                }
            }
            // Calculate fairness score (simple implementation)
            const fairnessScore = this.calculateFairnessScore(pairings, activePlayers);
            const result = {
                pairings,
                fairnessScore,
                oddPlayerOut,
                generatedAt: new Date()
            };
            // Performance monitoring
            const executionTime = Date.now() - startTime;
            console.log(`⚡ Pairing generation completed in ${executionTime}ms for ${activePlayers.length} players`);
            if (executionTime > 500) {
                console.warn(`🐌 Slow pairing generation detected: ${executionTime}ms`);
            }
            return result;
        }
        catch (error) {
            console.error('Error generating pairings:', error);
            throw error;
        }
    }
    /**
     * Invalidate player cache when players change
     */
    static async invalidatePlayerCache(sessionId) {
        try {
            const cacheKey = `players:active:${sessionId}`;
            await cacheService_1.cacheService.delete(cacheKey);
            console.log(`🗑️ Player cache invalidated for session ${sessionId}`);
        }
        catch (error) {
            console.error('Error invalidating player cache:', error);
        }
    }
    /**
     * Optimized pairing algorithm with better performance
     */
    static createOptimizedPairsFromList(players) {
        const pairings = [];
        const courts = Math.ceil(players.length / 2);
        // Use a more efficient approach for large player lists
        if (players.length > 20) {
            // For large groups, use a round-robin style pairing
            return this.createRoundRobinPairings(players);
        }
        // Standard pairing for smaller groups
        for (let i = 0; i < courts; i++) {
            const courtNumber = i + 1;
            const startIndex = i * 2;
            const endIndex = Math.min(startIndex + 2, players.length);
            const courtPlayers = players.slice(startIndex, endIndex);
            const pairing = {
                id: `pairing_${courtNumber}_${Date.now()}`,
                court: courtNumber,
                players: courtPlayers.map((player, index) => ({
                    id: player.id,
                    name: player.name,
                    position: index === 0 ? 'left' : 'right'
                })),
                createdAt: new Date()
            };
            pairings.push(pairing);
        }
        return pairings;
    }
    /**
     * Round-robin pairing for large groups
     */
    static createRoundRobinPairings(players) {
        const pairings = [];
        const courts = Math.ceil(players.length / 2);
        // Shuffle for variety while maintaining some fairness
        const shuffled = [...players].sort(() => Math.random() - 0.5);
        for (let i = 0; i < courts; i++) {
            const courtNumber = i + 1;
            const player1 = shuffled[i * 2];
            const player2 = shuffled[i * 2 + 1];
            const pairing = {
                id: `pairing_${courtNumber}_${Date.now()}`,
                court: courtNumber,
                players: [
                    {
                        id: player1.id,
                        name: player1.name,
                        position: 'left'
                    },
                    player2 ? {
                        id: player2.id,
                        name: player2.name,
                        position: 'right'
                    } : null
                ].filter(Boolean),
                createdAt: new Date()
            };
            pairings.push(pairing);
        }
        return pairings;
    }
    /**
     * Create pairs from a sorted list of players
     */
    static createPairsFromList(players) {
        const pairings = [];
        const courts = Math.ceil(players.length / 2);
        for (let i = 0; i < courts; i++) {
            const courtNumber = i + 1;
            const startIndex = i * 2;
            const endIndex = Math.min(startIndex + 2, players.length);
            const courtPlayers = players.slice(startIndex, endIndex);
            const pairing = {
                id: `pairing_${courtNumber}_${Date.now()}`,
                court: courtNumber,
                players: courtPlayers.map((player, index) => ({
                    id: player.id,
                    name: player.name,
                    position: index === 0 ? 'left' : 'right'
                })),
                createdAt: new Date()
            };
            pairings.push(pairing);
        }
        return pairings;
    }
    /**
     * Calculate fairness score based on games played distribution
     */
    static calculateFairnessScore(pairings, allPlayers) {
        if (pairings.length === 0)
            return 0;
        let totalGamesDifference = 0;
        let pairCount = 0;
        // Calculate average games per player
        const totalGames = allPlayers.reduce((sum, player) => sum + player.gamesPlayed, 0);
        const avgGames = totalGames / allPlayers.length;
        // Check each pairing for balance
        for (const pairing of pairings) {
            if (pairing.players.length === 2) {
                const player1 = allPlayers.find(p => p.id === pairing.players[0].id);
                const player2 = allPlayers.find(p => p.id === pairing.players[1].id);
                if (player1 && player2) {
                    const gamesDiff = Math.abs(player1.gamesPlayed - player2.gamesPlayed);
                    totalGamesDifference += gamesDiff;
                    pairCount++;
                }
            }
        }
        if (pairCount === 0)
            return 100;
        // Lower difference = higher fairness score
        const avgDifference = totalGamesDifference / pairCount;
        const maxReasonableDiff = 10; // Assume 10 games is a large difference
        const fairnessScore = Math.max(0, 100 - (avgDifference / maxReasonableDiff) * 100);
        return Math.round(fairnessScore);
    }
    /**
     * Validate that a pairing doesn't have duplicate players or invalid configurations
     */
    static validatePairing(pairing, existingPairings) {
        const errors = [];
        const allPlayerIds = new Set();
        // Collect all player IDs from existing pairings
        for (const existing of existingPairings) {
            for (const player of existing.players) {
                allPlayerIds.add(player.id);
            }
        }
        // Check for duplicate players
        for (const player of pairing.players) {
            if (allPlayerIds.has(player.id)) {
                errors.push(`Player ${player.name} is already assigned to another pairing`);
            }
        }
        // Check pairing size (should be 1-2 players)
        if (pairing.players.length === 0) {
            errors.push('Pairing must have at least 1 player');
        }
        else if (pairing.players.length > 2) {
            errors.push('Pairing cannot have more than 2 players');
        }
        return {
            valid: errors.length === 0,
            errors
        };
    }
    /**
     * Update player game counts after a pairing is used
     */
    static async updatePlayerGameCounts(pairings) {
        try {
            for (const pairing of pairings) {
                for (const player of pairing.players) {
                    await prisma.mvpPlayer.update({
                        where: { id: player.id },
                        data: {
                            gamesPlayed: {
                                increment: 1
                            }
                        }
                    });
                }
            }
        }
        catch (error) {
            console.error('Error updating player game counts:', error);
            throw new Error('Failed to update player statistics');
        }
    }
}
exports.PairingService = PairingService;
//# sourceMappingURL=pairingService.js.map