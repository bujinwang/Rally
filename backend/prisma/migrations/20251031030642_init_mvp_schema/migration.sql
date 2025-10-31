-- CreateTable
CREATE TABLE "mvp_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "scheduledAt" DATETIME NOT NULL,
    "location" TEXT,
    "maxPlayers" INTEGER NOT NULL DEFAULT 20,
    "courtCount" INTEGER NOT NULL DEFAULT 1,
    "ownerName" TEXT NOT NULL,
    "ownerDeviceId" TEXT,
    "organizerSecretHash" TEXT,
    "organizerSecretUpdatedAt" DATETIME,
    "ownershipClaimedAt" DATETIME,
    "shareCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "mvp_players" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'PLAYER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "wasBenchedLastRound" BOOLEAN NOT NULL DEFAULT false,
    "restRequestedAt" DATETIME,
    "restExpiresAt" DATETIME,
    "restGamesCount" INTEGER NOT NULL DEFAULT 0,
    "statusChangedAt" DATETIME,
    "statusChangedBy" TEXT,
    CONSTRAINT "mvp_players_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "mvp_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "mvp_games" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "gameNumber" INTEGER NOT NULL,
    "courtName" TEXT,
    "team1Player1Id" TEXT NOT NULL,
    "team1Player2Id" TEXT NOT NULL,
    "team2Player1Id" TEXT NOT NULL,
    "team2Player2Id" TEXT NOT NULL,
    "team1Score" INTEGER NOT NULL DEFAULT 0,
    "team2Score" INTEGER NOT NULL DEFAULT 0,
    "winnerTeam" INTEGER,
    "scoreType" TEXT,
    "duration" INTEGER,
    "startTime" DATETIME,
    "endTime" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "recordedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "mvp_games_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "mvp_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "mvp_games_team1Player1Id_fkey" FOREIGN KEY ("team1Player1Id") REFERENCES "mvp_players" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "mvp_games_team1Player2Id_fkey" FOREIGN KEY ("team1Player2Id") REFERENCES "mvp_players" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "mvp_games_team2Player1Id_fkey" FOREIGN KEY ("team2Player1Id") REFERENCES "mvp_players" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "mvp_games_team2Player2Id_fkey" FOREIGN KEY ("team2Player2Id") REFERENCES "mvp_players" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "mvp_sessions_shareCode_key" ON "mvp_sessions"("shareCode");

-- CreateIndex
CREATE INDEX "mvp_sessions_shareCode_idx" ON "mvp_sessions"("shareCode");

-- CreateIndex
CREATE INDEX "mvp_sessions_status_scheduledAt_idx" ON "mvp_sessions"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "mvp_sessions_ownerDeviceId_idx" ON "mvp_sessions"("ownerDeviceId");

-- CreateIndex
CREATE INDEX "mvp_players_sessionId_status_idx" ON "mvp_players"("sessionId", "status");

-- CreateIndex
CREATE INDEX "mvp_players_deviceId_idx" ON "mvp_players"("deviceId");

-- CreateIndex
CREATE INDEX "mvp_players_gamesPlayed_idx" ON "mvp_players"("gamesPlayed");

-- CreateIndex
CREATE UNIQUE INDEX "mvp_players_sessionId_name_key" ON "mvp_players"("sessionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "mvp_players_sessionId_deviceId_key" ON "mvp_players"("sessionId", "deviceId");

-- CreateIndex
CREATE INDEX "mvp_games_sessionId_status_idx" ON "mvp_games"("sessionId", "status");

-- CreateIndex
CREATE INDEX "mvp_games_gameNumber_idx" ON "mvp_games"("gameNumber");
