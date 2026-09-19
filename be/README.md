# bcn_quiz

NestJS API for quizzes, topics, courses, attempt sessions, project submissions, and certificates. Authentication uses BCN Profiles SSO; learning data lives in PostgreSQL; media uses MinIO presigned PUT uploads.

## Stack

- NestJS 11 + Prisma 7 (PostgreSQL via `@prisma/adapter-pg`)
- Auth: OAuth 2.0 Authorization Code + PKCE via BCN Profiles
- Password và 2FA được xử lý hoàn toàn tại Profiles trong luồng SSO
- Cache: Redis (`REDIS_HOST`/`REDIS_PORT` in production; legacy URL/Sentinel in development) for auth-token + shared GET catalog + Throttler; key prefix `bcn:quiz:`
- Logging: Winston (+ optional Loki)

## Setup

Cùng Postgres / Redis / MinIO với `bcn_profiles`. App chạy trên host:

```bash
cp .env.example .env
# DATABASE_URL=postgresql://postgres:postgres@localhost:5433/bcn_quiz?schema=public
# REDIS_URL=redis://localhost:6379
# REDIS_HOST=
# MINIO_ENDPOINT=http://127.0.0.1:9010
# MINIO_BUCKET=quizzes
# BCN_OAUTH_REDIRECT_URI=http://localhost:3001/api/auth/callback
# BCN_OAUTH_SUCCESS_REDIRECT_URL=http://localhost:5173/dashboard

npm install
npx prisma generate
npx prisma migrate deploy
npm run db:seed        # optional
npm run start:dev
```

API listens on `APP_PORT` (`PORT` remains supported locally). Production Redis uses `redis:6379`, DB 0 and `REDIS_PREFIX=quizzes:`.

## Scripts

| Script                   | Purpose                                 |
| ------------------------ | --------------------------------------- |
| `npm run start:dev`      | Watch mode                              |
| `npm run start:prod`     | Run `dist` (migration is a separate deploy step) |
| `npm run db:migrate`     | Create/apply migrations (dev)           |
| `npm run migrate:deploy` | Apply migrations (CI/prod)              |
| `npm test`               | Unit tests                              |
| `npm run lint`           | ESLint                                  |

## Main modules

- `auth` — BCN SSO login / callback / refresh / logout / me
- `quiz` / `topic` — catalog CRUD (admin), public quiz payloads hide answers
- `attempt` — timed topic sessions, scoring, topic progress
- `course` — curriculum, project submit/review, course progress
- `certificate` — issued certificates for completed courses

### Topic slug lookup

`GET /topic/slug/:slug` and `GET /topic/slug/:slug/quizzes` accept optional `?courseId=` because the same slug may exist in more than one course. Without `courseId`, an ambiguous slug returns `409 Conflict`.

### Topic schedule window

Optional `startsAt` / `endsAt` on a Topic control when students may take the exam set (inclusive start, exclusive end). Both `null` = always open (legacy topics). Responses include derived `availability`: `OPEN` | `SCHEDULED` | `CLOSED`.

- Before `startsAt`: start / save / submit are rejected (`TOPIC_NOT_OPEN_YET`).
- After `endsAt`: no new sessions and no saves (`TOPIC_CLOSED`); **submit** is still allowed for an existing session (same idea as session timer expiry).
- Session `expiresAt` is `min(now + expiresInMinutes, endsAt)` when `endsAt` is set.
- Admin can change the window any time via `PUT /topic/:id` (e.g. daily or weekly windows). Recurring RRULE schedules are out of scope.
- `GET /topic*` and course detail/slug/topics are **not** response-cached (schedule `availability` must stay fresh). Shared catalog cache covers `/quiz*`, `GET /course`, and project-requirement only; quiz/topic/course writes invalidate it.

## Production notes

- Prefer `migrate deploy` over `db push`.
- Do not commit `/data` (Docker volumes) or `/prisma/client` leftovers.
- Set `REQUEST_QUERY_LOG=false` unless debugging.

### BCN organization deployment

See [docs/DEPLOY.md](docs/DEPLOY.md) for shared PostgreSQL/Redis/MinIO, GitHub Environment `production`, database migration and the frontend MinIO upload flow.

See [docs/BCN_SSO.md](docs/BCN_SSO.md) for this app’s BFF wiring. Canonical SSO/RBAC contract for any BCN app: [BCN_CLIENT_APP_INTEGRATION.md](../../bcn_profiles/be/docs/BCN_CLIENT_APP_INTEGRATION.md).
