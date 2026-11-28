-- AlterTable
ALTER TABLE "tower_user_progresses"
  ADD COLUMN "isBlocked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "blockedReason" TEXT,
  ADD COLUMN "blockedAt" TIMESTAMP(3),
  ADD COLUMN "suspicionScore" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "tower_floor_attempts"
  ADD COLUMN "currentQuestionToken" TEXT,
  ADD COLUMN "currentOptionMap" JSONB,
  ADD COLUMN "answerTimingsMs" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "tower_anti_cheat_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seasonId" TEXT,
    "attemptId" TEXT,
    "floor" INTEGER NOT NULL DEFAULT 0,
    "ruleCode" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "serverResponseMs" INTEGER,
    "ip" TEXT,
    "userAgent" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tower_anti_cheat_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tower_user_progresses_seasonId_isBlocked_suspicionScore_idx"
  ON "tower_user_progresses"("seasonId", "isBlocked", "suspicionScore");

-- CreateIndex
CREATE INDEX "tower_anti_cheat_events_userId_createdAt_idx"
  ON "tower_anti_cheat_events"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "tower_anti_cheat_events_ruleCode_createdAt_idx"
  ON "tower_anti_cheat_events"("ruleCode", "createdAt");

-- CreateIndex
CREATE INDEX "tower_anti_cheat_events_createdAt_idx"
  ON "tower_anti_cheat_events"("createdAt");
