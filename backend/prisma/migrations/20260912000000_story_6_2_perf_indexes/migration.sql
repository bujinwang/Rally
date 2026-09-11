-- Story 6.2 — Performance indexes (additive + reversible)
--
-- Adds indexes for the two confirmed hot-path gaps (design Recon #10 / #11):
--   1. GET /mvp-sessions/my-sessions/:deviceId filters on ownerDeviceId + status.
--   2. Device-only player lookups (guest joins, POST /auth/claim, permission
--      checks) filter on MvpPlayer.deviceId.
--
-- The migration is additive (new indexes only; no column/table changes) and
-- reversible (see the DROP INDEX block at the bottom).
--
-- DESIGN NOTE (A7 — CORRECTED POST-QA): The original design note claimed these
-- statements used `CREATE INDEX CONCURRENTLY` and should be applied out-of-band.
-- That assumption was WRONG and the migration could not be applied:
-- `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block
-- (PostgreSQL error 25001), and Prisma Migrate wraps every migration file in a
-- transaction by default — so `prisma migrate deploy` failed with P3018.
--
-- Correction: use plain `CREATE INDEX` (no CONCURRENTLY). It is fully
-- compatible with Prisma's transactional migration runner and is applied
-- atomically with the migration record. It takes a brief write lock on the
-- table while the index builds; that is acceptable for this schema size.
-- If a genuinely huge production table ever needs a non-blocking build, that
-- must be done as a SEPARATE, explicitly non-transactional operation
-- (e.g. `prisma migrate dev --create-only` + manual `psql -f`), NOT by putting
-- CONCURRENTLY inside this file.

-- CreateIndex — Story 6.2: owner-device lookup for my-sessions
CREATE INDEX IF NOT EXISTS "mvp_sessions_ownerDeviceId_idx"
  ON "mvp_sessions" ("ownerDeviceId");

-- CreateIndex — Story 6.2: owner-device + status (my-sessions active filter)
CREATE INDEX IF NOT EXISTS "mvp_sessions_ownerDeviceId_status_idx"
  ON "mvp_sessions" ("ownerDeviceId", "status");

-- CreateIndex — Story 6.2: device-only player lookups
CREATE INDEX IF NOT EXISTS "mvp_players_deviceId_idx"
  ON "mvp_players" ("deviceId");

-- Rollback (reversible):
--   DROP INDEX IF EXISTS "mvp_players_deviceId_idx";
--   DROP INDEX IF EXISTS "mvp_sessions_ownerDeviceId_status_idx";
--   DROP INDEX IF EXISTS "mvp_sessions_ownerDeviceId_idx";
