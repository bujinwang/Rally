-- Story 6.5 — optimistic-concurrency version token (additive only).
--
-- Adds a monotonic `version` integer to the two entities the offline queue can
-- mutate directly: `mvp_sessions` and `mvp_players` (design §5.3).
--
-- The column is additive and back-compatible:
--   * `NOT NULL DEFAULT 0` — existing rows get v0, no data rewrite beyond the
--     default fill.
--   * Legacy clients that send no `X-Entity-Version` header are unaffected; the
--     `versioning` middleware only enforces a conflict when the header is
--     present (AC 6).
--
-- Reversible: see the DROP COLUMN block at the bottom.

ALTER TABLE "mvp_sessions" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "mvp_players"  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

-- Rollback (kept for symmetry with prior migrations):
-- ALTER TABLE "mvp_sessions" DROP COLUMN "version";
-- ALTER TABLE "mvp_players"  DROP COLUMN "version";
