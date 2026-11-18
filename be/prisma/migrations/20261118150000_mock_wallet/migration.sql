-- CreateEnum
CREATE TYPE "MockWalletTxType" AS ENUM ('RECEIVED', 'SENT', 'REWARD', 'SYNC_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "MockWalletTxStatus" AS ENUM ('SUCCESS', 'PENDING', 'FAILED');

-- CreateTable
CREATE TABLE "mock_wallets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 100,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncStatus" TEXT NOT NULL DEFAULT 'SYNCED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mock_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mock_wallet_transactions" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "MockWalletTxType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "MockWalletTxStatus" NOT NULL,
    "counterpartUserId" TEXT,
    "counterpartName" TEXT,
    "description" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mock_wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mock_wallets_userId_key" ON "mock_wallets"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "mock_wallet_transactions_reference_key" ON "mock_wallet_transactions"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "mock_wallet_transactions_idempotencyKey_key" ON "mock_wallet_transactions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "mock_wallet_transactions_userId_createdAt_idx" ON "mock_wallet_transactions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "mock_wallet_transactions_walletId_createdAt_idx" ON "mock_wallet_transactions"("walletId", "createdAt");

-- AddForeignKey
ALTER TABLE "mock_wallet_transactions" ADD CONSTRAINT "mock_wallet_transactions_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "mock_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
