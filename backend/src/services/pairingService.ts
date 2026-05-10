import { PrismaClient, MvpPlayer } from '@prisma/client';
import { cacheService } from './cacheService';
import { PerformanceService } from './performanceService';

const performanceService = new PerformanceService();

const prisma = new PrismaClient();

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
  oddPlayerOut?: string; // Player ID if odd number of players
  generatedAt: Date;
}

export class PairingService {
  /**
    * Get active players for pairing (excludes RESTING and LEFT players)
    */
  static async getActivePlayersForPairing(sessionId: string): Promise<PlayerForPairing[]> {
    try {
      // Check cache first
      const cacheKey = `players:active:${sessionId}`;
      const cachedPlayers = await cacheService.get<PlayerForPairing[]>(cacheKey);

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
        status: player.status as 'ACTIVE' | 'RESTING' | 'LEFT',
        gamesPlayed: player.gamesPlayed,
        wins: player.wins,
        losses: player.losses
      }));

      // Cache the result for 30 seconds (players change frequently)
      await cacheService.set(cacheKey, result, 30);
      console.log('💾 Active players cached');

      return result;
    } catch (error) {
      console.error('Error fetching active players for pairing:', error);
      throw new Error('Failed to fetch players for pairing');
    }
  }

  /**
    * Generate fair pairings using a simple algorithm
    * Prioritizes players with fewer games played
    */
  static async generatePairings(sessionId: string, algorithm: 'fair' | 'random' | 'skill_balanced' | 'partnership_rotation' = 'fair'): Promise<PairingResult> {
    const startTime = Date.now();

    try {
      const activePlayers = await this.getActivePlayersForPairing(sessionId);

      if (activePlayers.length < 4) {
        throw new Error('Need at least 4 active players to generate pairings');
      }

      let pairings: Pairing[] = [];
      let oddPlayerOut: string | undefined;

      switch (algorithm) {
        case 'random':
          const shuffled = [...activePlayers].sort(() => Math.random() - 0.5);
          pairings = this.createOptimizedPairsFromList(shuffled);
          break;
        case 'skill_balanced':
          pairings = this.createSkillBalancedPairs(activePlayers);
          break;
        case 'partnership_rotation':
          pairings = await this.createPartnershipRotationPairs(sessionId, activePlayers);
          break;
        case 'fair':
        default:
          const sortedByGames = [...activePlayers].sort((a, b) => a.gamesPlayed - b.gamesPlayed);
          pairings = this.createOptimizedPairsFromList(sortedByGames);
          break;
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

      const result: PairingResult = {
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
    } catch (error) {
      console.error('Error generating pairings:', error);
      throw error;
    }
  }

  /**
   * Invalidate player cache when players change
   */
  static async invalidatePlayerCache(sessionId: string): Promise<void> {
    try {
      const cacheKey = `players:active:${sessionId}`;
      await cacheService.delete(cacheKey);
      console.log(`🗑️ Player cache invalidated for session ${sessionId}`);
    } catch (error) {
      console.error('Error invalidating player cache:', error);
    }
  }

  /**
   * Optimized pairing algorithm with better performance
   */
  private static createOptimizedPairsFromList(players: PlayerForPairing[]): Pairing[] {
    const pairings: Pairing[] = [];
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

      const pairing: Pairing = {
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
  private static createRoundRobinPairings(players: PlayerForPairing[]): Pairing[] {
    const pairings: Pairing[] = [];
    const courts = Math.ceil(players.length / 2);

    // Shuffle for variety while maintaining some fairness
    const shuffled = [...players].sort(() => Math.random() - 0.5);

    for (let i = 0; i < courts; i++) {
      const courtNumber = i + 1;
      const player1 = shuffled[i * 2];
      const player2 = shuffled[i * 2 + 1];

      const pairing: Pairing = {
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
        ].filter(Boolean) as any,
        createdAt: new Date()
      };

      pairings.push(pairing);
    }

    return pairings;
  }

  /**
   * Create pairs from a sorted list of players
   */
  private static createPairsFromList(players: PlayerForPairing[]): Pairing[] {
    const pairings: Pairing[] = [];
    const courts = Math.ceil(players.length / 2);

    for (let i = 0; i < courts; i++) {
      const courtNumber = i + 1;
      const startIndex = i * 2;
      const endIndex = Math.min(startIndex + 2, players.length);

      const courtPlayers = players.slice(startIndex, endIndex);

      const pairing: Pairing = {
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
  private static calculateFairnessScore(pairings: Pairing[], allPlayers: PlayerForPairing[]): number {
    if (pairings.length === 0) return 0;

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

    if (pairCount === 0) return 100;

    // Lower difference = higher fairness score
    const avgDifference = totalGamesDifference / pairCount;
    const maxReasonableDiff = 10; // Assume 10 games is a large difference

    const fairnessScore = Math.max(0, 100 - (avgDifference / maxReasonableDiff) * 100);

    return Math.round(fairnessScore);
  }

  /**
   * Validate that a pairing doesn't have duplicate players or invalid configurations
   */
  /**
   * Skill-balanced pairing: matches strong players with weaker players
   * for balanced teams. Uses winRate as proxy for skill.
   */
  private static createSkillBalancedPairs(players: PlayerForPairing[]): Pairing[] {
    // Sort by win rate (higher = stronger)
    const sorted = [...players].sort((a, b) => {
      const aRate = a.gamesPlayed > 0 ? a.wins / a.gamesPlayed : 0.5;
      const bRate = b.gamesPlayed > 0 ? b.wins / b.gamesPlayed : 0.5;
      return bRate - aRate;
    });

    const pairings: Pairing[] = [];
    const half = Math.floor(sorted.length / 2);

    // Pair strongest with weakest for balanced teams
    for (let i = 0; i < half; i++) {
      const strong = sorted[i];
      const weak = sorted[sorted.length - 1 - i];

      pairings.push({
        id: `pairing_${i + 1}_${Date.now()}`,
        court: i + 1,
        players: [
          { id: strong.id, name: strong.name, position: 'left' },
          { id: weak.id, name: weak.name, position: 'left' },
        ],
        createdAt: new Date(),
      });
    }

    return pairings;
  }

  /**
   * Partnership rotation pairing: maximizes variety by tracking
   * who has played with whom and avoiding repeats.
   */
  private static async createPartnershipRotationPairs(
    sessionId: string,
    players: PlayerForPairing[]
  ): Promise<Pairing[]> {
    // Get recent game history to track partnerships
    const recentGames = await prisma.mvpGame.findMany({
      where: { sessionId, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        team1Player1: true,
        team1Player2: true,
        team2Player1: true,
        team2Player2: true,
      },
    });

    // Build partnership count map
    const partnershipCount = new Map<string, number>();
    for (const game of recentGames) {
      const pairs = [
        [game.team1Player1, game.team1Player2].sort().join('|'),
        [game.team2Player1, game.team2Player2].sort().join('|'),
      ];
      for (const pair of pairs) {
        partnershipCount.set(pair, (partnershipCount.get(pair) || 0) + 1);
      }
    }

    // Sort players by fewest games first
    const sorted = [...players].sort((a, b) => a.gamesPlayed - b.gamesPlayed);
    const used = new Set<string>();
    const pairings: Pairing[] = [];
    let court = 1;

    for (let i = 0; i < sorted.length; i++) {
      if (used.has(sorted[i].id)) continue;

      // Find best partner: someone they've played with least
      let bestPartner: PlayerForPairing | null = null;
      let bestScore = Infinity;

      for (let j = i + 1; j < sorted.length; j++) {
        if (used.has(sorted[j].id)) continue;
        const pairKey = [sorted[i].name, sorted[j].name].sort().join('|');
        const count = partnershipCount.get(pairKey) || 0;
        // Prefer players with similar games played AND low partnership count
        const score = count * 100 + Math.abs(sorted[i].gamesPlayed - sorted[j].gamesPlayed);

        if (score < bestScore || (score === bestScore && !bestPartner)) {
          bestScore = score;
          bestPartner = sorted[j];
        }
      }

      if (bestPartner) {
        used.add(sorted[i].id);
        used.add(bestPartner.id);
        pairings.push({
          id: `pairing_${court}_${Date.now()}`,
          court,
          players: [
            { id: sorted[i].id, name: sorted[i].name, position: 'left' },
            { id: bestPartner.id, name: bestPartner.name, position: 'right' },
          ],
          createdAt: new Date(),
        });
        court++;
      }
    }

    return pairings;
  }

  static validatePairing(pairing: Pairing, existingPairings: Pairing[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const allPlayerIds = new Set<string>();

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
    } else if (pairing.players.length > 2) {
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
  static async updatePlayerGameCounts(pairings: Pairing[]): Promise<void> {
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
    } catch (error) {
      console.error('Error updating player game counts:', error);
      throw new Error('Failed to update player statistics');
    }
  }
}