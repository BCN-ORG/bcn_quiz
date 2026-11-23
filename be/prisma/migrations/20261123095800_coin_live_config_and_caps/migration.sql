-- AlterEnum
ALTER TYPE "CoinRewardSource" ADD VALUE IF NOT EXISTS 'DAILY_QUEST';
ALTER TYPE "CoinRewardSource" ADD VALUE IF NOT EXISTS 'LEVEL_UP';

-- AlterTable bounties: lower default rewardCoins from 50 to 5 and cap existing OPEN/DRAFT bounties < 10
ALTER TABLE "bounties" ALTER COLUMN "rewardCoins" SET DEFAULT 5;
UPDATE "bounties" SET "rewardCoins" = 9 WHERE "rewardCoins" >= 10 AND "status" IN ('OPEN', 'DRAFT');

-- AlterTable coin_transactions: add providerMode and errorCode
ALTER TABLE "coin_transactions"
  ADD COLUMN IF NOT EXISTS "providerMode" TEXT NOT NULL DEFAULT 'mock',
  ADD COLUMN IF NOT EXISTS "errorCode" TEXT;

CREATE INDEX IF NOT EXISTS "coin_transactions_providerMode_createdAt_idx"
  ON "coin_transactions"("providerMode", "createdAt");

-- CreateTable coin_system_configs
CREATE TABLE IF NOT EXISTS "coin_system_configs" (
  "id" TEXT NOT NULL,
  "maxRewardCap" INTEGER NOT NULL DEFAULT 9,
  "dailyChestCoins" INTEGER NOT NULL DEFAULT 5,
  "levelMilestoneCoins" JSONB NOT NULL DEFAULT '{"3":3,"6":5,"10":6,"20":7,"40":8,"70":9,"100":9}',
  "botWarningThreshold" INTEGER NOT NULL DEFAULT 100,
  "botCriticalThreshold" INTEGER NOT NULL DEFAULT 20,
  "rewardsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "transfersEnabled" BOOLEAN NOT NULL DEFAULT true,
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "coin_system_configs_pkey" PRIMARY KEY ("id")
);

INSERT INTO "coin_system_configs" ("id", "maxRewardCap", "dailyChestCoins", "levelMilestoneCoins", "botWarningThreshold", "botCriticalThreshold", "rewardsEnabled", "transfersEnabled", "updatedAt")
VALUES ('default', 9, 5, '{"3":3,"6":5,"10":6,"20":7,"40":8,"70":9,"100":9}'::jsonb, 100, 20, true, true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
