CREATE TABLE "topic_leaderboard_results" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "businessDate" VARCHAR(10) NOT NULL,
  "score" INTEGER NOT NULL,
  "correctCount" INTEGER NOT NULL,
  "totalQuestions" INTEGER NOT NULL,
  "durationMs" INTEGER NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "topic_leaderboard_results_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "topic_leaderboard_results_sessionId_key" ON "topic_leaderboard_results"("sessionId");
CREATE UNIQUE INDEX "topic_leaderboard_results_userId_topicId_businessDate_key" ON "topic_leaderboard_results"("userId", "topicId", "businessDate");
CREATE INDEX "topic_leaderboard_results_topicId_businessDate_score_idx" ON "topic_leaderboard_results"("topicId", "businessDate", "score");
CREATE INDEX "topic_leaderboard_results_submittedAt_idx" ON "topic_leaderboard_results"("submittedAt");

ALTER TABLE "topic_leaderboard_results" ADD CONSTRAINT "topic_leaderboard_results_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "topic_leaderboard_results" ADD CONSTRAINT "topic_leaderboard_results_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "attempt_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
