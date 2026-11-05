-- Only a user's first submit of a topic counts for the leaderboard; later submits are practice.
-- Older rows are kept (nothing is deleted): the earliest row of each (user, topic) is marked counted, the rest stay NULL
-- and are ignored by every ranking query.
ALTER TABLE "topic_leaderboard_results" ADD COLUMN "isCounted" BOOLEAN;

UPDATE "topic_leaderboard_results" r
SET "isCounted" = TRUE
FROM (
  SELECT DISTINCT ON ("userId", "topicId") id
  FROM "topic_leaderboard_results"
  ORDER BY "userId", "topicId", "submittedAt" ASC, "businessDate" ASC, id ASC
) first_rows
WHERE r.id = first_rows.id;

CREATE UNIQUE INDEX "topic_leaderboard_results_userId_topicId_isCounted_key"
  ON "topic_leaderboard_results"("userId", "topicId", "isCounted");
