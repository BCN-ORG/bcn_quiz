-- CreateEnum
CREATE TYPE "CoinRewardSource" AS ENUM ('TOWER', 'BOSS', 'BOUNTY', 'LEADERBOARD', 'OTHER');

-- CreateEnum
CREATE TYPE "CoinTransactionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'UNKNOWN');

-- AlterEnum
ALTER TYPE "BountyRewardStatus" ADD VALUE IF NOT EXISTS 'UNKNOWN';

-- CreateTable
CREATE TABLE "coin_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT,
    "amount" INTEGER NOT NULL,
    "source" "CoinRewardSource" NOT NULL,
    "reason" TEXT,
    "referenceId" TEXT,
    "seasonId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "externalTxId" TEXT,
    "status" "CoinTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "reconciliationHistory" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "coin_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coin_transactions_idempotencyKey_key" ON "coin_transactions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "coin_transactions_userId_createdAt_idx" ON "coin_transactions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "coin_transactions_status_createdAt_idx" ON "coin_transactions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "coin_transactions_source_createdAt_idx" ON "coin_transactions"("source", "createdAt");
