import {
  calculateFairnessScore,
  calculateQueuePriority,
  updatePlayerRestStatus,
  generateOptimalRotation,
  getRotationExplanation,
  setPlayerRestPreference,
  adjustPlayerQueuePosition,
  skipPlayerNextGame,
  makePlayerReady,
  getQueueWithPriorities,
  getPlayerRestStatus,
  updateAllPlayersAfterGame,
  swapPlayersInQueue,
  Player,
  GameHistory,
  Court,
} from '../rotationAlgorithm';

let joinedCounter = 0;
const makePlayer = (overrides: Partial<Player> = {}): Player => ({
  id: 'p1',
  name: 'Alice',
  status: 'ACTIVE',
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  joinedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, joinedCounter++)),
  ...overrides,
});

const makeGame = (overrides: Partial<GameHistory> = {}): GameHistory => ({
  id: 'g1',
  gameNumber: 1,
  team1Player1: 'A',
  team1Player2: 'B',
  team2Player1: 'C',
  team2Player2: 'D',
  status: 'COMPLETED',
  ...overrides,
});

const makeCourt = (overrides: Partial<Court> = {}): Court => ({
  id: 'c1',
  name: 'Court 1',
  isAvailable: true,
  ...overrides,
});

const court = makeCourt();

describe('calculateFairnessScore', () => {
  const teams = (players: Player[]): [[Player, Player], [Player, Player]] => [
    [players[0], players[1]],
    [players[2], players[3]],
  ];

  it('returns a perfect score for four identical fresh players', () => {
    const players = [
      makePlayer({ id: 'a', name: 'A' }),
      makePlayer({ id: 'b', name: 'B' }),
      makePlayer({ id: 'c', name: 'C' }),
      makePlayer({ id: 'd', name: 'D' }),
    ];

    const { score, reasons } = calculateFairnessScore(players, [], teams(players));

    expect(score).toBe(100);
    expect(Number.isInteger(score)).toBe(true);
    expect(reasons).toContain('Excellent games played balance');
    expect(reasons).toContain('Fresh partnership combinations');
    expect(reasons).toContain('Balanced win rates');
    expect(reasons).toContain('Good rest distribution');
  });

  it('penalizes uneven games played and flags who needs more games', () => {
    const players = [
      makePlayer({ id: 'a', name: 'A', gamesPlayed: 0 }),
      makePlayer({ id: 'b', name: 'B', gamesPlayed: 0 }),
      makePlayer({ id: 'c', name: 'C', gamesPlayed: 0 }),
      makePlayer({ id: 'd', name: 'D', gamesPlayed: 5 }),
    ];

    const { score, reasons } = calculateFairnessScore(players, [], teams(players));

    expect(score).toBeLessThan(80);
    expect(reasons).toContain('Some players need more games');
  });

  it('penalizes repeated partnerships and reports good variety for minor repeats', () => {
    const players = [
      makePlayer({ id: 'a', name: 'A' }),
      makePlayer({ id: 'b', name: 'B' }),
      makePlayer({ id: 'c', name: 'C' }),
      makePlayer({ id: 'd', name: 'D' }),
    ];
    // A & B partner twice (penalty 30); C & D are fresh -> partnership score 70
    const history = [
      makeGame({ id: 'g1', team2Player1: 'C', team2Player2: 'E' }),
      makeGame({ id: 'g2', gameNumber: 2, team2Player1: 'C', team2Player2: 'E' }),
    ];

    const { reasons } = calculateFairnessScore(players, history, teams(players));

    expect(reasons).toContain('Good partnership variety');
  });

  it('flags heavily repeated partnerships', () => {
    const players = [
      makePlayer({ id: 'a', name: 'A' }),
      makePlayer({ id: 'b', name: 'B' }),
      makePlayer({ id: 'c', name: 'C' }),
      makePlayer({ id: 'd', name: 'D' }),
    ];
    const history = Array.from({ length: 5 }, (_, i) =>
      makeGame({ id: `g${i}`, gameNumber: i + 1 })
    );

    const { score, reasons } = calculateFairnessScore(players, history, teams(players));

    expect(reasons).toContain('Some repeated partnerships');
    expect(score).toBeLessThan(100);
  });

  it('treats players with no games as an even 50% win rate', () => {
    const players = [
      makePlayer({ id: 'a', name: 'A' }),
      makePlayer({ id: 'b', name: 'B' }),
      makePlayer({ id: 'c', name: 'C' }),
      makePlayer({ id: 'd', name: 'D' }),
    ];

    const { reasons } = calculateFairnessScore(players, [], teams(players));

    expect(reasons).toContain('Balanced win rates');
  });
});

describe('calculateQueuePriority', () => {
  it('gives players with fewer games a higher priority', () => {
    const players = [
      makePlayer({ id: 'a', name: 'A', gamesPlayed: 0 }),
      makePlayer({ id: 'b', name: 'B', gamesPlayed: 3 }),
      makePlayer({ id: 'c', name: 'C', gamesPlayed: 3 }),
    ];

    const low = calculateQueuePriority(players[0], 1, players);
    const high = calculateQueuePriority(players[1], 1, players);

    expect(low).toBeGreaterThan(high);
  });

  it('caps the rest bonus at 25', () => {
    const players = [makePlayer({ id: 'a', name: 'A', gamesPlayed: 1, lastGameNumber: 0 })];

    expect(calculateQueuePriority(players[0], 100, players)).toBe(25);
  });

  it('applies a negative priority to players who still need rest', () => {
    const base = [makePlayer({ id: 'a', name: 'A' })];
    const resting = makePlayer({ id: 'a', name: 'A', restGamesRemaining: 1 });

    expect(calculateQueuePriority(resting, 1, [resting])).toBe(
      calculateQueuePriority(base[0], 1, base) - 100
    );
  });

  it('penalizes explicitly RESTING players more than ACTIVE ones', () => {
    const active = makePlayer({ id: 'a', name: 'A', restGamesRemaining: 1 });
    const restingPlayer = makePlayer({ id: 'a', name: 'A', status: 'RESTING', restGamesRemaining: 1 });

    expect(calculateQueuePriority(restingPlayer, 1, [restingPlayer])).toBe(
      calculateQueuePriority(active, 1, [active]) - 200
    );
  });

  it('boosts players with a manual queue position', () => {
    const players = [makePlayer({ id: 'a', name: 'A' })];
    const player = makePlayer({ id: 'a', name: 'A', queuePosition: 0 });

    expect(calculateQueuePriority(player, 1, players)).toBe(
      calculateQueuePriority(players[0], 1, players) + 200
    );
  });

  it('uses a floor of 1 when no games have been played', () => {
    const players = [makePlayer({ id: 'a', name: 'A' })];

    // (maxGames=1 - 0) * 10 + min(1 * 5, 25) = 15
    expect(calculateQueuePriority(players[0], 1, players)).toBe(15);
  });
});

describe('updatePlayerRestStatus', () => {
  it('records the game number and sets rest after playing', () => {
    const player = makePlayer({ restPreference: 2 });

    const updated = updatePlayerRestStatus(player, 7, true);

    expect(updated.lastGameNumber).toBe(7);
    expect(updated.restGamesRemaining).toBe(2);
    expect(player.lastGameNumber).toBeUndefined();
  });

  it('defaults to one rest game when no preference is set', () => {
    const updated = updatePlayerRestStatus(makePlayer(), 3, true);

    expect(updated.restGamesRemaining).toBe(1);
  });

  it('decrements rest for players who did not play', () => {
    const updated = updatePlayerRestStatus(makePlayer({ restGamesRemaining: 2 }), 3, false);

    expect(updated.restGamesRemaining).toBe(1);
  });

  it('never drops rest below zero', () => {
    const updated = updatePlayerRestStatus(makePlayer({ restGamesRemaining: 0 }), 3, false);

    expect(updated.restGamesRemaining).toBe(0);
  });
});

describe('generateOptimalRotation', () => {
  it('suggests one game when four players and one court are available', () => {
    const players = ['A', 'B', 'C', 'D'].map((name, i) =>
      makePlayer({ id: `p${i}`, name })
    );

    const result = generateOptimalRotation(players, [], [court]);

    expect(result.suggestedGames).toHaveLength(1);
    expect(result.suggestedGames[0].court).toBe(court);
    expect(result.suggestedGames[0].team1).toHaveLength(2);
    expect(result.suggestedGames[0].team2).toHaveLength(2);
    expect(result.suggestedGames[0].fairnessScore).toBeGreaterThan(0);
    expect(result.suggestedGames[0].fairnessReasons.length).toBeGreaterThan(0);
    expect(result.nextInLine).toHaveLength(0);
  });

  it('fills multiple available courts when enough players exist', () => {
    const players = Array.from({ length: 8 }, (_, i) =>
      makePlayer({ id: `p${i}`, name: `P${i}` })
    );

    const result = generateOptimalRotation(players, [], [
      makeCourt({ id: 'c1', name: 'Court 1' }),
      makeCourt({ id: 'c2', name: 'Court 2' }),
    ]);

    expect(result.suggestedGames).toHaveLength(2);
  });

  it('produces no game when fewer than four players are available', () => {
    const players = ['A', 'B', 'C'].map((name, i) => makePlayer({ id: `p${i}`, name }));

    const result = generateOptimalRotation(players, [], [court]);

    expect(result.suggestedGames).toHaveLength(0);
    expect(result.nextInLine).toHaveLength(3);
  });

  it('ignores unavailable courts', () => {
    const players = Array.from({ length: 4 }, (_, i) =>
      makePlayer({ id: `p${i}`, name: `P${i}` })
    );

    const result = generateOptimalRotation(players, [], [makeCourt({ isAvailable: false })]);

    expect(result.suggestedGames).toHaveLength(0);
  });

  it('includes RESTING players whose rest is complete', () => {
    const players = Array.from({ length: 4 }, (_, i) =>
      makePlayer({ id: `p${i}`, name: `P${i}`, status: 'RESTING', restGamesRemaining: 0 })
    );

    const result = generateOptimalRotation(players, [], [court]);

    expect(result.suggestedGames).toHaveLength(1);
  });

  it('excludes players who still need rest', () => {
    const players = [
      makePlayer({ id: 'a', name: 'A' }),
      makePlayer({ id: 'b', name: 'B' }),
      makePlayer({ id: 'c', name: 'C' }),
      makePlayer({ id: 'd', name: 'D', restGamesRemaining: 1 }),
    ];

    const result = generateOptimalRotation(players, [], [court]);

    expect(result.suggestedGames).toHaveLength(0);
    expect(result.nextInLine.map(p => p.name)).not.toContain('D');
  });

  it('computes fairness metrics over active players only', () => {
    const players = [
      makePlayer({ id: 'a', name: 'A', gamesPlayed: 1 }),
      makePlayer({ id: 'b', name: 'B', gamesPlayed: 2 }),
      makePlayer({ id: 'c', name: 'C', gamesPlayed: 3 }),
      makePlayer({ id: 'd', name: 'D', gamesPlayed: 4 }),
      makePlayer({ id: 'e', name: 'E', gamesPlayed: 100, status: 'LEFT' }),
    ];

    const result = generateOptimalRotation(players, [], [court]);

    expect(result.fairnessMetrics.averageGamesPlayed).toBe(2.5);
    expect(result.fairnessMetrics.gameVariance).toBeCloseTo(1.25);
  });

  it('counts completed partnerships in the fairness metrics', () => {
    const players = Array.from({ length: 4 }, (_, i) =>
      makePlayer({ id: `p${i}`, name: `P${i}` })
    );

    const result = generateOptimalRotation(players, [makeGame()], [court]);

    expect(result.fairnessMetrics.partnershipBalance.get('A & B')).toBe(1);
    expect(result.fairnessMetrics.partnershipBalance.get('C & D')).toBe(1);
  });
});

describe('getRotationExplanation', () => {
  it('describes session stats and each suggested game', () => {
    const players = ['A', 'B', 'C', 'D'].map((name, i) =>
      makePlayer({ id: `p${i}`, name })
    );
    const result = generateOptimalRotation(players, [], [makeCourt({ name: 'Court 7' })]);

    const explanation = getRotationExplanation(result.suggestedGames, result.fairnessMetrics);

    expect(explanation).toContain('Rotation Algorithm Decision');
    expect(explanation).toContain('Court 7');
    expect(explanation).toContain('Fairness:');
  });
});

describe('queue management helpers', () => {
  it('clamps rest preference between 1 and 3', () => {
    expect(setPlayerRestPreference(makePlayer(), 0).restPreference).toBe(1);
    expect(setPlayerRestPreference(makePlayer(), 2).restPreference).toBe(2);
    expect(setPlayerRestPreference(makePlayer(), 9).restPreference).toBe(3);
  });

  it('clamps manual queue position to non-negative values', () => {
    expect(adjustPlayerQueuePosition(makePlayer(), -5).queuePosition).toBe(0);
    expect(adjustPlayerQueuePosition(makePlayer(), 4).queuePosition).toBe(4);
  });

  it('extends rest by one game when skipping', () => {
    expect(skipPlayerNextGame(makePlayer()).restGamesRemaining).toBe(1);
    expect(skipPlayerNextGame(makePlayer({ restGamesRemaining: 2 })).restGamesRemaining).toBe(3);
  });

  it('makes a player immediately ready', () => {
    expect(makePlayerReady(makePlayer({ restGamesRemaining: 3 })).restGamesRemaining).toBe(0);
  });

  it('swapPlayersInQueue exchanges queue positions by id', () => {
    const players = [
      makePlayer({ id: 'a', name: 'A', queuePosition: 1 }),
      makePlayer({ id: 'b', name: 'B', queuePosition: 5 }),
    ];

    const swapped = swapPlayersInQueue(players, 'a', 'b');

    expect(swapped.find(p => p.id === 'a')!.queuePosition).toBe(5);
    expect(swapped.find(p => p.id === 'b')!.queuePosition).toBe(1);
  });

  it('returns the original array when a player id is missing', () => {
    const players = [makePlayer({ id: 'a', name: 'A' })];

    expect(swapPlayersInQueue(players, 'a', 'missing')).toBe(players);
  });

  it('leaves uninvolved players untouched when swapping', () => {
    const players = [
      makePlayer({ id: 'a', name: 'A', queuePosition: 1 }),
      makePlayer({ id: 'b', name: 'B', queuePosition: 5 }),
      makePlayer({ id: 'c', name: 'C', queuePosition: 9 }),
    ];

    const swapped = swapPlayersInQueue(players, 'a', 'b');

    expect(swapped.find(p => p.id === 'c')!.queuePosition).toBe(9);
  });

  it('updates rest for players who played by name', () => {
    const players = [
      makePlayer({ id: 'a', name: 'A' }),
      makePlayer({ id: 'b', name: 'B', restGamesRemaining: 1 }),
    ];

    const updated = updateAllPlayersAfterGame(players, 4, ['A']);

    expect(updated[0].lastGameNumber).toBe(4);
    expect(updated[0].restGamesRemaining).toBe(1);
    expect(updated[1].restGamesRemaining).toBe(0);
  });
});

describe('getPlayerRestStatus', () => {
  it('reports remaining rest games with correct pluralisation', () => {
    expect(getPlayerRestStatus(makePlayer({ restGamesRemaining: 1 }), 1)).toBe('Resting 1 more game');
    expect(getPlayerRestStatus(makePlayer({ restGamesRemaining: 2 }), 1)).toBe('Resting 2 more games');
  });

  it('reports just played, ready to play, and waited states', () => {
    expect(getPlayerRestStatus(makePlayer({ lastGameNumber: 5 }), 5)).toBe('Just played');
    expect(getPlayerRestStatus(makePlayer({ lastGameNumber: 4 }), 5)).toBe('Ready to play');
    expect(getPlayerRestStatus(makePlayer({ lastGameNumber: 2 }), 5)).toBe('Ready (waited 3 games)');
  });
});

describe('getQueueWithPriorities', () => {
  it('ranks active players and annotates rest status', () => {
    const players = [
      makePlayer({ id: 'a', name: 'A', gamesPlayed: 0 }),
      makePlayer({ id: 'b', name: 'B', gamesPlayed: 3 }),
      makePlayer({ id: 'c', name: 'C', gamesPlayed: 3, status: 'LEFT' }),
    ];

    const queue = getQueueWithPriorities(players, 1);

    expect(queue).toHaveLength(2);
    expect(queue[0].name).toBe('A');
    expect(queue[0].queueRank).toBe(1);
    expect(queue[1].queueRank).toBe(2);
    expect(queue[0].restStatus).toBeDefined();
  });

  it('breaks priority ties in favour of the earlier joiner', () => {
    const earlier = makePlayer({
      id: 'a',
      name: 'A',
      joinedAt: new Date(Date.UTC(2026, 0, 1)),
    });
    const later = makePlayer({
      id: 'b',
      name: 'B',
      joinedAt: new Date(Date.UTC(2026, 0, 2)),
    });

    const queue = getQueueWithPriorities([later, earlier], 1);

    expect(queue.map(p => p.name)).toEqual(['A', 'B']);
  });
});
