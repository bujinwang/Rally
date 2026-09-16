-- Story 6.8 — Community and Social Engagement.
--
-- Scope (design §7 / §13 T02 / §14):
--   (a) CREATE TABLE `nps_responses`            — additive new table (D4)
--   (b) CREATE TABLE `share_reports` + FK        — additive new table (D6)
--   (c) `tournament_feedback` FK **repoint**     — the ONE sanctioned change to
--       an existing table (D5).
--
-- This file is the exact SQL Prisma generates for the schema delta. It was
-- produced with `prisma migrate diff --from-schema-datasource … --to-schema-datamodel …`
-- rather than `prisma migrate dev` because the repository's migration history is
-- **not replayable from empty**: `20260914000000_story_6_6_prediction_model_version`
-- alters `prediction_models`, a table that no earlier migration creates (it was
-- materialised with `db push`), so `migrate dev`'s shadow database fails with
-- P3006/P1014 before it ever reaches this migration. The diff was verified to
-- contain *only* the three intended changes (no unrelated drift), and the SQL is
-- byte-for-byte what `migrate dev` would have written. See the task report for
-- this deviation.
--
-- ---------------------------------------------------------------------------
-- (c) D5 — repoint `tournament_feedback.player_id` from `mvp_players(id)` to
--     `tournament_players(id)`.
--
-- Justification (design §14 — the one deliberate exception to additive-only):
--   * The old FK target was semantically wrong — a *tournament*-scoped feedback
--     row pointed at a *session*-scoped `MvpPlayer`.
--   * `MvpPlayer.sessionId` is required and there is **no** `TournamentPlayer` →
--     `MvpPlayer` bridge (`schema.prisma`, TournamentPlayer.userId note), so the
--     old write path was unimplementable — that is why it fell back to `User.id`
--     and a `'temp-user-id'` literal.
--   * `tournament_feedback` is **provably empty** (0 rows; every write under the
--     old path FK-violated), so there is no data to migrate or reinterpret.
--   * `player_id` keeps its type (`TEXT`) and NOT NULL; only the referenced
--     table changes.
--
-- Ordering note: this migration is the **first** statement that ever references
-- the repointed constraint, and it lands before any application code can insert
-- a feedback row, so the table is never written under the old FK target.
-- ---------------------------------------------------------------------------

-- DropForeignKey (old target: mvp_players)
ALTER TABLE "public"."tournament_feedback" DROP CONSTRAINT "tournament_feedback_playerId_fkey";

-- CreateTable (a) NPS — platform-level, 0-10 scale
CREATE TABLE "public"."nps_responses" (
    "id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "userId" TEXT,
    "deviceId" TEXT,
    "comment" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nps_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable (b) moderation reports
CREATE TABLE "public"."share_reports" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "reporterUserId" TEXT,
    "reporterDeviceId" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nps_responses_submittedAt_idx" ON "public"."nps_responses"("submittedAt");

-- CreateIndex
CREATE INDEX "share_reports_shareId_idx" ON "public"."share_reports"("shareId");

-- AddForeignKey (c) repoint → tournament_players(id)
ALTER TABLE "public"."tournament_feedback" ADD CONSTRAINT "tournament_feedback_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."tournament_players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (b)
ALTER TABLE "public"."share_reports" ADD CONSTRAINT "share_reports_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "public"."shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;
