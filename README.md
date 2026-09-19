# BCN Quiz

Repository gồm hai ứng dụng độc lập, cùng cấu trúc với BCN Profiles:

- `be/`: NestJS API, Prisma, Redis, MinIO và BCN SSO.
- `fe/`: Next.js web app cho học viên và quản trị viên.

Production: frontend `https://quizzes.bcn.id.vn`, API `https://quizzes.bcn.id.vn/api`.

## Chạy local

Postgres, Redis và MinIO dùng **cùng container với bcn_profiles** (host `5433` / `6379` / `9010`). Không bật thêm DB trong `bcn_quiz`.

Terminal 1, backend. `be/.env` local giống Profiles, chỉ đổi database/bucket/prefix:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/bcn_quiz?schema=public
REDIS_URL=redis://localhost:6379
REDIS_HOST=
REDIS_PREFIX=quizzes:
MINIO_ENDPOINT=http://127.0.0.1:9010
MINIO_BUCKET=quizzes
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_FORCE_PATH_STYLE=true
```

```bash
cd /Users/trantuanhung/Documents/learning_it/nestjs/bcn_quiz/be
cp .env.example .env   # lần đầu, rồi giữ secret SSO nếu đã có
npm install
npx prisma generate
npx prisma migrate deploy
npm run start:dev
```

Lần đầu API sẽ tạo bucket `quizzes` trên MinIO đang chạy (Profiles dùng bucket `profiles` trên cùng instance).

Terminal 2, frontend:

```bash
cd /Users/trantuanhung/Documents/learning_it/nestjs/bcn_quiz/fe
cp .env.example .env
pnpm install
pnpm dev
```

Kiểm tra:

```bash
curl -sS http://localhost:3001/api/health
open http://localhost:5173
```

| Service | URL local |
| --- | --- |
| Quiz frontend | `http://localhost:5173` |
| Quiz API | `http://localhost:3001/api` |
| Postgres (chung Profiles) | `localhost:5433`, DB `bcn_quiz` |
| Redis (chung Profiles) | `localhost:6379`, prefix `quizzes:` |
| MinIO (chung Profiles) | `http://127.0.0.1:9010`, bucket `quizzes` |
| Profiles SSO | `https://profiles.bcn.id.vn` |

Để test Quiz local với Profiles, application `QUIZ` cần:

- `accessMode=MEMBERS` (mọi thành viên BCN vào được; không grant từng user)
- redirect URI `http://localhost:3001/api/auth/callback`
- role `MEMBER` + permission MVP (xem [be/docs/profiles-manifest.yaml](be/docs/profiles-manifest.yaml))

Backend dùng:

```env
PROFILES_API_BASE_URL=https://profiles.bcn.id.vn/api
BCN_OAUTH_ISSUER=https://profiles.bcn.id.vn/api
BCN_OAUTH_REDIRECT_URI=http://localhost:3001/api/auth/callback
BCN_OAUTH_SUCCESS_REDIRECT_URL=http://localhost:5173/dashboard
```

Tài liệu: [be/docs/BCN_SSO.md](be/docs/BCN_SSO.md), [be/docs/FE_API_GUIDE.md](be/docs/FE_API_GUIDE.md).
