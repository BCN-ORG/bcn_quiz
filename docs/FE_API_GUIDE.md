# FE API Guide

Tai lieu nay tong hop toan bo API hien co de frontend tich hop nhanh.

> **Last updated:** July 2026 — (1) An `answer` va `explanation` khoi cac API lay danh sach quiz (bao mat), chi tra ve sau khi user submit bai — xem Section 4 va 5. (2) Them API admin lay quiz kem dap an — Section 3.4b. (3) **Quiz ho tro cau hoi hinh anh**: `content.image` + `content.has_image` trong moi response quiz, upload qua `POST /quiz/upload/signature` — xem Section 4.4 va 4.7. (4) **`quizCode` optional**: khong gui khi create → backend tu sinh `q_001`, `q_002`, ...; khi update khong gui → giu ma cu — xem Section 4.4. (5) **Tao nhieu quiz 1 lan**: `POST /quiz/bulk` — xem Section 4.4b.

---

## 1) Base Information

- Base URL (dev): `http://localhost:3000`
- Base URL (prod): `https://quizzes.uside.id.vn`
- Cong cu do latency tren browser: mo `docs/api-latency-tester.html` (khuyen nghi `npx --yes serve docs -p 5173`) — login/token roi chay cac GET, so sanh client time voi header `X-Response-Time-Ms` (neu API co tra).
- Tat ca response thanh cong duoc wrap theo format:

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

### ⚡ Security Notes

1. **Rate Limiting**
   - Cac API Auth nhay cam (`/auth/login`, `/auth/refresh`, `/auth/2fa/...`) gioi han toi da **5 requests / 1 phut** tren moi IP.
   - Vuot gioi han -> HTTP `429 Too Many Requests`. FE hien thong bao "Vui long thao tac cham lai".
   - Cac API con lai gioi han chung **100 requests / 1 phut**.

2. **Refresh Token Flow**
   - Goi `/auth/refresh` khong co `authorization` header hoac cookie `refresh` -> `401` voi detail code `MISSING_REFRESH_TOKEN`.
   - Co refresh token nhung het han / khong hop le -> `401` voi detail code `INVALID_REFRESH_TOKEN`.
   - FE dung 2 ma loi nay de buoc user logout hoac chuyen ve `/login`.

3. **Hieu suat**
   - Toan bo JSON response tu dong nen `gzip`. FE khong can config them.
   - Backend cache ket qua `GET /auth/me` (Profiles) tren Redis theo token (env `AUTH_CACHE_TTL_MS`, prefix `bcn:quiz:`) de giam latency request protected. FE van nen gui Bearer token nhu binh thuong; khong can doi flow. Logout se xoa cache key token hien tai.
   - **Shared GET catalog cache** ngan (~20s, `GET_CACHE_TTL_MS`) chi cho `/quiz*`, `GET /course` (list), va `GET /course/:id/project-requirement`. Header `X-Cache: HIT|MISS|BYPASS`. Tat bang `GET_CACHE_ENABLED=false` hoac `?nocache=1`.
   - **Khong cache** topic (schedule), course detail/slug/topics, progress, attempt, certificate, auth response body — tranh stale / leak theo user.
   - Sau POST/PUT/PATCH/DELETE `/quiz|/topic|/course` (tru submission/session), server **invalidate** shared catalog cache.

### Public APIs

| Method | Endpoint | Ghi chu |
|--------|----------|---------|
| `POST` | `/auth/login` | |
| `POST` | `/auth/2fa/verify/totp` | |
| `POST` | `/auth/2fa/verify/email` | Body: `{ "code": "123456" }` |
| `POST` | `/auth/2fa/send-email-otp` | Body (optional): `{ "email": "user@example.com" }` — goi truoc khi verify email OTP |
| `POST` | `/auth/refresh` | |
| `POST` | `/auth/logout` | Body: `{}` |

### Protected APIs

Tat ca API con lai yeu cau xac thuc.

```http
Authorization: Bearer <access_token>
```

### Get current user

`GET /auth/me`

### Logout

`POST /auth/logout` — Body: `{}`

FE nen goi truoc khi xoa token local de backend clear session-cookie dong bo.

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
  "imageUrl": "https://res.cloudinary.com/...",
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
        "image": "https://res.cloudinary.com/<cloud>/image/upload/quiz-images/abc.png",
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
  "imageUrl": "https://res.cloudinary.com/...",
  "imagePublicId": "topic-images/javascript-basics"
}
```

Luu y:
- `courseId` bat buoc.
- `slug` chi can unique trong cung mot course, co the trung giua cac course khac.
- `imageUrl` va `imagePublicId` la optional, nhung neu gui phai gui **ca hai** cung luc. Gui mot trong hai -> `400`.
- `imageUrl` phai la HTTPS URL thuoc `res.cloudinary.com` va dung cloud name.
- Lay `imageUrl` + `imagePublicId` bang cach upload anh truoc qua endpoint `POST /topic/upload/signature` (xem muc 3.8).

### 3.6 Update topic — [Admin]

`PUT /topic/:id`

Body (tat ca optional):

```json
{
  "name": "JavaScript Basics v2",
  "slug": "javascript-basics-v2",
  "imageUrl": "https://res.cloudinary.com/...",
  "imagePublicId": "topic-images/javascript-basics-v2"
}
```

Luu y:
- Khi cap nhat `imageUrl` + `imagePublicId` moi, anh cu tren Cloudinary se tu dong bi **xoa** neu `imagePublicId` khac.
- De xoa anh cua topic: gui `imageUrl: null, imagePublicId: null` — **khong ho tro hien tai**, chi update bang anh moi.

### 3.7 Delete topic — [Admin]

`DELETE /topic/:id`

- Xoa topic se tu dong xoa anh tren Cloudinary kem theo.

### 3.8 Upload topic image signature — [Admin]

`POST /topic/upload/signature`

Lay signature de FE upload anh truc tiep len Cloudinary (khong qua server).

Anh quiz/topic/course duoc convert thanh **WebP** luc upload (`format=webp` nam trong signature). FE phai gui lai `format` trong form Cloudinary neu signature co field do. File project submission **khong** bi convert.

Gioi han kich thuoc anh: **toi da 3MB** (config `CLOUDINARY_IMAGE_MAX_BYTES`). Signature tra `maxBytes` / `maxFileSizeMb` de FE check `file.size` truoc khi upload; backend verify lai khi create/update (vuot → `400`, anh tren Cloudinary bi xoa).

Body (optional):

```json
{
  "publicId": "javascript-basics"
}
```

- `publicId`: ten file muon dat tren Cloudinary. De trong de Cloudinary tu sinh.

Response `data`:

```json
{
  "signature": "abc123...",
  "timestamp": 1718000000,
  "folder": "topic-images",
  "apiKey": "your_api_key",
  "cloudName": "your_cloud",
  "resourceType": "auto",
  "uploadUrl": "https://api.cloudinary.com/v1_1/your_cloud/auto/upload",
  "format": "webp",
  "maxBytes": 3145728,
  "maxFileSizeMb": 3
}
```

**Flow upload anh cho topic (3 buoc):**

```
1. POST /topic/upload/signature  →  nhan signature
2. FE upload anh truc tiep len Cloudinary (multipart/form-data)
3. POST /topic hoac PUT /topic/:id  voi { imageUrl, imagePublicId }
```

**TypeScript snippet:**

```ts
type UploadSignatureResponse = {
  signature: string;
  timestamp: number;
  folder: string;
  apiKey: string;
  cloudName: string;
  resourceType: 'auto';
  uploadUrl: string;
  /** Backend mac dinh `webp` — FE BAT BUOC append neu co. */
  format?: string;
  /** Thuong khong co. Chi append neu signature tra ve. */
  quality?: string;
  /** Mac dinh 3MB — FE check file.size truoc khi upload. */
  maxBytes?: number;
  maxFileSizeMb?: number;
};

async function getTopicImageSignature(publicId?: string): Promise<UploadSignatureResponse> {
  const res = await fetch('/topic/upload/signature', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify(publicId ? { publicId } : {}),
  });
  if (!res.ok) throw new Error('Cannot get signature');
  const payload = await res.json();
  return payload.data;
}

async function uploadTopicImage(file: File, sig: UploadSignatureResponse, publicId?: string) {
  if (sig.maxBytes && file.size > sig.maxBytes) {
    throw new Error(`Image must be <= ${sig.maxFileSizeMb ?? 3}MB`);
  }

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', sig.apiKey);
  form.append('timestamp', String(sig.timestamp));
  form.append('signature', sig.signature);
  form.append('folder', sig.folder);
  form.append('resource_type', sig.resourceType);
  // Convert/store as WebP (signed). Thieu format → Invalid Signature.
  if (sig.format) form.append('format', sig.format);
  if (sig.quality) form.append('quality', sig.quality); // chi khi BE tra ve
  if (publicId) form.append('public_id', publicId);

  const res = await fetch(sig.uploadUrl, { method: 'POST', body: form });
  if (!res.ok) throw new Error('Cloudinary upload failed');
  const result = await res.json();

  return {
    imageUrl: result.secure_url as string,
    imagePublicId: result.public_id as string,
  };
}

// Usage:
async function createTopicWithImage(file: File, topicData: { name: string; slug: string; courseId: string }) {
  const publicId = file.name.replace(/\.[^.]+$/, '');
  const sig = await getTopicImageSignature(publicId);
  const { imageUrl, imagePublicId } = await uploadTopicImage(file, sig, publicId);

  const res = await fetch('/topic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ ...topicData, imageUrl, imagePublicId }),
  });
  return res.json();
}
```

---

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
    "image": "https://res.cloudinary.com/<cloud>/image/upload/quiz-images/abc.png",
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
  "imageUrl": "https://res.cloudinary.com/<cloud>/image/upload/quiz-images/abc.png",
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
- `imageUrl` phai la HTTPS URL thuoc `res.cloudinary.com` va dung cloud name → sai → `400`.
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
  "imageUrl": "https://res.cloudinary.com/<cloud>/image/upload/quiz-images/abc.png",
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
- Muon **doi anh**: upload anh moi → gui `imageUrl` + `imagePublicId` moi. Anh cu tren Cloudinary se tu dong bi xoa.
- Muon **xoa anh**: khong gui 2 field nay (hoac gui `null`). Anh cu tren Cloudinary se tu dong bi xoa.

### 4.6 Delete quiz — [Admin]

`DELETE /quiz/:id`

- Xoa quiz se tu dong xoa anh cau hoi tren Cloudinary kem theo (neu co).

### 4.7 Upload quiz image signature — [Admin]

`POST /quiz/upload/signature`

Lay signature de FE upload anh cau hoi truc tiep len Cloudinary (khong qua server) — giong het flow cua topic (Section 3.8), chi khac folder mac dinh la `quiz-images`. Response co `format` (mac dinh webp) — FE phai append khi upload.

Body (optional):

```json
{
  "publicId": "c-case-01"
}
```

Response `data`: giong Section 3.8 (`signature`, `timestamp`, `folder`, `apiKey`, `cloudName`, `resourceType`, `uploadUrl`).

**Flow upload anh cho quiz (3 buoc):**

```
1. POST /quiz/upload/signature  →  nhan signature
2. FE upload anh truc tiep len Cloudinary (multipart/form-data)
3. POST /quiz hoac PUT /quiz/:id  voi { imageUrl, imagePublicId }
```

TypeScript snippet o Section 3.8 tai su dung duoc — chi doi URL signature sang `/quiz/upload/signature`.

---

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
  "expiresInMinutes": 30
}
```

Range hop le: `5` → `240`. Mac dinh `30`.

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
- Moi lan save se gia han session them 30 phut.
- Response tra lai session object voi `answers` da cap nhat.

#### Submit session

`POST /attempt/session/:sessionId/submit`

Body: none

Response `data`:

```json
{
  "sessionId": "...",
  "topicId": "...",
  "attemptedQuizCount": 5,
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
      "content": { "text": "...", "code": null, "has_code": false, "image": "https://res.cloudinary.com/<cloud>/image/upload/quiz-images/xyz.png", "has_image": true },
      "options": { "is_code": false, "data": { "1": "A", "2": "B" } },
      "selectedAnswer": null,
      "correctAnswer": "1",
      "isCorrect": null,
      "explanation": "..."
    }
  ]
}
```

Luu y:
- `quizResults` chua **tat ca cau hoi** trong topic, ke ca cau user **bo qua**.
- Cau da chon: `selectedAnswer` = gia tri da chon, `isCorrect` = `true`/`false`.
- Cau bo qua: `selectedAnswer: null`, `isCorrect: null`, nhung van co `correctAnswer` va `explanation` de hien thi.
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

Chi tra session `status = SUBMITTED` cua **chinh user dang login**, moi nhat truoc.

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
      "score": 0.75
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

FE co the hien thi danh sach theo thu tu `submittedAt` (moi → cu) thanh "Lan nop 1" = item moi nhat, hoac danh so nguoc theo `total`.

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
  "score": 0.75,
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
- `quizResults` gom **tat ca cau trong topic** (ke ca cau bo qua: `selectedAnswer: null`, `isCorrect: null`).
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
| `POST` | `/course/:id/upload/signature` | Lay signature upload Cloudinary (project file) |
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

Upload project su dung direct upload Cloudinary:
- Cho phep: `.zip`, `.rar`, `.pdf`, `.docx`
- Toi da 5 file, moi file toi da 20 MB

**Flow upload project (4 buoc):**

```
1. POST /course/:id/upload/signature  →  nhan signature
2. FE upload file truc tiep len Cloudinary
3. Cloudinary tra ve secure_url + public_id
4. POST /course/:id/project-submission  voi metadata file
```

**Luu y quan trong:**
- Moi user chi co 1 submission cho moi course. Neu da submit, dung `PATCH` de cap nhat.
- Response submission tra ve `files` la mang object (co `originalName`), khong con chi la URL string:

```json
"files": [
  {
    "id": "...",
    "secureUrl": "https://res.cloudinary.com/.../file.zip",
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
  "signature": "cd35bf0407a178577c157ec54fbb9cb3875fd75e",
  "timestamp": 1775883082,
  "folder": "project-submissions/<courseId>/<userId>",
  "apiKey": "223812375436597",
  "cloudName": "dav7n3cu7",
  "resourceType": "auto",
  "uploadUrl": "https://api.cloudinary.com/v1_1/dav7n3cu7/auto/upload"
}
```

Body `POST /course/:id/project-submission`:

```json
{
  "note": "Em nop bai lan dau",
  "files": [
    {
      "secureUrl": "https://res.cloudinary.com/<cloud>/raw/upload/v123/project-submissions/<courseId>/<userId>/my_project_v2.zip",
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
    "https://res.cloudinary.com/<cloud>/raw/upload/v123/.../old-file.pdf"
  ],
  "files": [
    {
      "secureUrl": "https://res.cloudinary.com/<cloud>/raw/upload/v124/.../new-file.zip",
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
- `files`: metadata file moi da upload len Cloudinary (**bat buoc** co `originalName`).
- Co the vua xoa file cu, vua them file moi trong cung 1 request.
- Tong so file sau cung phai nam trong khoang `1 → 5`.
- Chi sua `note` thi file **khong** doi — FE muon doi file phai gui `files` (va/hoac `removeFiles`).
- Response `files` luon kem `originalName` (ten file luc nop).

Rule `DELETE`:
- Cho phep xoa khi status la `PENDING_REVIEW` hoac `REJECTED`.
- `APPROVED` → **khong** cho xoa.

**TypeScript snippet (course project upload):**

```ts
type UploadSignatureResponse = {
  signature: string;
  timestamp: number;
  folder: string;
  apiKey: string;
  cloudName: string;
  resourceType: 'auto';
  uploadUrl: string;
};

type UploadedCloudinaryFile = {
  secureUrl: string;
  publicId: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
};

async function getUploadSignature(courseId: string, publicId?: string): Promise<UploadSignatureResponse> {
  const res = await fetch(`/course/${courseId}/upload/signature`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(publicId ? { publicId } : {}),
  });
  if (!res.ok) throw new Error('Cannot get Cloudinary signature');
  const payload = await res.json();
  return payload.data;
}

async function uploadFileToCloudinary(
  file: File,
  sig: UploadSignatureResponse,
  publicId: string,
): Promise<UploadedCloudinaryFile> {
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', sig.apiKey);
  form.append('timestamp', String(sig.timestamp));
  form.append('signature', sig.signature);
  form.append('folder', sig.folder);
  form.append('resource_type', sig.resourceType);
  form.append('public_id', publicId);

  const uploadUrl = sig.uploadUrl ?? `https://api.cloudinary.com/v1_1/${sig.cloudName}/auto/upload`;
  const res = await fetch(uploadUrl, { method: 'POST', body: form });
  if (!res.ok) throw new Error('Upload to Cloudinary failed');
  const result = await res.json();

  return {
    secureUrl: result.secure_url,
    publicId: result.public_id,
    originalName: file.name,
    mimeType: file.type,
    fileSize: file.size,
  };
}

// Usage
async function handleProjectUpload(courseId: string, file: File) {
  const publicId = file.name.replace(/\.[^.]+$/, '');
  const sig = await getUploadSignature(courseId, publicId);
  return uploadFileToCloudinary(file, sig, publicId);
}
```

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
  2. Upload Cloudinary (`resourceType: auto`) vao folder `project-requirements/<courseId>/`
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
  "attachmentUrl": "https://res.cloudinary.com/.../project-requirements/<courseId>/brief.pdf",
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
  "attachmentUrl": "https://res.cloudinary.com/...",
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
  "imageUrl": "https://res.cloudinary.com/...",
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
  "imageUrl": "https://res.cloudinary.com/...",
  "imagePublicId": "course-images/javascript-fundamentals",
  "hasProject": true,
  "topicWeight": 50,
  "projectWeight": 50
}
```

- `imageUrl` va `imagePublicId` la optional, nhung neu gui phai gui **ca hai** cung luc. Gui mot trong hai -> `400`.
- `imageUrl` phai la HTTPS URL thuoc `res.cloudinary.com` va dung cloud name.
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
  "imageUrl": "https://res.cloudinary.com/...",
  "imagePublicId": "course-images/javascript-fundamentals-v2",
  "hasProject": false
}
```

- Khi cap nhat `imagePublicId` moi khac cu, anh cu tren Cloudinary se tu dong bi **xoa**.
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

`POST /course/upload/image-signature`

Lay signature de FE upload anh cover course truc tiep len Cloudinary (khong qua server).

Body (optional):

```json
{
  "publicId": "javascript-fundamentals"
}
```

Response `data`:

```json
{
  "signature": "abc123...",
  "timestamp": 1718000000,
  "folder": "course-images",
  "apiKey": "your_api_key",
  "cloudName": "your_cloud",
  "resourceType": "auto",
  "uploadUrl": "https://api.cloudinary.com/v1_1/your_cloud/auto/upload"
}
```

**Flow upload anh cho course (3 buoc):**

```
1. POST /course/upload/image-signature  →  nhan signature
2. FE upload anh truc tiep len Cloudinary (multipart/form-data)
3. POST /course hoac PUT /course/:id  voi { imageUrl, imagePublicId }
```

**TypeScript snippet:**

```ts
async function getCourseImageSignature(publicId?: string): Promise<UploadSignatureResponse> {
  const res = await fetch('/course/upload/image-signature', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify(publicId ? { publicId } : {}),
  });
  if (!res.ok) throw new Error('Cannot get signature');
  const payload = await res.json();
  return payload.data;
}

async function uploadCourseImage(file: File, sig: UploadSignatureResponse, publicId?: string) {
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', sig.apiKey);
  form.append('timestamp', String(sig.timestamp));
  form.append('signature', sig.signature);
  form.append('folder', sig.folder);
  form.append('resource_type', sig.resourceType);
  if (publicId) form.append('public_id', publicId);

  const res = await fetch(sig.uploadUrl, { method: 'POST', body: form });
  if (!res.ok) throw new Error('Cloudinary upload failed');
  const result = await res.json();

  return {
    imageUrl: result.secure_url as string,
    imagePublicId: result.public_id as string,
  };
}

// Usage: tao course kem anh
async function createCourseWithImage(
  file: File,
  courseData: { name: string; slug: string; description?: string; hasProject?: boolean },
) {
  const publicId = file.name.replace(/\.[^.]+$/, '');
  const sig = await getCourseImageSignature(publicId);
  const { imageUrl, imagePublicId } = await uploadCourseImage(file, sig, publicId);

  const res = await fetch('/course', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ ...courseData, imageUrl, imagePublicId }),
  });
  return res.json();
}
```

---

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

> **Luu y:** Khi khoa hoc dat 100% va chung chi duoc cap, backend tu dong ban event `COURSE_COMPLETE` sang he thong Profiles de cap nhat Timeline.

### Topic quiz session flow

1. User chon topic → `POST /topic/:topicId/session/start`.
2. Lay danh sach quiz → `GET /topic/:topicId/quizzes` — **chi co cau hoi + cac lua chon, khong co answer**.
3. Moi lan user chon dap an → `POST /attempt/session/:sessionId/save`.
4. User quay lai app → `GET /topic/:topicId/session/resume` (kem `answers` da chon truoc do).
5. Nop bai → `POST /attempt/session/:sessionId/submit`.
6. **Hien thi ket qua tung cau ngay tu response submit** — `quizResults[]` co san `correctAnswer`, `isCorrect`, `explanation` tung cau. Khong can goi them API.
7. Hien thi dashboard tong → `GET /progress/me`.
8. Xem lai lich su **theo lan nop** → `GET /attempt/sessions/me?topicId=...` roi `GET /attempt/sessions/me/:sessionId`.

> **Tai sao khong can goi them `GET /progress/me/topic/:topicId` sau submit?**
> Submit session gio tra ve `quizResults[]` day du. API progress van huu ich khi user muon **xem lai thong ke tong hop** (accuracy sticky, quizStats). De xem tung lan nop cu the, dung `GET /attempt/sessions/me`.

### Topic image upload flow (admin)

1. Admin chon anh cho topic.
2. Lay signature: `POST /topic/upload/signature` (voi Bearer admin token).
3. Upload anh truc tiep len Cloudinary.
4. Lay `imageUrl` + `imagePublicId` tu Cloudinary response.
5. Gui cung voi topic data khi tao (`POST /topic`) hoac cap nhat (`PUT /topic/:id`).

### Course image upload flow (admin)

1. Admin chon anh cover cho course.
2. Lay signature: `POST /course/upload/image-signature` (voi Bearer admin token).
3. Upload anh truc tiep len Cloudinary.
4. Lay `imageUrl` + `imagePublicId` tu Cloudinary response.
5. Gui cung voi course data khi tao (`POST /course`) hoac cap nhat (`PUT /course/:id`).
6. Khi xoa course, anh tren Cloudinary se tu dong bi xoa theo.

### Quiz image upload flow (admin)

1. Admin chon anh cho cau hoi (cau hoi dang hinh anh).
2. Lay signature: `POST /quiz/upload/signature` (voi Bearer admin token).
3. Upload anh truc tiep len Cloudinary.
4. Lay `imageUrl` + `imagePublicId` tu Cloudinary response.
5. Gui cung voi quiz data khi tao (`POST /quiz`) hoac cap nhat (`PUT /quiz/:id`).
6. FE hien thi: moi response quiz co `content.image` (URL) + `content.has_image` — render anh duoi text cau hoi.
7. Doi anh / xoa quiz → anh cu tren Cloudinary tu dong bi xoa.
