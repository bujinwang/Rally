// Tournament Service - Handles business logic for tournament creation and management
// Implements bracket generation, seeding, and tournament lifecycle management

import { PrismaClient, TournamentType } from '@prisma/client';
import { Tournament, TournamentPlayer, TournamentRound, TournamentMatch, TournamentGame, TournamentGameSet } from '@prisma/client';

const prisma = new PrismaClient();

interface TournamentInput {
  name: string;
  format: 'single_elimination' | 'round_robin';
  maxPlayers: number;
  organizer: string;
  startDate: Date;
  // Add other fields as needed
}

interface SeedingInput {
  tournamentId: string;
  players: string[]; // Player IDs
}

// Simple bracket generation for single elimination (power of 2 players)
export async function createTournament(input: TournamentInput) {
  return prisma.tournament.create({
    data: {
      name: input.name,
      // format: input.format, // format field not in schema
      status: 'REGISTRATION_OPEN',
      organizer: input.organizer,
      startDate: input.startDate,
      maxPlayers: input.maxPlayers,
      minPlayers: 4,
      visibility: 'PUBLIC',
      // Other fields with defaults
      description: '',
      venueName: '',
      venueAddress: '',
      latitude: null,
      longitude: null,
      tournamentType: 'SINGLES' as TournamentType,
      scoringSystem: '21_POINT',
      bestOfGames: 3,
      entryFee: 0,
      prizePool: 0,
      currency: 'USD',
      registrationDeadline: input.startDate,
      endDate: null,
    },
  });
}

// Generate bracket for single elimination tournament
export async function generateBracket(tournamentId: string, players: TournamentPlayer[]) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { players: true },
  });

  if (!tournament || players.length !== tournament.maxPlayers || (players.length & (players.length - 1)) !== 0) {
    throw new Error('Tournament must have power of 2 players for single elimination');
  }

  // Simple seeding: sort by ID for now (in real impl, use skill level)
  const seededPlayers = players.sort((a, b) => a.id.localeCompare(b.id));

  // Create rounds (log2(n) rounds for n players)
  const numRounds = Math.log2(players.length);
  const rounds = [];
  for (let roundNum = 1; roundNum <= numRounds; roundNum++) {
    const round = await prisma.tournamentRound.create({
      data: {
        tournamentId,
        roundNumber: roundNum,
        roundName: getRoundName(roundNum, 'SINGLE_ELIMINATION'), // format field not in schema
        roundType: 'ELIMINATION',
        matchesRequired: players.length / 2,
        playersAdvancing: players.length / 2,
        status: 'PENDING',
      },
    });

    rounds.push(round);

    // Create matches for this round (pair 1 vs 2, 3 vs 4, etc.)
    for (let i = 0; i < players.length / 2; i++) {
      const player1 = seededPlayers[i * 2];
      const player2 = seededPlayers[i * 2 + 1];

      await prisma.tournamentMatch.create({
        data: {
          tournamentId,
          roundId: round.id,
          matchNumber: i + 1,
          player1Id: player1.id,
          player2Id: player2.id,
          status: 'SCHEDULED',
          scheduledAt: null,
          bestOfGames: 3,
          scoringSystem: '21_POINT',
        },
      });
    }
  }

  return rounds;
}

// Simple seeding logic (can be enhanced with skill levels)
export async function calculateSeeding(tournamentId: string, players: string[]) {
  // Fetch player data for seeding
  const playerData = await prisma.tournamentPlayer.findMany({
    where: { tournamentId },
    // Player relation not available, using TournamentPlayer fields directly
  });

  // Sort by winRate descending, then by totalMatches
  const seeded = playerData.sort((a, b) => {
    if (a.winRate !== b.winRate) {
      return b.winRate - a.winRate;
    }
    return b.totalMatches - a.totalMatches;
  });

  // Assign seeds 1 to n
  for (let i = 0; i < seeded.length; i++) {
    await prisma.tournamentPlayer.update({
      where: { id: seeded[i].id },
      data: { seed: i + 1 },
    });
  }

  return seeded.map(p => p.seed);
}

// Get round name based on round number and tournament format
function getRoundName(roundNum: number, format: string): string {
  const names: Record<number, string> = {
    1: 'Round of 64',
    2: 'Round of 32',
    3: 'Round of 16',
    4: 'Quarter Finals',
    5: 'Semi Finals',
    6: 'Finals',
  };

  return names[roundNum] || `Round ${roundNum}`;
}

// Permission check for tournament actions (organizer only)
export async function checkTournamentPermission(userId: string, tournamentId: string, action: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
  });

  if (!tournament) {
    return false;
  }

  if (tournament.organizer !== userId) {
    throw new Error('Unauthorized: Only organizers can perform this action');
  }

  return true;
}

// Get tournaments with optional filters
export async function getTournaments(filters: any = {}) {
  const where: any = {};
  if (filters.status) where.status = filters.status;
  if (filters.visibility) where.visibility = filters.visibility;
  if (filters.tournamentType) where.tournamentType = filters.tournamentType;

  const limit = filters.limit || 20;
  const offset = filters.offset || 0;

  const [tournaments, total] = await Promise.all([
    prisma.tournament.findMany({
      where,
      include: { players: true, rounds: true },
      orderBy: { startDate: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.tournament.count({ where }),
  ]);

  return { tournaments, total };
}

// Get tournament by ID
export async function getTournamentById(id: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      players: { orderBy: { seed: 'asc' } },
      rounds: {
        orderBy: { roundNumber: 'asc' },
        include: { matches: true },
      },
    },
  });

  if (!tournament) throw new Error('Tournament not found');
  return tournament;
}

// Update tournament
export async function updateTournament(id: string, data: any) {
  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) throw new Error('Tournament not found');

  return prisma.tournament.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description,
      maxPlayers: data.maxPlayers,
      visibility: data.visibility,
      accessCode: data.accessCode,
    },
  });
}

// Delete tournament
export async function deleteTournament(id: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) throw new Error('Tournament not found');

  await prisma.tournament.delete({ where: { id } });
}

// Register player for tournament
export async function registerPlayer(tournamentId: string, playerData: { playerName: string; deviceId?: string }) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { players: true },
  });

  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status !== 'REGISTRATION_OPEN') throw new Error('Tournament is not accepting registrations');
  if (tournament.players.length >= tournament.maxPlayers) throw new Error('Tournament is full');

  const existing = tournament.players.find(p => p.playerName === playerData.playerName);
  if (existing) throw new Error('Player already registered');

  return prisma.tournamentPlayer.create({
    data: {
      tournamentId,
      playerName: playerData.playerName,
      deviceId: playerData.deviceId || null,
      seed: tournament.players.length + 1,
      status: 'REGISTERED',
    },
  });
}

// Unregister player
export async function unregisterPlayer(tournamentId: string, playerId: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status !== 'REGISTRATION_OPEN') throw new Error('Cannot unregister after tournament has started');

  await prisma.tournamentPlayer.delete({ where: { id: playerId } });
}

// Start tournament
export async function startTournament(id: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: { players: true },
  });

  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status !== 'REGISTRATION_OPEN') throw new Error('Tournament must be in registration phase');
  if (tournament.players.length < tournament.minPlayers) throw new Error(`Tournament needs at least ${tournament.minPlayers} players`);

  return prisma.tournament.update({
    where: { id },
    data: { status: 'IN_PROGRESS' },
  });
}

// Get tournament statistics
export async function getTournamentStats(id: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      players: true,
      rounds: { include: { matches: true } },
    },
  });

  if (!tournament) throw new Error('Tournament not found');

  const totalMatches = tournament.rounds.reduce((sum, r) => sum + r.matches.length, 0);
  const completedMatches = tournament.rounds.reduce(
    (sum, r) => sum + r.matches.filter(m => m.status === 'COMPLETED').length, 0
  );

  return {
    totalPlayers: tournament.players.length,
    maxPlayers: tournament.maxPlayers,
    totalMatches,
    completedMatches,
    completionRate: totalMatches > 0 ? (completedMatches / totalMatches) * 100 : 0,
    status: tournament.status,
  };
}

export { Tournament, TournamentPlayer, TournamentRound, TournamentMatch, TournamentGame, TournamentGameSet };