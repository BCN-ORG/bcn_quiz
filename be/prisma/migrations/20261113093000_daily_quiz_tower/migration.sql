-- Daily Quiz Tower (Leo Tháp Kiến Thức)
-- Additive: Creates tower_seasons, tower_user_progresses, tower_floor_attempts, and tower_reward_transactions.

CREATE TYPE "TowerAttemptStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED');
CREATE TYPE "TowerRewardStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'UNKNOWN');

CREATE TABLE "tower_seasons" (
  "id" TEXT NOT NULL,
  "seasonKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tower_seasons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tower_seasons_seasonKey_key" ON "tower_seasons"("seasonKey");
CREATE INDEX "tower_seasons_isActive_startsAt_endsAt_idx" ON "tower_seasons"("isActive", "startsAt", "endsAt");

CREATE TABLE "tower_user_progresses" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "seasonId" TEXT NOT NULL,
  "currentFloor" INTEGER NOT NULL DEFAULT 1,
  "highestCompletedFloor" INTEGER NOT NULL DEFAULT 0,
  "cooldownUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tower_user_progresses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tower_user_progresses_userId_seasonId_key" ON "tower_user_progresses"("userId", "seasonId");
CREATE INDEX "tower_user_progresses_userId_seasonId_idx" ON "tower_user_progresses"("userId", "seasonId");

ALTER TABLE "tower_user_progresses" ADD CONSTRAINT "tower_user_progresses_seasonId_fkey"
  FOREIGN KEY ("seasonId") REFERENCES "tower_seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "tower_floor_attempts" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "seasonId" TEXT NOT NULL,
  "floor" INTEGER NOT NULL,
  "requiredStreak" INTEGER NOT NULL,
  "currentStreak" INTEGER NOT NULL DEFAULT 0,
  "status" "TowerAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "currentQuizId" TEXT,
  "currentQuestionStartedAt" TIMESTAMP(3),
  "currentQuestionExpiresAt" TIMESTAMP(3),
  "currentQuestionNumber" INTEGER NOT NULL DEFAULT 1,
  "usedQuizIds" JSONB NOT NULL DEFAULT '[]',
  "failedReason" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tower_floor_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tower_floor_attempts_userId_seasonId_floor_status_idx" ON "tower_floor_attempts"("userId", "seasonId", "floor", "status");
CREATE INDEX "tower_floor_attempts_userId_status_currentQuestionExpiresAt_idx" ON "tower_floor_attempts"("userId", "status", "currentQuestionExpiresAt");
CREATE UNIQUE INDEX "tower_floor_attempts_one_active_per_user_season_idx" ON "tower_floor_attempts"("userId", "seasonId") WHERE "status" = 'IN_PROGRESS';

ALTER TABLE "tower_floor_attempts" ADD CONSTRAINT "tower_floor_attempts_seasonId_fkey"
  FOREIGN KEY ("seasonId") REFERENCES "tower_seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "tower_reward_transactions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "seasonId" TEXT NOT NULL,
  "floor" INTEGER NOT NULL,
  "rewardCoins" INTEGER NOT NULL DEFAULT 1,
  "idempotencyKey" TEXT NOT NULL,
  "externalTxId" TEXT,
  "status" "TowerRewardStatus" NOT NULL DEFAULT 'PENDING',
  "requestPayload" JSONB,
  "responsePayload" JSONB,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "tower_reward_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tower_reward_transactions_idempotencyKey_key" ON "tower_reward_transactions"("idempotencyKey");
CREATE UNIQUE INDEX "tower_reward_transactions_userId_seasonId_floor_key" ON "tower_reward_transactions"("userId", "seasonId", "floor");
CREATE INDEX "tower_reward_transactions_status_retryCount_createdAt_idx" ON "tower_reward_transactions"("status", "retryCount", "createdAt");
CREATE INDEX "tower_reward_transactions_userId_createdAt_idx" ON "tower_reward_transactions"("userId", "createdAt");

ALTER TABLE "tower_reward_transactions" ADD CONSTRAINT "tower_reward_transactions_seasonId_fkey"
  FOREIGN KEY ("seasonId") REFERENCES "tower_seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
