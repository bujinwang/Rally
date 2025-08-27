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
  // Fair Play Queue enhancements
  lastGameNumber?: number; // Track when player last played
  restGamesRemaining?: number; // Games to rest (default 1)
  restPreference?: number; // Player's preferred rest games (1-3)
  queuePosition?: number; // Manual queue adjustments
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
 * Calculate Fair Play priority score for queue ordering
 * Higher score = higher priority for next game
 */
export function calculateQueuePriority(player: Player, currentGameNumber: number, allPlayers: Player[]): number {
  let priority = 0;
  
  // Base priority: players with fewer games get higher priority
  const maxGames = Math.max(...allPlayers.map(p => p.gamesPlayed || 0), 1);
  const gamesPriorityWeight = (maxGames - (player.gamesPlayed || 0)) * 10;
  priority += gamesPriorityWeight;
  
  // Rest bonus: players who have waited longer get priority boost
  const gamesSinceLastPlay = currentGameNumber - (player.lastGameNumber || 0);
  const restBonus = Math.min(gamesSinceLastPlay * 5, 25); // Cap at 25 points
  priority += restBonus;
  
  // Rest requirement check: if player still needs rest, give negative priority
  const restRemaining = player.restGamesRemaining || 0;
  if (restRemaining > 0) {
    priority -= 100; // Strong negative priority if still resting
  }
  
  // Status check: RESTING players get negative priority unless rest is complete
  if (player.status === 'RESTING' && restRemaining > 0) {
    priority -= 200; // Even stronger negative priority for explicitly resting players
  }
  
  // Manual queue adjustment override
  if (player.queuePosition !== undefined) {
    priority += (100 - player.queuePosition) * 2; // Higher for lower queue positions
  }
  
  return priority;
}

/**
 * Update player rest status after a game
 */
export function updatePlayerRestStatus(player: Player, currentGameNumber: number, playedInThisGame: boolean): Player {
  const updatedPlayer = { ...player };
  
  if (playedInThisGame) {
    // Player just finished a game
    updatedPlayer.lastGameNumber = currentGameNumber;
    updatedPlayer.restGamesRemaining = updatedPlayer.restPreference || 1;
  } else {
    // Player is waiting/resting
    updatedPlayer.restGamesRemaining = Math.max(0, (updatedPlayer.restGamesRemaining || 0) - 1);
  }
  
  return updatedPlayer;
}

/**
 * Generate optimal game suggestions for available courts with Fair Play algorithm
 */
export function generateOptimalRotation(
  players: Player[],
  gameHistory: GameHistory[],
  courts: Court[],
  matchHistory: MatchHistory[] = [],
  currentGameNumber: number = gameHistory.length + 1
): RotationResult {
  // Update global reference for priority calculation
  const globalPlayers = players;
  
  const availablePlayersWithPriority = players
    .filter(p => p.status === 'ACTIVE' || (p.status === 'RESTING' && (p.restGamesRemaining || 0) === 0))
    .map(p => ({
      ...p,
      priority: calculateQueuePriority(p, currentGameNumber, players)
    }))
    .filter(p => p.priority >= 0) // Exclude players who still need rest
    .sort((a, b) => {
      // Primary sort: higher priority first
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      // Secondary sort: joined earlier (FIFO for equal priority)
      return a.joinedAt.getTime() - b.joinedAt.getTime();
    });
  
  const availableCourts = courts.filter(c => c.isAvailable);
  const suggestedGames: GameSuggestion[] = [];
  const usedPlayers = new Set<string>();
  
  // Generate games for each available court
  for (const court of availableCourts) {
    const remainingPlayers = availablePlayersWithPriority.filter(p => !usedPlayers.has(p.id));
    
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
  
  // Calculate next in line (players waiting for next rotation) - prioritized order
  const nextInLine = availablePlayersWithPriority
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

/**
 * Fair Play Queue Management Functions
 */

/**
 * Set player rest preference (1-3 games)
 */
export function setPlayerRestPreference(player: Player, restGames: number): Player {
  return {
    ...player,
    restPreference: Math.max(1, Math.min(3, restGames)) // Clamp between 1-3
  };
}

/**
 * Manually adjust player queue position
 */
export function adjustPlayerQueuePosition(player: Player, newPosition: number): Player {
  return {
    ...player,
    queuePosition: Math.max(0, newPosition)
  };
}

/**
 * Skip next game for a player (extends rest by 1)
 */
export function skipPlayerNextGame(player: Player): Player {
  return {
    ...player,
    restGamesRemaining: (player.restGamesRemaining || 0) + 1
  };
}

/**
 * Make player ready immediately (clears rest requirement)
 */
export function makePlayerReady(player: Player): Player {
  return {
    ...player,
    restGamesRemaining: 0
  };
}

/**
 * Get queue with priority scores for display
 */
export function getQueueWithPriorities(
  players: Player[], 
  currentGameNumber: number
): Array<Player & { priority: number; queueRank: number; restStatus: string }> {
  return players
    .filter(p => p.status === 'ACTIVE')
    .map(p => ({
      ...p,
      priority: calculateQueuePriority(p, currentGameNumber, players)
    }))
    .sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.joinedAt.getTime() - b.joinedAt.getTime();
    })
    .map((player, index) => ({
      ...player,
      queueRank: index + 1,
      restStatus: getPlayerRestStatus(player, currentGameNumber)
    }));
}

/**
 * Get human-readable rest status
 */
export function getPlayerRestStatus(player: Player, currentGameNumber: number): string {
  const restRemaining = player.restGamesRemaining || 0;
  
  if (restRemaining > 0) {
    return `Resting ${restRemaining} more game${restRemaining === 1 ? '' : 's'}`;
  }
  
  const gamesSinceLastPlay = currentGameNumber - (player.lastGameNumber || 0);
  if (gamesSinceLastPlay === 0) {
    return 'Just played';
  } else if (gamesSinceLastPlay === 1) {
    return 'Ready to play';
  } else {
    return `Ready (waited ${gamesSinceLastPlay} games)`;
  }
}

/**
 * Auto-update all players' rest status after a game completes
 */
export function updateAllPlayersAfterGame(
  players: Player[], 
  gameNumber: number, 
  playersInGame: string[]
): Player[] {
  return players.map(player => 
    updatePlayerRestStatus(player, gameNumber, playersInGame.includes(player.name))
  );
}

/**
 * Swap two players in the queue (drag & drop support)
 */
export function swapPlayersInQueue(players: Player[], playerId1: string, playerId2: string): Player[] {
  const player1 = players.find(p => p.id === playerId1);
  const player2 = players.find(p => p.id === playerId2);
  
  if (!player1 || !player2) {
    return players;
  }
  
  // Swap their manual queue positions
  const tempPosition = player1.queuePosition;
  
  return players.map(p => {
    if (p.id === playerId1) {
      return { ...p, queuePosition: player2.queuePosition };
    } else if (p.id === playerId2) {
      return { ...p, queuePosition: tempPosition };
    }
    return p;
  });
}