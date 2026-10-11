-- Device token (Option B, Phase 1) — additive credential store (design §1/§5.4).
--
-- `resolveIdentity` trusted a client-supplied `deviceId` (body ‖ x-device-id),
-- which is a bearer credential in practice: whoever knows an id can act as that
-- device. This table lets the server mint an unforgeable, revocable credential
-- and store only its hash — exactly the `RefreshToken` pattern.
--
-- This migration is ADDITIVE ONLY: it creates the new `device_tokens` table and
-- its indexes. It does NOT ALTER any existing table. `deviceId` values already
-- stored in `mvp_sessions.ownerDeviceId` / `mvp_players.deviceId` are unchanged —
-- a device token maps to the SAME id string, so no column changes are required
-- (design §5.1).
--
-- Safety justification — there is NO data to migrate: `device_tokens` does not
-- yet exist, so no existing row is reinterpreted, and no backfill is possible or
-- needed (guests enrol during the Phase-1 window; existing raw ids keep working
-- through the `device-legacy` branch until Phase 3).
--
-- NOTE ON GENERATION (known repo defect, same as 6.8 T02 / 6.9 F1): `prisma
-- migrate dev` cannot run here — the migration history is not replayable from
-- empty, because `20260914000000_story_6_6_prediction_model_version` ALTERs
-- `prediction_models`, a table no earlier migration CREATEs (it was materialised
-- with `db push`), so the shadow database fails with P3006/P1014. The SQL below
-- was produced with `prisma migrate diff --from-schema-datasource …
-- --to-schema-datamodel …` and verified to contain only the intended changes.

-- CreateTable
CREATE TABLE "public"."device_tokens" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "replacedByTokenId" TEXT,
    "createdByIp" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_tokenHash_key" ON "public"."device_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "device_tokens_deviceId_idx" ON "public"."device_tokens"("deviceId");

-- CreateIndex
CREATE INDEX "device_tokens_expiresAt_idx" ON "public"."device_tokens"("expiresAt");
