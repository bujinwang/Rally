-- CreateTable for Push Notifications
CREATE TABLE "push_tokens" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pushToken" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL UNIQUE,
    "platform" TEXT NOT NULL,
    "playerName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable for Session Subscriptions
CREATE TABLE "session_subscriptions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "playerName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "session_subscriptions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "mvp_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable for Notification Preferences  
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL UNIQUE,
    "enablePush" BOOLEAN NOT NULL DEFAULT true,
    "enableInApp" BOOLEAN NOT NULL DEFAULT true,
    "enableSound" BOOLEAN NOT NULL DEFAULT true,
    "enableVibration" BOOLEAN NOT NULL DEFAULT true,
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,
    "notificationTypes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE INDEX "push_tokens_deviceId_idx" ON "push_tokens"("deviceId");
CREATE INDEX "push_tokens_isActive_idx" ON "push_tokens"("isActive");

CREATE UNIQUE INDEX "session_subscriptions_sessionId_deviceId_key" ON "session_subscriptions"("sessionId", "deviceId");
CREATE INDEX "session_subscriptions_sessionId_idx" ON "session_subscriptions"("sessionId");
CREATE INDEX "session_subscriptions_deviceId_idx" ON "session_subscriptions"("deviceId");
CREATE INDEX "session_subscriptions_isActive_idx" ON "session_subscriptions"("isActive");

CREATE INDEX "notification_preferences_deviceId_idx" ON "notification_preferences"("deviceId");
