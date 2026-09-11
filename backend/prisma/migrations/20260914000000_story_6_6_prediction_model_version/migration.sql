-- Story 6.6 — Real Predictive Intelligence: per-type prediction-model versioning.
--
-- Problem this fixes (design §0 claim 5, §1 D5):
--   `PredictionModel` carried BOTH a global `version String @unique`
--   (index `prediction_models_version_key`) AND `@@unique([type, version])`
--   (index `prediction_models_type_version_key`). The global uniqueness made
--   `where: { version: 'v1.0' }` ambiguous across types and blocked `demand v1.0`
--   from coexisting with `churn v1.0`.
--
-- This migration is hand-written and **idempotent** — every statement is guarded
-- so it is safe to re-run (Prisma's `migrate deploy` records it once, but the
-- guards also make it replay-safe in a restored / partially-applied database).
--
-- Additive / relax-only:
--   * `DROP INDEX ... version_key` — removes an extra constraint, drops no data.
--   * `accuracy DROP NOT NULL` — relaxing NOT NULL never fails on existing rows.
--   * `ADD COLUMN ... IF NOT EXISTS` — new nullable columns, no default rewrite.
--
-- Reversible: see the rollback block at the bottom.

-- 1. Drop the global unique index on `version` (idempotent).
DROP INDEX IF EXISTS "prediction_models_version_key";

-- 2. Ensure the per-type unique index exists (it is declared as
--    `@@unique([type, version], name: "type_version")` in schema.prisma).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'prediction_models_type_version_key'
  ) THEN
    CREATE UNIQUE INDEX "prediction_models_type_version_key"
      ON "prediction_models" ("type", "version");
  END IF;
END
$$;

-- 3. `accuracy` becomes nullable so a labelled fallback row honestly carries no
--    measured value (design §1 D5, AC 8).
ALTER TABLE "prediction_models" ALTER COLUMN "accuracy" DROP NOT NULL;

-- 4. New columns: honesty tag, held-out metrics, evaluation protocol, feature
--    names (design §1 D6 / D3 / AC 12).
ALTER TABLE "prediction_models"
  ADD COLUMN IF NOT EXISTS "modelKind"          TEXT NOT NULL DEFAULT 'measured',
  ADD COLUMN IF NOT EXISTS "metrics"            JSONB,
  ADD COLUMN IF NOT EXISTS "evaluationProtocol" JSONB,
  ADD COLUMN IF NOT EXISTS "featureNames"       JSONB;

-- Rollback (kept for symmetry with prior migrations):
-- ALTER TABLE "prediction_models" ALTER COLUMN "accuracy" SET NOT NULL;
-- ALTER TABLE "prediction_models"
--   DROP COLUMN IF EXISTS "featureNames",
--   DROP COLUMN IF EXISTS "evaluationProtocol",
--   DROP COLUMN IF EXISTS "metrics",
--   DROP COLUMN IF EXISTS "modelKind";
-- DROP INDEX IF EXISTS "prediction_models_type_version_key";
-- CREATE UNIQUE INDEX "prediction_models_version_key" ON "prediction_models" ("version");
