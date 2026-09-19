# FE API Guide

> Upload dùng MinIO presigned PUT/GET. Giữ nguyên `secureUrl` và `publicId` từ response xin chữ ký; không tự thêm extension hoặc thay URL. Hướng dẫn presigned PUT/GET và cấu hình ở [DEPLOY.md](../DEPLOY.md).

Tai lieu nay tong hop toan bo API hien co de frontend tich hop nhanh.

> **Last updated:** 2026-09-19 — BCN SSO Authorization Code + PKCE, MinIO direct PUT/GET và metadata upload (mục 11). Các tính năng Quiz đã hỗ trợ: (1) An `answer` va `explanation` khoi cac API lay danh sach quiz (bao mat), chi tra ve sau khi user submit bai — xem Section 4 va 5. (2) Them API admin lay quiz kem dap an — Section 3.4b. (3) **Quiz ho tro cau hoi hinh anh**: `content.image` + `content.has_image` trong moi response quiz, upload qua `POST /quiz/upload/signature` — xem Section 4.4 va 4.7. (4) **`quizCode` optional**: khong gui khi create → backend tu sinh `q_001`, `q_002`, ...; khi update khong gui → giu ma cu — xem Section 4.4. (5) **Tao nhieu quiz 1 lan**: `POST /quiz/bulk` — xem Section 4.4b.

---

## 1) Base Information

- Base URL (production): `https://quizzes.bcn.id.vn/api`
- Base URL (dev theo `.env.example`): `http://localhost:3001/api`
- Storage: `https://storage.bcn.id.vn`, bucket `quizzes`
- Response nghiệp vụ được wrap theo format bên dưới. `/auth/*` trả raw SSO response hoặc redirect, không wrap lần hai; `/api/health` trả trực tiếp payload health:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {}
}
```

- Response loi (Profiles + Quiz) cung envelope:

```json
{
  "statusCode": 400,
  "message": "Bad Request" ,
  "error": "Bad Request",
  "data": null
}
```

`message` co the la string hoac mang string (validation).

- Validation dang bat:
  - `whitelist: true`
  - `forbidNonWhitelisted: true`
  - Neu gui field la se bi `400 Bad Request`.

- Pagination response chung:

```json
{
  "items": [],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10,
    "hasNext": true,
    "hasPrevious": false
  }
}
```

---

## 2) Authentication

Quiz chỉ dùng BCN SSO Authorization Code + PKCE. Password và 2FA được xử lý tại Profiles; FE không gửi credential cho Quiz.

### Public APIs

| Method | Endpoint | Ghi chu |
|---|---|---|
| `GET` | `/auth/login` | Top-level navigation; redirect sang Profiles |
| `GET` | `/auth/callback` | Profiles gọi; FE không gọi trực tiếp |
| `POST` | `/auth/refresh` | Rotate refresh token từ HttpOnly cookie |
| `POST` | `/auth/logout` | Revoke app session và xóa cookie Quiz |

### Protected APIs

API protected nhận cookie `quiz_access_token` hoặc Bearer app access token. Browser luôn gửi `credentials: 'include'`; không đọc cookie HttpOnly bằng JavaScript.

Đăng nhập bằng browser navigation:

```ts
window.location.assign(`${QUIZ_API_URL}/auth/login`);
```

Sau callback, backend redirect về `BCN_OAUTH_SUCCESS_REDIRECT_URL`. FE đọc user hiện tại:

```ts
await fetch(`${QUIZ_API_URL}/auth/me`, { credentials: 'include' });
```

`GET /auth/me` trả profile BCN. Khi access token hết hạn, gọi `POST /auth/refresh` một lần rồi retry request ban đầu. Nếu refresh trả `401`, chuyển về màn hình login.

Logout:

```ts
await fetch(`${QUIZ_API_URL}/auth/logout`, {
  method: 'POST',
  credentials: 'include',
});
```

Auth endpoints giới hạn 10 requests/phút/IP; API khác giới hạn chung 100 requests/phút. Backend revalidate app token qua Profiles `/api/me`; `AUTH_CACHE_TTL_MS=0` áp dụng block/revoke ngay.

Chi tiết backend và cấu hình: [BCN_SSO.md](./BCN_SSO.md).

---

## 3) Topic APIs

> **[Admin]** = chi admin moi goi duoc (Bearer token voi role `admin`).

### 3.1 Get topic list

`GET /topic?page=1&limit=10`

Response `data.items[]`:

```json
{
  "id": "...",
  "name": "JavaScript Basics",
  "slug": "javascript-basics",
  "imageUrl": "https://storage.bcn.id.vn/quizzes/topic-images/javascript-basics",
  "imagePublicId": "topic-images/javascript-basics",
  "createdAt": "...",
  "_count": { "quizzes": 10 }
}
```

`imageUrl` va `imagePublicId` co the la `null` neu topic chua co anh.

### 3.2 Get topic by id

`GET /topic/:id`

### 3.3 Get topic by slug

`GET /topic/slug/:slug`

### 3.4 Get quizzes in topic

1. `GET /topic/:id/quizzes?page=1&limit=10`
2. `GET /topic/slug/:slug/quizzes?page=1&limit=10`

Response `data.items[]` chi chua cau hoi va cac lua chon — **khong co `answer` va `explanation`**. Cau hoi hinh anh co `content.image` (URL) va `content.has_image` — xem Section 4.1. 

> Day la API chinh FE dung de hien thi man hinh lam bai. Viec an `answer` la co chu y — user khong the biet dap an bang cach inspect network response.

### 3.4b Get quizzes in topic (full, kem dap an) — [Admin]

`GET /topic/:id/quizzes/full?page=1&limit=10`

Danh cho man hinh admin cap nhat quiz trong topic. Format giong 3.4 nhung moi item co them `answer`, `explanation` va `imagePublicId` (de quan ly anh khi update):

```json
{
  "items": [
    {
      "id": "<quiz_id>",
      "quizCode": "c_case_01",
      "content": {
        "text": "...",
        "code": "...",
        "has_code": true,
        "image": "https://storage.bcn.id.vn/quizzes/quiz-images/abc",
        "has_image": true
      },
      "options": { "is_code": false, "data": { "1": "10", "2": "20" } },
      "answer": "2",
      "explanation": "...",
      "imagePublicId": "quiz-images/abc"
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 25, "totalPages": 3, "hasNext": true, "hasPrevious": false }
}
```

> Chi role `admin` goi duoc — user thuong bi `403`, chua dang nhap bi `401`.
> `content.image` va `imagePublicId` la `null` neu quiz khong co anh.

### 3.5 Create topic — [Admin]

`POST /topic`

Body:

```json
{
  "name": "JavaScript Basics",
  "slug": "javascript-basics",
  "courseId": "<course_id>",
  "imageUrl": "https://storage.bcn.id.vn/quizzes/topic-images/javascript-basics",
  "imagePublicId": "topic-images/javascript-basics"
}
```

Luu y:
- `courseId` bat buoc.
- `slug` chi can unique trong cung mot course, co the trung giua cac course khac.
- `imageUrl` va `imagePublicId` la optional, nhung neu gui phai gui **ca hai** cung luc. Gui mot trong hai -> `400`.
- `imageUrl` phai la URL khớp chính xác MINIO_ENDPOINT, bucket và object key.
- Lay `imageUrl` + `imagePublicId` bang cach upload anh truoc qua endpoint `POST /topic/upload/signature` (xem muc 3.8).

### 3.6 Update topic — [Admin]

`PUT /topic/:id`

Body (tat ca optional):

```json
{
  "name": "JavaScript Basics v2",
  "slug": "javascript-basics-v2",
  "imageUrl": "https://storage.bcn.id.vn/quizzes/topic-images/javascript-basics-v2",
  "imagePublicId": "topic-images/javascript-basics-v2"
}
```

Luu y:
- Khi cap nhat `imageUrl` + `imagePublicId` moi, anh cu tren MinIO se tu dong bi **xoa** neu `imagePublicId` khac.
- De xoa anh cua topic: gui `imageUrl: null, imagePublicId: null` — **khong ho tro hien tai**, chi update bang anh moi.

### 3.7 Delete topic — [Admin]

`DELETE /topic/:id`

- Xoa topic se tu dong xoa anh tren MinIO kem theo.

### 3.8 Upload topic image signature — [Admin]

`POST /topic/upload/signature` với body `{"publicId": "optional-name"}` trả presigned PUT/GET MinIO. Dùng đúng `uploadUrl` để PUT file trực tiếp; lấy `secureUrl`, `publicId` từ response xin chữ ký để lưu metadata. Giới hạn ảnh 3 MB, hết hạn 5 phút. Frontend tự chuyển WebP nếu cần. Xem [contract và ví dụ FE ở mục 11](#11-upload-minio-cho-fe).

## 4) Quiz APIs

> **[Admin]** = chi admin moi goi duoc.

> **Bao mat — answer an khoi response:** Tat ca API lay danh sach / chi tiet quiz (`GET /quiz`, `GET /quiz/:id`, `GET /quiz/code/:code`, `GET /topic/:id/quizzes`) **khong tra ve** field `answer` va `explanation`. Hai field nay chi xuat hien sau khi user **submit bai** (xem Section 5). Muc dich: tranh user doc dap an truoc khi lam bai.

### 4.1 Get quiz list

`GET /quiz?page=1&limit=10`

Response `data.items[]`:

```json
{
  "id": "...",
  "quizCode": "c_case_01",
  "content": {
    "text": "Ket qua xuat ra cua doan code sau la gi?",
    "code": "#include <stdio.h>\\nvoid main() { ... }",
    "has_code": true,
    "image": "https://storage.bcn.id.vn/quizzes/quiz-images/abc",
    "has_image": true
  },
  "options": {
    "is_code": false,
    "data": {
      "1": "10",
      "2": "20",
      "3": "30",
      "4": "Loi cu phap"
    }
  }
}
```

> `answer` va `explanation` **khong co** trong response nay.
> `content.image` la URL anh cua cau hoi (`null` neu khong co) — FE render anh nay ngay duoi text cau hoi khi `has_image: true`.

### 4.2 Get quiz by id

`GET /quiz/:id`

Response tuong tu 4.1 — khong co `answer`, `explanation`.

### 4.3 Get quiz by code

`GET /quiz/code/:code`

Response tuong tu 4.1. Luu y: `quizCode` chi unique trong 1 topic, endpoint nay tra quiz moi nhat theo `quizCode`.

### 4.4 Create quiz — [Admin]

`POST /quiz`

Body:

```json
{
  "question": "Ket qua xuat ra cua doan code sau la gi?",
  "code": "#include <stdio.h>\\nvoid main() { ... }",
  "answer": "2",
  "explanation": "Day la toan tu tam nguyen...",
  "topicId": "<topic_id>",
  "imageUrl": "https://storage.bcn.id.vn/quizzes/quiz-images/abc",
  "imagePublicId": "quiz-images/abc",
  "options": [
    { "label": "1", "content": "10", "isCode": false },
    { "label": "2", "content": "20", "isCode": false },
    { "label": "3", "content": "30", "isCode": false },
    { "label": "4", "content": "Loi cu phap", "isCode": false }
  ]
}
```

> **`quizCode` la optional:**
> - Khong gui → backend tu sinh theo thu tu trong topic: `q_001`, `q_002`, `q_003`, ...
> - Van co the gui tay neu muon dat ma rieng (vd. `c_case_01`). Trung trong cung topic → `409`.
> - Response create luon tra ve `quizCode` (ke ca khi tu sinh) de FE hien thi.

> **Quan trong — `answer` phai la label cua mot option:**
> `answer: "2"` nghia la dap an dung la option co `label: "2"` (noi dung "20").
> Neu `answer` khong khop voi bat ky label nao trong `options` → `400 Bad Request`.
> Vi du sai: options co label `"1"`, `"2"`, `"3"`, `"4"` nhung `answer: "A"` → bi reject.

**Cau hoi hinh anh (optional):**

- `imageUrl` + `imagePublicId` la optional, nhung neu gui phai gui **ca hai** cung luc. Gui mot trong hai → `400`.
- `imageUrl` phai la URL khớp chính xác MINIO_ENDPOINT, bucket và object key → sai → `400`.
- Lay `imageUrl` + `imagePublicId` bang cach upload anh truoc qua `POST /quiz/upload/signature` (xem muc 4.7).

### 4.4b Create many quizzes — [Admin]

`POST /quiz/bulk`

Tao nhieu quiz trong **1 request**. Toi da **200** quiz / lan. Tat ca-or-nothing: 1 item sai → ca batch bi reject, khong tao quiz nao.

Body:

```json
{
  "quizzes": [
    {
      "question": "Cau 1?",
      "answer": "1",
      "topicId": "<topic_id>",
      "options": [
        { "label": "1", "content": "A", "isCode": false },
        { "label": "2", "content": "B", "isCode": false }
      ]
    },
    {
      "question": "Cau 2?",
      "answer": "2",
      "topicId": "<topic_id>",
      "explanation": "...",
      "options": [
        { "label": "1", "content": "A", "isCode": false },
        { "label": "2", "content": "B", "isCode": false }
      ]
    }
  ]
}
```

Luu y:

- Moi item trong `quizzes[]` chap nhan **2 format**:
  1. Flat (khuyen nghi): `{ question, answer, topicId, options: [{ label, content, isCode }] }`
  2. Content format (giong response GET quiz): `{ content: { text, code, has_code, image }, options: { is_code, data }, answer, topicId }`
- Field `id` cua quiz/option neu FE gui len se **bi bo qua** (khong can xoa tay).
- `quizCode` van optional — khong gui thi backend tu sinh `q_001`, `q_002`, ... (khong trung trong topic, ke ca trong cung batch).
- Co the mix nhieu `topicId` trong 1 batch.
- Trung `quizCode` (trong DB hoac trong batch) → `409`.
- Item sai → `400` kem index `quizzes[i]` (all-or-nothing, khong tao quiz nao).
- Transaction timeout duoc set **120s** cho bulk (toi da 200 quiz).
- Body JSON limit mac dinh **5mb** (`BODY_LIMIT`) — batch lon (vd. 200 quiz) se bi `413 request entity too large` neu vuot limit cu (~100kb).

Response `data`:

```json
{
  "items": [
    { "id": "...", "quizCode": "q_001", "content": { "...": "..." }, "answer": "1", "explanation": "", "imagePublicId": null },
    { "id": "...", "quizCode": "q_002", "content": { "...": "..." }, "answer": "2", "explanation": "...", "imagePublicId": null }
  ],
  "count": 2
}
```

### 4.5 Update quiz — [Admin]

`PUT /quiz/:id`

Body giong create — `quizCode` optional; `answer` van phai la label hop le:

```json
{
  "question": "Noi dung moi",
  "code": "",
  "answer": "2",
  "explanation": "...",
  "topicId": "<topic_id>",
  "imageUrl": "https://storage.bcn.id.vn/quizzes/quiz-images/abc",
  "imagePublicId": "quiz-images/abc",
  "options": [
    { "label": "1", "content": "A", "isCode": false },
    { "label": "2", "content": "B", "isCode": false }
  ]
}
```

- Khong gui `quizCode` → giu nguyen ma cu.
- Gui `quizCode` moi → doi ma (van unique trong topic).
**Luu y ve anh khi update (PUT semantics — thay the toan bo):**

- Muon **giu anh cu**: gui lai `imageUrl` + `imagePublicId` hien tai (lay tu `GET /topic/:id/quizzes/full`).
- Muon **doi anh**: upload anh moi → gui `imageUrl` + `imagePublicId` moi. Anh cu tren MinIO se tu dong bi xoa.
- Muon **xoa anh**: khong gui 2 field nay (hoac gui `null`). Anh cu tren MinIO se tu dong bi xoa.

### 4.6 Delete quiz — [Admin]

`DELETE /quiz/:id`

- Xoa quiz se tu dong xoa anh cau hoi tren MinIO kem theo (neu co).

### 4.7 Upload quiz image signature — [Admin]

`POST /quiz/upload/signature` với body `{"publicId": "optional-name"}` trả presigned PUT/GET MinIO. Dùng đúng `uploadUrl` để PUT file trực tiếp; lấy `secureUrl`, `publicId` từ response xin chữ ký để lưu metadata. Giới hạn ảnh 3 MB, hết hạn 5 phút. Frontend tự chuyển WebP nếu cần. Xem [contract và ví dụ FE ở mục 11](#11-upload-minio-cho-fe).

## 5) Attempt + Session APIs

> **Khi nao FE nhan duoc `answer` va `explanation`?**
> - **Session submit** (`POST /attempt/session/:sessionId/submit`): response tra ve tong ket **va** `quizResults[]` chua `correctAnswer`, `isCorrect`, `explanation` tung cau ngay lap tuc — FE khong can goi them API de hien thi man hinh ket qua.
> - **Single quiz submit** (`POST /quiz/:id/attempt`): response tra ve `correctAnswer` va `explanation` ngay lap tuc sau khi nop 1 cau.
> - **Attempt detail** (`GET /attempt/me/:attemptId`): tra ve `quiz.answer` va `quiz.explanation` cho attempt cu.
> - **Progress topic** (`GET /progress/me/topic/:topicId`): `quizStats[].correctAnswer` **chi co khi quiz da tra loi** (`answered: true`); quiz chua lam → `correctAnswer: null` (khong lo dap an truoc).
> - **Session history** (`GET /attempt/sessions/me` + `GET /attempt/sessions/me/:sessionId`): lich su **theo tung lan nop bai** (lan 1, lan 2, ...), kem `quizResults` day du.

### 5.1 Session flow (khuyen nghi cho thi theo topic)

#### Start session

`POST /topic/:topicId/session/start`

Body (optional):

```json
{
  "expiresInMinutes": 525600
}
```

Range hop le: `5` → `525600` (toi da 1 nam). Mac dinh `525600`.
`expiresInMinutes` chi dung de don session bo do — **khong** phai dong ho thi. Cua so lam bai van do `topic.startsAt` / `topic.endsAt`.

Response `data`:

```json
{
  "id": "<sessionId>",
  "topicId": "...",
  "currentQuizId": null,
  "status": "IN_PROGRESS",
  "answers": {},
  "startedAt": "2026-06-25T10:00:00.000Z",
  "lastSeenAt": "2026-06-25T10:00:00.000Z",
  "expiresAt": "2026-06-25T10:30:00.000Z",
  "submittedAt": null
}
```

Luu y: neu user da co session `IN_PROGRESS` chua het han, se tra lai session do (khong tao moi).

#### Resume session

`GET /topic/:topicId/session/resume`

Tra `data: null` neu khong co session dang lam hoac session da het han.
Tra lai session object (gong start) neu con hop le — kem `answers` da luu truoc do.

#### Save progress (autosave)

`POST /attempt/session/:sessionId/save`

Body gon (khuyen nghi):

```json
{
  "currentQuizId": "<quiz_id>",
  "selectedAnswer": "2"
}
```

Body tuong thich nguoc (batch map):

```json
{
  "currentQuizId": "<quiz_id>",
  "answers": {
    "<quiz_id_1>": "2",
    "<quiz_id_2>": "3"
  }
}
```

Luu y:
- Neu gui `selectedAnswer` thi phai co `currentQuizId`.
- `answers` (batch) se merge vao cac cau da luu truoc, khong ghi de toan bo.
- Save **khong** gia han `expiresAt` (TTL chi de cleanup).
- Response tra lai session object voi `answers` da cap nhat.

#### Abandon session (huy bai do)

`POST /attempt/session/:sessionId/abandon`

Danh dau session `IN_PROGRESS` thanh `EXPIRED` de user co the start lai. Idempotent neu da `EXPIRED`.

#### Submit session

`POST /attempt/session/:sessionId/submit`

Body: none

Response `data`:

```json
{
  "sessionId": "...",
  "topicId": "...",
  "attemptedQuizCount": 5,
  "answeredCount": 4,
  "correctCount": 4,
  "score": 0.8,
  "submittedAt": "2026-04-02T07:00:00.000Z",
  "quizResults": [
    {
      "quizId": "...",
      "quizCode": "c_case_01",
      "content": {
        "text": "Ket qua xuat ra cua doan code sau la gi?",
        "code": "#include <stdio.h>\nvoid main() { ... }",
        "has_code": true,
        "image": null,
        "has_image": false
      },
      "options": {
        "is_code": false,
        "data": {
          "1": "10",
          "2": "20",
          "3": "30",
          "4": "Loi cu phap"
        }
      },
      "selectedAnswer": "1",
      "correctAnswer": "2",
      "isCorrect": false,
      "explanation": "Day la toan tu tam nguyen..."
    },
    {
      "quizId": "...",
      "quizCode": "c_case_02",
      "content": { "text": "...", "code": null, "has_code": false, "image": "https://storage.bcn.id.vn/quizzes/quiz-images/xyz", "has_image": true },
      "options": { "is_code": false, "data": { "1": "A", "2": "B" } },
      "selectedAnswer": null,
      "correctAnswer": "1",
      "isCorrect": false,
      "explanation": "..."
    }
  ]
}
```

Luu y:
- `quizResults` chua **tat ca cau hoi** trong topic, ke ca cau user **bo qua**.
- Cau da chon: `selectedAnswer` = gia tri da chon, `isCorrect` = `true`/`false`.
- Cau bo qua: `selectedAnswer: null`, `isCorrect: false` (tinh sai), van co `correctAnswer` va `explanation`.
- `score` = `correctCount / attemptedQuizCount` voi `attemptedQuizCount` = **tong so cau trong topic** (khong chi cau da tra loi).
- `selectedAnswer` va `correctAnswer` deu la **label cua option** (vi du `"1"`, `"2"`, `"3"`, `"4"`). FE dung label nay de map vao `options.data[label]` de lay noi dung hien thi.
- `content`, `options` co cung format voi GET quiz list — FE co the tai su dung component hien thi cau hoi.
- De hien thi man hinh ket qua sau submit, dung truc tiep `quizResults` tu response nay, **khong can goi them API**.

### 5.2 Single quiz submit (khong theo session)

`POST /quiz/:id/attempt`

Body:

```json
{
  "selectedAnswer": "2",
  "startedAt": "2026-04-02T13:30:00.000Z"
}
```

Response `data`:

```json
{
  "attemptId": "...",
  "quiz": { "id": "...", "quizCode": "c_case_01" },
  "selectedAnswer": "2",
  "correctAnswer": "2",
  "isCorrect": true,
  "score": 1,
  "explanation": "Day la toan tu tam nguyen...",
  "submittedAt": "2026-04-02T13:30:05.000Z",
  "durationMs": 5000
}
```

> Single submit tra ve `correctAnswer` va `explanation` ngay lap tuc.

### 5.3 Attempt history (theo cau)

**List my attempts:** `GET /attempt/me?page=1&limit=10`

Optional filters: `topicId`, `quizId`.

**Get attempt detail:** `GET /attempt/me/:attemptId`

Response attempt detail bao gom `quiz.answer` va `quiz.explanation` (vi user da tung tra loi cau nay).

Day la lich su **tung cau hoi** (moi dong = 1 quiz attempt). De xem lich su **theo lan nop bai**, dung Section 5.4.

### 5.4 Session submission history (theo lan nop)

Dung khi FE can man hinh: "Lan nop 1 / Lan nop 2 / ..." cho 1 topic.

#### List submitted sessions

`GET /attempt/sessions/me?topicId=<topicId>&page=1&limit=10`

Query:

| Param | Required | Mo ta |
|---|---|---|
| `topicId` | Khong bat buoc (khuyen nghi) | Loc theo topic |
| `page` | Khong | Mac dinh `1` |
| `limit` | Khong | Mac dinh `10`, max `100` |

Chi tra session `status IN (IN_PROGRESS, SUBMITTED, EXPIRED)` cua **chinh user dang login**. `IN_PROGRESS` xep truoc, roi theo thoi gian moi → cu.

Response `data`:

```json
{
  "items": [
    {
      "id": "<sessionId>",
      "topicId": "...",
      "topic": { "id": "...", "name": "...", "slug": "..." },
      "status": "SUBMITTED",
      "startedAt": "2026-07-13T08:00:00.000Z",
      "submittedAt": "2026-07-13T08:12:00.000Z",
      "durationMs": 720000,
      "answeredCount": 8,
      "correctCount": 6,
      "score": 0.6,
      "quizTotal": 10
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 3,
    "totalPages": 1,
    "hasNext": false,
    "hasPrevious": false
  }
}
```

`score` = `correctCount / quizTotal` (cau bo trong tinh sai). Session `IN_PROGRESS` co `score`/`correctCount` = `null`.

#### Get one submitted session detail

`GET /attempt/sessions/me/:sessionId`

Response `data` giong format ket qua submit (co `quizResults[]`):

```json
{
  "id": "<sessionId>",
  "topicId": "...",
  "topic": { "id": "...", "name": "...", "slug": "..." },
  "status": "SUBMITTED",
  "startedAt": "2026-07-13T08:00:00.000Z",
  "submittedAt": "2026-07-13T08:12:00.000Z",
  "durationMs": 720000,
  "answeredCount": 8,
  "correctCount": 6,
  "score": 0.6,
  "quizTotal": 10,
  "quizResults": [
    {
      "quizId": "...",
      "quizCode": "q_001",
      "attemptId": "...",
      "content": {
        "text": "...",
        "code": null,
        "has_code": false,
        "image": null,
        "has_image": false
      },
      "options": {
        "is_code": false,
        "data": { "1": "A", "2": "B", "3": "C", "4": "D" }
      },
      "selectedAnswer": "2",
      "correctAnswer": "2",
      "isCorrect": true,
      "explanation": "..."
    }
  ]
}
```

Luu y:
- Chi xem duoc session cua chinh minh; session chua nop (`IN_PROGRESS` / `EXPIRED`) se bi tu choi.
- `quizResults` gom **tat ca cau trong topic** (ke ca cau bo qua: `selectedAnswer: null`, `isCorrect: false`). `score` = `correctCount / quizTotal`.
- Session moi (sau thay doi nay) se co `attemptId` link toi `QuizAttempt`. Session cu van xem duoc (rebuild tu `answers` JSON).
- Sau submit, FE van dung truc tiep response submit de hien man hinh ket qua; API nay dung khi user **mo lai lich su** sau do.

---

## 6) Progress APIs

### 6.1 Global progress

`GET /progress/me`

Tra tong quan tat ca topic: `totalAttempts`, `correctAttempts`, `accuracy`, `byTopic`.

### 6.2 Topic progress detail

`GET /progress/me/topic/:topicId`

Tra thong ke chi tiet:
- `summary.totalQuizCount`
- `summary.attemptedQuizCount`
- `summary.unansweredQuizCount`
- `summary.correctQuizCount`
- `summary.wrongQuizCount`
- `summary.completionRate`
- `summary.accuracyByQuiz`
- `quizStats[]` — chi tiet tung quiz: `answered`, `selectedAnswer`, `correctAnswer` (null neu chua lam), `isCorrect`
- `recentAttempts[]`

---

## 7) Course APIs

Rule hoan thanh course:
- `topicWeight` + `projectWeight` (tren Course) quy dinh ty le dong gop vao `progressPercent` (mac dinh 50/50 neu co project; 100/0 neu khong co project).
- Hoan thanh tat ca topic (moi topic `isCompleted = true` khi **coverage** >= 80%: so quiz dung unique / tong quiz trong topic) → `topicProgressPercent` = `topicWeight` (vi du weight 10 → hien 10%). Neu khong co project → 100%.
- Phan project (`projectProgressPercent` = `projectWeight`) **chi duoc cong** khi admin **duyet** submission (`APPROVED`) — chi nop file chua duoc tinh %.
- `progressPercent` = `topicProgressPercent` + `projectProgressPercent` (cap 100 khi COMPLETED).
- Neu course khong co project requirement: hoan thanh tat ca topic se len 100%.

**Curriculum reopen (Option B) — quan trong cho FE:**
- Khi admin **them/doi topic** cua course, hoac **bat `hasProject`**, backend **re-evaluate ngay** tat ca user da co progress tren course do.
- Khi admin **them quiz** vao 1 topic, backend **mo lai** `TopicProgress.isCompleted` cua topic do, roi re-evaluate course lien quan.
- **Doc path heal:** `GET /course/:id/progress/me` van heal/recompute 1 course. `GET /course/progress/me` **mac dinh chi doc progress da luu** (nhanh); them `?revalidate=true` neu FE muon heal page hien tai. Admin doi curriculum van fan-out reevaluate o write path. Neu topic da complete nhung sau do co quiz moi (`quiz.createdAt > topicProgress.completedAt`), topic bi mo lai va % course giam khi revalidate/detail/write-path chay.
- Topic moi chua lam **khong** duoc tinh la complete → % = `so topic completed / tong topic` (va + project neu co).
- User dang `COMPLETED` + 100% co the bi **demote** ve `IN_PROGRESS` (hoac `PROJECT_PENDING_APPROVAL`) va % giam theo curriculum moi.
- **Chung chi khong bi xoa** (1 user / 1 course). Khi hoan thanh lai, cung 1 certificate duoc **refresh `issuedAt`** — khong tao chung chi moi, khong spam timeline `COURSE_COMPLETE` lan 2.
- FE nen goi lai `GET /course/progress/me` (hoac detail) sau khi admin doi noi dung / khi mo man "khoa hoc cua toi".

### 7.1 Learner APIs

| Method | Endpoint | Ghi chu |
|--------|----------|---------|
| `GET` | `/course?page=1&limit=10` | Catalog tat ca course |
| `GET` | `/course/progress/me` | Khoa hoc **toi dang lam / da hoan thanh** (co phan trang) |
| `GET` | `/course/slug/:slug` | |
| `GET` | `/course/:id` | |
| `GET` | `/course/:id/topics?page=1&limit=10` | |
| `GET` | `/course/:id/progress/me` | Chi tiet progress **1** course |
| `GET` | `/course/:id/project-submission/me` | |
| `GET` | `/course/:id/project-requirement` | De bai project (+ file dinh kem optional). `404` neu chua cau hinh |
| `POST` | `/course/:id/upload/signature` | Lay signature upload MinIO (project file) |
| `POST` | `/course/:id/project-submission` | Submit metadata file |
| `PATCH` | `/course/:id/project-submission/:submissionId` | Cap nhat submission (PENDING\_REVIEW hoac REJECTED) |
| `DELETE` | `/course/:id/project-submission/:submissionId` | Xoa submission (PENDING\_REVIEW hoac REJECTED) |

#### List my courses (dang lam / da xong)

`GET /course/progress/me?page=1&limit=10&scope=active`

Chi tra cac course ma user **da co ban ghi progress** (da bat dau lam).

Query:

| Param | Required | Mo ta |
|---|---|---|
| `page` | Khong | Mac dinh `1` |
| `limit` | Khong | Mac dinh `10`, max `100` |
| `scope` | Khong | `active` = dang lam (chua COMPLETED); `completed` = da hoan thanh |
| `status` | Khong | Loc dung 1 status: `IN_PROGRESS` \| `TOPICS_COMPLETED` \| `PROJECT_PENDING_APPROVAL` \| `COMPLETED`. Neu co `status` thi bo qua `scope`. |
| `revalidate` | Khong | `true`/`1` = heal/recompute page truoc khi tra. Mac dinh **tat** de list nhanh. |

Vi du tab FE:
- Dang hoc: `GET /course/progress/me?scope=active`
- Da xong: `GET /course/progress/me?scope=completed`
- Tat ca: `GET /course/progress/me`

Response `data`:

Y nghia cac field progress (vi du `topicWeight=10`, `projectWeight=90`):

| Field | Y nghia |
|---|---|
| `topicProgressPercent` | Phan tram khoa hoc den tu topic = `(so topic done / tong topic) * topicWeight`. Full topic → `10`. |
| `projectProgressPercent` | Phan tram den tu project = `projectWeight` khi submission **APPROVED**, nguoc lai `0`. Chi nop (pending) van la `0`. |
| `progressPercent` | Tong 2 phan tren (cap `100` khi `COMPLETED`). Full topic + chua duyet project → `10`, status `PROJECT_PENDING_APPROVAL`. |
| `course.topicWeight` / `projectWeight` | Trong so cau hinh tren Course (metadata). Mac dinh `50`/`50`. |

```json
{
  "items": [
    {
      "id": "<progressId>",
      "userId": "...",
      "courseId": "...",
      "topicProgressPercent": 50,
      "projectProgressPercent": 0,
      "progressPercent": 50,
      "status": "PROJECT_PENDING_APPROVAL",
      "topicsCompletedAt": "2026-07-16T08:00:00.000Z",
      "projectApprovedAt": null,
      "completedAt": null,
      "createdAt": "2026-07-10T08:00:00.000Z",
      "updatedAt": "2026-07-16T08:00:00.000Z",
      "course": {
        "id": "...",
        "name": "JavaScript Fundamentals",
        "slug": "javascript-fundamentals",
        "description": "...",
        "imageUrl": "https://...",
        "hasProject": true,
        "topicWeight": 50,
        "projectWeight": 50,
        "topicCount": 8,
        "projectRequirement": {
          "id": "...",
          "title": "Mini project",
          "isRequired": true
        }
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 2,
    "totalPages": 1,
    "hasNext": false,
    "hasPrevious": false
  }
}
```

Sap xep: `updatedAt` moi nhat truoc.

Upload project su dung direct upload MinIO:
- Cho phep: `.zip`, `.rar`, `.pdf`, `.docx`
- Toi da 5 file, moi file toi da 20 MB

**Flow upload project (4 buoc):**

```
1. POST /course/:id/upload/signature  →  nhan signature
2. FE upload file truc tiep len MinIO
3. Dùng secureUrl + publicId từ response xin chữ ký (MinIO có thể trả body rỗng)
4. POST /course/:id/project-submission  voi metadata file
```

**Luu y quan trong:**
- Moi user chi co 1 submission cho moi course. Neu da submit, dung `PATCH` de cap nhat.
- Response submission tra ve `files` la mang object (co `originalName`), khong con chi la URL string:

```json
"files": [
  {
    "id": "...",
    "secureUrl": "https://storage.bcn.id.vn/quizzes/project-submissions/<courseId>/<userId>/file",
    "publicId": "project-submissions/<courseId>/<userId>/file",
    "originalName": "my_project_v2.zip",
    "mimeType": "application/zip",
    "fileSize": 1048576,
    "sortOrder": 1
  }
]
```

- Khi `POST`/`PATCH`, FE **phai** gui `originalName` (ten file goc) trong moi item `files[]` — backend luu DB va tra lai o GET/response.

Body `POST /course/:id/upload/signature`:

```json
{
  "publicId": "my_project_v2"
}
```

Response `data`:

```json
{
  "provider": "minio",
  "method": "PUT",
  "uploadUrl": "https://storage.bcn.id.vn/quizzes/<object-key>?<PUT-signature>",
  "downloadUrl": "https://storage.bcn.id.vn/quizzes/<object-key>?<GET-signature>",
  "publicId": "project-submissions/<courseId>/<userId>/upload-<uuid>",
  "secureUrl": "https://storage.bcn.id.vn/quizzes/project-submissions/<courseId>/<userId>/upload-<uuid>",
  "maxBytes": 20971520,
  "maxFileSizeMb": 20,
  "expiresAt": "<ISO timestamp>"
}
```

Body `POST /course/:id/project-submission`:

```json
{
  "note": "Em nop bai lan dau",
  "files": [
    {
      "secureUrl": "https://storage.bcn.id.vn/quizzes/project-submissions/<courseId>/<userId>/my_project_v2",
      "publicId": "project-submissions/<courseId>/<userId>/my_project_v2",
      "originalName": "my_project_v2.zip",
      "mimeType": "application/zip",
      "fileSize": 1048576
    }
  ]
}
```

Body `PATCH /course/:id/project-submission/:submissionId`:

```json
{
  "note": "Em cap nhat ban moi",
  "removeFiles": [
    "<file.id hoặc secureUrl/publicId lấy từ submission hiện tại>"
  ],
  "files": [
    {
      "secureUrl": "https://storage.bcn.id.vn/quizzes/project-submissions/<courseId>/<userId>/new-file",
      "publicId": "project-submissions/<courseId>/<userId>/new-file",
      "originalName": "new-file.zip",
      "mimeType": "application/zip",
      "fileSize": 2097152
    }
  ]
}
```

Rule `PATCH`:
- Cho phep cap nhat khi status la `PENDING_REVIEW` hoac `REJECTED`.
- Khi cap nhat submission dang `REJECTED` → status tu dong reset ve `PENDING_REVIEW` (nop lai de cham diem).
- `APPROVED` → **khong** cho cap nhat hoac xoa.
- Mac dinh giu nguyen tat ca file cu neu **khong** truyen `files` va `removeFiles`.
- Neu truyen `files` (co phan tu) **ma khong** truyen `removeFiles` → **replace toan bo** file cu bang danh sach moi.
- `removeFiles`: co the dung `file.id`, `secureUrl`, hoac `publicId` (lay tu `files[]` trong GET/response).
- `files`: metadata file moi da upload len MinIO (**bat buoc** co `originalName`).
- Co the vua xoa file cu, vua them file moi trong cung 1 request.
- Tong so file sau cung phai nam trong khoang `1 → 5`.
- Chi sua `note` thi file **khong** doi — FE muon doi file phai gui `files` (va/hoac `removeFiles`).
- Response `files` luon kem `originalName` (ten file luc nop).

Rule `DELETE`:
- Cho phep xoa khi status la `PENDING_REVIEW` hoac `REJECTED`.
- `APPROVED` → **khong** cho xoa.

**TypeScript snippet (course project upload):**

Xem helper `uploadToMinio` trong [DEPLOY.md](../DEPLOY.md); giữ metadata `originalName`, `mimeType`, `fileSize` khi gửi submission.


### 7.2 Admin APIs

| Method | Endpoint | Ghi chu |
|--------|----------|---------|
| `POST` | `/course/upload/image-signature` | Lay signature upload anh cover course |
| `POST` | `/course` | Tao course |
| `PUT` | `/course/:id` | Cap nhat course |
| `DELETE` | `/course/:id` | Xoa course |
| `PUT` | `/course/:id/topics` | Cap nhat danh sach topic |
| `GET` | `/course/:id/project-requirement` | Lay de bai project (admin/learner deu dung duoc) |
| `POST` | `/course/:id/project-requirement/upload/signature` | Admin: signature upload file de bai (pdf/docx/zip/rar, optional) |
| `PUT` | `/course/:id/project-requirement` | Upsert de bai project (+ file dinh kem optional) |
| `GET` | `/course/:id/project-submission?status=...&page=1&limit=100` | List submission (array; mac dinh max 100/page) |
| `PATCH` | `/course/:id/project-submission/:submissionId/review` | Duyet bai nop |

Luu y project requirement:
- `GET /course/:id/project-requirement` — `404` neu chua upsert.
- `description` (text ngan) **bat buoc**. File dinh kem **optional** — dung de mo ta format / de bai chi tiet (PDF, DOCX, ZIP, RAR).
- Upload file de bai (admin):
  1. `POST /course/:id/project-requirement/upload/signature`
  2. PUT file tới `uploadUrl` cho folder `project-requirements/<courseId>/`
  3. `PUT /course/:id/project-requirement` kem `attachmentUrl` + `attachmentPublicId` (+ `attachmentOriginalName` khuyen nghi)
- Bo file: gui `attachmentUrl: null`, `attachmentPublicId: null` trong PUT.
- Khong gui 2 field attachment → giu file cu.
- Response GET/PUT:

```json
{
  "id": "...",
  "courseId": "...",
  "title": "Mini project",
  "description": "Nop zip + README. Chi tiet xem file dinh kem.",
  "isRequired": true,
  "attachmentUrl": "https://storage.bcn.id.vn/quizzes/project-requirements/<courseId>/brief",
  "attachmentPublicId": "project-requirements/<courseId>/brief",
  "attachmentOriginalName": "de-bai-project.pdf",
  "createdAt": "...",
  "updatedAt": "..."
}
```

**Body `PUT /course/:id/project-requirement`:**

```json
{
  "title": "Mini project",
  "description": "Tom tat yeu cau. Chi tiet trong file.",
  "isRequired": true,
  "attachmentUrl": "https://storage.bcn.id.vn/quizzes/project-requirements/<courseId>/brief",
  "attachmentPublicId": "project-requirements/<courseId>/brief",
  "attachmentOriginalName": "de-bai-project.pdf"
}
```

**Course response fields** (`imageUrl`, `imagePublicId` co the la `null`):

```json
{
  "id": "...",
  "name": "JavaScript Fundamentals",
  "slug": "javascript-fundamentals",
  "description": "...",
  "imageUrl": "https://storage.bcn.id.vn/quizzes/course-images/javascript-fundamentals",
  "imagePublicId": "course-images/javascript-fundamentals",
  "hasProject": true,
  "topicWeight": 50,
  "projectWeight": 50,
  "createdAt": "...",
  "updatedAt": "..."
}
```

**Body `POST /course`:**

```json
{
  "name": "JavaScript Fundamentals",
  "slug": "javascript-fundamentals",
  "description": "Khoa hoc co ban ve JavaScript",
  "imageUrl": "https://storage.bcn.id.vn/quizzes/course-images/javascript-fundamentals",
  "imagePublicId": "course-images/javascript-fundamentals",
  "hasProject": true,
  "topicWeight": 50,
  "projectWeight": 50
}
```

- `imageUrl` va `imagePublicId` la optional, nhung neu gui phai gui **ca hai** cung luc. Gui mot trong hai -> `400`.
- `imageUrl` phai la URL khớp chính xác MINIO_ENDPOINT, bucket và object key.
- Lay `imageUrl` + `imagePublicId` bang cach upload anh truoc qua `POST /course/upload/image-signature` (xem muc 7.4).
- **Trong so progress:** neu gui `topicWeight` / `projectWeight` thi phai gui **ca hai**, va:
  - `hasProject=true` → `topicWeight + projectWeight` **phai = 100** (thieu/thua → `400`, vd `"topicWeight + projectWeight must equal 100 (got 80)"`).
  - `hasProject=false` → chi chap nhan `topicWeight=100`, `projectWeight=0`.
  - Khong gui ca hai → backend dung mac dinh `50/50` (co project) hoac `100/0` (khong project).

**Body `PUT /course/:id`** (tat ca optional):

```json
{
  "name": "JavaScript Fundamentals v2",
  "slug": "javascript-fundamentals-v2",
  "description": "...",
  "imageUrl": "https://storage.bcn.id.vn/quizzes/course-images/javascript-fundamentals-v2",
  "imagePublicId": "course-images/javascript-fundamentals-v2",
  "hasProject": false
}
```

- Khi cap nhat `imagePublicId` moi khac cu, anh cu tren MinIO se tu dong bi **xoa**.
- Doi weight: cung rule nhu create — gui 1 trong 2 → `400`; tong ≠ 100 → `400`.
**Body `PATCH .../review`:**

```json
{
  "decision": "APPROVE",
  "reviewerNote": "Good architecture and documentation"
}
```

`decision` ho tro: `APPROVE`, `REJECT`.

### 7.3 Certificate APIs

`GET /certificate/me`

Chi tra ve chung chi sau khi course dat 100% (can auth).

`GET /certificate/verify/:code` — **Public** (khong can auth)

Xac minh chung chi theo ma. Response (trong `data`):

```json
{
  "valid": true,
  "certificateCode": "CRT-...",
  "issuedAt": "2026-01-01T00:00:00.000Z",
  "course": { "id": "...", "name": "...", "slug": "..." }
}
```

Khong tra userId / PII. Ma khong ton tai → `404` voi envelope loi:

```json
{ "statusCode": 404, "message": "Certificate not found", "error": "Not Found", "data": null }
```

---

### 7.4 Upload course image signature — [Admin]

`POST /course/upload/image-signature` với body `{"publicId": "optional-name"}` trả presigned PUT/GET MinIO. Dùng đúng `uploadUrl` để PUT file trực tiếp; lấy `secureUrl`, `publicId` từ response xin chữ ký để lưu metadata. Giới hạn ảnh 3 MB, hết hạn 5 phút. Frontend tự chuyển WebP nếu cần. Xem [contract và ví dụ FE ở mục 11](#11-upload-minio-cho-fe).

## 8) Session Expiration

- Cron job chay moi 5 phut.
- Session `IN_PROGRESS` qua `expiresAt` chuyen thanh `EXPIRED`.

---

## 9) Common Error Cases

| Code | Nguyen nhan |
|------|-------------|
| `400` | Sai DTO, gui field du, `selectedAnswer` khong co `currentQuizId`, `imageUrl` co nhung thieu `imagePublicId` (hoac nguoc lai), project submission het file sau update, submission vuot qua 5 file, `answer` khong khop voi bat ky label nao trong `options`, cap nhat/xoa submission da `APPROVED` |
| `401/403` | Thieu token, token het han, user truy cap resource khong phai cua minh |
| `404` | Topic / Quiz / Session / Attempt / Course khong ton tai |
| `409` | `quizCode` trung trong cung topic, `slug` trung trong cung course, user submit project lan 2 |
| `429` | Vuot rate limit (5 req/phut voi auth API, 100 req/phut chung) |

---

## 10) FE Integration Flow (Recommended)

### Course + Project flow

1. Login → lay access token.
2. Lay danh sach courses: `GET /course` (catalog) hoac `GET /course/progress/me` (khoa hoc cua toi).
3. Lay danh sach topics: `GET /topic` hoac `GET /course/:id/topics`.
4. Trong qua trinh hoc, theo doi tien do:
   - `GET /course/:id/progress/me`
   - `GET /progress/me/topic/:topicId`
5. Khi tat ca topic dat >= 80% → UI hien thi `topicWeight`% course progress (mac dinh 50; vd weight 10 → 10%). `projectProgressPercent` van 0 cho den khi admin duyet.
6. User nop project: `POST /course/:id/project-submission` (chi nop **chua** cong % project).
7. Neu bi REJECT → user cap nhat bai nop: `PATCH /course/:id/project-submission/:submissionId` → tu dong reset ve `PENDING_REVIEW`.
8. Neu da APPROVED → khong cho sua/xoa.
9. Sau khi admin approve → refresh `GET /course/:id/progress/me` de thay `projectProgressPercent` = `projectWeight` va `progressPercent` = 100.
10. Lay chung chi: `GET /certificate/me`.
11. Tab "Dang hoc" / "Da xong": `GET /course/progress/me?scope=active|completed`.

> **Luu y:** Khi khoa hoc dat 100% va chung chi duoc cap lan dau, backend tu dong ghi event `COURSE_COMPLETE` sang Timeline Profiles. FE khong can goi them API timeline.

### Topic quiz session flow

1. User chon topic → `POST /topic/:topicId/session/start`.
2. Lay danh sach quiz → `GET /topic/:topicId/quizzes` — **chi co cau hoi + cac lua chon, khong co answer**.
3. Moi lan user chon dap an → `POST /attempt/session/:sessionId/save`.
4. User quay lai app → `GET /topic/:topicId/session/resume` (kem `answers` da chon truoc do).
5. Nop bai → `POST /attempt/session/:sessionId/submit`.
6. **Hien thi ket qua tung cau ngay tu response submit** — `quizResults[]` co san `correctAnswer`, `isCorrect`, `explanation` tung cau. Khong can goi them API.
7. Hien thi dashboard tong → `GET /progress/me`.
8. Xem lai lich su **theo lan nop** → `GET /attempt/sessions/me?topicId=...` roi `GET /attempt/sessions/me/:sessionId`.

Khi coverage dap an dung cua topic dat tu 80%, backend tu dong ghi `QUIZ_COMPLETE` sang Timeline Profiles. Idempotency key theo topic + user dam bao submit lai khong tao event trung; FE khong can goi endpoint timeline.

> **Tai sao khong can goi them `GET /progress/me/topic/:topicId` sau submit?**
> Submit session gio tra ve `quizResults[]` day du. API progress van huu ich khi user muon **xem lai thong ke tong hop** (accuracy sticky, quizStats). De xem tung lan nop cu the, dung `GET /attempt/sessions/me`.

### Topic image upload flow (admin)

1. Admin chon anh cho topic.
2. Lay signature: `POST /topic/upload/signature` (voi cookie phiên admin hoặc Bearer hợp lệ).
3. Upload anh truc tiep len MinIO.
4. Lay `imageUrl` + `imagePublicId` từ response xin chữ ký MinIO.
5. Gui cung voi topic data khi tao (`POST /topic`) hoac cap nhat (`PUT /topic/:id`).

### Course image upload flow (admin)

1. Admin chon anh cover cho course.
2. Lay signature: `POST /course/upload/image-signature` (voi cookie phiên admin hoặc Bearer hợp lệ).
3. Upload anh truc tiep len MinIO.
4. Lay `imageUrl` + `imagePublicId` từ response xin chữ ký MinIO.
5. Gui cung voi course data khi tao (`POST /course`) hoac cap nhat (`PUT /course/:id`).
6. Khi xoa course, anh tren MinIO se tu dong bi xoa theo.

### Quiz image upload flow (admin)

1. Admin chon anh cho cau hoi (cau hoi dang hinh anh).
2. Lay signature: `POST /quiz/upload/signature` (voi cookie phiên admin hoặc Bearer hợp lệ).
3. Upload anh truc tiep len MinIO.
4. Lay `imageUrl` + `imagePublicId` từ response xin chữ ký MinIO.
5. Gui cung voi quiz data khi tao (`POST /quiz`) hoac cap nhat (`PUT /quiz/:id`).
6. FE hien thi: moi response quiz co `content.image` (URL) + `content.has_image` — render anh duoi text cau hoi.
7. Doi anh / xoa quiz → anh cu tren MinIO tu dong bi xoa.


## 11) Upload MinIO cho FE

| Xin chữ ký (POST) | Quyền | Folder mặc định trong bucket `quizzes` | Giới hạn |
| --- | --- | --- | --- |
| `/topic/upload/signature` | ADMIN | `topic-images/` | 3 MiB ảnh |
| `/quiz/upload/signature` | ADMIN | `quiz-images/` | 3 MiB ảnh |
| `/course/upload/image-signature` | ADMIN | `course-images/` | 3 MiB ảnh |
| `/course/:id/project-requirement/upload/signature` | ADMIN | `project-requirements/<courseId>/` | 20 MiB file |
| `/course/:id/upload/signature` | Đã đăng nhập | `project-submissions/<courseId>/<userId>/` | 20 MiB file |

Giới hạn ảnh có thể cấu hình; ưu tiên `maxBytes` từ response. File project/requirement cho phép `.zip`, `.rar`, `.pdf`, `.docx`; submission tối đa 5 file. Course phải có `hasProject=true` để xin chữ ký nộp bài. Xin một signature riêng cho mỗi file.

### Contract upload MinIO

Cập nhật ngày **2026-09-12**. Upload trực tiếp là **PUT raw file**, không dùng multipart/FormData hoặc SDK Cloudinary.

1. Gọi API xin URL bằng JSON `{}` hoặc `{"publicId":"profile-photo"}` với cookie đăng nhập. `publicId` là tên gợi ý, tối đa 200 ký tự; backend chọn folder và thêm UUID. Không gửi `timestamp`, `folder`, `format`, `quality`, `apiKey`, `cloudName`.
2. Đọc payload ở `response.data`. API xin chữ ký trả HTTP **201**, theo envelope `{statusCode, message, data}`.
3. Kiểm tra `0 < file.size <= data.maxBytes`, rồi PUT file tới **nguyên văn** `data.uploadUrl`. Gửi `Content-Type` đúng MIME của file; ảnh phải có MIME `image/*`. Không đổi host, path hoặc query; chữ ký đã được tạo bằng `https://storage.bcn.id.vn`.
4. Chỉ sau khi PUT thành công, gọi API lưu metadata với `data.secureUrl` và `data.publicId`. PUT MinIO thường trả body rỗng: không gọi `response.json()` và không lấy metadata từ response PUT.

Các key/URL trong ví dụ là minh họa; khi chạy thật luôn lấy nguyên cặp URL/key backend trả về, gồm UUID.

Các trường trong `data`:

| Trường | FE sử dụng |
| --- | --- |
| `provider` | `"minio"` |
| `method` | `"PUT"` |
| `uploadUrl` | URL có chữ ký để upload, hiệu lực 300 giây |
| `downloadUrl` | URL có chữ ký GET, hiệu lực 300 giây; dùng preview sau PUT |
| `secureUrl` | URL cố định, không có query; dùng lưu DB |
| `publicId` | Toàn bộ object key, gồm folder và UUID; giữ nguyên |
| `maxBytes` | Giới hạn chính xác theo byte, ưu tiên giá trị response |
| `maxFileSizeMb` | `maxBytes / 1024 / 1024`, dùng hiển thị giới hạn |
| `expiresAt` | ISO timestamp để FE kiểm tra URL upload hết hạn |

**URL lưu DB và URL download:** Không lưu `uploadUrl`/`downloadUrl` vào metadata. `secureUrl` chỉ mở trực tiếp được nếu quyền đọc object cho phép. API đọc avatar/ảnh/file hiện trả URL đã lưu, không tự tạo chữ ký GET mới; hiện chưa có endpoint công khai để xin lại `downloadUrl` cho object cũ. Với bucket private, FE cần API cấp URL đọc mới trước khi triển khai xem/download lâu dài; không dùng presigned URL đã hết hạn.

**Lỗi và retry:** API trả lỗi JSON envelope; MinIO có thể trả lỗi XML hoặc body rỗng. API `401` → refresh phiên trên cùng service rồi retry; `403` → kiểm tra role. PUT `403` → kiểm tra hạn URL và việc giữ nguyên URL; xin chữ ký mới khi hết hạn (tạo key mới). Không tự retry request lưu metadata vô hạn. Metadata `400` có thể do URL/key không khớp, object chưa upload, vượt kích thước hoặc MIME ảnh sai. Backend kiểm tra object bằng HEAD khi lưu metadata; PUT thành công chưa đồng nghĩa metadata hợp lệ.

**CORS và quyền:** API dùng `credentials: 'include'`; PUT/GET MinIO dùng `credentials: 'omit'`, không gửi Bearer hay cookie ứng dụng. Bucket phải cho phép origin FE, method `GET`, `HEAD`, `PUT` và header `Content-Type`. Lỗi CORS cần xử lý cấu hình bucket/proxy, không dùng `mode: 'no-cors'`. Không đưa `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` vào FE. Backend không chuyển ảnh sang WebP; nếu FE chuyển ảnh thì dùng MIME/kích thước của file sau chuyển đổi. Object upload nhưng chưa lưu metadata không có endpoint FE riêng để xóa.

Ví dụ helper dùng trong browser (đăng nhập và hoàn tất 2FA trước):

```javascript
async function uploadToMinio(apiBase, signaturePath, file) {
  const signatureResponse = await fetch(`${apiBase}${signaturePath}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const envelope = await signatureResponse.json();
  if (!signatureResponse.ok) {
    throw new Error(JSON.stringify(envelope.message));
  }
  const signed = envelope.data;
  if (file.size === 0 || file.size > signed.maxBytes) {
    throw new Error(`File phải từ 1 đến ${signed.maxBytes} byte`);
  }
  if (Date.now() >= Date.parse(signed.expiresAt)) {
    throw new Error('URL upload đã hết hạn; xin URL mới');
  }
  const putResponse = await fetch(signed.uploadUrl, {
    method: signed.method,
    credentials: 'omit',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!putResponse.ok) {
    throw new Error(`MinIO upload lỗi HTTP ${putResponse.status}`);
  }
  return signed; // Sau đó lưu metadata bằng API tương ứng bên dưới.
}
```

### Map metadata sau PUT

| Nghiệp vụ | API lưu | Body upload cần ghép vào DTO nghiệp vụ |
| --- | --- | --- |
| Ảnh topic | POST `/topic`, PUT `/topic/:id` | `imageUrl: signed.secureUrl`, `imagePublicId: signed.publicId` |
| Ảnh câu hỏi | POST `/quiz`, PUT `/quiz/:id` | `imageUrl: signed.secureUrl`, `imagePublicId: signed.publicId` |
| Ảnh course | POST `/course`, PUT `/course/:id` | `imageUrl: signed.secureUrl`, `imagePublicId: signed.publicId` |
| File đề bài | PUT `/course/:id/project-requirement` | `attachmentUrl: signed.secureUrl`, `attachmentPublicId: signed.publicId`, `attachmentOriginalName: file.name` |
| File nộp bài | POST `/course/:id/project-submission`, PATCH `/course/:id/project-submission/:submissionId` | `files[]` như ví dụ dưới |

```javascript
const apiBase = 'https://quizzes.bcn.id.vn';
const signed = await uploadToMinio(apiBase, `/course/${courseId}/upload/signature`, file);
const response = await fetch(`${apiBase}/course/${courseId}/project-submission`, {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    note: 'Bài nộp',
    files: [{
      secureUrl: signed.secureUrl,
      publicId: signed.publicId,
      originalName: file.name,
      mimeType: file.type || 'application/octet-stream',
      fileSize: file.size,
    }],
  }),
});
const result = await response.json();
if (!response.ok) throw new Error(JSON.stringify(result.message));
```

Tên file gốc có extension nằm ở `originalName`/`attachmentOriginalName`; không thêm extension vào object key. DTO nghiệp vụ vẫn yêu cầu các field riêng như question/options, tên topic/course hoặc description đề bài — xem mục 3, 4, 7.

Khi PUT cập nhật quiz, bỏ cả `imageUrl`/`imagePublicId` hoặc gửi null sẽ xóa ảnh; để giữ ảnh phải gửi lại cặp metadata hiện tại. Khi sửa requirement, bỏ cả hai field attachment sẽ giữ file cũ; gửi cả hai null để xóa. Quy tắc thay thế/giữ/xóa file submission bằng `files` và `removeFiles` ở mục 7.1 vẫn áp dụng.
