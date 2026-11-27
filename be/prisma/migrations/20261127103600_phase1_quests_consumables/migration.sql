-- Phase 1: Daily/Weekly Quests, Consumables & Mystery Chest

ALTER TYPE "XpSourceType" ADD VALUE IF NOT EXISTS 'QUEST_COMPLETED';
ALTER TYPE "XpSourceType" ADD VALUE IF NOT EXISTS 'MISTAKE_REVIEW';
ALTER TYPE "XpSourceType" ADD VALUE IF NOT EXISTS 'SEASON_PASS';
ALTER TYPE "XpSourceType" ADD VALUE IF NOT EXISTS 'PVP_MATCH';

ALTER TYPE "CoinRewardSource" ADD VALUE IF NOT EXISTS 'WEEKLY_QUEST';
ALTER TYPE "CoinRewardSource" ADD VALUE IF NOT EXISTS 'MYSTERY_CHEST_REFUND';
ALTER TYPE "CoinRewardSource" ADD VALUE IF NOT EXISTS 'SEASON_PASS';
ALTER TYPE "CoinRewardSource" ADD VALUE IF NOT EXISTS 'PVP_MATCH';
ALTER TYPE "CoinRewardSource" ADD VALUE IF NOT EXISTS 'GUILD_BOSS';

CREATE TYPE "QuestPeriod" AS ENUM ('DAILY', 'WEEKLY');
CREATE TYPE "ConsumableType" AS ENUM ('STREAK_FREEZE', 'XP_BOOST_2X');

CREATE TABLE "user_quest_claims" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "period" "QuestPeriod" NOT NULL,
    "periodKey" TEXT NOT NULL,
    "questCode" TEXT NOT NULL,
    "rewardXp" INTEGER NOT NULL DEFAULT 0,
    "rewardCoins" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_quest_claims_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_quest_claims_userId_periodKey_questCode_key"
  ON "user_quest_claims"("userId", "periodKey", "questCode");
CREATE INDEX "user_quest_claims_userId_periodKey_idx"
  ON "user_quest_claims"("userId", "periodKey");

CREATE TABLE "user_inventory_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemType" "ConsumableType" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "activeUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_inventory_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_inventory_items_userId_itemType_key"
  ON "user_inventory_items"("userId", "itemType");
CREATE INDEX "user_inventory_items_userId_idx"
  ON "user_inventory_items"("userId");

CREATE TABLE "mystery_chest_rolls" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "costCoins" INTEGER NOT NULL,
    "rewardType" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "rewardLabel" TEXT NOT NULL,
    "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "refundCoins" INTEGER NOT NULL DEFAULT 0,
    "pityCountAfter" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mystery_chest_rolls_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mystery_chest_rolls_idempotencyKey_key"
  ON "mystery_chest_rolls"("idempotencyKey");
CREATE INDEX "mystery_chest_rolls_userId_createdAt_idx"
  ON "mystery_chest_rolls"("userId", "createdAt");
