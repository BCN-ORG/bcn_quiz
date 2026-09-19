# BCN Quiz Frontend

Next.js frontend cho học viên và quản trị viên BCN Quiz.

```bash
cp .env.example .env
pnpm install
pnpm dev
```

Frontend chạy tại `http://localhost:5173`, backend mặc định tại `http://localhost:3001/api`.

Các luồng chính:

- BCN SSO, refresh và logout bằng HttpOnly cookie;
- dashboard, catalog khóa học và tiến độ;
- quiz session có resume, autosave và submit;
- project submission, lịch sử và chứng chỉ;
- Quiz Studio cho CRUD nội dung và duyệt project.

Design tokens: [design-system/bcn-quiz/MASTER.md](design-system/bcn-quiz/MASTER.md).
