// Fair Rotation Algorithm for Enhanced Live Games
// Based on UI/UX specification requirements for transparent, fair player distribution

export interface Player {
  id: string;
  name: string;
  status: 'ACTIVE' | 'RESTING' | 'LEFT';
  gamesPlayed: number;
  wins: number;
  losses: number;
  joinedAt: Date;
}

export interface GameHistory {
  id: string;
  gameNumber: number;
  team1Player1: string;
  team1Player2: string;
  team2Player1: string;
  team2Player2: string;
  winnerTeam?: number;
  status: 'IN_PROGRESS' | 'COMPLETED';
  matchId?: string;
  gameInMatch?: number;
}

export interface MatchHistory {
  id: string;
  matchNumber: number;
  team1Player1: string;
  team1Player2: string;
  team2Player1: string;
  team2Player2: string;
  team1GamesWon: number;
  team2GamesWon: number;
  winnerTeam?: number;
  status: 'IN_PROGRESS' | 'COMPLETED';
  bestOf: number;
  games: GameHistory[];
}

export interface Court {
  id: string;
  name: string;
  isAvailable: boolean;
}

export interface GameSuggestion {
  court: Court;
  team1: [Player, Player];
  team2: [Player, Player];
  fairnessScore: number;
  fairnessReasons: string[];
}

export interface RotationResult {
  suggestedGames: GameSuggestion[];
  nextInLine: Player[];
  fairnessMetrics: {
    averageGamesPlayed: number;
    gameVariance: number;
    partnershipBalance: Map<string, number>;
  };
}

/**
 * Calculate fairness score between 0-100 where higher is more fair
 * Factors considered:
 * - Games played balance (40% weight)
 * - Partnership diversity (30% weight) 
 * - Win/loss balance (20% weight)
 * - Recent play avoidance (10% weight)
 */
export function calculateFairnessScore(
  players: Player[],
  gameHistory: GameHistory[],
  suggestedTeams: [[Player, Player], [Player, Player]]
): { score: number; reasons: string[] } {
  const [team1, team2] = suggestedTeams;
  const allPlayers = [...team1, ...team2];
  const reasons: string[] = [];
  
  let fairnessScore = 0;

  // 1. Games Played Balance (40% weight)
  const gamesPlayedVariance = calculateVariance(allPlayers.map(p => p.gamesPlayed));
  const gamesBalance = Math.max(0, 100 - (gamesPlayedVariance * 20)); // Lower variance = higher score
  fairnessScore += gamesBalance * 0.4;
  
  if (gamesPlayedVariance < 1) {
    reasons.push("Excellent games played balance");
  } else if (gamesPlayedVariance < 2) {
    reasons.push("Good games played balance");
  } else {
    reasons.push("Some players need more games");
  }

  // 2. Partnership Diversity (30% weight)
  const partnershipScore = calculatePartnershipDiversity(allPlayers, gameHistory);
  fairnessScore += partnershipScore * 0.3;
  
  if (partnershipScore > 80) {
    reasons.push("Fresh partnership combinations");
  } else if (partnershipScore > 60) {
    reasons.push("Good partnership variety");
  } else {
    reasons.push("Some repeated partnerships");
  }

  // 3. Win/Loss Balance (20% weight)
  const winRates = allPlayers.map(p => p.gamesPlayed > 0 ? p.wins / p.gamesPlayed : 0.5);
  const winRateVariance = calculateVariance(winRates);
  const winBalance = Math.max(0, 100 - (winRateVariance * 100));
  fairnessScore += winBalance * 0.2;
  
  if (winRateVariance < 0.1) {
    reasons.push("Balanced win rates");
  }

  // 4. Recent Play Avoidance (10% weight)
  const recentPlayScore = calculateRecentPlayAvoidance(allPlayers, gameHistory);
  fairnessScore += recentPlayScore * 0.1;
  
  if (recentPlayScore > 80) {
    reasons.push("Good rest distribution");
  }

  return { score: Math.round(fairnessScore), reasons };
}

/**
 * Calculate partnership diversity score (0-100)
 * Higher score means players haven't partnered recently
 */
function calculatePartnershipDiversity(players: Player[], gameHistory: GameHistory[]): number {
  const partnerships = new Map<string, number>();
  
  // Count recent partnerships (last 5 games per player)
  const recentGames = gameHistory
    .filter(g => g.status === 'COMPLETED')
    .slice(-Math.max(5, players.length * 2));
  
  recentGames.forEach(game => {
    // Team 1 partnership
    const team1Key = [game.team1Player1, game.team1Player2].sort().join('|');
    partnerships.set(team1Key, (partnerships.get(team1Key) || 0) + 1);
    
    // Team 2 partnership
    const team2Key = [game.team2Player1, game.team2Player2].sort().join('|');
    partnerships.set(team2Key, (partnerships.get(team2Key) || 0) + 1);
  });
  
  // Check if current suggested partnerships are fresh
  let diversityScore = 100;
  
  // Check team 1 partnership
  const currentTeam1Key = [players[0].name, players[1].name].sort().join('|');
  const team1Count = partnerships.get(currentTeam1Key) || 0;
  diversityScore -= team1Count * 15;
  
  // Check team 2 partnership
  const currentTeam2Key = [players[2].name, players[3].name].sort().join('|');
  const team2Count = partnerships.get(currentTeam2Key) || 0;
  diversityScore -= team2Count * 15;
  
  return Math.max(0, diversityScore);
}

/**
 * Calculate how well players are rested (0-100)
 */
function calculateRecentPlayAvoidance(players: Player[], gameHistory: GameHistory[]): number {
  const lastFewGames = gameHistory
    .filter(g => g.status === 'COMPLETED')
    .slice(-3); // Look at last 3 games
  
  let restScore = 100;
  
  players.forEach(player => {
    const recentAppearances = lastFewGames.filter(game => 
      game.team1Player1 === player.name ||
      game.team1Player2 === player.name ||
      game.team2Player1 === player.name ||
      game.team2Player2 === player.name
    ).length;
    
    // Penalize players who have played too recently
    restScore -= recentAppearances * 10;
  });
  
  return Math.max(0, restScore);
}

/**
 * Generate optimal game suggestions for available courts
 */
export function generateOptimalRotation(
  players: Player[],
  gameHistory: GameHistory[],
  courts: Court[],
  matchHistory: MatchHistory[] = []
): RotationResult {
  const activePlayers = players
    .filter(p => p.status === 'ACTIVE')
    .sort((a, b) => {
      // Primary sort: fewer games played (prioritize players who need games)
      if (a.gamesPlayed !== b.gamesPlayed) {
        return a.gamesPlayed - b.gamesPlayed;
      }
      // Secondary sort: joined earlier (FIFO for equal games)
      return a.joinedAt.getTime() - b.joinedAt.getTime();
    });
  
  const availableCourts = courts.filter(c => c.isAvailable);
  const suggestedGames: GameSuggestion[] = [];
  const usedPlayers = new Set<string>();
  
  // Generate games for each available court
  for (const court of availableCourts) {
    const remainingPlayers = activePlayers.filter(p => !usedPlayers.has(p.id));
    
    if (remainingPlayers.length < 4) {
      break; // Not enough players for another game
    }
    
    // Try different combinations to find the most fair one
    const bestCombination = findBestPlayerCombination(remainingPlayers, gameHistory);
    
    if (bestCombination) {
      const { team1, team2, fairnessScore, reasons } = bestCombination;
      
      suggestedGames.push({
        court,
        team1,
        team2,
        fairnessScore,
        fairnessReasons: reasons
      });
      
      // Mark players as used
      [...team1, ...team2].forEach(p => usedPlayers.add(p.id));
    }
  }
  
  // Calculate next in line (players waiting for next rotation)
  const nextInLine = activePlayers
    .filter(p => !usedPlayers.has(p.id))
    .slice(0, 8); // Show next 8 players in queue
  
  // Calculate overall fairness metrics
  const fairnessMetrics = calculateFairnessMetrics(players, gameHistory, matchHistory);
  
  return {
    suggestedGames,
    nextInLine,
    fairnessMetrics
  };
}

/**
 * Find the best 4-player combination for a game from available players
 */
function findBestPlayerCombination(
  availablePlayers: Player[],
  gameHistory: GameHistory[]
): { team1: [Player, Player]; team2: [Player, Player]; fairnessScore: number; reasons: string[] } | null {
  if (availablePlayers.length < 4) {
    return null;
  }
  
  let bestCombination: any = null;
  let bestScore = -1;
  
  // Try all possible 4-player combinations
  for (let i = 0; i < availablePlayers.length - 3; i++) {
    for (let j = i + 1; j < availablePlayers.length - 2; j++) {
      for (let k = j + 1; k < availablePlayers.length - 1; k++) {
        for (let l = k + 1; l < availablePlayers.length; l++) {
          const fourPlayers = [availablePlayers[i], availablePlayers[j], availablePlayers[k], availablePlayers[l]];
          
          // Try different team arrangements
          const teamArrangements = [
            [[fourPlayers[0], fourPlayers[1]], [fourPlayers[2], fourPlayers[3]]],
            [[fourPlayers[0], fourPlayers[2]], [fourPlayers[1], fourPlayers[3]]],
            [[fourPlayers[0], fourPlayers[3]], [fourPlayers[1], fourPlayers[2]]]
          ];
          
          for (const arrangement of teamArrangements) {
            const { score, reasons } = calculateFairnessScore(fourPlayers, gameHistory, arrangement as [[Player, Player], [Player, Player]]);
            
            if (score > bestScore) {
              bestScore = score;
              bestCombination = {
                team1: arrangement[0] as [Player, Player],
                team2: arrangement[1] as [Player, Player],
                fairnessScore: score,
                reasons
              };
            }
          }
        }
      }
    }
  }
  
  return bestCombination;
}

/**
 * Calculate overall session fairness metrics
 */
function calculateFairnessMetrics(players: Player[], gameHistory: GameHistory[], matchHistory: MatchHistory[] = []) {
  const activePlayers = players.filter(p => p.status === 'ACTIVE');
  const gamesPlayed = activePlayers.map(p => p.gamesPlayed);
  
  const averageGamesPlayed = gamesPlayed.length > 0 
    ? gamesPlayed.reduce((sum, games) => sum + games, 0) / gamesPlayed.length 
    : 0;
  
  const gameVariance = calculateVariance(gamesPlayed);
  
  // Calculate partnership balance
  const partnershipBalance = new Map<string, number>();
  gameHistory
    .filter(g => g.status === 'COMPLETED')
    .forEach(game => {
      const team1Key = [game.team1Player1, game.team1Player2].sort().join(' & ');
      const team2Key = [game.team2Player1, game.team2Player2].sort().join(' & ');
      
      partnershipBalance.set(team1Key, (partnershipBalance.get(team1Key) || 0) + 1);
      partnershipBalance.set(team2Key, (partnershipBalance.get(team2Key) || 0) + 1);
    });
  
  return {
    averageGamesPlayed,
    gameVariance,
    partnershipBalance
  };
}

/**
 * Calculate statistical variance
 */
function calculateVariance(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  
  const mean = numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
  const squaredDifferences = numbers.map(num => Math.pow(num - mean, 2));
  const variance = squaredDifferences.reduce((sum, diff) => sum + diff, 0) / numbers.length;
  
  return variance;
}

/**
 * Get rotation explanation for transparency
 */
export function getRotationExplanation(
  suggestedGames: GameSuggestion[],
  fairnessMetrics: RotationResult['fairnessMetrics']
): string {
  let explanation = "**Rotation Algorithm Decision:**\n\n";
  
  explanation += `📊 **Session Stats:** ${fairnessMetrics.averageGamesPlayed.toFixed(1)} average games, `;
  explanation += `${fairnessMetrics.gameVariance.toFixed(1)} variance\n\n`;
  
  suggestedGames.forEach((game, index) => {
    explanation += `🏸 **Court ${game.court.name}:** `;
    explanation += `${game.team1[0].name} & ${game.team1[1].name} vs ${game.team2[0].name} & ${game.team2[1].name}\n`;
    explanation += `   Fairness: ${game.fairnessScore}/100 - ${game.fairnessReasons.join(', ')}\n\n`;
  });
  
  return explanation;
}