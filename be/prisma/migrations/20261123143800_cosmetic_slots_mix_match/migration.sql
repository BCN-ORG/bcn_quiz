-- AlterTable user_cosmetic_preferences: add independent cosmetic slots for mix-and-match
ALTER TABLE "user_cosmetic_preferences"
  ADD COLUMN IF NOT EXISTS "equippedCharacterId" TEXT,
  ADD COLUMN IF NOT EXISTS "equippedBannerId" TEXT,
  ADD COLUMN IF NOT EXISTS "equippedFrameId" TEXT,
  ADD COLUMN IF NOT EXISTS "equippedNameplateId" TEXT;
