/**
 * Story 6.7 T02 — bracket projection tests (design §7 items 5–7, §1 D5).
 *
 * Progression is a *projection* of recorded results, not an incremental append.
 * These tests pin the consequences of that decision: idempotency, self-healing
 * corrections, and the rule that an undecided later round is `PENDING` rather
 * than a bye.
 */
import { generateRoundRobin, generateSingleElimination, projectBracket } from '../engine';
import type {
  BracketGenerationOptions,
  PlayerSeed,
  ProjectedState,
  StoredMatch,
  TournamentBracket,
} from '../types';

// ---------------------------------------------------------------------------
// Fixtures and helpers
// ---------------------------------------------------------------------------

function seededPlayers(count: number): PlayerSeed[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
    seed: index + 1,
  }));
}

function options(players: PlayerSeed[], type: BracketGenerationOptions['tournamentType']) {
  return { tournamentId: 't1', players, tournamentType: type };
}

/** Numeric part of a `p<n>` id. */
function seedOf(id: string | null): number {
  if (!id) return Number.POSITIVE_INFINITY;
  const digits = id.replace(/\D/g, '');
  return digits ? Number(digits) : Number.POSITIVE_INFINITY;
}

/** Lower seed wins — a deterministic, predictable result rule. */
const lowerSeedWins = (a: string, b: string): string => (seedOf(a) <= seedOf(b) ? a : b);

/** Flatten a generated bracket into the stored shape projection consumes. */
function toStored(bracket: TournamentBracket): StoredMatch[] {
  const stored: StoredMatch[] = [];
  for (const round of bracket.bracket) {
    for (const match of round) {
      stored.push({
        id: match.id,
        tournamentId: bracket.tournamentId,
        roundId: `round-${match.round}`,
        roundNumber: match.round,
        matchNumber: match.match,
        player1Id: match.player1Id,
        player2Id: match.player2Id,
        winnerId: match.winnerId,
        status: match.status,
        feedMatch1Id: match.feedMatch1Id,
        feedMatch2Id: match.feedMatch2Id,
        bracket: match.bracket ?? 'WINNERS',
      });
    }
  }
  return stored;
}

/** Write projected slots/winner/status back onto the stored rows. */
function applyProjection(stored: StoredMatch[], state: ProjectedState): StoredMatch[] {
  const byId = new Map(state.matches.map((match) => [match.id, match]));
  return stored.map((match) => {
    const projected = byId.get(match.id);
    if (!projected) return match;
    return {
      ...match,
      player1Id: projected.player1Id,
      player2Id: projected.player2Id,
      winnerId: projected.winnerId,
      status: projected.status,
    };
  });
}

/** Record a result and return the updated stored rows. */
function recordResult(stored: StoredMatch[], matchId: string, winnerId: string): StoredMatch[] {
  return stored.map((match) =>
    match.id === matchId ? { ...match, winnerId, status: 'COMPLETED' as const } : match,
  );
}

/** The projected row for a match id. */
function projected(state: ProjectedState, matchId: string) {
  const match = state.matches.find((candidate) => candidate.id === matchId);
  if (!match) throw new Error(`no projected match ${matchId}`);
  return match;
}

/** Play one round (deterministically) and re-project. */
function playRound(
  stored: StoredMatch[],
  roundNumber: number,
  pick: (a: string, b: string) => string = lowerSeedWins,
): { stored: StoredMatch[]; state: ProjectedState } {
  let next = stored;
  for (const match of stored.filter((candidate) => candidate.roundNumber === roundNumber)) {
    if (match.player1Id && match.player2Id && !match.winnerId) {
      next = recordResult(next, match.id, pick(match.player1Id, match.player2Id));
    }
  }
  const state = projectBracket(next);
  return { stored: applyProjection(next, state), state };
}

/** Play every round in order. */
function playThrough(
  bracket: TournamentBracket,
  pick: (a: string, b: string) => string = lowerSeedWins,
): { stored: StoredMatch[]; state: ProjectedState } {
  let stored = toStored(bracket);
  let state = projectBracket(stored);
  for (let round = 1; round <= bracket.totalRounds; round += 1) {
    const played = playRound(stored, round, pick);
    stored = played.stored;
    state = played.state;
  }
  return { stored, state };
}

const eightPlayerBracket = () =>
  generateSingleElimination(options(seededPlayers(8), 'SINGLE_ELIMINATION'));

// ---------------------------------------------------------------------------
// Baseline behaviour
// ---------------------------------------------------------------------------

describe('projectBracket — baseline', () => {
  it('handles an empty input', () => {
    expect(projectBracket([])).toEqual({
      matches: [],
      currentRound: 1,
      isComplete: false,
      championId: null,
      changedMatchIds: [],
    });
  });

  it('is a no-op on a freshly generated bracket', () => {
    const bracket = eightPlayerBracket();
    const state = projectBracket(toStored(bracket));
    // Generation already produced exactly the projected state.
    expect(state.changedMatchIds).toEqual([]);
    expect(state.currentRound).toBe(1);
    expect(state.isComplete).toBe(false);
    expect(state.championId).toBeNull();
  });

  it('does not depend on input ordering', () => {
    const stored = toStored(eightPlayerBracket());
    const shuffled = stored.slice().reverse();
    expect(projectBracket(shuffled)).toEqual(projectBracket(stored));
  });
});

// ---------------------------------------------------------------------------
// Bye auto-advance
// ---------------------------------------------------------------------------

describe('projectBracket — byes', () => {
  const fivePlayerBracket = () =>
    generateSingleElimination(options(seededPlayers(5), 'SINGLE_ELIMINATION'));

  it('auto-advances a round-1 bye without it being played', () => {
    const bracket = fivePlayerBracket();
    const state = projectBracket(toStored(bracket));

    // p1, p2, p3 hold byes and are already through.
    for (const matchId of ['t1-WINNERS-R1-M1', 't1-WINNERS-R1-M3', 't1-WINNERS-R1-M4']) {
      const match = projected(state, matchId);
      expect(match.status).toBe('BYE');
      expect(match.winnerId).not.toBeNull();
    }

    // Two byes can therefore fill a whole second-round match...
    const secondRound = projected(state, 't1-WINNERS-R2-M2');
    expect([secondRound.player1Id, secondRound.player2Id].sort()).toEqual(['p2', 'p3']);
    expect(secondRound.status).toBe('SCHEDULED');

    // ...while a match still waiting on a real result stays undecided.
    const waiting = projected(state, 't1-WINNERS-R2-M1');
    expect(waiting.player1Id).toBe('p1');
    expect(waiting.player2Id).toBeNull();
    expect(waiting.status).toBe('PENDING');
  });

  it('propagates the winner of the one real first-round match', () => {
    const bracket = fivePlayerBracket();
    const state = projectBracket(recordResult(toStored(bracket), 't1-WINNERS-R1-M2', 'p5'));
    expect(projected(state, 't1-WINNERS-R2-M1').player2Id).toBe('p5');
  });
});

// ---------------------------------------------------------------------------
// A later round with one decided slot is PENDING, not a bye
// ---------------------------------------------------------------------------

describe('projectBracket — undecided vs bye', () => {
  it('leaves a partially-fed later round PENDING rather than advancing the lone player', () => {
    const bracket = eightPlayerBracket();
    const state = projectBracket(recordResult(toStored(bracket), 't1-WINNERS-R1-M1', 'p1'));

    const secondRound = projected(state, 't1-WINNERS-R2-M1');
    expect(secondRound.player1Id).toBe('p1');
    expect(secondRound.player2Id).toBeNull();
    // A null slot outside round 1 means "not decided yet", not "bye".
    expect(secondRound.status).toBe('PENDING');
    expect(secondRound.winnerId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Full progression
// ---------------------------------------------------------------------------

describe('projectBracket — full progression', () => {
  it('plays an 8-player bracket to a champion', () => {
    const bracket = eightPlayerBracket();
    const { state } = playThrough(bracket);

    // Seed 1 wins every match under the lower-seed-wins rule.
    expect(state.championId).toBe('p1');
    expect(state.isComplete).toBe(true);
    expect(state.currentRound).toBe(bracket.totalRounds);

    const final = projected(state, 't1-WINNERS-R3-M1');
    expect(final.status).toBe('COMPLETED');
    expect([final.player1Id, final.player2Id].sort()).toEqual(['p1', 'p2']);
    expect(final.winnerId).toBe('p1');

    // Every match is terminal.
    expect(state.matches.every((match) => match.status !== 'PENDING' && match.status !== 'SCHEDULED')).toBe(true);
  });

  it('advances currentRound as each round completes', () => {
    const bracket = eightPlayerBracket();
    let stored = toStored(bracket);

    let state = projectBracket(stored);
    expect(state.currentRound).toBe(1);

    const afterRoundOne = playRound(stored, 1);
    stored = afterRoundOne.stored;
    expect(afterRoundOne.state.currentRound).toBe(2);

    const afterRoundTwo = playRound(stored, 2);
    stored = afterRoundTwo.stored;
    expect(afterRoundTwo.state.currentRound).toBe(3);
    expect(afterRoundTwo.state.isComplete).toBe(false);

    const afterRoundThree = playRound(stored, 3);
    stored = afterRoundThree.stored;
    expect(afterRoundThree.state.isComplete).toBe(true);
    expect(projectBracket(stored).championId).toBe('p1');
  });

  it('follows the winner, not the bracket position', () => {
    const bracket = eightPlayerBracket();
    // The weakest player wins every match.
    const { state } = playThrough(bracket, (a, b) => (seedOf(a) >= seedOf(b) ? a : b));
    expect(state.championId).toBe('p8');
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe('projectBracket — idempotency', () => {
  it('re-projecting its own output changes nothing', () => {
    const { stored, state } = playThrough(eightPlayerBracket());
    const again = projectBracket(applyProjection(stored, state));
    expect(again).toEqual(state);
    expect(again.changedMatchIds).toEqual([]);
  });

  it('recording the same result twice is a no-op', () => {
    const bracket = eightPlayerBracket();
    const once = recordResult(toStored(bracket), 't1-WINNERS-R1-M1', 'p1');
    const twice = recordResult(once, 't1-WINNERS-R1-M1', 'p1');
    expect(projectBracket(twice)).toEqual(projectBracket(once));
  });
});

// ---------------------------------------------------------------------------
// Correction (AC 12) — self-healing re-projection
// ---------------------------------------------------------------------------

describe('projectBracket — correction', () => {
  it('replaces the advancing player downstream when an earlier result changes', () => {
    const bracket = eightPlayerBracket();
    let stored = toStored(bracket);
    stored = playRound(stored, 1).stored;

    // p4 beat p5 and is due to meet p1.
    expect(projected(projectBracket(stored), 't1-WINNERS-R2-M1').player2Id).toBe('p4');

    // Correct the result: p5 actually won.
    stored = recordResult(stored, 't1-WINNERS-R1-M2', 'p5');
    const corrected = projectBracket(stored);

    expect(projected(corrected, 't1-WINNERS-R2-M1').player2Id).toBe('p5');
    // p4 must no longer appear anywhere beyond round 1.
    const laterPlayers = corrected.matches
      .filter((match) => match.id !== 't1-WINNERS-R1-M2')
      .flatMap((match) => [match.player1Id, match.player2Id]);
    expect(laterPlayers).not.toContain('p4');
  });

  it('unwinds the whole downstream chain when a completed result is corrected', () => {
    const bracket = eightPlayerBracket();
    let stored = toStored(bracket);

    // Play the bracket out: p1 is champion.
    for (let round = 1; round <= bracket.totalRounds; round += 1) {
      stored = playRound(stored, round).stored;
    }
    expect(projectBracket(stored).championId).toBe('p1');

    // Correct the very first match so p8 wins it instead.
    stored = recordResult(stored, 't1-WINNERS-R1-M1', 'p8');
    const corrected = projectBracket(stored);

    // The stale downstream winners are no longer occupants, so they are cleared
    // and the bracket is no longer complete.
    const semi = projected(corrected, 't1-WINNERS-R2-M1');
    expect([semi.player1Id, semi.player2Id].sort()).toEqual(['p4', 'p8']);
    expect(semi.winnerId).toBeNull();
    expect(semi.status).toBe('SCHEDULED');

    const final = projected(corrected, 't1-WINNERS-R3-M1');
    expect(final.winnerId).toBeNull();
    expect(final.status).toBe('PENDING');

    expect(corrected.isComplete).toBe(false);
    expect(corrected.championId).toBeNull();
    // And the whole change is reported so persistence can write it back.
    expect(corrected.changedMatchIds.length).toBeGreaterThan(0);
  });

  it('keeps a downstream result that is still valid after a correction', () => {
    const bracket = eightPlayerBracket();
    let stored = toStored(bracket);
    stored = playRound(stored, 1).stored;
    stored = playRound(stored, 2).stored;

    // Correct the other half of the draw; p1's half is untouched.
    stored = recordResult(stored, 't1-WINNERS-R1-M4', 'p6');
    const corrected = projectBracket(stored);

    expect(projected(corrected, 't1-WINNERS-R2-M1').winnerId).toBe('p1');
    // p6 takes the slot vacated by p3, and p2's recorded win still stands.
    expect(projected(corrected, 't1-WINNERS-R2-M2').player1Id).toBe('p2');
    expect(projected(corrected, 't1-WINNERS-R2-M2').player2Id).toBe('p6');
    expect(projected(corrected, 't1-WINNERS-R2-M2').winnerId).toBe('p2');
    expect(projected(corrected, 't1-WINNERS-R2-M2').status).toBe('COMPLETED');
  });

  it('reports exactly which matches changed', () => {
    const bracket = eightPlayerBracket();
    const stored = recordResult(toStored(bracket), 't1-WINNERS-R1-M1', 'p1');
    const state = projectBracket(stored);
    expect(state.changedMatchIds).toContain('t1-WINNERS-R2-M1');
    expect(state.changedMatchIds).not.toContain('t1-WINNERS-R1-M1');
  });
});

// ---------------------------------------------------------------------------
// Anti-corruption invariants (QA-reproduced modes ii and iii)
// ---------------------------------------------------------------------------

describe('projectBracket — anti-corruption invariants', () => {
  /**
   * QA mode (iii): recording the same result twice must not place the same
   * player in both next-round slots. The old incremental "first empty slot"
   * advancement did exactly that.
   */
  it('never places the same player in both slots, even when a result is recorded twice', () => {
    const bracket = eightPlayerBracket();
    let stored = toStored(bracket);
    stored = recordResult(stored, 't1-WINNERS-R1-M1', 'p1');
    stored = recordResult(stored, 't1-WINNERS-R1-M1', 'p1'); // duplicate
    stored = recordResult(stored, 't1-WINNERS-R1-M2', 'p4');

    const semi = projected(projectBracket(stored), 't1-WINNERS-R2-M1');
    expect(semi.player1Id).toBe('p1');
    expect(semi.player2Id).toBe('p4');
    expect(semi.player1Id).not.toBe(semi.player2Id);
  });

  /** QA mode (ii): a match's two occupants must come from two different feeders. */
  it('fills each match from two different upstream matches', () => {
    const { stored, state } = playThrough(eightPlayerBracket());

    for (const match of stored) {
      if (match.feedMatch1Id === null || match.feedMatch2Id === null) continue;
      expect(match.feedMatch1Id).not.toBe(match.feedMatch2Id);
    }

    // No projected match may ever hold the same player in both slots.
    for (const match of state.matches) {
      if (match.player1Id === null || match.player2Id === null) continue;
      expect(match.player1Id).not.toBe(match.player2Id);
    }
  });

  it('holds that invariant after an arbitrary correction', () => {
    const bracket = eightPlayerBracket();
    let stored = toStored(bracket);
    for (let round = 1; round <= bracket.totalRounds; round += 1) {
      stored = playRound(stored, round).stored;
    }
    stored = recordResult(stored, 't1-WINNERS-R1-M3', 'p7');
    const state = projectBracket(stored);

    for (const match of state.matches) {
      if (match.player1Id === null || match.player2Id === null) continue;
      expect(match.player1Id).not.toBe(match.player2Id);
    }
    // A player may occupy at most one live slot in the same round.
    const roundOf = new Map(stored.map((match) => [match.id, match.roundNumber]));
    const byRound = new Map<number, string[]>();
    for (const match of state.matches) {
      const round = roundOf.get(match.id) as number;
      const occupants = [match.player1Id, match.player2Id].filter(
        (id): id is string => id !== null,
      );
      byRound.set(round, [...(byRound.get(round) ?? []), ...occupants]);
    }
    for (const occupants of byRound.values()) {
      expect(new Set(occupants).size).toBe(occupants.length);
    }
  });
});

// ---------------------------------------------------------------------------
// Terminal statuses
// ---------------------------------------------------------------------------

describe('projectBracket — terminal statuses', () => {
  it('preserves CANCELLED and clears its winner', () => {
    const bracket = eightPlayerBracket();
    const stored = toStored(bracket).map((match) =>
      match.id === 't1-WINNERS-R1-M1'
        ? { ...match, status: 'CANCELLED' as const, winnerId: 'p1' }
        : match,
    );
    const state = projectBracket(stored);
    const cancelled = projected(state, 't1-WINNERS-R1-M1');
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.winnerId).toBeNull();
    // A cancelled match advances nobody.
    expect(projected(state, 't1-WINNERS-R2-M1').player1Id).toBeNull();
  });

  it('preserves WALKOVER as the completion reason', () => {
    const bracket = eightPlayerBracket();
    const stored = toStored(bracket).map((match) =>
      match.id === 't1-WINNERS-R1-M1'
        ? { ...match, status: 'WALKOVER' as const, winnerId: 'p8' }
        : match,
    );
    const state = projectBracket(stored);
    expect(projected(state, 't1-WINNERS-R1-M1').status).toBe('WALKOVER');
    expect(projected(state, 't1-WINNERS-R2-M1').player1Id).toBe('p8');
  });

  it('preserves IN_PROGRESS when both players are decided', () => {
    const bracket = eightPlayerBracket();
    const stored = toStored(bracket).map((match) =>
      match.id === 't1-WINNERS-R1-M1' ? { ...match, status: 'IN_PROGRESS' as const } : match,
    );
    expect(projected(projectBracket(stored), 't1-WINNERS-R1-M1').status).toBe('IN_PROGRESS');
  });
});

// ---------------------------------------------------------------------------
// Robustness
// ---------------------------------------------------------------------------

describe('projectBracket — robustness', () => {
  it('leaves a slot undecided when its feed link is missing', () => {
    const bracket = eightPlayerBracket();
    const stored = toStored(bracket).map((match) =>
      match.id === 't1-WINNERS-R2-M1' ? { ...match, feedMatch1Id: 'does-not-exist' } : match,
    );
    const state = projectBracket(recordResult(stored, 't1-WINNERS-R1-M1', 'p1'));
    const secondRound = projected(state, 't1-WINNERS-R2-M1');
    expect(secondRound.player1Id).toBeNull();
    expect(secondRound.status).toBe('PENDING');
  });

  it('treats a round robin as complete only when every match is done, with no champion', () => {
    const bracket = generateRoundRobin(options(seededPlayers(4), 'ROUND_ROBIN'));
    const initial = projectBracket(toStored(bracket));
    expect(initial.championId).toBeNull();
    expect(initial.isComplete).toBe(false);
    // Every pairing is known up front, so all matches are scheduled immediately.
    expect(initial.matches.every((match) => match.status === 'SCHEDULED')).toBe(true);

    let stored = toStored(bracket);
    for (let round = 1; round <= bracket.totalRounds; round += 1) {
      stored = playRound(stored, round).stored;
    }
    const finished = projectBracket(stored);
    expect(finished.isComplete).toBe(true);
    // No single final match, so there is no champion to name.
    expect(finished.championId).toBeNull();
  });
});
