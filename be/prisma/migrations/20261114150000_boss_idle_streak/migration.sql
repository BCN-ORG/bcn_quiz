-- AlterTable
ALTER TABLE "boss_battle_sessions" ADD COLUMN IF NOT EXISTS "idleStreak" INTEGER NOT NULL DEFAULT 0;
