-- AlterEnum (must sort AFTER 20261114090000_user_xp_events, which creates "XpSourceType")
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "XpSourceType" ADD VALUE IF NOT EXISTS 'BOSS_SESSION_COMPLETED';
ALTER TYPE "XpSourceType" ADD VALUE IF NOT EXISTS 'BOSS_COMBO_STREAK';
