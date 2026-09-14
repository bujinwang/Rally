/**
 * Story 6.7 T03 — tournament bracket service facade.
 *
 * This file used to *be* the bracket engine: 619 lines of in-memory generation
 * that persisted nothing (design §0 findings 2 and 6) and an `advanceWinnerToNextRound`
 * that picked "the first match with an empty slot" — the source of the three
 * corruption modes QA reproduced (design §0.1). It is now a thin facade:
 *
 *   - **Generation** delegates to the pure engine (`./bracket/engine`), so AC 9
 *     and AC 13 stay testable without a database (design §1 D3).
 *   - **Persistence, progression and correction** delegate to
 *     `./bracket/persistence`, which recomputes state via `projectBracket`
 *     instead of appending to it (design §1 D5).
 *   - **Real-time emission** stays here (Story 6.4, AC 3/AC 7), best-effort, so a
 *     socket outage can never break the business path.
 *
 * The exported names are preserved on purpose (`BracketMatch`,
 * `TournamentBracket`, `BracketGenerationOptions`, `generateBracket`,
 * `updateMatchResult`, `getBracketState`, the singleton) so existing importers
 * keep compiling (design §1 D2 migration path). The domain types are now
 * re-exported from the single canonical module `./bracket/types`.
 *
 * Note on `generateBracket`: it stays **pure** (it returns a bracket and touches
 * no database) so generation correctness can be asserted without a DB. The route
 * persists the result with `persistBracket`, or uses the `generateAndPersistBracket`
 * convenience which is idempotent (it skips when rounds already exist).
 */

import {
  emitLeaderboardUpdate,
  emitMatchComplete,
} from '../socket/events/tournamentAnalytics';
import {
  generateDoubleElimination,
  generateRoundRobin,
  generateSingleElimination,
  generateSwiss,
  validateBracket,
} from './bracket/engine';
import {
  BracketError,
  applyResult as persistApplyResult,
  correctResult as persistCorrectResult,
  getBracketState as persistGetBracketState,
  persistBracket as persistBracketRows,
} from './bracket/persistence';
import type {
  BracketGenerationOptions,
  CorrectionResult,
  TournamentBracket,
  ValidationResult,
} from './bracket/types';

// Re-export the canonical domain types so existing importers of this module keep
// working (design §1 D2). `BracketError` is re-exported so routes can map a
// bracket failure onto an HTTP status.
export type {
  BracketGenerationOptions,
  BracketMatch,
  BracketRound,
  CorrectionResult,
  MatchResult,
  MatchStatus,
  PlayerSeed,
  TournamentBracket,
  TournamentFormat,
  ValidationResult,
} from './bracket/types';
export { BracketError } from './bracket/persistence';

/**
 * Stateless facade over the pure engine and the persistence layer.
 *
 * Kept as a class + singleton for backward compatibility with the previous
 * `tournamentBracketService` shape.
 */
class TournamentBracketService {
  /**
   * Generate a bracket for the given format.
   *
   * Pure: this touches no database and returns a fully-structured
   * `TournamentBracket` whose match ids are synthetic (the engine's ids) and
   * whose feed links reference those synthetic ids. Persist it with
   * `persistBracket`, which remaps the feed links to stored cuids.
   *
   * A structural failure (unsupported format, a non-power-of-two double
   * elimination field) is raised as a {@link BracketError} with a 4xx status so
   * a route can return an actionable error instead of a 500.
   */
  async generateBracket(options: BracketGenerationOptions): Promise<TournamentBracket> {
    const bracket = this.generate(options);
    const validation: ValidationResult = validateBracket(bracket);
    if (!validation.isValid) {
      throw new BracketError(
        'INVALID_BRACKET',
        500,
        `Generated bracket failed validation: ${validation.errors.join('; ')}`,
      );
    }
    return bracket;
  }

  /** Synchronous generation core (no validation) — kept private. */
  private generate(options: BracketGenerationOptions): TournamentBracket {
    try {
      switch (options.tournamentType) {
        case 'SINGLE_ELIMINATION':
          return generateSingleElimination(options);
        case 'DOUBLE_ELIMINATION':
          return generateDoubleElimination(options);
        case 'ROUND_ROBIN':
          return generateRoundRobin(options);
        case 'SWISS':
          return generateSwiss(options);
        default:
          throw new BracketError(
            'UNSUPPORTED_FORMAT',
            400,
            `Unsupported tournament type: ${String(options.tournamentType)}`,
          );
      }
    } catch (error) {
      if (error instanceof BracketError) throw error;
      // e.g. a non-power-of-two double-elimination field: surface it as a 400
      // rather than an unhandled 500 (T02 handoff #5).
      throw new BracketError(
        'BRACKET_GENERATION_FAILED',
        400,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /** Persist a generated bracket (rounds + matches + feed-link remap). */
  async persistBracket(bracket: TournamentBracket): Promise<void> {
    await persistBracketRows(bracket);
  }

  /**
   * Generate and persist in one step, idempotently: when the tournament already
   * has rounds the existing bracket is returned untouched (design §1 D4 —
   * "if rounds already exist, skip"), so calling it twice never orphans results.
   */
  async generateAndPersistBracket(options: BracketGenerationOptions): Promise<TournamentBracket> {
    const existing = await persistGetBracketState(options.tournamentId);
    if (existing) return existing;

    const bracket = await this.generateBracket(options);
    await persistBracketRows(bracket);
    return bracket;
  }

  /** Read the current (projected) bracket state, or `null` when none exists. */
  async getBracketState(tournamentId: string): Promise<TournamentBracket | null> {
    return persistGetBracketState(tournamentId);
  }

  /**
   * Record a match result and advance the bracket (AC 3, AC 11).
   *
   * Persists first, then re-emits the authoritative state (Story 6.4, AC 3). A
   * `BracketError` from persistence (unknown match, invalid winner, undecided
   * match) propagates unchanged so the route can map it to a status code.
   */
  async updateMatchResult(
    tournamentId: string,
    matchId: string,
    winnerId: string,
    score?: string,
  ): Promise<void> {
    await persistApplyResult(matchId, winnerId, score);
    await this.emitTournamentUpdates(tournamentId, matchId);
  }

  /**
   * Correct a recorded result (AC 12).
   *
   * Delegates the self-healing re-projection to persistence, then re-emits.
   * Without `cascade`, a correction whose downstream matches are already
   * completed is refused with `DOWNSTREAM_COMPLETED`.
   */
  async correctMatchResult(
    tournamentId: string,
    matchId: string,
    winnerId: string,
    reason: string,
    cascade = false,
  ): Promise<CorrectionResult> {
    const result = await persistCorrectResult(matchId, winnerId, reason, cascade);
    await this.emitTournamentUpdates(tournamentId, matchId);
    return result;
  }

  /**
   * Emit the post-write tournament events (Story 6.4, AC 3).
   *
   * Best-effort: any emitter failure is logged but never propagated, so the
   * business path is unaffected by a real-time outage.
   */
  private async emitTournamentUpdates(tournamentId: string, matchId: string): Promise<void> {
    try {
      // `emitMatchComplete` also emits a fresh bracket; standings change on a
      // completed match, so the leaderboard is refreshed too.
      await emitMatchComplete(tournamentId, matchId);
      await emitLeaderboardUpdate(tournamentId);
    } catch (error) {
      console.warn('Failed to emit tournament real-time update:', error);
    }
  }
}

// Export singleton instance
export const tournamentBracketService = new TournamentBracketService();
export default tournamentBracketService;
