-- Story 6.9 — NotificationPreferences account key (F1, Option C follow-on).
--
-- `NotificationPreferences` had `playerId` / `deviceId` but no `userId`, so there
-- was no way to key preferences to an authenticated account — the same identity
-- gap F1 fixed for `PushToken`. This adds an additive, nullable `userId` (unique)
-- with a `User` relation, mirroring the PushToken Option-C identity model.
--
-- Safety justification — there is NO data to migrate: `notification_preferences`
-- is EMPTY (0 rows, verified via psql before applying). Adding a nullable column
-- reinterprets no existing row.
--
-- `onDelete: SET NULL` is deliberate and explicit: a user-keyed preferences row
-- must not be deleted (or blocked) when its user is deleted.
--
-- NOTE ON GENERATION (known repo defect, same as 6.8 T02 / 6.9 F1): `prisma
-- migrate dev` cannot run here — the migration history is not replayable from
-- empty, because `20260914000000_story_6_6_prediction_model_version` ALTERs
-- `prediction_models`, a table no earlier migration CREATEs (it was materialised
-- with `db push`), so the shadow database fails with P3006/P1014. The SQL below
-- was produced with `prisma migrate diff --from-schema-datasource …
-- --to-schema-datamodel …` and verified to contain only the intended changes.

ALTER TABLE "public"."notification_preferences" ADD COLUMN "userId" TEXT;

CREATE UNIQUE INDEX "notification_preferences_userId_key" ON "public"."notification_preferences"("userId");

ALTER TABLE "public"."notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
