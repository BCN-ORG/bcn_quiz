-- AlterTable
ALTER TABLE "topics" ADD COLUMN "startsAt" TIMESTAMP(3),
ADD COLUMN "endsAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "topics_startsAt_endsAt_idx" ON "topics"("startsAt", "endsAt");
