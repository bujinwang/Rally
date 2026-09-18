-- Story 6.9 — F1 BLOCKER fix: push-token identity (Option C, design §4).
--
-- Problem (design §1 F1): `POST /notifications/register` wrote `playerId: deviceId`,
-- but `PushToken.playerId` was a REQUIRED FK to `mvp_players(id)`. A device id is
-- not a player id, so every call violated `push_tokens_playerId_fkey` (P2003) and
-- the route answered 500 — no client could ever register a push token.
--
-- Fix (Option C — the identity model Story 6.7 established for tournament
-- ownership: `organizerUserId` / `organizerDeviceId`): a push token is keyed to a
-- **user** and/or a **device**, with at least one required. This is a strict
-- superset of "key to device" (Option A) so it serves guests AND account holders,
-- as AC 5 requires ("guest tokens where allowed").
--
-- Safety justification — there is NO data to migrate: `push_tokens` is EMPTY
-- (0 rows, verified via psql before applying). So relaxing `playerId` to nullable
-- and adding `userId` reinterprets no existing row.
--
-- NOTE ON GENERATION (known repo defect, same as 6.8 T02): `prisma migrate dev`
-- cannot run here — the migration history is not replayable from empty, because
-- `20260914000000_story_6_6_prediction_model_version` ALTERs `prediction_models`,
-- a table no earlier migration CREATEs (it was materialised with `db push`), so
-- the shadow database fails with P3006/P1014. The SQL below was produced with
-- `prisma migrate diff --from-schema-datasource … --to-schema-datamodel …` and
-- verified to contain only the intended changes; the CHECK constraint (which
-- Prisma does not model) is added by hand.

-- 1. `playerId` becomes legacy/nullable — it is no longer written by the route.
ALTER TABLE "public"."push_tokens" ALTER COLUMN "playerId" DROP NOT NULL;

-- 2. Repoint the player FK's delete behaviour to SET NULL: a device/account-keyed
--    token must NOT be deleted when its (legacy) player row is deleted. Pinned
--    explicitly — never rely on Prisma's default for an optional relation.
ALTER TABLE "public"."push_tokens" DROP CONSTRAINT "push_tokens_playerId_fkey";
ALTER TABLE "public"."push_tokens" ADD CONSTRAINT "push_tokens_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."mvp_players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Additive account identity.
ALTER TABLE "public"."push_tokens" ADD COLUMN "userId" TEXT;
CREATE INDEX "push_tokens_userId_idx" ON "public"."push_tokens"("userId");
ALTER TABLE "public"."push_tokens" ADD CONSTRAINT "push_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. At least one identity must be present. This is the schema-level expression of
--    Option C. The route validates first and returns 400 (not a 500 from this
--    CHECK) when neither identity resolves.
ALTER TABLE "public"."push_tokens"
  ADD CONSTRAINT "push_tokens_identity_present_check"
  CHECK ("userId" IS NOT NULL OR "deviceId" IS NOT NULL);
