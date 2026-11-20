-- AlterTable
ALTER TABLE "user_cosmetic_preferences"
ADD COLUMN IF NOT EXISTS "pinnedBadges" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS "unlockedCosmetics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
