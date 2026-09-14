/**
 * Story 6.7 T03 — bracket persistence, progression and correction.
 *
 * This module is the **only** place that reads or writes bracket rows. It sits
 * between the pure engine (`./engine`) and the service facade
 * (`../tournamentBracketService`), and it owns three concerns:
 *
 *   1. **Persistence** — `persistBracket` turns a generated `TournamentBracket`
 *      into `tournament_rounds` + `tournament_matches` rows, inside a single
 *      `$transaction`, in a fixed number of statements regardless of field size
 *      (design §6).
 *   2. **Projection** — `getBracketState`, `applyResult` and `correctResult` all
 *      derive the live bracket by calling the pure `projectBracket` over the
 *      recorded results (design §1 D5). Progression is **never** an incremental
 *      append: state is *recomputed*, so a correction self-heals and re-applying
 *      a result is a no-op.
 *   3. **Finalisation** — when the final match is decided the champion is written
 *      to `tournament_results`, the tournament flips to `COMPLETED` and the two
 *      finalists get `finalRank` 1/2. If a later correction un-decides the final,
 *      that is undone (the result row is removed and the tournament reverts to
 *      `IN_PROGRESS`).
 *
 * ── Why the synthetic-id remap matters (T02 handoff #1) ─────────────────────
 *
 * The engine gives each generated match a *synthetic* id
 * (`<tournamentId>-<SIDE>-R<round>-M<match>`) and its `feedMatch1Id` /
 * `feedMatch2Id` reference those synthetic ids. The database assigns real cuids
 * on insert, so `persistBracket` must translate **every** feed reference to the
 * stored cuid *after* the insert. Persisting the synthetic strings would leave
 * dangling feed links and progression would silently die — so the remap is done
 * explicitly here and proven by `__tests__/correction.test.ts`, which reads the
 * rows back and resolves each feed link to a real row.
 *
 * ── Why the match slots are read back through `projectBracket` ──────────────
 *
 * The database enum `TournamentMatchStatus` has no `PENDING` or `BYE`, so a
 * stored row cannot express those domain states directly. `deriveDomainStatus`
 * reconstructs them from the slot/winner contents using exactly the rules
 * `projectBracket` applies, which keeps the "what changed?" diff honest: a
 * stored bye round-trips as a bye, so it is never reported as a spurious change.
 *
 * `persistBracket` uses `createManyAndReturn` for rounds and matches (one
 * statement each) and a single `UPDATE ... FROM (VALUES …)` for the feed-link
 * remap. Three statements, independent of player count — see `persistBracket`.
 */

import { Prisma } from '@prisma/client';
import type { TournamentMatchStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { getBracketRoundName, projectBracket } from './engine';
import type {
  BracketMatch,
  BracketSide,
  CorrectionResult,
  MatchStatus,
  PlayerSeed,
  ProjectedMatch,
  ProjectedState,
  RoundStatus,
  StoredMatch,
  TournamentBracket,
  TournamentFormat,
} from './types';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * A bracket-domain failure that carries an HTTP-mappable `statusCode`, so a
 * route can turn it into a 4xx/5xx response instead of an unhandled 500.
 *
 * This is deliberately defined here (the persistence/validation layer) rather
 * than in `types.ts`, which is kept type-only so the `bracket/` barrel stays
 * free of runtime side effects.
 */
export class BracketError extends Error {
  /** Stable machine-readable code, e.g. `DOWNSTREAM_COMPLETED`. */
  readonly code: string;
  /** Suggested HTTP status, e.g. `409`. */
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.name = 'BracketError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

// ---------------------------------------------------------------------------
// Domain <-> database status mapping
// ---------------------------------------------------------------------------

/** Map a domain status onto the database enum (`PENDING`/`BYE` have no column). */
function toDbStatus(status: MatchStatus): TournamentMatchStatus {
  switch (status) {
    case 'PENDING':
      return 'SCHEDULED';
    case 'BYE':
      return 'COMPLETED';
    default:
      return status as TournamentMatchStatus;
  }
}

/**
 * Reconstruct the canonical domain status of a stored row.
 *
 * This mirrors `projectBracket`'s decision procedure exactly, so a match whose
 * slots did not change reports the same status before and after projection and
 * is therefore never written back needlessly.
 */
function deriveDomainStatus(
  dbStatus: TournamentMatchStatus,
  player1Id: string | null,
  player2Id: string | null,
  winnerId: string | null,
  feedMatch1Id: string | null,
  feedMatch2Id: string | null,
): MatchStatus {
  if (dbStatus === 'CANCELLED') return 'CANCELLED';

  if (player1Id && player2Id) {
    const winnerIsValid = winnerId === player1Id || winnerId === player2Id;
    if (winnerIsValid) return dbStatus === 'WALKOVER' ? 'WALKOVER' : 'COMPLETED';
    return dbStatus === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'SCHEDULED';
  }

  const selfPaired = !feedMatch1Id && !feedMatch2Id;
  if (selfPaired && (player1Id || player2Id)) return 'BYE';
  return 'PENDING';
}

/** True for statuses that mean "this match will not change again". */
function isTerminal(status: MatchStatus): boolean {
  return status === 'COMPLETED' || status === 'BYE' || status === 'CANCELLED' || status === 'WALKOVER';
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Key a match by (round, match) — unique within a tournament. */
function slotKey(round: number, match: number): string {
  return `${round}:${match}`;
}

/** Round type for the database, derived from the bracket format. */
function roundTypeFor(format: TournamentFormat): 'ELIMINATION' | 'ROUND_ROBIN' | 'SWISS' {
  if (format === 'ROUND_ROBIN') return 'ROUND_ROBIN';
  if (format === 'SWISS') return 'SWISS';
  return 'ELIMINATION';
}

/** The sub-bracket a round belongs to (rounds are homogeneous in this engine). */
function roundSide(roundMatches: BracketMatch[]): BracketSide {
  return roundMatches[0]?.bracket ?? 'WINNERS';
}

/**
 * Human-readable round name.
 *
 * Elimination brackets are named relative to the bracket size (via the engine);
 * round robin and Swiss rounds have no "round of N" meaning, so they are named
 * positionally.
 */
function roundNameFor(bracket: TournamentBracket, side: BracketSide, roundNumber: number): string {
  if (bracket.format === 'DOUBLE_ELIMINATION') {
    const winnersRounds = Math.max(1, Math.round(Math.log2(Math.max(2, bracket.totalPlayers))));
    if (side === 'LOSERS') {
      return getBracketRoundName('LOSERS', roundNumber - winnersRounds, winnersRounds);
    }
    return getBracketRoundName(side, roundNumber, winnersRounds);
  }
  if (bracket.format === 'SINGLE_ELIMINATION') {
    return getBracketRoundName('WINNERS', roundNumber, bracket.totalRounds);
  }
  return `Round ${roundNumber}`;
}

/**
 * Resolve the sub-bracket of a stored round.
 *
 * `TournamentMatch` has no `bracket` column, so the side is re-derived from the
 * format and the round's position: for double elimination rounds `1..log2(n)`
 * are the winners bracket, the last round is the grand final, and everything in
 * between is the losers bracket. Every other format is all-winners.
 */
function makeSideResolver(
  format: TournamentFormat,
  totalPlayers: number,
  totalRounds: number,
): (roundNumber: number) => BracketSide {
  if (format !== 'DOUBLE_ELIMINATION') {
    return () => 'WINNERS';
  }
  const winnersRounds = Math.max(1, Math.round(Math.log2(Math.max(2, totalPlayers))));
  return (roundNumber: number): BracketSide => {
    if (roundNumber === totalRounds) return 'GRAND_FINAL';
    if (roundNumber <= winnersRounds) return 'WINNERS';
    return 'LOSERS';
  };
}

/**
 * Parse a free-text score line (`"21-19 21-15"`) into the `gameScores` JSON
 * shape. Returns `undefined` when the line is absent or unparseable, so a
 * malformed score never overwrites a stored one.
 */
function parseScoreToGameScores(score?: string): Prisma.InputJsonValue | undefined {
  if (!score || !score.trim()) return undefined;
  const parts = score.trim().split(/\s+/);
  const games: Array<{ player1Score: number; player2Score: number }> = [];
  for (const part of parts) {
    const match = /^(\d+)-(\d+)$/.exec(part);
    if (!match) return undefined;
    games.push({ player1Score: Number(match[1]), player2Score: Number(match[2]) });
  }
  return games.length > 0 ? (games as unknown as Prisma.InputJsonValue) : undefined;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Persist a generated bracket.
 *
 * Runs inside a single `$transaction` and uses a **fixed three statements** for
 * the structural write regardless of field size (design §6 / AC 16):
 *
 *   1. `createManyAndReturn` the rounds → the `roundNumber -> roundId` map.
 *   2. `createManyAndReturn` the matches (feed links omitted) → the
 *      `(round, match) -> id` map, which is how the synthetic ids are resolved.
 *   3. one `UPDATE … FROM (VALUES …)` that rewrites `feedMatch1Id` /
 *      `feedMatch2Id` from the synthetic ids to the stored cuids.
 *
 * A fourth step then runs a projection pass so the persisted rows are
 * internally consistent the moment the bracket exists (bye winners advance
 * immediately instead of only appearing once `getBracketState` projects them).
 *
 * The remap (step 3) is the critical one: the engine's feed links reference
 * synthetic ids, and a bracket persisted without the translation would have
 * dangling links and would never progress.
 */
export async function persistBracket(bracket: TournamentBracket): Promise<void> {
  const allMatches = bracket.bracket.flat();
  if (allMatches.length === 0) {
    throw new BracketError('EMPTY_BRACKET', 400, 'Cannot persist a bracket with no matches');
  }

  await prisma.$transaction(async (tx) => {
    // ---- 1. Rounds --------------------------------------------------------
    const roundRows = await tx.tournamentRound.createManyAndReturn({
      data: bracket.bracket.map((roundMatches, index) => {
        const roundNumber = index + 1;
        const side = roundSide(roundMatches);
        return {
          tournamentId: bracket.tournamentId,
          roundNumber,
          roundName: roundNameFor(bracket, side, roundNumber),
          roundType: roundTypeFor(bracket.format),
          matchesRequired: roundMatches.length,
          playersAdvancing:
            bracket.format === 'ROUND_ROBIN' || bracket.format === 'SWISS' ? null : roundMatches.length,
          status: 'PENDING' as RoundStatus,
        };
      }),
      select: { id: true, roundNumber: true },
    });
    const roundIdByNumber = new Map(roundRows.map((row) => [row.roundNumber, row.id]));
    const roundNumberByRoundId = new Map(roundRows.map((row) => [row.id, row.roundNumber]));

    // ---- 2. Matches (feed links wired in step 3) --------------------------
    const matchRows = await tx.tournamentMatch.createManyAndReturn({
      data: allMatches.map((match) => ({
        tournamentId: bracket.tournamentId,
        roundId: roundIdByNumber.get(match.round) ?? null,
        matchNumber: match.match,
        player1Id: match.player1Id,
        player2Id: match.player2Id,
        winnerId: match.winnerId,
        status: toDbStatus(match.status),
      })),
      select: { id: true, roundId: true, matchNumber: true },
    });

    // Synthetic id -> (round, match); then (round, match) -> stored cuid.
    const slotBySyntheticId = new Map<string, string>();
    for (const match of allMatches) {
      slotBySyntheticId.set(match.id, slotKey(match.round, match.match));
    }
    const storedIdBySlot = new Map<string, string>();
    for (const row of matchRows) {
      if (!row.roundId) continue;
      const roundNumber = roundNumberByRoundId.get(row.roundId);
      if (roundNumber == null) continue;
      storedIdBySlot.set(slotKey(roundNumber, row.matchNumber), row.id);
    }
    const resolveStoredId = (syntheticId: string | null): string | null => {
      if (!syntheticId) return null;
      const slot = slotBySyntheticId.get(syntheticId);
      if (!slot) return null;
      return storedIdBySlot.get(slot) ?? null;
    };

    // ---- 3. Remap feed links synthetic id -> stored cuid ------------------
    const feedUpdates: Array<{ id: string; feedMatch1Id: string | null; feedMatch2Id: string | null }> = [];
    for (const match of allMatches) {
      if (!match.feedMatch1Id && !match.feedMatch2Id) continue;
      const storedId = storedIdBySlot.get(slotKey(match.round, match.match));
      if (!storedId) continue;
      feedUpdates.push({
        id: storedId,
        feedMatch1Id: resolveStoredId(match.feedMatch1Id),
        feedMatch2Id: resolveStoredId(match.feedMatch2Id),
      });
    }

    if (feedUpdates.length > 0) {
      const values = Prisma.join(
        feedUpdates.map(
          (update) =>
            Prisma.sql`(${update.id}::text, ${update.feedMatch1Id}::text, ${update.feedMatch2Id}::text)`,
        ),
      );
      await tx.$executeRaw(Prisma.sql`
        UPDATE "tournament_matches" AS m
        SET "feedMatch1Id" = v.f1, "feedMatch2Id" = v.f2
        FROM (VALUES ${values}) AS v(id, f1, f2)
        WHERE m.id = v.id
      `);
    }

    // ---- 4. Materialise derived state (bye auto-advance) ------------------
    // Byes are decided at generation time, so their winners must be written
    // into the next round immediately. Without this the persisted rows would
    // disagree with what `getBracketState` projects until the first result is
    // recorded — a bye would look un-advanced to anything reading the table.
    const context = await loadProjection(tx, bracket.tournamentId);
    await writeBackProjection(tx, context.projected);
    await updateRoundStatuses(tx, context);
  });
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * Read a tournament's bracket back as a fully-projected `TournamentBracket`.
 *
 * Returns `null` when the tournament does not exist or has no bracket yet (no
 * rounds), so a route can answer 404 rather than inventing an empty bracket.
 *
 * The returned shape populates the three additive fields the engine declares —
 * `format`, `totalMatches` and `byePlayers` (T02 handoff #2) — so callers do not
 * have to recompute them.
 */
export async function getBracketState(tournamentId: string): Promise<TournamentBracket | null> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      players: { select: { id: true, seed: true } },
      rounds: {
        orderBy: { roundNumber: 'asc' },
        include: {
          matches: {
            orderBy: { matchNumber: 'asc' },
            include: {
              player1: { select: { id: true, playerName: true } },
              player2: { select: { id: true, playerName: true } },
            },
          },
        },
      },
    },
  });

  if (!tournament || tournament.rounds.length === 0) return null;

  const format = tournament.tournamentType as TournamentFormat;
  const totalPlayers = tournament.players.length;
  const sideFor = makeSideResolver(format, totalPlayers, tournament.rounds.length);
  const nameById = new Map<string, string>();

  const stored: StoredMatch[] = tournament.rounds.flatMap((round) =>
    round.matches.map((match) => {
      if (match.player1) nameById.set(match.player1.id, match.player1.playerName);
      if (match.player2) nameById.set(match.player2.id, match.player2.playerName);
      return {
        id: match.id,
        tournamentId,
        roundId: match.roundId,
        roundNumber: round.roundNumber,
        matchNumber: match.matchNumber,
        player1Id: match.player1Id,
        player2Id: match.player2Id,
        winnerId: match.winnerId,
        status: deriveDomainStatus(
          match.status,
          match.player1Id,
          match.player2Id,
          match.winnerId,
          match.feedMatch1Id,
          match.feedMatch2Id,
        ),
        feedMatch1Id: match.feedMatch1Id,
        feedMatch2Id: match.feedMatch2Id,
        bracket: sideFor(round.roundNumber),
      };
    }),
  );

  const projected = projectBracket(stored);
  const projectedById = new Map(projected.matches.map((match) => [match.id, match]));

  const bracket: BracketMatch[][] = tournament.rounds.map((round) =>
    round.matches.map((match) => {
      const projectedMatch = projectedById.get(match.id) as ProjectedMatch;
      return {
        id: match.id,
        round: round.roundNumber,
        match: match.matchNumber,
        player1Id: projectedMatch.player1Id,
        player2Id: projectedMatch.player2Id,
        winnerId: projectedMatch.winnerId,
        status: projectedMatch.status,
        feedMatch1Id: match.feedMatch1Id,
        feedMatch2Id: match.feedMatch2Id,
        bracket: sideFor(round.roundNumber),
        player1Name: match.player1?.playerName,
        player2Name: match.player2?.playerName,
        winnerName: projectedMatch.winnerId ? nameById.get(projectedMatch.winnerId) : undefined,
        court: match.courtName ?? undefined,
        scheduledTime: match.scheduledAt ?? undefined,
        correctedAt: match.correctedAt,
        correctionReason: match.correctionReason,
      };
    }),
  );

  const seedById = new Map(tournament.players.map((player) => [player.id, player.seed]));
  const byePlayers = deriveByePlayers(bracket, seedById);

  return {
    tournamentId,
    totalRounds: bracket.length,
    totalPlayers,
    bracket,
    currentRound: projected.currentRound,
    isComplete: projected.isComplete,
    format,
    totalMatches: stored.length,
    byePlayers,
  };
}

/** Players who received a first-round bye, highest seed first. */
function deriveByePlayers(bracket: BracketMatch[][], seedById: Map<string, number | null>): string[] {
  const firstRound = bracket[0] ?? [];
  const byeIds: string[] = [];
  for (const match of firstRound) {
    if (match.status !== 'BYE') continue;
    const playerId = match.player1Id ?? match.player2Id;
    if (playerId) byeIds.push(playerId);
  }
  return byeIds.sort((a, b) => {
    const seedA = seedById.get(a) ?? Number.POSITIVE_INFINITY;
    const seedB = seedById.get(b) ?? Number.POSITIVE_INFINITY;
    return seedA - seedB;
  });
}

// ---------------------------------------------------------------------------
// Seed data (players + format) for generation
// ---------------------------------------------------------------------------

/** Everything the engine needs to generate a tournament's bracket. */
export interface BracketSeedData {
  tournamentId: string;
  format: TournamentFormat;
  players: PlayerSeed[];
}

/**
 * Load a tournament's registered players (seeded) and its format.
 *
 * Used by the facade's `generateAndPersistForTournament` so the route never has
 * to know how a `TournamentPlayer` row maps onto the engine's `PlayerSeed`.
 * Returns `null` when the tournament does not exist.
 */
export async function loadBracketSeedData(tournamentId: string): Promise<BracketSeedData | null> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { players: { orderBy: { seed: 'asc' } } },
  });
  if (!tournament) return null;

  return {
    tournamentId,
    format: tournament.tournamentType as TournamentFormat,
    players: tournament.players.map((player) => ({
      id: player.id,
      name: player.playerName,
      seed: player.seed,
      winRate: player.winRate,
      totalMatches: player.totalMatches,
      skillLevel: player.skillLevel,
    })),
  };
}

// ---------------------------------------------------------------------------
// Projection context
// ---------------------------------------------------------------------------

/** Everything a projection pass needs, loaded once per transaction. */
interface ProjectionContext {
  tournamentId: string;
  format: TournamentFormat;
  stored: StoredMatch[];
  storedById: Map<string, StoredMatch>;
  roundRows: Array<{ id: string; roundNumber: number }>;
  projected: ProjectedState;
  projectedById: Map<string, ProjectedMatch>;
}

/** Load a tournament's rows and run the pure projection over them. */
async function loadProjection(
  tx: Prisma.TransactionClient,
  tournamentId: string,
): Promise<ProjectionContext> {
  const tournament = await tx.tournament.findUnique({
    where: { id: tournamentId },
    select: { tournamentType: true, _count: { select: { players: true } } },
  });
  if (!tournament) {
    throw new BracketError('TOURNAMENT_NOT_FOUND', 404, `Tournament ${tournamentId} not found`);
  }

  const rounds = await tx.tournamentRound.findMany({
    where: { tournamentId },
    orderBy: { roundNumber: 'asc' },
    include: { matches: { orderBy: { matchNumber: 'asc' } } },
  });

  const format = tournament.tournamentType as TournamentFormat;
  const sideFor = makeSideResolver(format, tournament._count.players, rounds.length);

  const stored: StoredMatch[] = rounds.flatMap((round) =>
    round.matches.map((match) => ({
      id: match.id,
      tournamentId,
      roundId: match.roundId,
      roundNumber: round.roundNumber,
      matchNumber: match.matchNumber,
      player1Id: match.player1Id,
      player2Id: match.player2Id,
      winnerId: match.winnerId,
      status: deriveDomainStatus(
        match.status,
        match.player1Id,
        match.player2Id,
        match.winnerId,
        match.feedMatch1Id,
        match.feedMatch2Id,
      ),
      feedMatch1Id: match.feedMatch1Id,
      feedMatch2Id: match.feedMatch2Id,
      bracket: sideFor(round.roundNumber),
    })),
  );

  const projected = projectBracket(stored);

  return {
    tournamentId,
    format,
    stored,
    storedById: new Map(stored.map((match) => [match.id, match])),
    roundRows: rounds.map((round) => ({ id: round.id, roundNumber: round.roundNumber })),
    projected,
    projectedById: new Map(projected.matches.map((match) => [match.id, match])),
  };
}

/** Write back only the matches whose projected slots/winner/status changed. */
async function writeBackProjection(
  tx: Prisma.TransactionClient,
  projected: ProjectedState,
): Promise<void> {
  const changed = new Set(projected.changedMatchIds);
  for (const match of projected.matches) {
    if (!changed.has(match.id)) continue;
    await tx.tournamentMatch.update({
      where: { id: match.id },
      data: {
        player1Id: match.player1Id,
        player2Id: match.player2Id,
        winnerId: match.winnerId,
        status: toDbStatus(match.status),
      },
    });
  }
}

/** Recompute and persist the status of every round from its projected matches. */
async function updateRoundStatuses(
  tx: Prisma.TransactionClient,
  context: ProjectionContext,
): Promise<void> {
  const matchesByRound = new Map<number, ProjectedMatch[]>();
  for (const stored of context.stored) {
    const projectedMatch = context.projectedById.get(stored.id) as ProjectedMatch;
    const bucket = matchesByRound.get(stored.roundNumber);
    if (bucket) bucket.push(projectedMatch);
    else matchesByRound.set(stored.roundNumber, [projectedMatch]);
  }

  for (const round of context.roundRows) {
    const matches = matchesByRound.get(round.roundNumber) ?? [];
    let status: RoundStatus = 'PENDING';
    if (matches.length > 0 && matches.every((match) => isTerminal(match.status))) {
      status = 'COMPLETED';
    } else if (matches.some((match) => isTerminal(match.status) || match.status === 'IN_PROGRESS')) {
      status = 'IN_PROGRESS';
    }
    await tx.tournamentRound.update({ where: { id: round.id }, data: { status } });
  }
}

/**
 * Write (or un-write) the tournament's final state.
 *
 * When the final match has a decided winner the champion and runner-up are
 * recorded, the tournament flips to `COMPLETED`, and the two finalists get
 * `finalRank` 1 and 2. When the final is *not* decided — which happens after a
 * cascading correction voids it — any previously written result row is removed
 * and the tournament reverts to `IN_PROGRESS`, so a corrected bracket cannot
 * leave a stale champion behind.
 */
async function finalize(
  tx: Prisma.TransactionClient,
  context: ProjectionContext,
): Promise<void> {
  const lastRoundNumber = context.roundRows.reduce(
    (max, round) => (round.roundNumber > max ? round.roundNumber : max),
    0,
  );
  const lastRoundMatches = context.stored
    .filter((match) => match.roundNumber === lastRoundNumber)
    .map((match) => context.projectedById.get(match.id) as ProjectedMatch);
  const finalMatch = lastRoundMatches.length === 1 ? lastRoundMatches[0] : undefined;

  if (context.projected.isComplete && finalMatch && finalMatch.winnerId) {
    const championId = finalMatch.winnerId;
    const champion = await tx.tournamentPlayer.findUnique({ where: { id: championId } });
    const totalMatches = context.stored.length;

    await tx.tournamentResult.upsert({
      where: { tournamentId: context.tournamentId },
      create: {
        tournamentId: context.tournamentId,
        winnerId: championId,
        winnerName: champion?.playerName ?? null,
        completedAt: new Date(),
        totalMatches,
      },
      update: {
        winnerId: championId,
        winnerName: champion?.playerName ?? null,
        completedAt: new Date(),
        totalMatches,
      },
    });

    await tx.tournament.update({
      where: { id: context.tournamentId },
      data: { status: 'COMPLETED' },
    });

    await tx.tournamentPlayer.update({ where: { id: championId }, data: { finalRank: 1 } });
    const runnerUpId =
      finalMatch.player1Id === championId ? finalMatch.player2Id : finalMatch.player1Id;
    if (runnerUpId) {
      await tx.tournamentPlayer.update({ where: { id: runnerUpId }, data: { finalRank: 2 } });
    }
    return;
  }

  const existing = await tx.tournamentResult.findUnique({
    where: { tournamentId: context.tournamentId },
  });
  if (existing) {
    await tx.tournamentResult.delete({ where: { tournamentId: context.tournamentId } });
    await tx.tournament.update({
      where: { id: context.tournamentId },
      data: { status: 'IN_PROGRESS' },
    });
  }
}

// ---------------------------------------------------------------------------
// Downstream traversal & clearing
// ---------------------------------------------------------------------------

/** Transitive closure of every match fed (directly or indirectly) by `matchId`. */
function collectDownstream(stored: StoredMatch[], matchId: string): Set<string> {
  const targetsByFeeder = new Map<string, string[]>();
  for (const match of stored) {
    for (const feed of [match.feedMatch1Id, match.feedMatch2Id]) {
      if (!feed) continue;
      const bucket = targetsByFeeder.get(feed);
      if (bucket) bucket.push(match.id);
      else targetsByFeeder.set(feed, [match.id]);
    }
  }

  const downstream = new Set<string>();
  const queue: string[] = [matchId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const target of targetsByFeeder.get(current) ?? []) {
      if (downstream.has(target)) continue;
      downstream.add(target);
      queue.push(target);
    }
  }
  return downstream;
}

/**
 * Void every recorded downstream result (winner + status) for the matches that
 * depend on `matchId`, returning the ids that were actually cleared.
 *
 * This is the cascade primitive behind `correctResult` and the public
 * `clearDerivedDownstream`. Because slots are re-derived by projection, voiding
 * a downstream *recorded winner* is all that is needed — the stale slots then
 * disappear on the next projection pass.
 */
async function voidDownstream(
  tx: Prisma.TransactionClient,
  stored: StoredMatch[],
  matchId: string,
): Promise<string[]> {
  const downstream = collectDownstream(stored, matchId);
  const cleared: string[] = [];
  for (const match of stored) {
    if (!downstream.has(match.id) || !match.winnerId) continue;
    await tx.tournamentMatch.update({
      where: { id: match.id },
      data: { winnerId: null, status: 'SCHEDULED', gameScores: Prisma.DbNull },
    });
    cleared.push(match.id);
  }
  return cleared;
}

/**
 * Clear every downstream result that depends on `matchId` and re-project.
 *
 * Exposed for callers that need to invalidate a subtree without immediately
 * recording a replacement winner (design §4 `clearDerivedDownstream`).
 */
export async function clearDerivedDownstream(
  tournamentId: string,
  matchId: string,
): Promise<string[]> {
  return prisma.$transaction(async (tx) => {
    const before = await loadProjection(tx, tournamentId);
    const cleared = await voidDownstream(tx, before.stored, matchId);
    const after = await loadProjection(tx, tournamentId);
    await writeBackProjection(tx, after.projected);
    await updateRoundStatuses(tx, after);
    await finalize(tx, after);
    return cleared;
  });
}

// ---------------------------------------------------------------------------
// Progression
// ---------------------------------------------------------------------------

/**
 * Record a match result and re-project the bracket (design §5 flow B).
 *
 * Idempotent: re-applying the same result recomputes the same state and writes
 * nothing new. The winner must be one of the match's two current occupants and
 * both slots must be filled — a bye or a not-yet-decided placeholder cannot
 * receive a result.
 */
export async function applyResult(matchId: string, winnerId: string, score?: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const match = await tx.tournamentMatch.findUnique({ where: { id: matchId } });
    if (!match) {
      throw new BracketError('MATCH_NOT_FOUND', 404, `Match ${matchId} not found`);
    }

    const occupants = [match.player1Id, match.player2Id].filter(
      (id): id is string => typeof id === 'string',
    );
    if (occupants.length < 2) {
      throw new BracketError(
        'MATCH_NOT_READY',
        400,
        `Match ${matchId} does not have two players yet (bye or undecided placeholder)`,
      );
    }
    if (!occupants.includes(winnerId)) {
      throw new BracketError(
        'INVALID_WINNER',
        400,
        `winnerId ${winnerId} is not one of match ${matchId}'s two players`,
      );
    }

    const gameScores = parseScoreToGameScores(score);
    await tx.tournamentMatch.update({
      where: { id: matchId },
      data: {
        winnerId,
        status: 'COMPLETED',
        ...(gameScores ? { gameScores } : {}),
      },
    });

    const context = await loadProjection(tx, match.tournamentId);
    await writeBackProjection(tx, context.projected);
    await updateRoundStatuses(tx, context);
    await finalize(tx, context);
  });
}

// ---------------------------------------------------------------------------
// Correction (AC 12)
// ---------------------------------------------------------------------------

/**
 * Correct a recorded result and self-heal the bracket (design §1 D5, AC 12).
 *
 * Steps:
 *   1. Reject the correction if any **downstream** match is already completed,
 *      unless `cascade` is set (the `DOWNSTREAM_COMPLETED` guard).
 *   2. Set the corrected match's new winner and stamp the audit columns
 *      (`correctedAt` / `correctionReason`).
 *   3. On the cascade path, void the downstream recorded results.
 *   4. Re-project — because state is *recomputed*, the stale winner disappears
 *      from every downstream slot with no incremental unwinding.
 *   5. Persist round/tournament status, un-finalising the tournament if the
 *      correction un-decides the final.
 *
 * There is deliberately no "revert" bookkeeping: the re-projection is the fix.
 */
export async function correctResult(
  matchId: string,
  winnerId: string,
  reason: string,
  cascade = false,
): Promise<CorrectionResult> {
  return prisma.$transaction(async (tx) => {
    const match = await tx.tournamentMatch.findUnique({ where: { id: matchId } });
    if (!match) {
      throw new BracketError('MATCH_NOT_FOUND', 404, `Match ${matchId} not found`);
    }

    const occupants = [match.player1Id, match.player2Id].filter(
      (id): id is string => typeof id === 'string',
    );
    if (occupants.length < 2) {
      throw new BracketError(
        'MATCH_NOT_READY',
        400,
        `Match ${matchId} does not have two players yet (bye or undecided placeholder)`,
      );
    }
    if (!occupants.includes(winnerId)) {
      throw new BracketError(
        'INVALID_WINNER',
        400,
        `winnerId ${winnerId} is not one of match ${matchId}'s two players`,
      );
    }

    const previousWinnerId = match.winnerId;

    // ---- 1. Downstream guard (evaluated against the pre-correction state) --
    const before = await loadProjection(tx, match.tournamentId);
    const downstreamIds = collectDownstream(before.stored, matchId);
    const completedDownstream = before.stored.filter(
      (stored) =>
        downstreamIds.has(stored.id) &&
        (stored.status === 'COMPLETED' || stored.status === 'WALKOVER') &&
        stored.winnerId,
    );
    if (completedDownstream.length > 0 && !cascade) {
      throw new BracketError(
        'DOWNSTREAM_COMPLETED',
        409,
        `Cannot correct match ${matchId}: ${completedDownstream.length} downstream match(es) ` +
          'are already completed. Retry with cascade=true to void them.',
      );
    }

    // ---- 2. Set the new winner + audit trail ------------------------------
    await tx.tournamentMatch.update({
      where: { id: matchId },
      data: {
        winnerId,
        status: 'COMPLETED',
        correctedAt: new Date(),
        correctionReason: reason,
      },
    });

    // ---- 3. Cascade: void downstream recorded results ---------------------
    const clearedDownstreamMatchIds: string[] = [];
    if (cascade) {
      clearedDownstreamMatchIds.push(...(await voidDownstream(tx, before.stored, matchId)));
    }

    // ---- 4. Re-project (self-healing) -------------------------------------
    const after = await loadProjection(tx, match.tournamentId);
    await writeBackProjection(tx, after.projected);
    for (const id of after.projected.changedMatchIds) {
      if (downstreamIds.has(id) && !clearedDownstreamMatchIds.includes(id)) {
        clearedDownstreamMatchIds.push(id);
      }
    }

    // ---- 5. Persist status / un-finalise if needed ------------------------
    await updateRoundStatuses(tx, after);
    await finalize(tx, after);

    return {
      matchId,
      previousWinnerId,
      winnerId,
      reason,
      cascade,
      recomputed: true,
      clearedDownstreamMatchIds,
    };
  });
}
