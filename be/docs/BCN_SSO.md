# BCN SSO trong Quiz

Quiz là **implementation mẫu**. Hợp đồng SSO + RBAC + Timeline:  
[BCN Profiles — Client App Integration](../../../bcn_profiles/be/docs/BCN_CLIENT_APP_INTEGRATION.md).

Password và 2FA chỉ nhập tại Profiles; Quiz không proxy credential.

## Đăng ký application

Profiles Admin → Applications, app `QUIZ` (hoặc import [`profiles-manifest.yaml`](./profiles-manifest.yaml)):

```text
Client ID: bcn-quiz
Name: BCN Quiz
accessMode: MEMBERS
Redirect URI production: https://quizzes.bcn.id.vn/api/auth/callback
Redirect URI local: http://localhost:3001/api/auth/callback
Roles: MEMBER (học), MENTOR (tạo/sửa câu hỏi), ADMIN (xoá + full)

**Test MENTOR:** import manifest → Profiles Admin gán user role `MENTOR` → login Quiz → `POST /api/quiz` được; `DELETE /api/quiz/:id` bị 403.
```

**`MEMBERS`:** user đã verify membership BCN vào được Quiz **không** cần grant từng người. Lần đầu SSO tự gán role catalog `MEMBER` (nếu có). Chỉ **block** cá nhân khi cần cấm.

Admin phải:

1. User verify membership (Discord/Zalo) trên Profiles.
2. App `accessMode=MEMBERS` + role `MEMBER` có permission MVP (xem manifest).
3. Gán app role `ADMIN` (Profiles) hoặc dùng platform `ADMIN` cho route `@Roles('admin')` hiện tại của Quiz BE.
4. Tạo server key → `PROFILES_CLIENT_SECRET` (Timeline Basic auth, không dùng PKCE).

## Cấu hình local

Redirect URI local phải đã đăng ký trên Profiles.

```env
PROFILES_API_BASE_URL=https://profiles.bcn.id.vn/api
BCN_OAUTH_ISSUER=https://profiles.bcn.id.vn/api
BCN_OAUTH_CLIENT_ID=bcn-quiz
BCN_OAUTH_REDIRECT_URI=http://localhost:3001/api/auth/callback
BCN_OAUTH_SUCCESS_REDIRECT_URL=http://localhost:5173/dashboard
PROFILES_CLIENT_SECRET=<server-key-from-profiles>
```

Production: `PROFILES_API_BASE_URL=http://bcn_profiles:3000/api`; `BCN_OAUTH_ISSUER` vẫn `https://profiles.bcn.id.vn/api`.

## Contract frontend Quiz

Base URL có prefix `/api`.

| Method | Endpoint | Mục đích |
| --- | --- | --- |
| `GET` | `/auth/login` | Redirect sang Profiles authorize |
| `GET` | `/auth/callback` | Đổi code, set cookie |
| `GET` | `/auth/me` | Profile hiện tại |
| `POST` | `/auth/refresh` | Rotate refresh |
| `POST` | `/auth/logout` | Revoke + xoá cookie |

```ts
window.location.assign(`${QUIZ_API_URL}/auth/login`);
```

```ts
await fetch(`${QUIZ_API_URL}/auth/me`, { credentials: 'include' });
```

Cookie `HttpOnly`: `quiz_access_token`, `quiz_refresh_token`. Nên cấu hình `BCN_OAUTH_SUCCESS_REDIRECT_URL`.

## Luồng

```text
Browser -> Quiz /api/auth/login
        -> Profiles /api/oauth/authorize (PKCE S256)
        -> Profiles login / membership / MEMBERS access / optional 2FA
        -> (auto MEMBER role nếu chưa có)
        -> Quiz /api/auth/callback?code&state
        -> Profiles /api/oauth/token + /api/me
        -> Quiz HttpOnly cookies
        -> FE success URL
```

Protected API Quiz revalidate qua Profiles `/api/me` (kèm `roles` + `permissions` của app). `AUTH_CACHE_TTL_MS=0` = revoke/block có hiệu lực ngay.

Route nội dung dùng `@Permissions('quiz.question.*')` từ manifest Profiles — không check platform `ADMIN`.

## Timeline

Basic `BCN_OAUTH_CLIENT_ID:PROFILES_CLIENT_SECRET` → `POST /api/internal/timeline-events`:

| Khi nào | Event | Idempotency key |
| --- | --- | --- |
| Topic coverage đúng ≥ 80% | `QUIZ_COMPLETE` | `quiz:topic:<topicId>:<userId>` |
| Course 100% + cấp certificate lần đầu | `COURSE_COMPLETE` | `quiz:course:<courseId>:<userId>` |

FE không gọi timeline. Không log/commit `PROFILES_CLIENT_SECRET`.
