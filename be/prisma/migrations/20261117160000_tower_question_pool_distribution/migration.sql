-- Centralized Question Pool & Floor Distribution & Anti-Repeat Schema
-- Additive: Creates tower_question_pool_items, tower_distribution_configs, tower_question_usages, and tower_collection_job_logs.

-- CreateEnum
CREATE TYPE "TowerDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateTable
CREATE TABLE "tower_question_pool_items" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "courseId" TEXT,
    "subject" TEXT NOT NULL,
    "difficulty" "TowerDifficulty" NOT NULL DEFAULT 'MEDIUM',
    "contentHash" TEXT NOT NULL,
    "isEligible" BOOLEAN NOT NULL DEFAULT true,
    "ineligibleReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tower_question_pool_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tower_distribution_configs" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rules" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tower_distribution_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tower_question_usages" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "floor" INTEGER NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usageCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "tower_question_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tower_collection_job_logs" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "totalCollected" INTEGER NOT NULL DEFAULT 0,
    "totalEligible" INTEGER NOT NULL DEFAULT 0,
    "totalDuplicates" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "tower_collection_job_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tower_question_pool_items_quizId_key" ON "tower_question_pool_items"("quizId");

-- CreateIndex
CREATE INDEX "tower_question_pool_items_isEligible_subject_difficulty_idx" ON "tower_question_pool_items"("isEligible", "subject", "difficulty");

-- CreateIndex
CREATE INDEX "tower_question_pool_items_contentHash_idx" ON "tower_question_pool_items"("contentHash");

-- CreateIndex
CREATE INDEX "tower_question_pool_items_topicId_idx" ON "tower_question_pool_items"("topicId");

-- CreateIndex
CREATE INDEX "tower_question_pool_items_courseId_idx" ON "tower_question_pool_items"("courseId");

-- CreateIndex
CREATE INDEX "tower_distribution_configs_isActive_version_idx" ON "tower_distribution_configs"("isActive", "version");

-- CreateIndex
CREATE UNIQUE INDEX "tower_question_usages_quizId_seasonId_key" ON "tower_question_usages"("quizId", "seasonId");

-- CreateIndex
CREATE INDEX "tower_question_usages_seasonId_floor_idx" ON "tower_question_usages"("seasonId", "floor");

-- CreateIndex
CREATE INDEX "tower_question_usages_usedAt_idx" ON "tower_question_usages"("usedAt");

-- CreateIndex
CREATE INDEX "tower_collection_job_logs_startedAt_idx" ON "tower_collection_job_logs"("startedAt");

-- AddForeignKey
ALTER TABLE "tower_question_pool_items" ADD CONSTRAINT "tower_question_pool_items_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tower_question_usages" ADD CONSTRAINT "tower_question_usages_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tower_question_usages" ADD CONSTRAINT "tower_question_usages_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "tower_seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
