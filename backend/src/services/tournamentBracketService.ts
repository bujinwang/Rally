import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

class TournamentBracketService {
  /**
   * Generate tournament bracket based on tournament type
   */
  async generateBracket(options: BracketGenerationOptions): Promise<TournamentBracket> {
    const { tournamentId, players, tournamentType } = options;

    switch (tournamentType) {
      case 'SINGLE_ELIMINATION':
        return this.generateSingleEliminationBracket(options);
      case 'DOUBLE_ELIMINATION':
        return this.generateDoubleEliminationBracket(options);
      case 'ROUND_ROBIN':
        return this.generateRoundRobinBracket(options);
      case 'SWISS':
        return this.generateSwissBracket(options);
      default:
        throw new Error(`Unsupported tournament type: ${tournamentType}`);
    }
  }

  /**
   * Generate single elimination bracket
   */
  private async generateSingleEliminationBracket(options: BracketGenerationOptions): Promise<TournamentBracket> {
    const { tournamentId, players } = options;
    const totalPlayers = players.length;
    const totalRounds = Math.ceil(Math.log2(totalPlayers));

    // Sort players by seeding (if available) or randomize
    const sortedPlayers = this.sortPlayersForBracket(players, options.randomizeSeeding);

    // Create bracket structure
    const bracket: BracketMatch[][] = [];

    // Initialize first round
    const firstRound: BracketMatch[] = [];
    const byesNeeded = Math.pow(2, totalRounds) - totalPlayers;

    let playerIndex = 0;
    let byeCount = 0;

    for (let matchNum = 1; matchNum <= Math.pow(2, totalRounds - 1); matchNum++) {
      const match: BracketMatch = {
        id: `${tournamentId}-R1-M${matchNum}`,
        round: 1,
        match: matchNum,
        status: 'PENDING',
      };

      // Assign players or byes
      if (playerIndex < sortedPlayers.length) {
        match.player1Id = sortedPlayers[playerIndex].id;
        match.player1Name = sortedPlayers[playerIndex].name;
        playerIndex++;
      } else if (byeCount < byesNeeded) {
        match.status = 'BYE';
        byeCount++;
      }

      if (playerIndex < sortedPlayers.length) {
        match.player2Id = sortedPlayers[playerIndex].id;
        match.player2Name = sortedPlayers[playerIndex].name;
        playerIndex++;
      } else if (byeCount < byesNeeded) {
        match.status = 'BYE';
        byeCount++;
      }

      firstRound.push(match);
    }

    bracket.push(firstRound);

    // Generate subsequent rounds (placeholders)
    for (let round = 2; round <= totalRounds; round++) {
      const roundMatches: BracketMatch[] = [];
      const matchesInRound = Math.pow(2, totalRounds - round);

      for (let matchNum = 1; matchNum <= matchesInRound; matchNum++) {
        roundMatches.push({
          id: `${tournamentId}-R${round}-M${matchNum}`,
          round,
          match: matchNum,
          status: 'PENDING',
        });
      }

      bracket.push(roundMatches);
    }

    return {
      tournamentId,
      totalRounds,
      totalPlayers,
      bracket,
      currentRound: 1,
      isComplete: false,
    };
  }

  /**
   * Generate double elimination bracket
   */
  private async generateDoubleEliminationBracket(options: BracketGenerationOptions): Promise<TournamentBracket> {
    const { tournamentId, players } = options;
    const totalPlayers = players.length;
    const winnersBracketRounds = Math.ceil(Math.log2(totalPlayers));
    const totalRounds = winnersBracketRounds * 2 - 1; // Winners + losers brackets

    const sortedPlayers = this.sortPlayersForBracket(players, options.randomizeSeeding);

    // Create bracket structure for double elimination
    const bracket: BracketMatch[][] = [];

    // Winners bracket (first half of rounds)
    for (let round = 1; round <= winnersBracketRounds; round++) {
      const roundMatches: BracketMatch[] = [];
      const matchesInRound = round === 1 ? totalPlayers / 2 : Math.pow(2, winnersBracketRounds - round);

      for (let matchNum = 1; matchNum <= matchesInRound; matchNum++) {
        const match: BracketMatch = {
          id: `${tournamentId}-WB-R${round}-M${matchNum}`,
          round,
          match: matchNum,
          status: 'PENDING',
        };

        // Assign players for first round
        if (round === 1) {
          const player1Index = (matchNum - 1) * 2;
          const player2Index = player1Index + 1;

          if (player1Index < sortedPlayers.length) {
            match.player1Id = sortedPlayers[player1Index].id;
            match.player1Name = sortedPlayers[player1Index].name;
          }

          if (player2Index < sortedPlayers.length) {
            match.player2Id = sortedPlayers[player2Index].id;
            match.player2Name = sortedPlayers[player2Index].name;
          }
        }

        roundMatches.push(match);
      }

      bracket.push(roundMatches);
    }

    // Losers bracket (remaining rounds)
    for (let round = winnersBracketRounds + 1; round <= totalRounds; round++) {
      const roundMatches: BracketMatch[] = [];
      const matchesInRound = Math.pow(2, totalRounds - round);

      for (let matchNum = 1; matchNum <= matchesInRound; matchNum++) {
        roundMatches.push({
          id: `${tournamentId}-LB-R${round}-M${matchNum}`,
          round,
          match: matchNum,
          status: 'PENDING',
        });
      }

      bracket.push(roundMatches);
    }

    return {
      tournamentId,
      totalRounds,
      totalPlayers,
      bracket,
      currentRound: 1,
      isComplete: false,
    };
  }

  /**
   * Generate round robin bracket
   */
  private async generateRoundRobinBracket(options: BracketGenerationOptions): Promise<TournamentBracket> {
    const { tournamentId, players } = options;
    const totalPlayers = players.length;

    // Round robin requires even number of players
    const adjustedPlayers = totalPlayers % 2 === 0 ? players : [...players, { id: 'BYE', name: 'BYE' }];
    const totalRounds = adjustedPlayers.length - 1;

    const sortedPlayers = this.sortPlayersForBracket(adjustedPlayers, options.randomizeSeeding);
    const bracket: BracketMatch[][] = [];

    // Generate round robin schedule using circle method
    for (let round = 1; round <= totalRounds; round++) {
      const roundMatches: BracketMatch[] = [];

      for (let i = 0; i < sortedPlayers.length / 2; i++) {
        const player1 = sortedPlayers[i];
        const player2 = sortedPlayers[sortedPlayers.length - 1 - i];

        // Skip bye matches
        if (player1.id === 'BYE' || player2.id === 'BYE') {
          continue;
        }

        const match: BracketMatch = {
          id: `${tournamentId}-RR-R${round}-M${i + 1}`,
          round,
          match: i + 1,
          player1Id: player1.id,
          player1Name: player1.name,
          player2Id: player2.id,
          player2Name: player2.name,
          status: 'PENDING',
        };

        roundMatches.push(match);
      }

      bracket.push(roundMatches);

      // Rotate players for next round (keep first player fixed)
      const firstPlayer = sortedPlayers.shift()!;
      sortedPlayers.splice(1, 0, firstPlayer);
    }

    return {
      tournamentId,
      totalRounds,
      totalPlayers,
      bracket,
      currentRound: 1,
      isComplete: false,
    };
  }

  /**
   * Generate Swiss system bracket
   */
  private async generateSwissBracket(options: BracketGenerationOptions): Promise<TournamentBracket> {
    const { tournamentId, players } = options;
    const totalPlayers = players.length;

    // Swiss system typically runs for 5-7 rounds
    const totalRounds = Math.min(7, Math.max(5, Math.ceil(Math.log2(totalPlayers))));

    const sortedPlayers = this.sortPlayersForBracket(players, options.randomizeSeeding);
    const bracket: BracketMatch[][] = [];

    // Initialize player scores for pairing
    const playerScores = new Map(sortedPlayers.map(p => [p.id, 0]));

    for (let round = 1; round <= totalRounds; round++) {
      const roundMatches: BracketMatch[] = [];
      const availablePlayers = sortedPlayers.filter(p => p.id !== 'BYE');

      // Sort by current score for pairing
      availablePlayers.sort((a, b) => (playerScores.get(b.id) || 0) - (playerScores.get(a.id) || 0));

      const pairedPlayers = new Set<string>();

      for (let i = 0; i < availablePlayers.length; i++) {
        if (pairedPlayers.has(availablePlayers[i].id)) continue;

        // Find best opponent (similar score, not played before)
        let opponentIndex = -1;
        for (let j = i + 1; j < availablePlayers.length; j++) {
          if (!pairedPlayers.has(availablePlayers[j].id)) {
            opponentIndex = j;
            break;
          }
        }

        if (opponentIndex === -1) {
          // No opponent found, this player gets a bye
          continue;
        }

        const player1 = availablePlayers[i];
        const player2 = availablePlayers[opponentIndex];

        const match: BracketMatch = {
          id: `${tournamentId}-SWISS-R${round}-M${roundMatches.length + 1}`,
          round,
          match: roundMatches.length + 1,
          player1Id: player1.id,
          player1Name: player1.name,
          player2Id: player2.id,
          player2Name: player2.name,
          status: 'PENDING',
        };

        roundMatches.push(match);
        pairedPlayers.add(player1.id);
        pairedPlayers.add(player2.id);
      }

      bracket.push(roundMatches);
    }

    return {
      tournamentId,
      totalRounds,
      totalPlayers,
      bracket,
      currentRound: 1,
      isComplete: false,
    };
  }

  /**
   * Sort players for bracket generation
   */
  private sortPlayersForBracket(
    players: Array<{ id: string; name: string; seed?: number; skillLevel?: string }>,
    randomizeSeeding: boolean = false
  ): Array<{ id: string; name: string; seed?: number; skillLevel?: string }> {
    if (randomizeSeeding) {
      // Random seeding
      return [...players].sort(() => Math.random() - 0.5);
    }

    // Sort by seed, then by skill level, then by name
    return [...players].sort((a, b) => {
      // Primary: seed (lower seed number = better)
      if (a.seed !== undefined && b.seed !== undefined) {
        return a.seed - b.seed;
      }
      if (a.seed !== undefined) return -1;
      if (b.seed !== undefined) return 1;

      // Secondary: skill level
      const skillOrder = { beginner: 1, intermediate: 2, advanced: 3 };
      const aSkill = skillOrder[a.skillLevel as keyof typeof skillOrder] || 0;
      const bSkill = skillOrder[b.skillLevel as keyof typeof skillOrder] || 0;

      if (aSkill !== bSkill) {
        return bSkill - aSkill; // Higher skill first
      }

      // Tertiary: alphabetical by name
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Update match result and advance bracket
   */
  async updateMatchResult(
    tournamentId: string,
    matchId: string,
    winnerId: string,
    score?: string
  ): Promise<void> {
    try {
      // Update match result
      await prisma.tournamentMatch.update({
        where: { id: matchId },
        data: {
          winnerId,
          status: 'COMPLETED',
        },
      });

      // Update game scores if provided
      if (score) {
        const match = await prisma.tournamentMatch.findUnique({
          where: { id: matchId },
          include: { games: true },
        });

        if (match && match.games.length > 0) {
          // Update the first game with the score
          await prisma.tournamentGame.update({
            where: { id: match.games[0].id },
            data: {
              winnerId,
              status: 'COMPLETED',
            },
          });
        }
      }

      // Advance winner to next round
      await this.advanceWinnerToNextRound(tournamentId, matchId, winnerId);

    } catch (error) {
      console.error('Error updating match result:', error);
      throw new Error('Failed to update match result');
    }
  }

  /**
   * Advance winner to next round
   */
  private async advanceWinnerToNextRound(
    tournamentId: string,
    matchId: string,
    winnerId: string
  ): Promise<void> {
    try {
      const match = await prisma.tournamentMatch.findUnique({
        where: { id: matchId },
        include: { round: true },
      });

      if (!match || !match.round) {
        return;
      }

      const currentRound = match.round;
      const nextRoundNumber = currentRound.roundNumber + 1;

      // Find next round
      const nextRound = await prisma.tournamentRound.findFirst({
        where: {
          tournamentId,
          roundNumber: nextRoundNumber,
        },
        include: { matches: true },
      });

      if (!nextRound) {
        // Tournament is complete
        await this.completeTournament(tournamentId, winnerId);
        return;
      }

      // Find appropriate match in next round
      const nextMatch = nextRound.matches.find(m => !m.player1Id || !m.player2Id);

      if (nextMatch) {
        // Assign winner to available slot
        if (!nextMatch.player1Id) {
          await prisma.tournamentMatch.update({
            where: { id: nextMatch.id },
            data: { player1Id: winnerId },
          });
        } else if (!nextMatch.player2Id) {
          await prisma.tournamentMatch.update({
            where: { id: nextMatch.id },
            data: { player2Id: winnerId },
          });
        }
      }

    } catch (error) {
      console.error('Error advancing winner:', error);
      throw new Error('Failed to advance winner to next round');
    }
  }

  /**
   * Complete tournament
   */
  private async completeTournament(tournamentId: string, winnerId: string): Promise<void> {
    try {
      const winner = await prisma.tournamentPlayer.findUnique({
        where: { id: winnerId },
      });

      if (!winner) {
        throw new Error('Winner not found');
      }

      // Create tournament result
      await prisma.tournamentResult.create({
        data: {
          tournamentId,
          winnerId,
          winnerName: winner.playerName,
          completedAt: new Date(),
        },
      });

      // Update tournament status
      await prisma.tournament.update({
        where: { id: tournamentId },
        data: { status: 'COMPLETED' },
      });

    } catch (error) {
      console.error('Error completing tournament:', error);
      throw new Error('Failed to complete tournament');
    }
  }

  /**
   * Get current bracket state
   */
  async getBracketState(tournamentId: string): Promise<TournamentBracket | null> {
    try {
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: {
          rounds: {
            include: {
              matches: {
                include: {
                  player1: true,
                  player2: true,
                },
              },
            },
            orderBy: { roundNumber: 'asc' },
          },
        },
      });

      if (!tournament) {
        return null;
      }

      // Convert database format to bracket format
      const bracket: BracketMatch[][] = tournament.rounds.map(round => {
        return round.matches.map(match => ({
          id: match.id,
          round: round.roundNumber,
          match: match.matchNumber,
          player1Id: match.player1Id || undefined,
          player2Id: match.player2Id || undefined,
          player1Name: match.player1?.playerName || undefined,
          player2Name: match.player2?.playerName || undefined,
          winnerId: match.winnerId || undefined,
          status: match.status as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BYE',
          court: match.courtName || undefined,
          scheduledTime: match.scheduledAt || undefined,
        }));
      });

      return {
        tournamentId,
        totalRounds: tournament.rounds.length,
        totalPlayers: tournament.maxPlayers,
        bracket,
        currentRound: tournament.rounds.find(r => r.status === 'IN_PROGRESS')?.roundNumber || 1,
        isComplete: tournament.status === 'COMPLETED',
      };

    } catch (error) {
      console.error('Error getting bracket state:', error);
      return null;
    }
  }
}

// Export singleton instance
export const tournamentBracketService = new TournamentBracketService();
export default tournamentBracketService;