-- Phase 2: Mistake Bank (SRS) & Monthly Season Pass

CREATE TYPE "MistakeStatus" AS ENUM ('ACTIVE', 'MASTERED');

CREATE TABLE "user_mistake_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "wrongCount" INTEGER NOT NULL DEFAULT 1,
    "consecutiveCorrect" INTEGER NOT NULL DEFAULT 0,
    "status" "MistakeStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastWrongAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextReviewAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_mistake_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_mistake_items_userId_quizId_key"
  ON "user_mistake_items"("userId", "quizId");
CREATE INDEX "user_mistake_items_userId_status_nextReviewAt_idx"
  ON "user_mistake_items"("userId", "status", "nextReviewAt");
CREATE INDEX "user_mistake_items_userId_topicId_idx"
  ON "user_mistake_items"("userId", "topicId");

CREATE TABLE "season_passes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "premiumPriceCoins" INTEGER NOT NULL DEFAULT 300,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "season_passes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "season_passes_code_key" ON "season_passes"("code");

CREATE TABLE "user_season_progresses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "seasonXp" INTEGER NOT NULL DEFAULT 0,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "claimedFreeTiers" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "claimedPremiumTiers" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_season_progresses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_season_progresses_userId_seasonId_key"
  ON "user_season_progresses"("userId", "seasonId");
CREATE INDEX "user_season_progresses_userId_idx"
  ON "user_season_progresses"("userId");

ALTER TABLE "user_season_progresses"
  ADD CONSTRAINT "user_season_progresses_seasonId_fkey"
  FOREIGN KEY ("seasonId") REFERENCES "season_passes"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
