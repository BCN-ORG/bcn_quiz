-- Weekly Community Boss Battle Module
-- Additive: Creates boss_weekly_seasons, boss_battle_sessions, boss_user_weekly_stats, and boss_reward_transactions.

CREATE TYPE "BossSessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');
CREATE TYPE "BossRewardStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'UNKNOWN');

CREATE TABLE "boss_weekly_seasons" (
  "id" TEXT NOT NULL,
  "weekKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "bossName" TEXT NOT NULL DEFAULT 'Ma Vương Hư Không',
  "bossMaxHp" INTEGER NOT NULL DEFAULT 1500,
  "milestoneConfig" JSONB NOT NULL DEFAULT '[{"at":300,"coin":5,"name":"Rương Đồng"},{"at":600,"coin":5,"name":"Rương Bạc"},{"at":900,"coin":5,"name":"Rương Vàng"},{"at":1200,"coin":5,"name":"Rương Bạch Kim"},{"at":1500,"coin":5,"name":"Rương Kim Cương"}]',
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isSettled" BOOLEAN NOT NULL DEFAULT false,
  "settledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "boss_weekly_seasons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "boss_weekly_seasons_weekKey_key" ON "boss_weekly_seasons"("weekKey");
CREATE INDEX "boss_weekly_seasons_isActive_startsAt_endsAt_idx" ON "boss_weekly_seasons"("isActive", "startsAt", "endsAt");

CREATE TABLE "boss_battle_sessions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "seasonId" TEXT NOT NULL,
  "status" "BossSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "score" INTEGER NOT NULL DEFAULT 0,
  "combo" INTEGER NOT NULL DEFAULT 0,
  "maxCombo" INTEGER NOT NULL DEFAULT 0,
  "totalAnswered" INTEGER NOT NULL DEFAULT 0,
  "correctCount" INTEGER NOT NULL DEFAULT 0,
  "wrongCount" INTEGER NOT NULL DEFAULT 0,
  "currentQuestionId" TEXT,
  "currentQuestionNumber" INTEGER NOT NULL DEFAULT 1,
  "currentQuestionStartedAt" TIMESTAMP(3),
  "currentQuestionExpiresAt" TIMESTAMP(3),
  "usedQuestionIds" JSONB NOT NULL DEFAULT '[]',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "endReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "boss_battle_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "boss_battle_sessions_userId_seasonId_status_idx" ON "boss_battle_sessions"("userId", "seasonId", "status");
CREATE INDEX "boss_battle_sessions_userId_status_expiresAt_idx" ON "boss_battle_sessions"("userId", "status", "expiresAt");

ALTER TABLE "boss_battle_sessions" ADD CONSTRAINT "boss_battle_sessions_seasonId_fkey"
  FOREIGN KEY ("seasonId") REFERENCES "boss_weekly_seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "boss_user_weekly_stats" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "seasonId" TEXT NOT NULL,
  "highestScore" INTEGER NOT NULL DEFAULT 0,
  "totalAttempts" INTEGER NOT NULL DEFAULT 0,
  "bestCombo" INTEGER NOT NULL DEFAULT 0,
  "hasParticipated" BOOLEAN NOT NULL DEFAULT false,
  "lastPlayedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "boss_user_weekly_stats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "boss_user_weekly_stats_userId_seasonId_key" ON "boss_user_weekly_stats"("userId", "seasonId");
CREATE INDEX "boss_user_weekly_stats_seasonId_highestScore_idx" ON "boss_user_weekly_stats"("seasonId", "highestScore");

ALTER TABLE "boss_user_weekly_stats" ADD CONSTRAINT "boss_user_weekly_stats_seasonId_fkey"
  FOREIGN KEY ("seasonId") REFERENCES "boss_weekly_seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "boss_reward_transactions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "seasonId" TEXT NOT NULL,
  "milestoneIndex" INTEGER NOT NULL,
  "milestoneAt" INTEGER NOT NULL,
  "rewardCoins" INTEGER NOT NULL DEFAULT 5,
  "idempotencyKey" TEXT NOT NULL,
  "externalTxId" TEXT,
  "status" "BossRewardStatus" NOT NULL DEFAULT 'PENDING',
  "requestPayload" JSONB,
  "responsePayload" JSONB,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "boss_reward_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "boss_reward_transactions_idempotencyKey_key" ON "boss_reward_transactions"("idempotencyKey");
CREATE UNIQUE INDEX "boss_reward_transactions_userId_seasonId_milestoneIndex_key" ON "boss_reward_transactions"("userId", "seasonId", "milestoneIndex");
CREATE INDEX "boss_reward_transactions_status_retryCount_createdAt_idx" ON "boss_reward_transactions"("status", "retryCount", "createdAt");
CREATE INDEX "boss_reward_transactions_userId_createdAt_idx" ON "boss_reward_transactions"("userId", "createdAt");

ALTER TABLE "boss_reward_transactions" ADD CONSTRAINT "boss_reward_transactions_seasonId_fkey"
  FOREIGN KEY ("seasonId") REFERENCES "boss_weekly_seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
