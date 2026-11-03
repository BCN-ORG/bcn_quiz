# BCN Quiz project instructions

This repository follows the user's Global Engineering Rules. Read `~/.ai-guidance/ENGINEERING_PRINCIPLES.md` as the canonical baseline before engineering changes when available. Project rules below are additive and must not weaken global rules. The parent `../AGENTS.md` describes service boundaries when this repository is opened inside `bcn_system`.

## Architecture and identity

- `fe/`: Next.js, React, TypeScript. `be/`: NestJS, Prisma, PostgreSQL, Redis; MinIO stores assets. Profiles is a separate service and owns users, names, email, avatar, OAuth and permissions. Quiz must not add a local User source of truth for profile lookup.
- Auth uses Profiles OAuth2 Authorization Code with PKCE, HttpOnly cookies, Redis token/session-related caching, and existing RBAC/permission guards. Reuse `ProfilesService` and batch profile resolution (at most 100 IDs per call); protect internal Profiles endpoints. Never trust a client-supplied user ID for scoring, notifications, or SSE.
- Preserve existing API envelope and controller/service patterns; pagination is inside `data.pagination`. Public payloads must not leak email or phone. Frontend uses the existing request helper, React state/effects, AppShell and shared Loading/ErrorState/Empty/PaginationNav where appropriate. Do not add a state framework for a single feature.

## Domain and progress

- `Course ↔ Topic → Quiz → Option`: Course–Topic is many-to-many; Topic is the complete question set, Quiz is one question, AttemptSession is one attempt at the whole Topic, and QuizAttempt is one question's result.
- Preserve TopicProgress, CourseProgress, Certificate and ProjectSubmission behavior. A retry may affect learning progress under existing rules, but cannot overwrite an official leaderboard result.

## Topic leaderboard invariants

- Scope and unique business identity: `(userId, topicId, businessDate)`. The first successfully submitted AttemptSession for that tuple is official; the same user can have independent official results for different Topics on one day.
- Score is `totalQuestions === 0 ? 0 : Math.round(correctCount / totalQuestions * 1000)`. Question weight `1000 / totalQuestions` explains the UI only. Do not sum rounded per-question points or add speed, streak, multiplier, or attempt bonuses.
- Daily order: `score DESC, durationMs ASC, submittedAt ASC, userId ASC`. Weekly score is the sum of official daily scores; weekly order: `weeklyScore DESC, completedDays DESC, totalDurationMs ASC, lastSubmittedAt ASC, userId ASC`. Search filters displayed users after global rank is computed.
- Business timezone is `Asia/Ho_Chi_Minh`; use business dates and Monday–Sunday business weeks, not raw UTC calendar dates.
- `TopicLeaderboardResult` is an immutable historical snapshot. Never recalculate score, correctCount, totalQuestions, durationMs or submittedAt from current questions after submit. Admin edits to questions cannot change old results.

## Notifications and realtime

- PostgreSQL is the source of truth. Insert notification, commit, then publish SSE; an SSE failure must not roll back a completed business operation. Preserve unique dedup keys and the existing seven types: `LEADERBOARD_RESULT`, `LEADERBOARD_TOP10`, `LEADERBOARD_TOP3`, `LEADERBOARD_RANK_DROPPED`, `DAILY_REMINDER`, `WEEKLY_PROGRESS`, `WEEKLY_SUMMARY`.
- An official result creates one main notification, with rank priority Top 3, Top 10, then Result. Notify rank drops only when the previous #3 or #10 leaves that threshold. Deduplicate result, drop, daily reminder, and weekly progress/summary by user, Topic and business day/week; retries and rerun jobs must not spam users.
- SSE derives the user from authenticated request context, supports multiple tabs, heartbeat, disconnect cleanup, and REST/DB recovery after reconnect. Never put auth tokens in the query string or allow clients to choose another user's stream.
- Current deployment configuration has one NestJS app container, so the in-process subscriber registry is valid. If deployment scales to multiple replicas, add cross-instance fan-out such as Redis Pub/Sub before scaling; do not add it speculatively.

## Verification and handoff

- Existing leaderboard baseline covers PostgreSQL migration, official/retry and same-Topic concurrency, VN midnight and Monday/Sunday boundaries, immutable snapshots, Daily/Weekly API, XLSX parity, and browser user/admin flows. Preserve those contracts.
- For DB, concurrency, or timezone work, favor real PostgreSQL integration; for important user/admin flows, run browser smoke when feasible. If a check cannot run, report it as **NOT VERIFIED**, never infer PASS from compilation.
- Actual commands: `cd be && npm test -- --runInBand`, `npm run build` (runs Prisma generate first), `npx prisma validate`, `npx prisma generate`, `npx prisma migrate status`; `cd fe && npm run lint`, `npm run build`. Backend `npm run lint` runs ESLint with `--fix`, so use `npx eslint 'src/**/*.ts' 'test/**/*.ts'` for a read-only lint check.
- Inspect Git status/diff before editing. Preserve existing uncommitted work, avoid unrelated refactors, and do not commit, push or deploy unless asked. Explain changed behavior, verification actually run, and remaining risks.
