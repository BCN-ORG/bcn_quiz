-- Phase 3: PvP 1v1 Quiz Battle & Study Guilds

CREATE TYPE "PvpMatchStatus" AS ENUM ('WAITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "GuildRole" AS ENUM ('LEADER', 'OFFICER', 'MEMBER');

CREATE TABLE "pvp_matches" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "status" "PvpMatchStatus" NOT NULL DEFAULT 'WAITING',
    "player1Id" TEXT NOT NULL,
    "player2Id" TEXT,
    "questionIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "player1Score" INTEGER NOT NULL DEFAULT 0,
    "player2Score" INTEGER NOT NULL DEFAULT 0,
    "winnerId" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pvp_matches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pvp_matches_inviteCode_key" ON "pvp_matches"("inviteCode");
CREATE INDEX "pvp_matches_status_createdAt_idx" ON "pvp_matches"("status", "createdAt");
CREATE INDEX "pvp_matches_player1Id_idx" ON "pvp_matches"("player1Id");
CREATE INDEX "pvp_matches_player2Id_idx" ON "pvp_matches"("player2Id");

CREATE TABLE "pvp_match_answers" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionIndex" INTEGER NOT NULL,
    "selectedAnswer" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "responseMs" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pvp_match_answers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pvp_match_answers_matchId_userId_questionIndex_key"
  ON "pvp_match_answers"("matchId", "userId", "questionIndex");
CREATE INDEX "pvp_match_answers_matchId_idx" ON "pvp_match_answers"("matchId");

ALTER TABLE "pvp_match_answers"
  ADD CONSTRAINT "pvp_match_answers_matchId_fkey"
  FOREIGN KEY ("matchId") REFERENCES "pvp_matches"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "pvp_user_ratings" (
    "userId" TEXT NOT NULL,
    "elo" INTEGER NOT NULL DEFAULT 1000,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "winStreak" INTEGER NOT NULL DEFAULT 0,
    "bestWinStreak" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pvp_user_ratings_pkey" PRIMARY KEY ("userId")
);

CREATE INDEX "pvp_user_ratings_elo_idx" ON "pvp_user_ratings"("elo");

CREATE TABLE "guilds" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "leaderId" TEXT NOT NULL,
    "maxMembers" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guilds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guilds_name_key" ON "guilds"("name");
CREATE UNIQUE INDEX "guilds_tag_key" ON "guilds"("tag");

CREATE TABLE "guild_members" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "GuildRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guild_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guild_members_userId_key" ON "guild_members"("userId");
CREATE INDEX "guild_members_guildId_idx" ON "guild_members"("guildId");

ALTER TABLE "guild_members"
  ADD CONSTRAINT "guild_members_guildId_fkey"
  FOREIGN KEY ("guildId") REFERENCES "guilds"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "guild_boss_contributions" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "totalDamage" INTEGER NOT NULL DEFAULT 0,
    "participantCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_boss_contributions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guild_boss_contributions_seasonId_guildId_key"
  ON "guild_boss_contributions"("seasonId", "guildId");
CREATE INDEX "guild_boss_contributions_seasonId_totalDamage_idx"
  ON "guild_boss_contributions"("seasonId", "totalDamage");

ALTER TABLE "guild_boss_contributions"
  ADD CONSTRAINT "guild_boss_contributions_guildId_fkey"
  FOREIGN KEY ("guildId") REFERENCES "guilds"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
