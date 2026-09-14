/**
 * Story 6.7 — Canonical tournament-bracket domain types.
 *
 * This module is the SINGLE source of truth for bracket shapes (design §1 D2).
 * Before this story the repository carried three mutually incompatible shapes:
 *
 *   1. `services/tournamentBracketService.ts` — an in-memory shape that
 *      persisted nothing (design §0 findings 2 and 6).
 *   2. `services/bracketService.ts` — dead code, zero callers (finding 4).
 *   3. `socket/events/tournamentAnalytics.ts` — the client *wire* shape.
 *
 * Shapes (1) and (2) are replaced by this module. Shape (3) is a **projection**
 * of these types and is intentionally left byte-for-byte unchanged so the
 * Story 6.4 real-time contract is preserved (design §1 D2, §11).
 *
 * Rules for consumers (design §11, "cross-file conventions"):
 *
 *   - Never re-declare `BracketMatch` / `TournamentBracket` locally; import them
 *     from here (directly or through the `bracket/` barrel).
 *   - Never leak these types onto the socket wire — map domain -> wire.
 *   - Never call `Math.random()` during generation; use the seeded PRNG
 *     (`seededShuffle`) so brackets are reproducible (design §1 D3, AC 13).
 *   - Every progression/correction write is a single `$transaction`, and
 *     re-projection must be idempotent (design §11).
 *
 * Everything here is a *type* (plus the `as const` runtime mirrors of the string
 * unions, which exist so route/engine code can validate untrusted input without
 * duplicating the literal lists).
 */

// ---------------------------------------------------------------------------
// Enumerations (string unions + runtime mirrors)
// ---------------------------------------------------------------------------

/**
 * Lifecycle state of a single bracket match.
 *
 * This is a superset of the database enum `TournamentMatchStatus`
 * (`SCHEDULED | IN_PROGRESS | COMPLETED | CANCELLED | WALKOVER`) plus two
 * domain-only states that have no column of their own:
 *
 *   - `PENDING` — a future-round placeholder: neither slot is filled yet.
 *   - `BYE`     — exactly one real player; auto-advanced without being played.
 *
 * `persistence` maps `PENDING` and `BYE` onto the database enum on write
 * (`PENDING` -> `SCHEDULED`, `BYE` -> `COMPLETED`) and derives them again on
 * read from the slot/winner contents, so the wire and the API never see a
 * state the schema cannot represent.
 */
export type MatchStatus =
  | 'PENDING'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'WALKOVER'
  | 'BYE';

/** Runtime mirror of {@link MatchStatus}. */
export const MATCH_STATUSES = [
  'PENDING',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'WALKOVER',
  'BYE',
] as const;

/**
 * Which sub-bracket a round/match belongs to.
 *
 * `WINNERS` is the only side single elimination, round robin and Swiss use;
 * `LOSERS` and `GRAND_FINAL` exist so double elimination is representable
 * (design §1 D5, §13 open question 3).
 */
export type BracketSide = 'WINNERS' | 'LOSERS' | 'GRAND_FINAL';

/** Runtime mirror of {@link BracketSide}. */
export const BRACKET_SIDES = ['WINNERS', 'LOSERS', 'GRAND_FINAL'] as const;

/** Lifecycle state of a round. Mirrors the `TournamentRoundStatus` enum. */
export type RoundStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

/** Runtime mirror of {@link RoundStatus}. */
export const ROUND_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

/**
 * Tournament format. Deliberately identical to the database enum
 * `TournamentType` so no mapping layer is needed.
 *
 * `MIXED` is not a generatable format — the engine rejects it explicitly rather
 * than guessing (see `generateSingleElimination` and friends in `engine.ts`).
 */
export type TournamentFormat =
  | 'SINGLE_ELIMINATION'
  | 'DOUBLE_ELIMINATION'
  | 'ROUND_ROBIN'
  | 'SWISS'
  | 'MIXED';

/** Runtime mirror of {@link TournamentFormat}. */
export const TOURNAMENT_FORMATS = [
  'SINGLE_ELIMINATION',
  'DOUBLE_ELIMINATION',
  'ROUND_ROBIN',
  'SWISS',
  'MIXED',
] as const;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * A player as handed to the engine.
 *
 * Field names match the pre-existing public shape (`{ id, name, seed,
 * skillLevel }`) so the `tournamentBracketService` facade can keep re-exporting
 * this type without breaking its existing importers (design §1 D2 migration
 * path). `winRate` / `totalMatches` are the tournament-player statistics used
 * as the documented tie-breakers in the seeding rule (design §1 D3).
 */
export interface PlayerSeed {
  /** `TournamentPlayer.id` — stable bracket identity. */
  id: string;
  /** Display name, used as the final deterministic tie-breaker. */
  name: string;
  /** Explicit tournament seed; 1 is the strongest. `null`/absent sorts last. */
  seed?: number | null;
  /** Tournament-local win rate in `[0, 1]`; higher sorts first. */
  winRate?: number;
  /** Tournament-local matches played; higher sorts first. */
  totalMatches?: number;
  /** Informational only — never used for ordering. */
  skillLevel?: string | null;
}

/**
 * Input to a bracket generator.
 *
 * `seed` drives the seeded PRNG; when absent the engine derives a stable seed
 * from `tournamentId` so the same tournament always produces the same bracket
 * (design §1 D3 rule 4, AC 13).
 */
export interface BracketGenerationOptions {
  tournamentId: string;
  players: PlayerSeed[];
  tournamentType: TournamentFormat;
  /** When true, player order is permuted by the seeded PRNG. Default: `false`. */
  randomizeSeeding?: boolean;
  /** Explicit PRNG seed. Default: a stable hash of `tournamentId`. */
  seed?: number;
  /**
   * Swiss only: number of rounds to play. Default: `ceil(log2(playerCount))`,
   * the standard Swiss round count.
   */
  swissRounds?: number;
}

/** A recorded match result, as supplied by an organizer. */
export interface MatchResult {
  matchId: string;
  /** `TournamentPlayer.id` of the winner. Must be one of the two occupants. */
  winnerId: string;
  /** Free-text score line, e.g. `"21-19 21-15"`. Optional. */
  score?: string;
  /** When the result was recorded. Defaults to the write time. */
  recordedAt?: Date;
}

// ---------------------------------------------------------------------------
// Domain shapes
// ---------------------------------------------------------------------------

/**
 * A single match inside a bracket.
 *
 * Slot nullability is meaningful (design §2): a `PENDING` placeholder has both
 * slots `null`, and a `BYE` has exactly one slot `null` with `winnerId` already
 * set. `feedMatch1Id` -> `player1`, `feedMatch2Id` -> `player2`.
 */
export interface BracketMatch {
  /** Stable match id. For a generated (unpersisted) bracket this is a synthetic
   * id; `persistence.persistBracket` replaces it with the stored `cuid`. */
  id: string;
  /** 1-based round number within the whole bracket. */
  round: number;
  /** 1-based match number within its round. */
  match: number;
  player1Id: string | null;
  player2Id: string | null;
  winnerId: string | null;
  status: MatchStatus;
  /** Winner of this match advances into the `player1` slot of the match whose
   * `id` is referenced here. `null` for the final. */
  feedMatch1Id: string | null;
  /** Winner of this match advances into the `player2` slot of the referenced
   * match. `null` for the final. */
  feedMatch2Id: string | null;
  /** Sub-bracket membership. Defaults to `'WINNERS'` when omitted. */
  bracket?: BracketSide;
  /** Denormalised display names — presentation convenience only, never used
   * for ordering or advancement. */
  player1Name?: string;
  player2Name?: string;
  winnerName?: string;
  /** Free-text score line, when known. */
  score?: string;
  /** Court assignment, when scheduled. */
  court?: string;
  /** Scheduled start, when known. */
  scheduledTime?: Date;
  /** Set when the result was corrected (AC 12 audit trail). */
  correctedAt?: Date | null;
  /** Operator-supplied reason for the correction. */
  correctionReason?: string | null;
}

/**
 * Persistence-facing round aggregate.
 *
 * `TournamentBracket.bracket` groups matches by round and is the canonical
 * grouping; `BracketRound` adds the round metadata the `tournament_rounds`
 * table needs (`roundName`, `matchesRequired`, `playersAdvancing`, `roundType`)
 * without polluting the canonical bracket shape. `persistence.persistBracket`
 * derives these from the bracket + `engine.getRoundName`; `getBracketState`
 * returns the richer form for callers that want round names/status.
 */
export interface BracketRound {
  /** 1-based round number, unique within the bracket. */
  round: number;
  /** Human-readable name, e.g. `"Quarter Finals"`. */
  name: string;
  /** Sub-bracket membership. */
  bracket: BracketSide;
  status: RoundStatus;
  matches: BracketMatch[];
}

/**
 * A fully-structured bracket. Shape is fixed by design §4 (class diagram) —
 * `bracket[0]` is round 1, `bracket[R - 1]` is the final.
 */
export interface TournamentBracket {
  tournamentId: string;
  /** Total number of rounds, `bracket.length`. */
  totalRounds: number;
  /** Number of distinct players placed in the bracket. */
  totalPlayers: number;
  /** Matches grouped by round; index 0 is round 1. */
  bracket: BracketMatch[][];
  /** 1-based index of the earliest round that still has an unplayed match. */
  currentRound: number;
  /** True once a champion is decided (final match has a winner). */
  isComplete: boolean;
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

/**
 * A match as read back from storage, in the minimal shape `projectBracket`
 * needs. `roundNumber` comes from the joined `tournament_rounds` row, because
 * projection walks rounds in order.
 */
export interface StoredMatch {
  id: string;
  tournamentId: string;
  roundId: string | null;
  /** 1-based round number from the parent round row. */
  roundNumber: number;
  /** 1-based match number within the round. */
  matchNumber: number;
  player1Id: string | null;
  player2Id: string | null;
  winnerId: string | null;
  status: MatchStatus;
  feedMatch1Id: string | null;
  feedMatch2Id: string | null;
  /** Sub-bracket membership. Defaults to `'WINNERS'` when omitted. */
  bracket?: BracketSide;
}

/**
 * The mutable outcome of projection for one match — only the fields that
 * `projectBracket` recomputes. Everything else is immutable structural data.
 */
export interface ProjectedMatch {
  id: string;
  player1Id: string | null;
  player2Id: string | null;
  winnerId: string | null;
  status: MatchStatus;
}

/**
 * Result of a pure `projectBracket(matches)` pass.
 *
 * Projection is a *recomputation*, never an incremental append (design §1 D5):
 * every non-first-round slot is cleared and then re-derived from recorded
 * winners and feed links, which is what makes a correction self-healing.
 */
export interface ProjectedState {
  /** One entry per input match, keyed by `id`. */
  matches: ProjectedMatch[];
  /** 1-based index of the earliest round with an unplayed match. */
  currentRound: number;
  /** True once the final match has a winner. */
  isComplete: boolean;
  /** `TournamentPlayer.id` of the champion, or `null`. */
  championId: string | null;
  /**
   * Ids of matches whose projected slots/winner/status differ from the input.
   * Provided so `persistence` can write back only what actually changed.
   */
  changedMatchIds: string[];
}

/** Outcome of a bracket invariant check (`engine.validateBracket`). */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Outcome of `correctResult` (AC 12).
 *
 * `recomputed` is always true on success — correction recomputes the bracket
 * from recorded results rather than unwinding incremental state.
 */
export interface CorrectionResult {
  matchId: string;
  /** Winner before the correction; `null` if the match had no winner yet. */
  previousWinnerId: string | null;
  /** Winner after the correction. */
  winnerId: string;
  /** Operator-supplied reason, persisted to `TournamentMatch.correctionReason`. */
  reason: string;
  /** Whether downstream completed matches were voided as part of the fix. */
  cascade: boolean;
  /** Always true: state was re-derived, not patched. */
  recomputed: boolean;
  /** Ids of downstream matches whose derived slots/winners were cleared. */
  clearedDownstreamMatchIds: string[];
}
