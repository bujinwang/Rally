-- Story 6.7 — Tournament Bracket Management: bracket lifecycle support.
--
-- Scope (design §2, "additive only — AC 14"): every statement is either a
-- relaxation or the addition of a NULLABLE column/index/FK. No column is
-- dropped, retyped or given a non-null default, so existing rows and the nine
-- live `routes/tournaments.ts` contracts are unaffected.
--
-- Problems this fixes:
--   1. `TournamentMatch.player1Id`/`player2Id` were NOT NULL with FKs, so a
--      future-round placeholder slot and a bye (one real player) were
--      impossible to persist — which made AC 3 unachievable (design §0
--      finding 11, §1 D5).
--   2. There was no explicit link from a match to the two matches that feed its
--      slots, so winner placement could not be recomputed deterministically
--      after a correction (design §1 D5 / AC 12).
--   3. `Tournament.organizer` is free text and cannot express a resolvable
--      identity, so AC 15 (organizer-only mutation) had nothing to authorize
--      against (design §0 finding 13, §1 D6).
--   4. `TournamentPlayer` had no link to a platform identity, which is the
--      forward path for AC 8 (design §1 D8).
--
-- This migration is hand-written and **idempotent** — every statement is guarded
-- so it is safe to re-run (Prisma's `migrate deploy` records it once, but the
-- guards also make it replay-safe in a restored / partially-applied database).
--
-- Reversible: see the rollback block at the bottom.

-- ---------------------------------------------------------------------------
-- 1. `tournament_matches` — nullable participant slots (relax-only).
--    Dropping NOT NULL never fails on existing rows and drops no data.
-- ---------------------------------------------------------------------------
ALTER TABLE "tournament_matches" ALTER COLUMN "player1Id" DROP NOT NULL;
ALTER TABLE "tournament_matches" ALTER COLUMN "player2Id" DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. `tournament_matches` — bracket feed links + correction audit trail.
-- ---------------------------------------------------------------------------
ALTER TABLE "tournament_matches"
  ADD COLUMN IF NOT EXISTS "feedMatch1Id"     TEXT,
  ADD COLUMN IF NOT EXISTS "feedMatch2Id"     TEXT,
  ADD COLUMN IF NOT EXISTS "correctedAt"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "correctionReason" TEXT;

-- Self-referencing FKs. Optional relation ⇒ Prisma's default referential action
-- is ON DELETE SET NULL (a deleted feeder must not delete its dependents).
-- Guarded by constraint name so a replay is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tournament_matches_feedMatch1Id_fkey'
  ) THEN
    ALTER TABLE "tournament_matches"
      ADD CONSTRAINT "tournament_matches_feedMatch1Id_fkey"
      FOREIGN KEY ("feedMatch1Id") REFERENCES "tournament_matches"("id")
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tournament_matches_feedMatch2Id_fkey'
  ) THEN
    ALTER TABLE "tournament_matches"
      ADD CONSTRAINT "tournament_matches_feedMatch2Id_fkey"
      FOREIGN KEY ("feedMatch2Id") REFERENCES "tournament_matches"("id")
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END
$$;

-- Feed-link lookups are on the projection hot path (every `projectBracket`
-- walks matches by their feed links).
CREATE INDEX IF NOT EXISTS "tournament_matches_feedMatch1Id_idx"
  ON "tournament_matches" ("feedMatch1Id");
CREATE INDEX IF NOT EXISTS "tournament_matches_feedMatch2Id_idx"
  ON "tournament_matches" ("feedMatch2Id");

-- ---------------------------------------------------------------------------
-- 3. `tournaments` — resolvable organizer identity for AC 15 authorization.
--    `organizer` (free text) is intentionally left untouched for back-compat.
-- ---------------------------------------------------------------------------
ALTER TABLE "tournaments"
  ADD COLUMN IF NOT EXISTS "organizerUserId"   TEXT,
  ADD COLUMN IF NOT EXISTS "organizerDeviceId" TEXT;

-- ---------------------------------------------------------------------------
-- 4. `tournament_players` — platform identity link (AC 8 forward path).
--    Nullable and unused until a platform identity exists; nothing is
--    back-filled, so no ranking data is fabricated (design §1 D8, §8).
-- ---------------------------------------------------------------------------
ALTER TABLE "tournament_players"
  ADD COLUMN IF NOT EXISTS "userId" TEXT;

-- ---------------------------------------------------------------------------
-- Rollback (kept for symmetry with prior migrations). Applying this restores
-- the pre-6.7 shape; it will FAIL if any match row has a NULL participant slot,
-- which is the correct, explicit behaviour (a rollback must not silently
-- discard placeholder/bye data).
-- ---------------------------------------------------------------------------
-- ALTER TABLE "tournament_players" DROP COLUMN IF EXISTS "userId";
-- ALTER TABLE "tournaments"
--   DROP COLUMN IF EXISTS "organizerDeviceId",
--   DROP COLUMN IF EXISTS "organizerUserId";
-- DROP INDEX IF EXISTS "tournament_matches_feedMatch2Id_idx";
-- DROP INDEX IF EXISTS "tournament_matches_feedMatch1Id_idx";
-- ALTER TABLE "tournament_matches"
--   DROP CONSTRAINT IF EXISTS "tournament_matches_feedMatch2Id_fkey",
--   DROP CONSTRAINT IF EXISTS "tournament_matches_feedMatch1Id_fkey",
--   DROP COLUMN IF EXISTS "correctionReason",
--   DROP COLUMN IF EXISTS "correctedAt",
--   DROP COLUMN IF EXISTS "feedMatch2Id",
--   DROP COLUMN IF EXISTS "feedMatch1Id";
-- ALTER TABLE "tournament_matches" ALTER COLUMN "player2Id" SET NOT NULL;
-- ALTER TABLE "tournament_matches" ALTER COLUMN "player1Id" SET NOT NULL;
