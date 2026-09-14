/**
 * Story 6.7 T02 — pure bracket engine.
 *
 * Generation, validation and progression-projection for tournament brackets.
 * **This module has no database access and does not import Prisma** (design §1
 * D3). Everything here is a pure function of its arguments, which is what makes
 * AC 9 (generation correctness) and AC 13 (determinism) testable without a DB.
 *
 * ── The defects this replaces (all measured against the old generators) ─────
 *
 *   1. **Degenerate seeding.** The old round 1 for 8 players was
 *      `1v2 3v4 5v6 7v8`, so the top two seeds met immediately and seeding was
 *      meaningless. This module uses standard bracket seeding, where round-1
 *      pairs are `s` vs `size + 1 - s`: `1v8 4v5 3v6 2v7`. The top two seeds
 *      are in opposite halves and can only meet in the final.
 *   2. **Phantom bye matches.** The old generator emitted an `EMPTY vs EMPTY`
 *      round-1 match for non-power-of-two fields (5 players → `p5vEMPTY`
 *      *and* `EMPTYvEMPTY`). Here byes go to the highest seeds and a bye match
 *      always has exactly one real player. A bye-vs-bye match is unreachable by
 *      construction (proof in `standardSeedingOrder`) and is asserted by
 *      `validateBracket`.
 *   3. **`totalMatches` / `byePlayers` came back `undefined`.** Both are now
 *      populated on every generated bracket.
 *   4. **Double elimination was not a double-elimination bracket.** 8 players
 *      produced 10 matches with a 2-round losers bracket; a real one needs 14
 *      matches (`2n - 2`) and 4 losers rounds. 16 players produced 22 instead
 *      of 30. Both are now structurally correct.
 *   5. **Non-determinism.** `randomizeSeeding` used `Math.random()`. This module
 *      uses a seeded PRNG (mulberry32) and contains no `Math.random()` call at
 *      all — enforced by a static test.
 *   6. **Swiss always ran 5 rounds** regardless of field size. The round count
 *      now derives from the field size.
 *
 * ── Conventions ─────────────────────────────────────────────────────────────
 *
 *   - **Determinism.** Same options + same `seed` ⇒ deep-equal bracket. When no
 *     `seed` is given, one is derived from `tournamentId`, so a tournament
 *     always regenerates identically.
 *   - **Domain statuses.** Matches carry the canonical `MatchStatus`, which is a
 *     superset of the database enum: `PENDING` (both slots null — a future-round
 *     placeholder) and `BYE` (exactly one player, auto-advanced) are domain-only
 *     values that `persistence` maps on write. They are not weakened here.
 *   - **Synthetic ids.** A generated bracket's match ids are deterministic
 *     (`<tournamentId>-<SIDE>-R<round>-M<match>`) and `feedMatch1Id` /
 *     `feedMatch2Id` reference *those* ids. `persistence.persistBracket` must
 *     remap them to the stored cuids.
 *   - **Byes are round-1 only.** A null slot in round 1 means "no player". A
 *     null slot in a later round means "not decided yet" — that is a `PENDING`
 *     match, never a bye. Auto-advance therefore applies only to self-paired
 *     matches (those with no feed links, which in a generated bracket means
 *     round 1), so a partially-fed later round stays `PENDING` rather than
 *     advancing its lone player.
 *   - **Double elimination is structure-only.** The winners bracket, losers
 *     bracket and grand final are generated with correct sizing and correct
 *     winner-feed links. Losers-bracket slots that are fed by *losers* of the
 *     winners bracket cannot be expressed with winner-feed links, so those
 *     slots stay null and losers-bracket *progression* is deferred — this is
 *     the option recommended in design §13 open question 3.
 */

import type {
  BracketGenerationOptions,
  BracketMatch,
  BracketSide,
  MatchStatus,
  PlayerSeed,
  ProjectedMatch,
  ProjectedState,
  StoredMatch,
  TournamentBracket,
  ValidationResult,
} from './types';

// ---------------------------------------------------------------------------
// Numeric helpers
// ---------------------------------------------------------------------------

/** Smallest power of two that is `>= value` (and at least 1). */
export function nextPowerOfTwo(value: number): number {
  if (!Number.isFinite(value) || value <= 1) return 1;
  let size = 1;
  while (size < value) size *= 2;
  return size;
}

/** True when `value` is a positive power of two. */
export function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
}

/** Order in which bracket sides must be walked during projection. */
const SIDE_ORDER: Record<BracketSide, number> = { WINNERS: 0, LOSERS: 1, GRAND_FINAL: 2 };

/** True for statuses that mean "this match will not change again". */
function isTerminal(status: MatchStatus): boolean {
  return status === 'COMPLETED' || status === 'BYE' || status === 'CANCELLED' || status === 'WALKOVER';
}

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) — no Math.random anywhere in this module
// ---------------------------------------------------------------------------

/**
 * FNV-1a 32-bit hash, used to turn a `tournamentId` into a stable PRNG seed.
 * Deterministic across processes and runs (unlike any hash seeded from time or
 * memory layout).
 */
export function hashStringToSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * mulberry32 — a tiny, fast, well-distributed 32-bit PRNG. Hand-rolled so the
 * engine needs no dependency (design §9) and is reproducible.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle driven by a seeded PRNG. Returns a new array; the input
 * is never mutated. Same `items` + same `seed` ⇒ same order, always.
 */
export function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = items.slice();
  const random = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const swap = out[i];
    out[i] = out[j];
    out[j] = swap;
  }
  return out;
}

/** Resolve the PRNG seed for a generation run: explicit `seed`, else `tournamentId`. */
export function resolveSeed(options: BracketGenerationOptions): number {
  if (typeof options.seed === 'number' && Number.isFinite(options.seed)) {
    return options.seed >>> 0;
  }
  return hashStringToSeed(options.tournamentId);
}

// ---------------------------------------------------------------------------
// Seeding (design §1 D3)
// ---------------------------------------------------------------------------

/**
 * Deterministic player ordering (design §1 D3 rule 1).
 *
 * `seed` asc → `winRate` desc → `totalMatches` desc → `name` asc → `id` asc.
 * The final `id` tie-break makes the comparator a **total order**, so two
 * players with identical names still order deterministically.
 */
export function sortPlayersForSeeding(players: PlayerSeed[]): PlayerSeed[] {
  return players.slice().sort((a, b) => {
    const seedA = typeof a.seed === 'number' ? a.seed : Number.POSITIVE_INFINITY;
    const seedB = typeof b.seed === 'number' ? b.seed : Number.POSITIVE_INFINITY;
    if (seedA !== seedB) return seedA - seedB;

    const winRateA = a.winRate ?? 0;
    const winRateB = b.winRate ?? 0;
    if (winRateA !== winRateB) return winRateB - winRateA;

    const matchesA = a.totalMatches ?? 0;
    const matchesB = b.totalMatches ?? 0;
    if (matchesA !== matchesB) return matchesB - matchesA;

    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    return 0;
  });
}

/**
 * Apply the optional seeded random draw (design §1 D3 rule 4).
 *
 * When `randomizeSeeding` is set, the *seeding order itself* is shuffled, so the
 * top of the returned list receives the byes. Uses `seededShuffle`, never
 * `Math.random()`.
 */
export function orderPlayersForBracket(options: BracketGenerationOptions): PlayerSeed[] {
  const ordered = sortPlayersForSeeding(options.players);
  if (!options.randomizeSeeding) return ordered;
  return seededShuffle(ordered, resolveSeed(options));
}

/**
 * Standard bracket seeding order for a field of `size` (a power of two).
 *
 * Returns the virtual seed number occupying each bracket slot, in slot order.
 * For 8: `[1, 8, 4, 5, 2, 7, 3, 6]` — i.e. round 1 pairs `1v8, 4v5, 2v7, 3v6`.
 *
 * Construction: start from `[1]` and repeatedly fold the list with
 * `size + 1 - s`, which places the strongest seed at the top and the weakest
 * opposite it. This guarantees two properties the old generator lacked:
 *
 *   - **Round-1 pairs sum to `size + 1`**, so slot `2i` and slot `2i + 1` hold
 *     seeds `s` and `size + 1 - s`.
 *   - **Seed 1 and seed 2 are in opposite halves**, so they can only meet in the
 *     final. (Each fold keeps the strongest seed at the top of the current
 *     order and the next-strongest in the reflected position, which is the top
 *     of the second half.)
 *
 * These two properties together also make a **bye-vs-bye match unreachable**:
 * byes are virtual seeds `n + 1 … size`, and a bye's partner is
 * `size + 1 - s <= size - n <= n`, which is always a real player.
 *
 * Note: published "standard seeding" lists differ only in the *index order* of
 * the bottom-half matches (for 16 they appear as both `1,16,8,9,4,13,5,12,…`
 * and `1,16,8,9,5,12,4,13,…`). The pairing *sets* are identical and the bracket
 * tree is isomorphic, so this implementation uses the single uniform fold.
 */
export function standardSeedingOrder(size: number): number[] {
  if (!isPowerOfTwo(size)) {
    throw new Error(`standardSeedingOrder requires a power of two, got ${size}`);
  }
  let order: number[] = [1];
  while (order.length < size) {
    const doubled = order.length * 2;
    const next: number[] = [];
    for (const seed of order) {
      next.push(seed);
      next.push(doubled + 1 - seed);
    }
    order = next;
  }
  return order;
}

// ---------------------------------------------------------------------------
// Round naming
// ---------------------------------------------------------------------------

/**
 * Human-readable round name for an elimination bracket.
 *
 * Names are relative to the **bracket size**, not absolute round numbers — the
 * old implementation hard-coded `1 → 'Round of 64'`, so an 8-player bracket's
 * first round was mislabelled "Round of 64". Here the name follows the number of
 * players still in at that round (`2^(total - round + 1)`).
 */
export function getRoundName(round: number, total: number): string {
  if (!Number.isInteger(round) || !Number.isInteger(total) || total < 1) {
    return `Round ${round}`;
  }
  if (round < 1 || round > total) return `Round ${round}`;

  const remaining = Math.pow(2, total - round + 1);
  if (remaining === 2) return 'Finals';
  if (remaining === 4) return 'Semi Finals';
  if (remaining === 8) return 'Quarter Finals';
  return `Round of ${remaining}`;
}

/**
 * Round name for a bracket that may contain a losers bracket.
 *
 * `winnersRounds` is the number of winners-bracket round groups (`log2(n)` for
 * double elimination). For a single-elimination bracket pass that bracket's own
 * round count and this delegates to `getRoundName`.
 */
export function getBracketRoundName(
  side: BracketSide,
  round: number,
  winnersRounds: number,
): string {
  if (side === 'GRAND_FINAL') return 'Grand Final';
  if (side === 'LOSERS') return `Losers Round ${round}`;
  return getRoundName(round, winnersRounds);
}

// ---------------------------------------------------------------------------
// Match construction helpers
// ---------------------------------------------------------------------------

/** Deterministic synthetic id for a generated (not yet persisted) match. */
function makeMatchId(
  tournamentId: string,
  side: BracketSide,
  round: number,
  match: number,
): string {
  return `${tournamentId}-${side}-R${round}-M${match}`;
}

/** Build an empty placeholder match for a future round. */
function placeholderMatch(
  tournamentId: string,
  side: BracketSide,
  round: number,
  match: number,
  feedMatch1Id: string | null,
  feedMatch2Id: string | null,
): BracketMatch {
  return {
    id: makeMatchId(tournamentId, side, round, match),
    round,
    match,
    player1Id: null,
    player2Id: null,
    winnerId: null,
    status: 'PENDING',
    feedMatch1Id,
    feedMatch2Id,
    bracket: side,
  };
}

/** Build a match from two resolved (possibly null) player slots. */
function matchFromSlots(
  tournamentId: string,
  side: BracketSide,
  round: number,
  match: number,
  player1: PlayerSeed | null,
  player2: PlayerSeed | null,
  feedMatch1Id: string | null,
  feedMatch2Id: string | null,
): BracketMatch {
  const built = placeholderMatch(tournamentId, side, round, match, feedMatch1Id, feedMatch2Id);
  built.player1Id = player1 ? player1.id : null;
  built.player2Id = player2 ? player2.id : null;
  built.player1Name = player1 ? player1.name : undefined;
  built.player2Name = player2 ? player2.name : undefined;

  if (player1 && player2) {
    built.status = 'SCHEDULED';
  } else if (player1 || player2) {
    // Structural bye: exactly one real player, auto-advanced.
    built.status = 'BYE';
    built.winnerId = (player1 ?? player2)!.id;
    built.winnerName = (player1 ?? player2)!.name;
  } else {
    // Unreachable for round 1 with standard seeding; left PENDING so
    // validateBracket can report it rather than crashing generation.
    built.status = 'PENDING';
  }
  return built;
}

/** Assemble the final bracket object with the derived summary fields. */
function buildBracket(
  tournamentId: string,
  format: TournamentBracket['format'],
  totalPlayers: number,
  bracket: BracketMatch[][],
  byePlayers: string[],
): TournamentBracket {
  const totalMatches = bracket.reduce((sum, round) => sum + round.length, 0);
  return {
    tournamentId,
    totalRounds: bracket.length,
    totalPlayers,
    bracket,
    currentRound: 1,
    isComplete: false,
    format,
    totalMatches,
    byePlayers,
  };
}

// ---------------------------------------------------------------------------
// Single elimination
// ---------------------------------------------------------------------------

/**
 * Single-elimination bracket.
 *
 * Round `r` holds `2^(totalRounds - r)` matches. Byes go to the highest seeds
 * and are represented as a match with exactly one player and `status: 'BYE'`;
 * they are already advanced, so the following round can be projected from them.
 */
export function generateSingleElimination(options: BracketGenerationOptions): TournamentBracket {
  const players = orderPlayersForBracket(options);
  const totalPlayers = players.length;
  if (totalPlayers < 2) {
    throw new Error('A bracket needs at least 2 players');
  }

  const size = nextPowerOfTwo(totalPlayers);
  const totalRounds = Math.log2(size);
  const byeCount = size - totalPlayers;
  const slotSeeds = standardSeedingOrder(size);

  const bracket: BracketMatch[][] = [];

  // Round 1 — real slots plus byes.
  const firstRound: BracketMatch[] = [];
  for (let match = 1; match <= size / 2; match += 1) {
    const seed1 = slotSeeds[(match - 1) * 2];
    const seed2 = slotSeeds[(match - 1) * 2 + 1];
    firstRound.push(
      matchFromSlots(
        options.tournamentId,
        'WINNERS',
        1,
        match,
        seed1 <= totalPlayers ? players[seed1 - 1] : null,
        seed2 <= totalPlayers ? players[seed2 - 1] : null,
        null,
        null,
      ),
    );
  }
  bracket.push(firstRound);

  // Rounds 2..R — placeholders fed by the previous round.
  for (let round = 2; round <= totalRounds; round += 1) {
    const matchesInRound = size / Math.pow(2, round);
    const roundMatches: BracketMatch[] = [];
    for (let match = 1; match <= matchesInRound; match += 1) {
      roundMatches.push(
        placeholderMatch(
          options.tournamentId,
          'WINNERS',
          round,
          match,
          makeMatchId(options.tournamentId, 'WINNERS', round - 1, (match - 1) * 2 + 1),
          makeMatchId(options.tournamentId, 'WINNERS', round - 1, (match - 1) * 2 + 2),
        ),
      );
    }
    bracket.push(roundMatches);
  }

  // Byes belong to the top seeds (design §1 D3 rule 3).
  const byePlayers = players.slice(0, byeCount).map((player) => player.id);

  return buildBracket(options.tournamentId, 'SINGLE_ELIMINATION', totalPlayers, bracket, byePlayers);
}

// ---------------------------------------------------------------------------
// Double elimination
// ---------------------------------------------------------------------------

/**
 * Match counts for each losers-bracket round, for a winners bracket of
 * `winnersRounds` rounds (`k = log2(n)`).
 *
 * Produces `[2^(k-2), 2^(k-2), 2^(k-3), 2^(k-3), …, 1, 1]`, which has `2k - 2`
 * rounds and sums to `n - 2` matches — exactly the losers-bracket size a real
 * double-elimination bracket needs. (The old generator produced `[2, 1]` for 8
 * players, two rounds where four are required.)
 */
export function losersRoundCounts(winnersRounds: number): number[] {
  const counts: number[] = [];
  for (let level = winnersRounds - 2; level >= 0; level -= 1) {
    const size = Math.pow(2, level);
    counts.push(size, size);
  }
  return counts;
}

/**
 * Double-elimination bracket: winners bracket, losers bracket, grand final.
 *
 * Total matches are exactly `2n - 2` (winners `n - 1`, losers `n - 2`, grand
 * final `1`) and every losers round is non-empty.
 *
 * Requires a power-of-two field. A non-power-of-two double-elimination bracket
 * needs byes threaded through *both* brackets, which is a different structure
 * and would no longer satisfy `2n - 2`; rather than emit a structurally wrong
 * bracket this throws with an actionable message.
 *
 * Winner-feed links are set for winners-bracket progression, the 1:1
 * losers-bracket steps, and the grand final. Losers-bracket slots fed by
 * *losers* of the winners bracket stay null, because the schema expresses only
 * winner feeds — losers-bracket progression is deferred (design §13 q3).
 */
export function generateDoubleElimination(options: BracketGenerationOptions): TournamentBracket {
  const players = orderPlayersForBracket(options);
  const totalPlayers = players.length;
  if (totalPlayers < 2) {
    throw new Error('A bracket needs at least 2 players');
  }
  if (!isPowerOfTwo(totalPlayers)) {
    throw new Error(
      `Double elimination requires a power-of-two field (got ${totalPlayers}). ` +
        'Pad the field with byes or use single elimination.',
    );
  }

  const winnersRounds = Math.log2(totalPlayers);
  const losersCounts = losersRoundCounts(winnersRounds);
  const bracket: BracketMatch[][] = [];

  // ---- Winners bracket (rounds 1..winnersRounds) --------------------------
  const slotSeeds = standardSeedingOrder(totalPlayers);
  for (let round = 1; round <= winnersRounds; round += 1) {
    const matchesInRound = totalPlayers / Math.pow(2, round);
    const roundMatches: BracketMatch[] = [];
    for (let match = 1; match <= matchesInRound; match += 1) {
      if (round === 1) {
        const seed1 = slotSeeds[(match - 1) * 2];
        const seed2 = slotSeeds[(match - 1) * 2 + 1];
        roundMatches.push(
          matchFromSlots(
            options.tournamentId,
            'WINNERS',
            1,
            match,
            players[seed1 - 1] ?? null,
            players[seed2 - 1] ?? null,
            null,
            null,
          ),
        );
      } else {
        roundMatches.push(
          placeholderMatch(
            options.tournamentId,
            'WINNERS',
            round,
            match,
            makeMatchId(options.tournamentId, 'WINNERS', round - 1, (match - 1) * 2 + 1),
            makeMatchId(options.tournamentId, 'WINNERS', round - 1, (match - 1) * 2 + 2),
          ),
        );
      }
    }
    bracket.push(roundMatches);
  }

  // ---- Losers bracket (rounds winnersRounds+1 ..) -------------------------
  // 1-based losers round index; the generator's global round number is
  // winnersRounds + losersRound.
  for (let losersRound = 1; losersRound <= losersCounts.length; losersRound += 1) {
    const globalRound = winnersRounds + losersRound;
    const matchesInRound = losersCounts[losersRound - 1];
    const roundMatches: BracketMatch[] = [];

    for (let match = 1; match <= matchesInRound; match += 1) {
      let feed1: string | null = null;
      let feed2: string | null = null;

      if (losersRound >= 2) {
        if (losersRound % 2 === 1) {
          // Odd losers round: two previous losers-round winners meet, so both
          // slots are winner-fed and fully expressible.
          feed1 = makeMatchId(options.tournamentId, 'LOSERS', winnersRounds + losersRound - 1, (match - 1) * 2 + 1);
          feed2 = makeMatchId(options.tournamentId, 'LOSERS', winnersRounds + losersRound - 1, (match - 1) * 2 + 2);
        } else {
          // Even losers round: one slot takes the same-index previous
          // losers-round winner (1:1); the other takes a winners-bracket
          // *loser*, which winner-feed links cannot express, so it stays null.
          feed1 = makeMatchId(options.tournamentId, 'LOSERS', winnersRounds + losersRound - 1, match);
        }
      }

      roundMatches.push(
        placeholderMatch(options.tournamentId, 'LOSERS', globalRound, match, feed1, feed2),
      );
    }
    bracket.push(roundMatches);
  }

  // ---- Grand final --------------------------------------------------------
  const grandFinalRound = winnersRounds + losersCounts.length + 1;
  const winnersFinalId = makeMatchId(options.tournamentId, 'WINNERS', winnersRounds, 1);
  // A 2-player field has no losers bracket at all: its grand final is the
  // winners-bracket winner against that match's *loser*, and a loser feed is not
  // expressible, so the second slot is left undecided.
  const losersFinalId =
    losersCounts.length > 0
      ? makeMatchId(options.tournamentId, 'LOSERS', winnersRounds + losersCounts.length, 1)
      : null;
  bracket.push([
    placeholderMatch(
      options.tournamentId,
      'GRAND_FINAL',
      grandFinalRound,
      1,
      winnersFinalId,
      losersFinalId,
    ),
  ]);

  return buildBracket(options.tournamentId, 'DOUBLE_ELIMINATION', totalPlayers, bracket, []);
}

// ---------------------------------------------------------------------------
// Round robin
// ---------------------------------------------------------------------------

/** Sentinel used to give an odd round-robin field an even number of slots. */
const ROUND_ROBIN_BYE = '__ROUND_ROBIN_BYE__';

/**
 * Circle-method round-robin schedule: every unordered pair meets exactly once.
 *
 * Fix the first slot and rotate the remaining slots by one each round. For an
 * odd field a sentinel is added so the rotation works; pairings involving the
 * sentinel are dropped (that player rests).
 *
 * The old implementation rotated with `shift()` + `splice(1, 0, …)`, which
 * oscillates between two permutations instead of rotating — measured, it played
 * only 6 of the 28 distinct pairs for 8 players and repeated 22. This version is
 * asserted exhaustively in the tests.
 */
export function roundRobinRounds(playerIds: string[]): Array<Array<[string, string]>> {
  const slots = playerIds.slice();
  if (slots.length % 2 !== 0) slots.push(ROUND_ROBIN_BYE);
  const slotCount = slots.length;

  const rounds: Array<Array<[string, string]>> = [];
  for (let round = 0; round < slotCount - 1; round += 1) {
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < slotCount / 2; i += 1) {
      const first = slots[i];
      const second = slots[slotCount - 1 - i];
      if (first === ROUND_ROBIN_BYE || second === ROUND_ROBIN_BYE) continue;
      pairs.push([first, second]);
    }
    rounds.push(pairs);

    // Rotate: keep slot 0 fixed, move the last slot to position 1.
    const last = slots.pop() as string;
    slots.splice(1, 0, last);
  }
  return rounds;
}

/**
 * Round-robin bracket. Every unordered pair plays exactly once, so there are
 * `n(n-1)/2` matches. All participants are known up front, so every match is
 * `SCHEDULED` (there are no byes to auto-advance).
 */
export function generateRoundRobin(options: BracketGenerationOptions): TournamentBracket {
  const players = orderPlayersForBracket(options);
  const totalPlayers = players.length;
  if (totalPlayers < 2) {
    throw new Error('A bracket needs at least 2 players');
  }

  const byId = new Map(players.map((player) => [player.id, player]));
  const schedule = roundRobinRounds(players.map((player) => player.id));

  const bracket: BracketMatch[][] = schedule.map((roundPairs, roundIndex) =>
    roundPairs.map(([firstId, secondId], matchIndex) => {
      const first = byId.get(firstId);
      const second = byId.get(secondId);
      return {
        id: makeMatchId(options.tournamentId, 'WINNERS', roundIndex + 1, matchIndex + 1),
        round: roundIndex + 1,
        match: matchIndex + 1,
        player1Id: firstId,
        player2Id: secondId,
        player1Name: first ? first.name : undefined,
        player2Name: second ? second.name : undefined,
        winnerId: null,
        status: 'SCHEDULED' as MatchStatus,
        feedMatch1Id: null,
        feedMatch2Id: null,
        bracket: 'WINNERS' as BracketSide,
      };
    }),
  );

  return buildBracket(options.tournamentId, 'ROUND_ROBIN', totalPlayers, bracket, []);
}

// ---------------------------------------------------------------------------
// Swiss
// ---------------------------------------------------------------------------

/**
 * Swiss-system bracket.
 *
 * The round count derives from the field size (`ceil(log2 n)`, the standard
 * Swiss round count) unless `swissRounds` overrides it. The old implementation
 * always ran 5 rounds — it ran 5 rounds for a 2-player field.
 *
 * Round 1 is paired by seed using the same standard pairing as elimination, so
 * an odd field gives the top seeds a bye. **Rounds 2 and later are emitted as
 * `PENDING` placeholders**: Swiss pairings are a function of accumulated
 * results, and a pure generator has no results to read. Emitting invented
 * pairings would be a lie, so the slots are left undecided for the service to
 * fill in as results arrive.
 */
export function generateSwiss(options: BracketGenerationOptions): TournamentBracket {
  const players = orderPlayersForBracket(options);
  const totalPlayers = players.length;
  if (totalPlayers < 2) {
    throw new Error('A bracket needs at least 2 players');
  }

  const requestedRounds = options.swissRounds;
  const totalRounds =
    typeof requestedRounds === 'number' && Number.isInteger(requestedRounds) && requestedRounds >= 1
      ? requestedRounds
      : Math.max(1, Math.ceil(Math.log2(totalPlayers)));

  const matchesPerRound = Math.ceil(totalPlayers / 2);
  // An odd field means exactly one player rests each round — a Swiss round never
  // has more than one bye, so the lowest-ranked player sits out. (The old
  // generator instead reused elimination-style byes, which left players unpaired
  // and others duplicated.)
  const hasBye = totalPlayers % 2 !== 0;
  const pairedCount = hasBye ? totalPlayers - 1 : totalPlayers;
  const playing = players.slice(0, pairedCount);
  const resting = hasBye ? players[totalPlayers - 1] : null;

  const bracket: BracketMatch[][] = [];

  // Round 1 — seeded pairing, strongest against weakest (1v n, 2v n-1, …).
  const firstRound: BracketMatch[] = [];
  const half = playing.length / 2;
  for (let match = 0; match < half; match += 1) {
    firstRound.push(
      matchFromSlots(
        options.tournamentId,
        'WINNERS',
        1,
        match + 1,
        playing[match],
        playing[playing.length - 1 - match],
        null,
        null,
      ),
    );
  }
  if (resting) {
    firstRound.push(
      matchFromSlots(options.tournamentId, 'WINNERS', 1, half + 1, resting, null, null, null),
    );
  }
  bracket.push(firstRound);

  // Rounds 2..R — undecided, because pairings depend on results.
  for (let round = 2; round <= totalRounds; round += 1) {
    const roundMatches: BracketMatch[] = [];
    for (let match = 1; match <= matchesPerRound; match += 1) {
      roundMatches.push(
        placeholderMatch(options.tournamentId, 'WINNERS', round, match, null, null),
      );
    }
    bracket.push(roundMatches);
  }

  const byePlayers = resting ? [resting.id] : [];

  return buildBracket(options.tournamentId, 'SWISS', totalPlayers, bracket, byePlayers);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Check a bracket's structural invariants. Used as a post-generation assertion
 * and as the test oracle (design §7).
 *
 * This is a **rewrite**, not a port: the old `bracketService.validateBracket`
 * treated `player1Id`/`player2Id` as required (so every bye and placeholder was
 * an error) and compared raw advancing-player counts, which cannot detect any of
 * the defects listed at the top of this file.
 *
 * `errors` mean the bracket is malformed. `warnings` mean it is well-formed but
 * something is worth surfacing (for example byes, or undecided Swiss rounds).
 */
export function validateBracket(bracket: TournamentBracket): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const { format, bracket: rounds, totalPlayers } = bracket;

  if (rounds.length !== bracket.totalRounds) {
    errors.push(
      `totalRounds is ${bracket.totalRounds} but the bracket has ${rounds.length} rounds`,
    );
  }
  if (rounds.length === 0) {
    errors.push('bracket has no rounds');
    return { isValid: false, errors, warnings };
  }
  if (totalPlayers < 2) {
    errors.push(`totalPlayers must be at least 2, got ${totalPlayers}`);
  }

  // ---- shared checks ------------------------------------------------------
  const allMatches = rounds.flat();
  const seenIds = new Set<string>();
  for (const match of allMatches) {
    if (seenIds.has(match.id)) errors.push(`duplicate match id "${match.id}"`);
    seenIds.add(match.id);
  }

  const byId = new Map(allMatches.map((match) => [match.id, match]));
  const roundNumberOf = new Map(allMatches.map((match) => [match.id, match.round]));

  for (const match of allMatches) {
    const label = `match ${match.id}`;
    const side: BracketSide = match.bracket ?? 'WINNERS';

    // A recorded winner must be one of the two occupants.
    if (match.winnerId) {
      if (match.winnerId !== match.player1Id && match.winnerId !== match.player2Id) {
        errors.push(`${label}: winnerId "${match.winnerId}" is not one of its two players`);
      }
      if (match.status !== 'COMPLETED' && match.status !== 'BYE' && match.status !== 'WALKOVER') {
        errors.push(`${label}: has a winnerId but status is ${match.status}`);
      }
    }
    if ((match.status === 'COMPLETED' || match.status === 'BYE') && !match.winnerId) {
      errors.push(`${label}: status is ${match.status} but there is no winnerId`);
    }

    // Feed links must exist and must point backwards.
    for (const feed of [match.feedMatch1Id, match.feedMatch2Id]) {
      if (!feed) continue;
      const feeder = byId.get(feed);
      if (!feeder) {
        errors.push(`${label}: feed link "${feed}" does not exist in this bracket`);
        continue;
      }
      const feederRound = roundNumberOf.get(feed) as number;
      if (feederRound >= match.round) {
        errors.push(
          `${label}: feed link "${feed}" is in round ${feederRound}, which is not before round ${match.round}`,
        );
      }
    }

    // Only the entry round may hold a structural bye.
    if (side !== 'GRAND_FINAL' && match.round !== 1) {
      const filled = (match.player1Id ? 1 : 0) + (match.player2Id ? 1 : 0);
      if (filled === 1 && match.status === 'BYE') {
        warnings.push(`${label}: bye outside round 1 (round ${match.round})`);
      }
    }
  }

  // ---- format-specific checks --------------------------------------------
  switch (format) {
    case 'SINGLE_ELIMINATION':
      validateEliminationShape(bracket, errors, warnings, 'SINGLE_ELIMINATION');
      break;

    case 'DOUBLE_ELIMINATION':
      validateDoubleEliminationShape(bracket, errors, warnings);
      break;

    case 'ROUND_ROBIN':
      validateRoundRobinShape(bracket, errors, warnings);
      break;

    case 'SWISS':
      validateSwissShape(bracket, errors, warnings);
      break;

    case 'MIXED':
    default:
      errors.push(`format "${String(format)}" is not a generatable bracket format`);
      break;
  }

  return { isValid: errors.length === 0, errors, warnings };
}

/**
 * Round-1 slot and bye invariants.
 *
 * `everyPlayerAppearsInRoundOne` is false for round robin, where an odd field
 * means one player rests in every round (including the first) rather than
 * receiving a bye match.
 */
function validateEntryRound(
  bracket: TournamentBracket,
  errors: string[],
  warnings: string[],
  label: string,
  everyPlayerAppearsInRoundOne = true,
): void {
  const firstRound = bracket.bracket[0];
  const placed: string[] = [];

  for (const match of firstRound) {
    const filled = (match.player1Id ? 1 : 0) + (match.player2Id ? 1 : 0);
    if (filled === 0) {
      errors.push(`${label}: round 1 match ${match.id} has no players (bye-vs-bye)`);
    }
    if (filled === 1 && match.status !== 'BYE') {
      errors.push(`${label}: round 1 match ${match.id} has one player but status is ${match.status}`);
    }
    if (filled === 2 && match.status === 'BYE') {
      errors.push(`${label}: round 1 match ${match.id} has two players but is marked BYE`);
    }
    if (match.player1Id) placed.push(match.player1Id);
    if (match.player2Id) placed.push(match.player2Id);
  }

  const distinct = new Set(placed);
  if (distinct.size !== placed.length) {
    errors.push(`${label}: a player appears in more than one round 1 slot`);
  }
  if (everyPlayerAppearsInRoundOne && distinct.size !== bracket.totalPlayers) {
    errors.push(
      `${label}: round 1 holds ${distinct.size} distinct players but totalPlayers is ${bracket.totalPlayers}`,
    );
  }

  const byeCount = firstRound.filter((match) => match.status === 'BYE').length;
  if (byeCount !== bracket.byePlayers.length) {
    errors.push(
      `${label}: ${byeCount} bye match(es) in round 1 but byePlayers lists ${bracket.byePlayers.length}`,
    );
  }
  if (byeCount > 0) {
    warnings.push(`${label}: ${byeCount} player(s) have a bye in round 1`);
  }
}

/** Single-elimination shape: power-of-two round sizes, n-1 real matches. */
function validateEliminationShape(
  bracket: TournamentBracket,
  errors: string[],
  warnings: string[],
  label: string,
): void {
  validateEntryRound(bracket, errors, warnings, label);

  const rounds = bracket.totalRounds;
  const expectedRounds = Math.max(1, Math.ceil(Math.log2(Math.max(2, bracket.totalPlayers))));
  if (rounds !== expectedRounds) {
    errors.push(`${label}: totalRounds is ${rounds}, expected ceil(log2 n) = ${expectedRounds}`);
  }
  const size = Math.pow(2, rounds);

  bracket.bracket.forEach((roundMatches, index) => {
    const roundNumber = index + 1;
    const expected = Math.pow(2, rounds - roundNumber);
    if (roundMatches.length !== expected) {
      errors.push(
        `${label}: round ${roundNumber} has ${roundMatches.length} matches, expected ${expected}`,
      );
    }
  });

  const expectedTotal = size - 1;
  if (bracket.totalMatches !== expectedTotal) {
    errors.push(`${label}: totalMatches is ${bracket.totalMatches}, expected ${expectedTotal}`);
  }
  const realMatches = bracket.totalMatches - bracket.byePlayers.length;
  if (realMatches !== bracket.totalPlayers - 1) {
    errors.push(
      `${label}: ${realMatches} real matches, expected totalPlayers - 1 = ${bracket.totalPlayers - 1}`,
    );
  }
}

/** Double-elimination shape: WB sizing, LB sizing, non-empty LB, grand final. */
function validateDoubleEliminationShape(
  bracket: TournamentBracket,
  errors: string[],
  warnings: string[],
): void {
  const label = 'DOUBLE_ELIMINATION';
  const n = bracket.totalPlayers;

  if (!isPowerOfTwo(n)) {
    errors.push(`${label}: field size ${n} is not a power of two`);
    return;
  }

  const winnersRounds = Math.log2(n);
  const expectedLosersCounts = losersRoundCounts(winnersRounds);
  const expectedTotalRounds = winnersRounds + expectedLosersCounts.length + 1;

  if (bracket.totalRounds !== expectedTotalRounds) {
    errors.push(
      `${label}: totalRounds is ${bracket.totalRounds}, expected ${expectedTotalRounds} ` +
        `(${winnersRounds} winners + ${expectedLosersCounts.length} losers + 1 grand final)`,
    );
  }

  validateEntryRound(bracket, errors, warnings, label);

  // Winners bracket rounds.
  for (let index = 0; index < winnersRounds && index < bracket.bracket.length; index += 1) {
    const roundMatches = bracket.bracket[index];
    const roundNumber = index + 1;
    const expected = n / Math.pow(2, roundNumber);
    if (roundMatches.length !== expected) {
      errors.push(
        `${label}: winners round ${roundNumber} has ${roundMatches.length} matches, expected ${expected}`,
      );
    }
    if (roundMatches.some((match) => (match.bracket ?? 'WINNERS') !== 'WINNERS')) {
      errors.push(`${label}: winners round ${roundNumber} contains a non-WINNERS match`);
    }
  }

  // Losers bracket rounds.
  for (let losersRound = 1; losersRound <= expectedLosersCounts.length; losersRound += 1) {
    const index = winnersRounds + losersRound - 1;
    const roundMatches = bracket.bracket[index];
    if (!roundMatches) {
      errors.push(`${label}: losers round ${losersRound} is missing`);
      continue;
    }
    if (roundMatches.length === 0) {
      errors.push(`${label}: losers round ${losersRound} is empty`);
    }
    const expected = expectedLosersCounts[losersRound - 1];
    if (roundMatches.length !== expected) {
      errors.push(
        `${label}: losers round ${losersRound} has ${roundMatches.length} matches, expected ${expected}`,
      );
    }
    if (roundMatches.some((match) => match.bracket !== 'LOSERS')) {
      errors.push(`${label}: losers round ${losersRound} contains a non-LOSERS match`);
    }
  }

  // Grand final.
  const finalRound = bracket.bracket[bracket.bracket.length - 1];
  if (!finalRound || finalRound.length !== 1 || finalRound[0].bracket !== 'GRAND_FINAL') {
    errors.push(`${label}: the last round must be a single GRAND_FINAL match`);
  }

  const expectedTotalMatches = 2 * n - 2;
  if (bracket.totalMatches !== expectedTotalMatches) {
    errors.push(
      `${label}: totalMatches is ${bracket.totalMatches}, expected 2n - 2 = ${expectedTotalMatches}`,
    );
  }

  warnings.push(
    `${label}: losers-bracket progression is deferred — slots fed by winners-bracket losers ` +
      'are undecided (design §13 q3)',
  );
}

/** Round-robin shape: every unordered pair exactly once. */
function validateRoundRobinShape(
  bracket: TournamentBracket,
  errors: string[],
  warnings: string[],
): void {
  const label = 'ROUND_ROBIN';
  const n = bracket.totalPlayers;

  // An odd field rests one player per round, so not every player appears in
  // round 1 — pair coverage is asserted below instead.
  validateEntryRound(bracket, errors, warnings, label, false);

  const expectedRounds = n % 2 === 0 ? n - 1 : n;
  const expectedPerRound = n % 2 === 0 ? n / 2 : (n - 1) / 2;
  if (bracket.totalRounds !== expectedRounds) {
    errors.push(`${label}: totalRounds is ${bracket.totalRounds}, expected ${expectedRounds}`);
  }
  bracket.bracket.forEach((roundMatches, index) => {
    if (roundMatches.length !== expectedPerRound) {
      errors.push(
        `${label}: round ${index + 1} has ${roundMatches.length} matches, expected ${expectedPerRound}`,
      );
    }
    for (const match of roundMatches) {
      if (!match.player1Id || !match.player2Id) {
        errors.push(`${label}: match ${match.id} is missing a player`);
      }
    }
  });

  const pairCounts = new Map<string, number>();
  for (const match of bracket.bracket.flat()) {
    if (!match.player1Id || !match.player2Id) continue;
    const key = [match.player1Id, match.player2Id].sort().join('|');
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of pairCounts) {
    if (count !== 1) {
      errors.push(`${label}: pairing ${key} occurs ${count} times, expected exactly once`);
    }
  }
  const expectedPairs = (n * (n - 1)) / 2;
  if (pairCounts.size !== expectedPairs) {
    errors.push(`${label}: ${pairCounts.size} distinct pairings, expected ${expectedPairs}`);
  }

  const expectedTotal = (n * (n - 1)) / 2;
  if (bracket.totalMatches !== expectedTotal) {
    errors.push(`${label}: totalMatches is ${bracket.totalMatches}, expected ${expectedTotal}`);
  }
}

/** Swiss shape: round count derived from the field, later rounds undecided. */
function validateSwissShape(
  bracket: TournamentBracket,
  errors: string[],
  warnings: string[],
): void {
  const label = 'SWISS';
  const n = bracket.totalPlayers;

  validateEntryRound(bracket, errors, warnings, label);

  const expectedPerRound = Math.ceil(n / 2);
  bracket.bracket.forEach((roundMatches, index) => {
    if (roundMatches.length !== expectedPerRound) {
      errors.push(
        `${label}: round ${index + 1} has ${roundMatches.length} matches, expected ${expectedPerRound}`,
      );
    }
  });

  const undecided = bracket.bracket
    .slice(1)
    .flat()
    .filter((match) => !match.player1Id && !match.player2Id).length;
  if (undecided > 0) {
    warnings.push(
      `${label}: ${undecided} slot pairing(s) after round 1 are undecided — Swiss pairings ` +
        'depend on results (a pure generator has none to read)',
    );
  }

  const expectedTotal = bracket.totalRounds * expectedPerRound;
  if (bracket.totalMatches !== expectedTotal) {
    errors.push(`${label}: totalMatches is ${bracket.totalMatches}, expected ${expectedTotal}`);
  }
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

/**
 * Recompute a bracket's state from its recorded results (design §1 D5).
 *
 * Progression is a **projection, never an incremental append**. Every
 * non-entry-round slot is cleared and then re-derived from recorded winners and
 * feed links, so the result is a pure function of the recorded results. That is
 * what makes a correction self-healing: there is no stale incremental state to
 * unwind, and re-applying the same results is a no-op (idempotent).
 *
 * Rules:
 *   - A slot is **re-derived only when a feeder is declared for it**. A slot with
 *     no declared source is authoritative as stored. That single rule covers
 *     round 1, every round-robin and Swiss round (those are paired independently
 *     rather than fed by links), and the losers-bracket slots that take a
 *     winners-bracket *loser* — which winner-feed links cannot express. A feed
 *     link that is declared but dangling resolves to `null`, which is how a
 *     stale slot gets cleared.
 *   - A **self-paired** match (no feed links at all) with exactly one player is a
 *     structural bye: it is auto-advanced. This is how round-1 byes work, and it
 *     is why a partially-fed later round is *not* a bye — a null slot there means
 *     "not decided yet", so that match stays `PENDING`.
 *   - A stored winner is only kept if it is one of the two projected occupants.
 *     Otherwise it is cleared, which is how a corrected upstream result removes
 *     a player who should no longer have advanced.
 *   - `CANCELLED` is terminal and preserved; its winner is cleared.
 */
export function projectBracket(matches: StoredMatch[]): ProjectedState {
  const ordered = matches
    .slice()
    .sort((a, b) => {
      if (a.roundNumber !== b.roundNumber) return a.roundNumber - b.roundNumber;
      const sideA = SIDE_ORDER[a.bracket ?? 'WINNERS'];
      const sideB = SIDE_ORDER[b.bracket ?? 'WINNERS'];
      if (sideA !== sideB) return sideA - sideB;
      return a.matchNumber - b.matchNumber;
    });

  // Winners are resolved as we walk, because a later round reads the winners of
  // earlier rounds.
  const winnerOf = new Map<string, string | null>();
  const projected: ProjectedMatch[] = [];
  const changedMatchIds: string[] = [];

  for (const match of ordered) {
    const stored1 = match.player1Id;
    const stored2 = match.player2Id;
    const selfPaired = !match.feedMatch1Id && !match.feedMatch2Id;

    // 1. Slots: re-derived only where a feeder is declared.
    const player1Id = match.feedMatch1Id
      ? resolveFeederWinner(match.feedMatch1Id, winnerOf)
      : stored1;
    const player2Id = match.feedMatch2Id
      ? resolveFeederWinner(match.feedMatch2Id, winnerOf)
      : stored2;

    // 2. Winner + status.
    let winnerId: string | null = null;
    let status: MatchStatus;

    if (match.status === 'CANCELLED') {
      status = 'CANCELLED';
    } else if (player1Id && player2Id) {
      const winnerIsValid = match.winnerId === player1Id || match.winnerId === player2Id;
      if (winnerIsValid) {
        winnerId = match.winnerId;
        status = match.status === 'WALKOVER' ? 'WALKOVER' : 'COMPLETED';
      } else {
        status = match.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'SCHEDULED';
      }
    } else if (selfPaired && (player1Id || player2Id)) {
      // Structural bye: one player, auto-advanced.
      winnerId = (player1Id ?? player2Id) as string;
      status = 'BYE';
    } else {
      status = 'PENDING';
    }

    winnerOf.set(match.id, winnerId);

    const after: ProjectedMatch = { id: match.id, player1Id, player2Id, winnerId, status };
    projected.push(after);

    if (
      after.player1Id !== stored1 ||
      after.player2Id !== stored2 ||
      after.winnerId !== match.winnerId ||
      after.status !== match.status
    ) {
      changedMatchIds.push(match.id);
    }
  }

  // 3. Round/tournament status.
  const roundNumbers = ordered.map((match) => match.roundNumber);
  const byRound = new Map<number, ProjectedMatch[]>();
  for (let i = 0; i < ordered.length; i += 1) {
    const round = ordered[i].roundNumber;
    const bucket = byRound.get(round);
    if (bucket) bucket.push(projected[i]);
    else byRound.set(round, [projected[i]]);
  }

  const earliestUnfinished = roundNumbers
    .slice()
    .sort((a, b) => a - b)
    .find((round) => (byRound.get(round) as ProjectedMatch[]).some((m) => !isTerminal(m.status)));
  const currentRound = earliestUnfinished ?? (roundNumbers.length > 0 ? Math.max(...roundNumbers) : 1);

  const lastRound = roundNumbers.length > 0 ? Math.max(...roundNumbers) : 0;
  const lastRoundMatches = byRound.get(lastRound) ?? [];
  const finalMatch = lastRoundMatches.length === 1 ? lastRoundMatches[0] : undefined;

  const isComplete = finalMatch
    ? isTerminal(finalMatch.status) && finalMatch.winnerId !== null
    : projected.length > 0 && projected.every((m) => isTerminal(m.status));

  const championId = finalMatch && isTerminal(finalMatch.status) ? finalMatch.winnerId : null;

  return { matches: projected, currentRound, isComplete, championId, changedMatchIds };
}

/** Resolve the winner of a feeder match, or null when undecided/missing. */
function resolveFeederWinner(
  feedId: string | null,
  winnerOf: Map<string, string | null>,
): string | null {
  if (!feedId) return null;
  return winnerOf.get(feedId) ?? null;
}
