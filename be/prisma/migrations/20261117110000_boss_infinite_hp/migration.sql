-- AlterTable
ALTER TABLE "boss_weekly_seasons" ADD COLUMN "isInfiniteHp" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "boss_weekly_seasons" ALTER COLUMN "bossMaxHp" DROP NOT NULL;
ALTER TABLE "boss_weekly_seasons" ALTER COLUMN "bossMaxHp" SET DEFAULT 0;
