CREATE TYPE "NotificationType" AS ENUM (
  'LEADERBOARD_RESULT',
  'LEADERBOARD_TOP10',
  'LEADERBOARD_TOP3',
  'LEADERBOARD_RANK_DROPPED',
  'DAILY_REMINDER',
  'WEEKLY_PROGRESS',
  'WEEKLY_SUMMARY'
);

CREATE TABLE "notifications" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "topicId" TEXT,
  "leaderboardResultId" TEXT,
  "businessDate" VARCHAR(10),
  "weekStart" VARCHAR(10),
  "dedupKey" TEXT NOT NULL,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notifications_dedupKey_key" ON "notifications"("dedupKey");
CREATE INDEX "notifications_userId_isRead_createdAt_idx" ON "notifications"("userId", "isRead", "createdAt");
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");
