-- Recreate the social graph against "users" instead of "mvp_players".
--
-- Context: prisma/schema.prisma retargets the Friend/FriendRequest relations
-- from MvpPlayer to User, but these tables were never covered by a migration
-- (they only existed via `prisma db push`). This migration makes the schema
-- deployable with `prisma migrate deploy`.
--
-- WARNING: the friend graph is treated as empty/rebuildable in the current
-- environment assessment. This migration DROPS any existing rows in
-- "friends" and "friend_requests" and recreates them with FKs to "users".
-- Do not run against an environment whose friend graph must be preserved.

DROP TABLE IF EXISTS "public"."friends" CASCADE;
DROP TABLE IF EXISTS "public"."friend_requests" CASCADE;

-- CreateEnum (idempotent: the types may already exist from a prior db push)
DO $$ BEGIN
  CREATE TYPE "public"."FriendStatus" AS ENUM ('PENDING', 'ACCEPTED', 'BLOCKED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."FriendRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE "public"."friends" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "friendId" TEXT NOT NULL,
    "status" "public"."FriendStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "friends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."friend_requests" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "message" TEXT,
    "status" "public"."FriendRequestStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "friend_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "friends_playerId_friendId_key" ON "public"."friends"("playerId", "friendId");

-- CreateIndex
CREATE INDEX "friends_playerId_idx" ON "public"."friends"("playerId");

-- CreateIndex
CREATE INDEX "friends_friendId_idx" ON "public"."friends"("friendId");

-- CreateIndex
CREATE INDEX "friends_status_idx" ON "public"."friends"("status");

-- CreateIndex
CREATE UNIQUE INDEX "friend_requests_senderId_receiverId_key" ON "public"."friend_requests"("senderId", "receiverId");

-- CreateIndex
CREATE INDEX "friend_requests_senderId_idx" ON "public"."friend_requests"("senderId");

-- CreateIndex
CREATE INDEX "friend_requests_receiverId_idx" ON "public"."friend_requests"("receiverId");

-- CreateIndex
CREATE INDEX "friend_requests_status_idx" ON "public"."friend_requests"("status");

-- AddForeignKey
ALTER TABLE "public"."friends" ADD CONSTRAINT "friends_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."friends" ADD CONSTRAINT "friends_friendId_fkey" FOREIGN KEY ("friendId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."friend_requests" ADD CONSTRAINT "friend_requests_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."friend_requests" ADD CONSTRAINT "friend_requests_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
