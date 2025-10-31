"use strict";
// Tournament Service - Handles business logic for tournament creation and management
// Implements bracket generation, seeding, and tournament lifecycle management
Object.defineProperty(exports, "__esModule", { value: true });
exports.TournamentGameSet = exports.TournamentGame = exports.TournamentMatch = exports.TournamentRound = exports.TournamentPlayer = exports.Tournament = void 0;
exports.createTournament = createTournament;
exports.generateBracket = generateBracket;
exports.calculateSeeding = calculateSeeding;
exports.checkTournamentPermission = checkTournamentPermission;
const client_1 = require("@prisma/client");
const client_2 = require("@prisma/client");
Object.defineProperty(exports, "Tournament", { enumerable: true, get: function () { return client_2.Tournament; } });
Object.defineProperty(exports, "TournamentPlayer", { enumerable: true, get: function () { return client_2.TournamentPlayer; } });
Object.defineProperty(exports, "TournamentRound", { enumerable: true, get: function () { return client_2.TournamentRound; } });
Object.defineProperty(exports, "TournamentMatch", { enumerable: true, get: function () { return client_2.TournamentMatch; } });
Object.defineProperty(exports, "TournamentGame", { enumerable: true, get: function () { return client_2.TournamentGame; } });
Object.defineProperty(exports, "TournamentGameSet", { enumerable: true, get: function () { return client_2.TournamentGameSet; } });
const prisma = new client_1.PrismaClient();
// Simple bracket generation for single elimination (power of 2 players)
async function createTournament(input) {
    return prisma.tournament.create({
        data: {
            name: input.name,
            format: input.format,
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
            tournamentType: 'SINGLES',
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
async function generateBracket(tournamentId, players) {
    const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: { players: true },
    });
    if (!tournament || players.length !== tournament.maxPlayers || players.length & (players.length - 1) !== 0) {
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
                roundName: getRoundName(roundNum, tournament.format),
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
async function calculateSeeding(tournamentId, players) {
    // Fetch player data for seeding
    const playerData = await prisma.tournamentPlayer.findMany({
        where: { tournamentId },
        include: { player: { select: { winRate: true, totalMatches: true } } },
    });
    // Sort by winRate descending, then by totalMatches
    const seeded = playerData.sort((a, b) => {
        if (a.player.winRate !== b.player.winRate) {
            return b.player.winRate - a.player.winRate;
        }
        return b.player.totalMatches - a.player.totalMatches;
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
function getRoundName(roundNum, format) {
    const names = {
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
async function checkTournamentPermission(userId, tournamentId, action) {
    const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: { organizer: true },
    });
    if (tournament.organizer !== userId) {
        throw new Error('Unauthorized: Only organizers can perform this action');
    }
    return true;
}
//# sourceMappingURL=tournamentService.js.map