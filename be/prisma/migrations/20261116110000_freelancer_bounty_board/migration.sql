-- Freelancer Bounty Board Module
-- Additive: Creates bounties, bounty_assignments, and bounty_reward_transactions.

-- 1. Alter enum XpSourceType
ALTER TYPE "XpSourceType" ADD VALUE IF NOT EXISTS 'BOUNTY_COMPLETED';

-- 2. Create Enums
DO $$ BEGIN
  CREATE TYPE "BountyCategory" AS ENUM ('WEB', 'APP', 'GAME', 'DESIGN', 'AI');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "BountyStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "BountyAssignmentStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ABANDONED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "BountyRewardStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. Create Table bounties
CREATE TABLE IF NOT EXISTS "bounties" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" "BountyCategory" NOT NULL,
  "difficulty" INTEGER NOT NULL DEFAULT 1,
  "rewardCoins" INTEGER NOT NULL DEFAULT 50,
  "rewardXp" INTEGER NOT NULL DEFAULT 100,
  "durationMinutes" INTEGER NOT NULL DEFAULT 120,
  "clientName" TEXT NOT NULL,
  "clientRole" TEXT NOT NULL,
  "clientCompany" TEXT,
  "clientAvatarUrl" TEXT,
  "clientNotes" TEXT,
  "deliverableType" TEXT NOT NULL DEFAULT 'URL',
  "tasks" JSONB NOT NULL DEFAULT '[]',
  "skills" JSONB NOT NULL DEFAULT '[]',
  "status" "BountyStatus" NOT NULL DEFAULT 'OPEN',
  "maxParticipants" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bounties_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "bounties_slug_key" ON "bounties"("slug");
CREATE INDEX IF NOT EXISTS "bounties_status_category_idx" ON "bounties"("status", "category");

-- 4. Create Table bounty_assignments
CREATE TABLE IF NOT EXISTS "bounty_assignments" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "bountyId" TEXT NOT NULL,
  "status" "BountyAssignmentStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "submittedAt" TIMESTAMP(3),
  "projectUrl" TEXT,
  "submissionNotes" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewedBy" TEXT,
  "reviewFeedback" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bounty_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bounty_assignments_bountyId_fkey" FOREIGN KEY ("bountyId") REFERENCES "bounties"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "bounty_assignments_userId_status_idx" ON "bounty_assignments"("userId", "status");
CREATE INDEX IF NOT EXISTS "bounty_assignments_status_expiresAt_idx" ON "bounty_assignments"("status", "expiresAt");
CREATE UNIQUE INDEX IF NOT EXISTS "bounty_assignments_active_unique" ON "bounty_assignments"("userId") WHERE "status" IN ('IN_PROGRESS', 'SUBMITTED');

-- 5. Create Table bounty_reward_transactions
CREATE TABLE IF NOT EXISTS "bounty_reward_transactions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "bountyId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "rewardCoins" INTEGER NOT NULL,
  "rewardXp" INTEGER NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "externalTxId" TEXT,
  "status" "BountyRewardStatus" NOT NULL DEFAULT 'PENDING',
  "requestPayload" JSONB,
  "responsePayload" JSONB,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "bounty_reward_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bounty_reward_transactions_bountyId_fkey" FOREIGN KEY ("bountyId") REFERENCES "bounties"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "bounty_reward_transactions_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "bounty_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "bounty_reward_transactions_assignmentId_key" ON "bounty_reward_transactions"("assignmentId");
CREATE UNIQUE INDEX IF NOT EXISTS "bounty_reward_transactions_idempotencyKey_key" ON "bounty_reward_transactions"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "bounty_reward_transactions_userId_status_idx" ON "bounty_reward_transactions"("userId", "status");
CREATE INDEX IF NOT EXISTS "bounty_reward_transactions_status_retryCount_createdAt_idx" ON "bounty_reward_transactions"("status", "retryCount", "createdAt");
