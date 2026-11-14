-- Official XP ledger. Additive; append-only; idempotent by (userId, sourceType, sourceKey).
CREATE TYPE "XpSourceType" AS ENUM ('TOPIC_FIRST_SUBMIT', 'TOWER_FLOOR', 'COURSE_COMPLETED', 'CERTIFICATE_ISSUED');

CREATE TABLE "user_xp_events" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sourceType" "XpSourceType" NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_xp_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_xp_events_userId_sourceType_sourceKey_key" ON "user_xp_events"("userId", "sourceType", "sourceKey");
CREATE INDEX "user_xp_events_userId_idx" ON "user_xp_events"("userId");

-- Backfill from existing data (weights: topic 50, tower floor 30, course 200, certificate 300).
INSERT INTO "user_xp_events" ("id", "userId", "sourceType", "sourceKey", "amount", "createdAt")
SELECT gen_random_uuid()::text, s."userId", 'TOPIC_FIRST_SUBMIT'::"XpSourceType", s."topicId", 50, MIN(COALESCE(s."submittedAt", s."createdAt"))
FROM "attempt_sessions" s
WHERE s."status" = 'SUBMITTED'
GROUP BY s."userId", s."topicId"
ON CONFLICT ("userId", "sourceType", "sourceKey") DO NOTHING;

INSERT INTO "user_xp_events" ("id", "userId", "sourceType", "sourceKey", "amount", "createdAt")
SELECT gen_random_uuid()::text, p."userId", 'TOWER_FLOOR'::"XpSourceType", p."seasonId" || ':' || f.floor::text, 30, CURRENT_TIMESTAMP
FROM "tower_user_progresses" p
CROSS JOIN LATERAL generate_series(1, p."highestCompletedFloor") AS f(floor)
WHERE p."highestCompletedFloor" > 0
ON CONFLICT ("userId", "sourceType", "sourceKey") DO NOTHING;

INSERT INTO "user_xp_events" ("id", "userId", "sourceType", "sourceKey", "amount", "createdAt")
SELECT gen_random_uuid()::text, c."userId", 'COURSE_COMPLETED'::"XpSourceType", c."courseId", 200, COALESCE(c."completedAt", c."updatedAt")
FROM "user_course_progresses" c
WHERE c."status" = 'COMPLETED'
ON CONFLICT ("userId", "sourceType", "sourceKey") DO NOTHING;

INSERT INTO "user_xp_events" ("id", "userId", "sourceType", "sourceKey", "amount", "createdAt")
SELECT gen_random_uuid()::text, ce."userId", 'CERTIFICATE_ISSUED'::"XpSourceType", ce."id", 300, ce."issuedAt"
FROM "certificates" ce
WHERE ce."revokedAt" IS NULL
ON CONFLICT ("userId", "sourceType", "sourceKey") DO NOTHING;
