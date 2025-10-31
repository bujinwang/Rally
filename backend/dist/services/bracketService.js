"use strict";
/**
 * Tournament Bracket Generation Service
 *
 * Handles the creation and management of tournament brackets for different tournament formats:
 * - Single Elimination
 * - Double Elimination
 * - Round Robin
 * - Swiss System
 * - Mixed formats
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BracketService = void 0;
const tournament_1 = require("./types/tournament");
class BracketService {
    /**
     * Generate tournament bracket based on tournament type and players
     */
    static generateBracket(tournamentId, tournamentType, players, options = {}) {
        const { maxRounds, includeByes = true, randomizeSeeds = false } = options;
        // Sort players by seeding
        const sortedPlayers = this.sortPlayersBySeeding(players, randomizeSeeds);
        switch (tournamentType) {
            case tournament_1.TournamentType.SINGLE_ELIMINATION:
                return this.generateSingleEliminationBracket(tournamentId, sortedPlayers, includeByes);
            case tournament_1.TournamentType.DOUBLE_ELIMINATION:
                return this.generateDoubleEliminationBracket(tournamentId, sortedPlayers);
            case tournament_1.TournamentType.ROUND_ROBIN:
                return this.generateRoundRobinBracket(tournamentId, sortedPlayers, maxRounds);
            case tournament_1.TournamentType.SWISS:
                return this.generateSwissBracket(tournamentId, sortedPlayers, maxRounds);
            default:
                throw new Error(`Unsupported tournament type: ${tournamentType}`);
        }
    }
    /**
     * Generate single elimination bracket
     */
    static generateSingleEliminationBracket(tournamentId, players, includeByes) {
        const rounds = [];
        const playerCount = players.length;
        // Calculate number of rounds needed
        const totalRounds = Math.ceil(Math.log2(playerCount));
        const maxPlayersInRound = Math.pow(2, totalRounds);
        // Handle byes for non-power-of-2 player counts
        const byePlayers = [];
        let adjustedPlayers = [...players];
        if (includeByes && playerCount !== maxPlayersInRound) {
            const byesNeeded = maxPlayersInRound - playerCount;
            // Add bye slots
            for (let i = 0; i < byesNeeded; i++) {
                adjustedPlayers.push({
                    id: `bye-${i}`,
                    playerName: 'BYE',
                    seed: maxPlayersInRound - i
                });
                byePlayers.push(`bye-${i}`);
            }
        }
        // Generate each round
        for (let roundNum = 1; roundNum <= totalRounds; roundNum++) {
            const round = {
                roundNumber: roundNum,
                roundName: this.getRoundName(roundNum, totalRounds),
                roundType: tournament_1.TournamentRoundType.ELIMINATION,
                matches: [],
                playersAdvancing: Math.ceil(adjustedPlayers.length / 2),
                status: tournament_1.TournamentRoundStatus.PENDING
            };
            // Create matches for this round
            const matchesInRound = adjustedPlayers.length / 2;
            for (let matchNum = 1; matchNum <= matchesInRound; matchNum++) {
                const player1Index = (matchNum - 1) * 2;
                const player2Index = player1Index + 1;
                const player1 = adjustedPlayers[player1Index];
                const player2 = adjustedPlayers[player2Index];
                const match = {
                    id: `${tournamentId}-R${roundNum}-M${matchNum}`,
                    roundNumber: roundNum,
                    matchNumber: matchNum,
                    player1Id: player1.id,
                    player2Id: player2.id,
                    player1Name: player1.playerName,
                    player2Name: player2.playerName
                };
                round.matches.push(match);
            }
            rounds.push(round);
            // Prepare players for next round (winners)
            adjustedPlayers = this.simulateRoundWinners(adjustedPlayers);
        }
        return {
            rounds,
            totalRounds,
            totalMatches: rounds.reduce((sum, round) => sum + round.matches.length, 0),
            byePlayers
        };
    }
    /**
     * Generate double elimination bracket
     */
    static generateDoubleEliminationBracket(tournamentId, players) {
        // Double elimination is more complex - simplified version
        const singleElimination = this.generateSingleEliminationBracket(tournamentId, players, true);
        // Add losers bracket rounds (simplified)
        const losersRounds = [];
        for (let i = 1; i < singleElimination.totalRounds; i++) {
            const losersRound = {
                roundNumber: i + singleElimination.totalRounds,
                roundName: `Losers Round ${i}`,
                roundType: tournament_1.TournamentRoundType.ELIMINATION,
                matches: [], // Would need complex logic to generate
                playersAdvancing: Math.pow(2, singleElimination.totalRounds - i - 1),
                status: tournament_1.TournamentRoundStatus.PENDING
            };
            losersRounds.push(losersRound);
        }
        return {
            rounds: [...singleElimination.rounds, ...losersRounds],
            totalRounds: singleElimination.totalRounds + losersRounds.length,
            totalMatches: singleElimination.totalMatches + losersRounds.reduce((sum, round) => sum + round.matches.length, 0),
            byePlayers: singleElimination.byePlayers
        };
    }
    /**
     * Generate round robin bracket
     */
    static generateRoundRobinBracket(tournamentId, players, maxRounds) {
        const rounds = [];
        const playerCount = players.length;
        // Round robin: each player plays every other player
        const totalPossibleRounds = playerCount - 1;
        const actualRounds = maxRounds ? Math.min(maxRounds, totalPossibleRounds) : totalPossibleRounds;
        for (let roundNum = 1; roundNum <= actualRounds; roundNum++) {
            const round = {
                roundNumber: roundNum,
                roundName: `Round ${roundNum}`,
                roundType: tournament_1.TournamentRoundType.ROUND_ROBIN,
                matches: [],
                playersAdvancing: playerCount, // All players continue in round robin
                status: tournament_1.TournamentRoundStatus.PENDING
            };
            // Generate round robin matches for this round
            const matches = this.generateRoundRobinMatches(tournamentId, players, roundNum);
            round.matches = matches.map((match, index) => ({
                ...match,
                roundNumber: roundNum,
                matchNumber: index + 1
            }));
            rounds.push(round);
        }
        return {
            rounds,
            totalRounds: actualRounds,
            totalMatches: rounds.reduce((sum, round) => sum + round.matches.length, 0),
            byePlayers: []
        };
    }
    /**
     * Generate Swiss system bracket
     */
    static generateSwissBracket(tournamentId, players, maxRounds) {
        const rounds = [];
        const playerCount = players.length;
        // Swiss system: typically 5-7 rounds
        const defaultRounds = Math.max(5, Math.ceil(Math.log2(playerCount)));
        const actualRounds = maxRounds ? Math.min(maxRounds, defaultRounds) : defaultRounds;
        for (let roundNum = 1; roundNum <= actualRounds; roundNum++) {
            const round = {
                roundNumber: roundNum,
                roundName: `Swiss Round ${roundNum}`,
                roundType: tournament_1.TournamentRoundType.SWISS,
                matches: [],
                playersAdvancing: playerCount, // All players continue
                status: tournament_1.TournamentRoundStatus.PENDING
            };
            // In Swiss system, players are paired based on current standings
            // Simplified: pair players with similar records
            const matches = this.generateSwissMatches(tournamentId, players, roundNum);
            round.matches = matches.map((match, index) => ({
                ...match,
                roundNumber: roundNum,
                matchNumber: index + 1
            }));
            rounds.push(round);
        }
        return {
            rounds,
            totalRounds: actualRounds,
            totalMatches: rounds.reduce((sum, round) => sum + round.matches.length, 0),
            byePlayers: []
        };
    }
    /**
     * Sort players by seeding for bracket generation
     */
    static sortPlayersBySeeding(players, randomize) {
        if (randomize) {
            // Random seeding for fairness
            return [...players].sort(() => Math.random() - 0.5);
        }
        // Sort by explicit seed, then by win rate, then by skill level
        return [...players].sort((a, b) => {
            // Explicit seed takes precedence
            if (a.seed && b.seed)
                return a.seed - b.seed;
            if (a.seed && !b.seed)
                return -1;
            if (!a.seed && b.seed)
                return 1;
            // Then by win rate
            if (a.winRate && b.winRate)
                return b.winRate - a.winRate;
            // Finally by skill level (higher skill first)
            const skillOrder = { 'ADVANCED': 3, 'INTERMEDIATE': 2, 'BEGINNER': 1 };
            const aSkill = skillOrder[a.skillLevel] || 0;
            const bSkill = skillOrder[b.skillLevel] || 0;
            return bSkill - aSkill;
        });
    }
    /**
     * Get round name based on round number and total rounds
     */
    static getRoundName(roundNumber, totalRounds) {
        if (totalRounds <= 3) {
            const names = ['Final', 'Semi-Final', 'Quarter-Final'];
            return names[totalRounds - roundNumber] || `Round ${roundNumber}`;
        }
        if (roundNumber === totalRounds)
            return 'Final';
        if (roundNumber === totalRounds - 1)
            return 'Semi-Final';
        if (roundNumber === totalRounds - 2)
            return 'Quarter-Final';
        return `Round of ${Math.pow(2, totalRounds - roundNumber + 1)}`;
    }
    /**
     * Simulate round winners for bracket progression
     */
    static simulateRoundWinners(players) {
        const winners = [];
        for (let i = 0; i < players.length; i += 2) {
            const player1 = players[i];
            const player2 = players[i + 1];
            // Skip bye players
            if (player1.playerName === 'BYE') {
                winners.push(player2);
            }
            else if (player2.playerName === 'BYE') {
                winners.push(player1);
            }
            else {
                // In a real implementation, this would be determined by actual match results
                // For bracket generation, we'll use seeding as a proxy
                const winner = (player1.seed || 999) < (player2.seed || 999) ? player1 : player2;
                winners.push(winner);
            }
        }
        return winners;
    }
    /**
     * Generate round robin matches for a round
     */
    static generateRoundRobinMatches(tournamentId, players, roundNumber) {
        const matches = [];
        const playerCount = players.length;
        // Simple round robin: rotate players
        const rotatedPlayers = [...players];
        if (roundNumber > 1) {
            // Rotate for different matchups each round
            const firstPlayer = rotatedPlayers.shift();
            rotatedPlayers.splice(roundNumber - 1, 0, firstPlayer);
        }
        for (let i = 0; i < playerCount; i += 2) {
            if (i + 1 < playerCount) {
                const player1 = rotatedPlayers[i];
                const player2 = rotatedPlayers[i + 1];
                matches.push({
                    id: `${tournamentId}-RR${roundNumber}-M${Math.floor(i / 2) + 1}`,
                    player1Id: player1.id,
                    player2Id: player2.id,
                    player1Name: player1.playerName,
                    player2Name: player2.playerName
                });
            }
        }
        return matches;
    }
    /**
     * Generate Swiss system matches for a round
     */
    static generateSwissMatches(tournamentId, players, roundNumber) {
        const matches = [];
        // Simplified Swiss pairing: pair players with similar "scores"
        // In a real implementation, this would track actual match results
        const sortedPlayers = [...players].sort((a, b) => (b.winRate || 0) - (a.winRate || 0));
        for (let i = 0; i < sortedPlayers.length; i += 2) {
            if (i + 1 < sortedPlayers.length) {
                const player1 = sortedPlayers[i];
                const player2 = sortedPlayers[i + 1];
                matches.push({
                    id: `${tournamentId}-SW${roundNumber}-M${Math.floor(i / 2) + 1}`,
                    player1Id: player1.id,
                    player2Id: player2.id,
                    player1Name: player1.playerName,
                    player2Name: player2Name
                });
            }
        }
        return matches;
    }
    /**
     * Validate bracket integrity
     */
    static validateBracket(bracket) {
        const errors = [];
        const warnings = [];
        // Check round progression
        for (let i = 1; i < bracket.rounds.length; i++) {
            const currentRound = bracket.rounds[i];
            const previousRound = bracket.rounds[i - 1];
            if (currentRound.playersAdvancing > previousRound.playersAdvancing) {
                errors.push(`Round ${i + 1} has more advancing players than round ${i}`);
            }
        }
        // Check for duplicate players in same round
        for (const round of bracket.rounds) {
            const playerIds = new Set();
            for (const match of round.matches) {
                if (playerIds.has(match.player1Id)) {
                    errors.push(`Player ${match.player1Id} appears multiple times in round ${round.roundNumber}`);
                }
                if (playerIds.has(match.player2Id)) {
                    errors.push(`Player ${match.player2Id} appears multiple times in round ${round.roundNumber}`);
                }
                playerIds.add(match.player1Id);
                playerIds.add(match.player2Id);
            }
        }
        // Check for bye players
        if (bracket.byePlayers.length > 0) {
            warnings.push(`${bracket.byePlayers.length} players have byes in the first round`);
        }
        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }
    /**
     * Update bracket after match result
     */
    static updateBracketAfterMatch(bracket, matchId, winnerId) {
        // Find the match and update winner
        for (const round of bracket.rounds) {
            for (const match of round.matches) {
                if (match.id === matchId) {
                    // In a real implementation, this would update the bracket
                    // and potentially advance the winner to the next round
                    console.log(`Match ${matchId} won by ${winnerId}`);
                    break;
                }
            }
        }
        return bracket;
    }
}
exports.BracketService = BracketService;
exports.default = BracketService;
//# sourceMappingURL=bracketService.js.map