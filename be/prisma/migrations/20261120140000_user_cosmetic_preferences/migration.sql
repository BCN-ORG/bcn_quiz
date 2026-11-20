-- CreateTable
CREATE TABLE IF NOT EXISTS "user_cosmetic_preferences" (
    "userId" TEXT NOT NULL,
    "equippedTierId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_cosmetic_preferences_pkey" PRIMARY KEY ("userId")
);
