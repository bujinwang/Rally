import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface TournamentCreationData {
  name: string;
  description?: string;
  tournamentType: 'SINGLE_ELIMINATION' | 'DOUBLE_ELIMINATION' | 'ROUND_ROBIN' | 'SWISS' | 'MIXED';
  maxPlayers: number;
  minPlayers: number;
  startDate: Date;
  endDate?: Date;
  registrationDeadline: Date;
  venueName?: string;
  venueAddress?: string;
  latitude?: number;
  longitude?: number;
  matchFormat: 'SINGLES' | 'DOUBLES' | 'MIXED';
  scoringSystem: '21_POINT' | '15_POINT' | '11_POINT';
  bestOfGames: number;
  entryFee: number;
  prizePool: number;
  currency: string;
  organizerName: string;
  organizerEmail?: string;
  organizerPhone?: string;
  visibility: 'PUBLIC' | 'PRIVATE' | 'INVITATION_ONLY';
  accessCode?: string;
  skillLevelMin?: string;
  skillLevelMax?: string;
  ageRestriction?: { min?: number; max?: number };
}

export interface TournamentUpdateData {
  name?: string;
  description?: string;
  startDate?: Date;
  endDate?: Date;
  registrationDeadline?: Date;
  venueName?: string;
  venueAddress?: string;
  latitude?: number;
  longitude?: number;
  entryFee?: number;
  prizePool?: number;
  visibility?: 'PUBLIC' | 'PRIVATE' | 'INVITATION_ONLY';
  accessCode?: string;
  status?: 'DRAFT' | 'REGISTRATION_OPEN' | 'REGISTRATION_CLOSED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
}

export interface PlayerRegistrationData {
  tournamentId: string;
  playerName: string;
  email?: string;
  phone?: string;
  deviceId?: string;
  skillLevel?: string;
}

class TournamentService {
  /**
   * Create a new tournament
   */
  async createTournament(data: TournamentCreationData) {
    try {
      const tournament = await prisma.tournament.create({
        data: {
          name: data.name,
          description: data.description,
          tournamentType: data.tournamentType,
          maxPlayers: data.maxPlayers,
          minPlayers: data.minPlayers,
          startDate: data.startDate,
          endDate: data.endDate,
          registrationDeadline: data.registrationDeadline,
          venueName: data.venueName,
          venueAddress: data.venueAddress,
          latitude: data.latitude,
          longitude: data.longitude,
          matchFormat: data.matchFormat,
          scoringSystem: data.scoringSystem,
          bestOfGames: data.bestOfGames,
          entryFee: data.entryFee,
          prizePool: data.prizePool,
          currency: data.currency,
          organizerName: data.organizerName,
          organizerEmail: data.organizerEmail,
          organizerPhone: data.organizerPhone,
          visibility: data.visibility,
          accessCode: data.accessCode,
          skillLevelMin: data.skillLevelMin,
          skillLevelMax: data.skillLevelMax,
          ageRestriction: data.ageRestriction ? JSON.stringify(data.ageRestriction) : null,
          status: 'REGISTRATION_OPEN',
        },
      });

      return tournament;
    } catch (error) {
      console.error('Error creating tournament:', error);
      throw new Error('Failed to create tournament');
    }
  }

  /**
   * Get tournament by ID with full details
   */
  async getTournamentById(id: string) {
    try {
      const tournament = await prisma.tournament.findUnique({
        where: { id },
        include: {
          players: {
            orderBy: { seed: 'asc' },
          },
          rounds: {
            orderBy: { roundNumber: 'asc' },
            include: {
              matches: {
                include: {
                  player1: true,
                  player2: true,
                  games: {
                    include: {
                      sets: true,
                    },
                  },
                },
              },
            },
          },
          results: true,
        },
      });

      if (!tournament) {
        throw new Error('Tournament not found');
      }

      return tournament;
    } catch (error) {
      console.error('Error fetching tournament:', error);
      throw new Error('Failed to fetch tournament');
    }
  }

  /**
   * Get tournaments with filtering and pagination
   */
  async getTournaments(filters: {
    status?: string;
    visibility?: string;
    tournamentType?: string;
    skillLevel?: string;
    latitude?: number;
    longitude?: number;
    radius?: number; // in kilometers
    limit?: number;
    offset?: number;
  } = {}) {
    try {
      const {
        status,
        visibility,
        tournamentType,
        skillLevel,
        latitude,
        longitude,
        radius = 50,
        limit = 20,
        offset = 0,
      } = filters;

      const where: any = {};

      if (status) {
        where.status = status;
      }

      if (visibility) {
        where.visibility = visibility;
      }

      if (tournamentType) {
        where.tournamentType = tournamentType;
      }

      if (skillLevel) {
        where.OR = [
          { skillLevelMin: { lte: skillLevel } },
          { skillLevelMin: null },
        ];
        where.AND = [
          { skillLevelMax: { gte: skillLevel } },
          { skillLevelMax: null },
        ];
      }

      // Location-based filtering
      if (latitude && longitude) {
        // Simple bounding box calculation (could be improved with proper geospatial queries)
        const latDelta = radius / 111; // 1 degree ≈ 111 km
        const lngDelta = radius / (111 * Math.cos(latitude * Math.PI / 180));

        where.latitude = {
          gte: latitude - latDelta,
          lte: latitude + latDelta,
        };
        where.longitude = {
          gte: longitude - lngDelta,
          lte: longitude + lngDelta,
        };
      }

      const tournaments = await prisma.tournament.findMany({
        where,
        include: {
          players: {
            select: {
              id: true,
              playerName: true,
              status: true,
              seed: true,
            },
          },
          _count: {
            select: {
              players: true,
              matches: true,
            },
          },
        },
        orderBy: { startDate: 'asc' },
        take: limit,
        skip: offset,
      });

      const total = await prisma.tournament.count({ where });

      return {
        tournaments,
        total,
        limit,
        offset,
      };
    } catch (error) {
      console.error('Error fetching tournaments:', error);
      throw new Error('Failed to fetch tournaments');
    }
  }

  /**
   * Update tournament details
   */
  async updateTournament(id: string, data: TournamentUpdateData) {
    try {
      const tournament = await prisma.tournament.update({
        where: { id },
        data,
      });

      return tournament;
    } catch (error) {
      console.error('Error updating tournament:', error);
      throw new Error('Failed to update tournament');
    }
  }

  /**
   * Delete tournament
   */
  async deleteTournament(id: string) {
    try {
      await prisma.tournament.delete({
        where: { id },
      });

      return { success: true };
    } catch (error) {
      console.error('Error deleting tournament:', error);
      throw new Error('Failed to delete tournament');
    }
  }

  /**
   * Register player for tournament
   */
  async registerPlayer(data: PlayerRegistrationData) {
    try {
      // Check if tournament exists and is accepting registrations
      const tournament = await prisma.tournament.findUnique({
        where: { id: data.tournamentId },
        include: { players: true },
      });

      if (!tournament) {
        throw new Error('Tournament not found');
      }

      if (tournament.status !== 'REGISTRATION_OPEN') {
        throw new Error('Tournament is not accepting registrations');
      }

      if (tournament.players.length >= tournament.maxPlayers) {
        throw new Error('Tournament is full');
      }

      // Check for duplicate registration
      const existingPlayer = tournament.players.find(
        p => p.playerName === data.playerName || (data.deviceId && p.deviceId === data.deviceId)
      );

      if (existingPlayer) {
        throw new Error('Player already registered for this tournament');
      }

      // Get player stats from MVP system if deviceId is provided
      let playerStats = { winRate: 0, totalMatches: 0 };
      if (data.deviceId) {
        try {
          const mvpPlayer = await prisma.mvpPlayer.findFirst({
            where: { deviceId: data.deviceId },
          });

          if (mvpPlayer) {
            playerStats = {
              winRate: mvpPlayer.winRate,
              totalMatches: mvpPlayer.matchesPlayed,
            };
          }
        } catch (error) {
          console.warn('Could not fetch player stats from MVP system:', error);
        }
      }

      // Register player
      const player = await prisma.tournamentPlayer.create({
        data: {
          tournamentId: data.tournamentId,
          playerName: data.playerName,
          email: data.email,
          phone: data.phone,
          deviceId: data.deviceId,
          skillLevel: data.skillLevel,
          winRate: playerStats.winRate,
          totalMatches: playerStats.totalMatches,
          status: 'REGISTERED',
        },
      });

      return player;
    } catch (error) {
      console.error('Error registering player:', error);
      throw error;
    }
  }

  /**
   * Unregister player from tournament
   */
  async unregisterPlayer(tournamentId: string, playerId: string) {
    try {
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: { status: true },
      });

      if (!tournament) {
        throw new Error('Tournament not found');
      }

      if (tournament.status !== 'REGISTRATION_OPEN') {
        throw new Error('Cannot unregister from tournament that has started');
      }

      await prisma.tournamentPlayer.delete({
        where: { id: playerId },
      });

      return { success: true };
    } catch (error) {
      console.error('Error unregistering player:', error);
      throw new Error('Failed to unregister player');
    }
  }

  /**
   * Start tournament and generate bracket
   */
  async startTournament(tournamentId: string) {
    try {
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: {
          players: {
            orderBy: { seed: 'asc' },
          },
        },
      });

      if (!tournament) {
        throw new Error('Tournament not found');
      }

      if (tournament.status !== 'REGISTRATION_CLOSED') {
        throw new Error('Tournament must be in REGISTRATION_CLOSED status to start');
      }

      if (tournament.players.length < tournament.minPlayers) {
        throw new Error(`Tournament needs at least ${tournament.minPlayers} players to start`);
      }

      // Generate bracket based on tournament type
      await this.generateBracket(tournamentId);

      // Update tournament status
      await prisma.tournament.update({
        where: { id: tournamentId },
        data: { status: 'IN_PROGRESS' },
      });

      return { success: true };
    } catch (error) {
      console.error('Error starting tournament:', error);
      throw error;
    }
  }

  /**
   * Generate tournament bracket
   */
  private async generateBracket(tournamentId: string) {
    try {
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: {
          players: {
            orderBy: { seed: 'asc' },
          },
        },
      });

      if (!tournament) {
        throw new Error('Tournament not found');
      }

      const playerCount = tournament.players.length;

      // Calculate number of rounds needed
      const roundsNeeded = Math.ceil(Math.log2(playerCount));

      // Create rounds
      for (let roundNumber = 1; roundNumber <= roundsNeeded; roundNumber++) {
        const roundName = this.getRoundName(roundNumber, roundsNeeded);

        await prisma.tournamentRound.create({
          data: {
            tournamentId,
            roundNumber,
            roundName,
            roundType: 'ELIMINATION',
            matchesRequired: Math.floor(playerCount / Math.pow(2, roundNumber)),
            playersAdvancing: roundNumber === roundsNeeded ? 1 : Math.floor(playerCount / Math.pow(2, roundNumber)),
            status: roundNumber === 1 ? 'IN_PROGRESS' : 'PENDING',
          },
        });
      }

      // Generate matches for first round
      await this.generateRoundMatches(tournamentId, 1, tournament.players);

    } catch (error) {
      console.error('Error generating bracket:', error);
      throw new Error('Failed to generate tournament bracket');
    }
  }

  /**
   * Generate matches for a specific round
   */
  private async generateRoundMatches(
    tournamentId: string,
    roundNumber: number,
    players: any[]
  ) {
    try {
      const round = await prisma.tournamentRound.findFirst({
        where: {
          tournamentId,
          roundNumber,
        },
      });

      if (!round) {
        throw new Error('Round not found');
      }

      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
      });

      if (!tournament) {
        throw new Error('Tournament not found');
      }

      // Shuffle players for fairness (except seeded players)
      const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);

      // Create matches
      for (let i = 0; i < shuffledPlayers.length; i += 2) {
        if (i + 1 < shuffledPlayers.length) {
          await prisma.tournamentMatch.create({
            data: {
              tournamentId,
              roundId: round.id,
              player1Id: shuffledPlayers[i].id,
              player2Id: shuffledPlayers[i + 1].id,
              matchNumber: Math.floor(i / 2) + 1,
              bestOfGames: tournament.bestOfGames,
              scoringSystem: tournament.scoringSystem,
              status: 'SCHEDULED',
            },
          });
        }
      }
    } catch (error) {
      console.error('Error generating round matches:', error);
      throw new Error('Failed to generate round matches');
    }
  }

  /**
   * Get round name based on round number and total rounds
   */
  private getRoundName(roundNumber: number, totalRounds: number): string {
    if (roundNumber === totalRounds) {
      return 'Finals';
    } else if (roundNumber === totalRounds - 1) {
      return 'Semi Finals';
    } else if (roundNumber === totalRounds - 2) {
      return 'Quarter Finals';
    } else {
      const playersInRound = Math.pow(2, totalRounds - roundNumber + 1);
      return `Round of ${playersInRound}`;
    }
  }

  /**
   * Get tournament statistics
   */
  async getTournamentStats(tournamentId: string) {
    try {
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: {
          players: true,
          matches: {
            include: {
              games: {
                include: {
                  sets: true,
                },
              },
            },
          },
          rounds: true,
        },
      });

      if (!tournament) {
        throw new Error('Tournament not found');
      }

      const stats = {
        totalPlayers: tournament.players.length,
        totalMatches: tournament.matches.length,
        completedMatches: tournament.matches.filter(m => m.status === 'COMPLETED').length,
        totalGames: tournament.matches.reduce((sum, match) => sum + match.games.length, 0),
        totalSets: tournament.matches.reduce((sum, match) =>
          sum + match.games.reduce((gameSum, game) => gameSum + game.sets.length, 0), 0),
        currentRound: tournament.rounds.find(r => r.status === 'IN_PROGRESS')?.roundNumber || 0,
        tournamentProgress: tournament.rounds.length > 0 ?
          (tournament.rounds.filter(r => r.status === 'COMPLETED').length / tournament.rounds.length) * 100 : 0,
      };

      return stats;
    } catch (error) {
      console.error('Error fetching tournament stats:', error);
      throw new Error('Failed to fetch tournament statistics');
    }
  }
}

// Export singleton instance
export const tournamentService = new TournamentService();
export default tournamentService;