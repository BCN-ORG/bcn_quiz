-- Additive: indexes for the /boss/live feed (filters by season + status, ordered by endedAt / filtered by expiresAt).
CREATE INDEX "boss_battle_sessions_seasonId_status_expiresAt_idx" ON "boss_battle_sessions"("seasonId", "status", "expiresAt");
CREATE INDEX "boss_battle_sessions_seasonId_status_endedAt_idx" ON "boss_battle_sessions"("seasonId", "status", "endedAt");
