# Quizzes System Audit

Phạm vi: mã nguồn tại thời điểm audit; không truy cập database đang chạy hoặc Profiles production. `NOT CONFIRMED` nghĩa là không thể chứng minh từ repository. Đường dẫn và số dòng dưới đây là bằng chứng trong code. API có tiền tố `/api` theo `be/src/main.ts:22`.

## 1. Executive Summary

- Hierarchy thực tế: `Course ↔ Topic → Quiz → Option`. `CourseTopic` là bảng nối nhiều-nhiều, có `sortOrder`; mỗi `Quiz` chỉ có một `topicId`. Một topic có thể có 0..N quiz, sắp theo `createdAt`, không có vị trí quiz riêng. Evidence: `be/prisma/schema.prisma:12-76,138-173`; `be/src/course/course.service.ts:234-282`; `be/src/topic/topic.service.ts:173-219`.
- Bài làm thông thường là một `AttemptSession` cho **toàn topic**. Submit tạo một `QuizAttempt` cho **mỗi quiz**, kể cả câu bỏ trống; session giữ JSON đáp án. Có endpoint riêng nộp một câu, tạo attempt không gắn session. Evidence: `be/src/attempt/attempt.service.ts:255-410,469-565`; `be/src/attempt/attempt.controller.ts:19-110`.
- Điểm câu là 0/1. Điểm một lần nộp topic là `correctCount / số quiz hiện có trong topic` (0..1). `TopicProgress.accuracy` lại là đúng / tổng **mọi** attempt, không phải điểm chính thức của một lượt. Không có cột điểm tổng lượt, attempt number, hay quy tắc chọn “official attempt”. Evidence: `be/src/attempt/attempt.service.ts:316-356,1444-1514`; `be/prisma/schema.prisma:79-122,279-300`.
- Topic hoàn thành khi đáp án đúng **mới nhất theo từng quiz** bao phủ ít nhất 80% số quiz; course hoàn thành khi mọi topic đạt và, nếu `hasProject`, project được duyệt. Evidence: `be/src/attempt/attempt.service.ts:1516-1545`; `be/src/course/course-progress.service.ts:470-536`.

## 2. Architecture

- Backend NestJS: `CourseModule`, `TopicModule`, `QuizModule`, `AttemptModule`, `CertificateModule`, `AuthModule`, `ProfilesModule` dùng Prisma/PostgreSQL; `AppModule` gắn guard, throttle Redis, response filter/interceptor và cron. Evidence: `be/src/app.module.ts:1-91`; `be/prisma/schema.prisma:1-10`.
- Frontend Next.js App Router, các page nghiệp vụ là client component dùng `useEffect`/`useState` và `request` từ `fe/src/lib/api.ts`; không thấy TanStack Query trong `fe/package.json` hoặc import trong `fe/src`. Evidence: `fe/src/app/(app)/courses/page.tsx:1-36`; `fe/src/app/(app)/topics/[id]/page.tsx:1-95`; `fe/package.json`.
- Redis dùng cho auth token cache và throttling, không chứa attempt/session. `AttemptSession`/`QuizAttempt` nằm ở PostgreSQL. Evidence: `be/src/auth/auth-token.cache.ts:1-68`; `be/src/app.module.ts:30-81`; `be/src/attempt/attempt.service.ts:42-83,184-252`.

## 3. Domain Model

`Course` là chương trình học; `CourseTopic` nối Course và Topic, lưu thứ tự trong course. Topic có thể nối nhiều course vì `topicId` của `CourseTopic` không unique. `Quiz` là **một câu hỏi** trắc nghiệm, không phải một bộ đề; một Topic chứa bộ câu hỏi. `Option` là lựa chọn. `AttemptSession` là một lượt làm toàn topic; `QuizAttempt` là kết quả từng câu. Không có model `Question`, `Answer`, `Submission` hay `Result` riêng cho quiz. `ProjectSubmission` là bài nộp project, tách khỏi quiz. Evidence: `be/prisma/schema.prisma:12-122,138-300`.

Không có `Quiz.order`, `position`, `sequence`. Course topics sắp theo `CourseTopic.sortOrder`; quiz được lấy theo `Quiz.createdAt ASC`. `Option` cũng không có thứ tự lưu riêng; API làm bài trộn lựa chọn ổn định theo hash của `sessionId`, còn không có session thì random. Evidence: `be/prisma/schema.prisma:36-76,161-173`; `be/src/course/course.service.ts:234-282`; `be/src/topic/topic.service.ts:67-95,173-219`.

## 4. Course → Topic → Quiz Flow

1. `/courses` gọi `GET /api/course?page=…&limit=12&q=…` và `GET /api/course/progress/me?limit=100`; `CourseController.getAllCourses` → `CourseService.getAllCourses` (catalog, count, requirement). Evidence: `fe/src/app/(app)/courses/page.tsx:14-35`; `be/src/course/course.controller.ts:30-54`; `be/src/course/course.service.ts:69-181`.
2. `/courses/[id]` gọi `GET /api/course/:id`, `GET /api/course/:id/progress/me` và riêng `GET /api/course/:id/topics?page=…&limit=10`. Detail course **cũng nested** các topic; page dùng endpoint topics riêng để phân trang. `CourseService.getCourseTopics` sắp `sortOrder`. Evidence: `fe/src/app/(app)/courses/[id]/page.tsx:14-71`; `be/src/course/course.controller.ts:55-85`; `be/src/course/course.service.ts:184-282`.
3. Link `/topics/[id]?courseId=…` gọi `GET /api/topic/:id`, `GET /api/topic/:id/quizzes?limit=100`, sau đó `GET /api/topic/:id/session/resume`. Khi bắt đầu, `POST /api/topic/:id/session/start` rồi lấy lại quizzes với `sessionId` để cố định thứ tự option. `TopicController` → `TopicService.fetchQuizzesPageByTopicId`. Evidence: `fe/src/app/(app)/courses/[id]/page.tsx:133-141`; `fe/src/app/(app)/topics/[id]/page.tsx:38-95`; `be/src/topic/topic.controller.ts:61-97`; `be/src/topic/topic.service.ts:140-219`.
4. Có `GET /api/quiz`, `/api/quiz/:id`, `/api/quiz/code/:code` riêng; frontend làm bài hiện dùng topic quizzes. Public mapper bỏ đáp án/giải thích, admin dùng `/api/topic/:id/quizzes/full`. Evidence: `be/src/quiz/quiz.controller.ts:28-49`; `be/src/topic/topic.service.ts:46-95,140-170`; `be/src/topic/topic.controller.ts:51-78`.

## 5. Database Schema

Nguồn: `be/prisma/schema.prisma`; migration đầu `be/prisma/migrations/20260818170000_init/migration.sql` tạo các bảng, enum, foreign key và index tương ứng; migration `20260906153000_topic_schedule_window/migration.sql` thêm `Topic.startsAt/endsAt` và index. Tất cả PK dưới đây là `String @id @default(cuid())`. Tên index/unique dưới đây là bộ cột Prisma tương ứng.

| Model (purpose) | Important fields / relations | Unique; indexes; enum |
|---|---|---|
| `Topic` (bộ câu hỏi/lịch mở) | `name`, `slug`, `startsAt`, `endsAt`, `createdAt`; 1:N quiz/session/attempt/progress, N:M course qua links | unique: không có trên `slug`; index `(createdAt)`, `(slug,createdAt)`, `(startsAt,endsAt)`; `be/prisma/schema.prisma:12-33` |
| `Quiz` (một câu) | `quizCode`, `question`, `code`, `explanation`, `answer`, `topicId`, `createdAt`, `updatedAt`; N:1 Topic, 1:N Option/QuizAttempt | unique `(topicId,quizCode)`; index `(createdAt)`, `(topicId,createdAt)`, `(quizCode,createdAt)`; `:36-62` |
| `Option` (lựa chọn) | `label`, `content`, `isCode`, `quizId`; N:1 Quiz | unique: không; index `(quizId)`; `:65-76` |
| `QuizAttempt` (một câu được chấm) | `userId`, `quizId`, `topicId`, nullable `sessionId`, `selectedAnswer`, `isCorrect`, `score Int`, nullable `startedAt`, `submittedAt`, nullable `durationMs`, `createdAt`; N:1 Quiz/Topic, optional Session | unique: không; index `(userId,submittedAt)`, `(userId,quizId,submittedAt)`, `(topicId,submittedAt)`, `(sessionId)`; `:79-101` |
| `TopicProgress` (tổng tích lũy) | `userId`, `topicId`, `totalAttempts`, `correctAttempts`, `accuracy`, `isCompleted`, `completedAt`, `completionThreshold`, `lastAttemptAt`; N:1 Topic | unique `(userId,topicId)`; index `(userId,updatedAt)`; `:104-122` |
| `Course` (khóa học) | `name`, `slug`, `hasProject`, `topicWeight`, `projectWeight`, timestamps; 1:N CourseTopic/progress/submission/certificate, 1:1 requirement | unique `slug`; index `(createdAt)`; `:138-158` |
| `CourseTopic` (nối + thứ tự) | `courseId`, `topicId`, `sortOrder`, `createdAt`; N:1 Course/Topic | unique `(courseId,topicId)`; index `(courseId,sortOrder)`; `:161-173` |
| `CourseProjectRequirement` (đề project) | unique `courseId`, `title`, `description`, `isRequired`, attachment fields, timestamps; 1:1 Course, 1:N Submission | unique `(courseId)`; không index khác; `:176-192` |
| `UserCourseProgress` (tiến độ course) | `userId`, `courseId`, `topicProgressPercent`, `projectProgressPercent`, `progressPercent`, `status`, milestone timestamps; N:1 Course | unique `(userId,courseId)`; index `(userId,status,updatedAt)`; enum `CourseProgressStatus`; `:125-130,195-213` |
| `ProjectSubmission` (bài project) | `userId`, `courseId`, `requirementId`, `status`, reviewer/note/reviewedAt/submittedAt; N:1 Course/Requirement, 1:N File | unique `(userId,courseId)`; index `(courseId,status,submittedAt)`, `(userId,courseId,submittedAt)`; enum `ProjectSubmissionStatus`; `:132-136,216-237` |
| `ProjectSubmissionFile` (tệp) | `submissionId`, `filePath`, `storageKey`, `originalName`, `mimeType`, `fileSize`, `sortOrder`; N:1 Submission | unique: không; index `(submissionId,sortOrder)`; `:240-254` |
| `Certificate` (chứng chỉ) | `userId`, `courseId`, `certificateCode`, `issuedAt`, `metadata`; N:1 Course | unique `certificateCode`, `(userId,courseId)`; index `(userId,issuedAt)`; `:257-270` |
| `AttemptSession` (lượt làm Topic) | `userId`, `topicId`, nullable `currentQuizId`, `status`, `answers Json`, `startedAt`, `lastSeenAt`, `expiresAt`, nullable `submittedAt`, timestamps; N:1 Topic, optional current Quiz, 1:N QuizAttempt | unique: không; index `(userId,topicId,status,updatedAt)`, `(userId,status,expiresAt)`, `(userId,topicId,submittedAt)`; enum `AttemptSessionStatus`; `:273-300` |

`AttemptSessionStatus = IN_PROGRESS | SUBMITTED | EXPIRED`; `CourseProgressStatus = IN_PROGRESS | TOPICS_COMPLETED | PROJECT_PENDING_APPROVAL | COMPLETED` (nhánh hiện tại không gán `TOPICS_COMPLETED`); `ProjectSubmissionStatus = PENDING_REVIEW | APPROVED | REJECTED`. Không có local User table hay FK userId tới Profiles. Không có `attemptNumber`, `totalQuestions`, `timeLimit`, `isPassed`; `completionThreshold` có trong TopicProgress nhưng phép tính thực tế hard-code `0.8`. Evidence: `be/prisma/schema.prisma:104-136,273-300`; `be/src/attempt/attempt.service.ts:1472-1486,1516-1545`.

## 6. Quiz Lifecycle

| Step | Endpoint → service / writes / validation |
|---|---|
| Mở | `GET /api/topic/:id`, `GET /api/topic/:id/quizzes`, `GET /api/topic/:id/session/resume` → `TopicService`, `AttemptService`. Chỉ read, trừ resume có thể đổi session quá hạn sang `EXPIRED`. Quiz public ẩn đáp án. `topic.controller.ts:61-97`; `attempt.service.ts:107-141`. |
| Start | `POST /api/topic/:topicId/session/start` → `startTopicSession`: auth user ID, topic tồn tại và đang mở, tìm `IN_PROGRESS` gần nhất; nếu chưa có tạo row `AttemptSession` với `answers={}`, thời gian server và `expiresAt`. Không transaction/unique active session. `attempt.service.ts:33-105`. |
| Chọn đáp án/autosave | `POST /api/attempt/session/:sessionId/save` → `saveSessionProgress`: kiểm tra owner/status/expiry/topic window, xác thực option của `currentQuizId`; merge JSON rồi update session. `attempt.service.ts:184-252`. |
| Resume | `GET /api/topic/:topicId/session/resume` → tìm row `IN_PROGRESS` hoặc `EXPIRED` mới nhất theo `updatedAt`; nếu hết hạn đổi trạng thái; frontend chỉ khôi phục `IN_PROGRESS`. `attempt.service.ts:107-141`; `fe/src/app/(app)/topics/[id]/page.tsx:73-95`. |
| Submit + score | `POST /api/attempt/session/:sessionId/submit` → chấm từ `session.answers` và quiz/options hiện tại, claim status trong Prisma transaction, `createMany` QuizAttempt, update TopicProgress. Sau commit đánh giá course và gửi Profiles timeline khi topic completed. `attempt.service.ts:255-466`. |
| Result/history | Response submit có `score`, counts, `quizResults`; `GET /api/attempt/sessions/me`, `GET /api/attempt/sessions/me/:id`; `GET /api/attempt/me` là lịch sử từng câu. `attempt.controller.ts:80-127`; `attempt.service.ts:568-1034`. |
| Nộp từng câu | `POST /api/quiz/:id/attempt` → `submitAttempt`: verify option, tạo một `QuizAttempt` với `sessionId=null` trong transaction, update TopicProgress; không đi qua session. `attempt.service.ts:469-565`. |

Các route session yêu cầu `quiz.question.read`; route submit từng câu yêu cầu một trong `quiz.question.create/update`; lịch sử yêu cầu `quiz.result.read`. Guard global kiểm tra auth trước quyền. Evidence: `be/src/attempt/attempt.controller.ts:19-124`; `be/src/auth/quiz-permissions.ts`; `be/src/app.module.ts:58-81`.

## 7. Session / Attempt Model

- Một user có thể có **nhiều session lịch sử** cho cùng topic, retry sau submit hoặc abandon tạo row mới. `start` tái dùng session `IN_PROGRESS` nếu thấy. Số QuizAttempt trên mỗi quiz/user không giới hạn; mỗi lần submit topic thường thêm một row cho mỗi quiz. Không có attempt number/max attempts/official attempt/unique `(sessionId,quizId)`. Evidence: `be/src/attempt/attempt.service.ts:42-105,316-397`; `be/prisma/schema.prisma:79-101,279-300`; `fe/src/app/(app)/topics/[id]/page.tsx:143-150`.
- Submit rồi có thể bấm “Làm lại”; dữ liệu cũ được giữ, không overwrite. Session hoàn thành về mặt trạng thái khi `SUBMITTED` được claim và transaction commit. Không có `NOT_STARTED`/`COMPLETED` trong enum. `EXPIRED` vẫn được submit, dùng đáp án đã lưu; frontend chỉ resume `IN_PROGRESS`. Evidence: `attempt.service.ts:255-283,358-410`; `fe/src/app/(app)/topics/[id]/page.tsx:73-95,143-150`.
- Không có ràng buộc DB bảo đảm chỉ một `IN_PROGRESS` cho `(userId,topicId)`. Hai start đồng thời có thể cùng không thấy existing rồi tạo hai rows; catch chỉ hữu ích nếu create ném lỗi, nhưng không có unique constraint gây lỗi tại cặp này. Evidence: `attempt.service.ts:42-104`; `be/prisma/schema.prisma:279-300`.

## 8. Scoring

**Function cuối:** `AttemptService.submitSession` tại `be/src/attempt/attempt.service.ts:285-356`; nhánh từng câu `AttemptService.submitAttempt` tại `:490-508`.

```text
question.isCorrect = validSavedOptionLabel && selectedLabel === quiz.answer
question.score = question.isCorrect ? 1 : 0
session.correctCount = count(correct questions)
session.score = totalQuizCount > 0 ? correctCount / totalQuizCount : 0
```

Điểm topic là tỷ lệ 0..1; UI nhân 100 và làm tròn để hiện %. Câu trống/sai/mã option không hợp lệ lúc submit = 0; không partial, trọng số, penalty, bonus thời gian hoặc loại câu khác ngoài một đáp án đúng A/B/C/D dạng label. `Option.isCode` chỉ là định dạng nội dung. Không có pass threshold cho một session; **topic completion** có ngưỡng coverage 80%, không phải `session.score >= 0.8`. Evidence: `attempt.service.ts:316-356,1516-1545`; `fe/src/app/(app)/topics/[id]/page.tsx:139-144`; `be/prisma/schema.prisma:36-76`.

`getMySessions`/`getMySessionById` tính lại score từ attempts hoặc JSON legacy và **số quiz hiện tại**; sửa/xóa/thêm quiz có thể làm history score lệch score đã trả lúc submit. Evidence: `attempt.service.ts:795-875,942-1033,1347-1417`; `be/src/quiz/quiz.service.ts:597-686`.

## 9. Timing

- `startedAt` do backend đặt khi tạo session; `submittedAt` do backend đặt khi submit; `expiresAt = min(start+TTL, topic.endsAt)` nếu có. FE truyền TTL 1 năm, DTO chặn 5 phút..1 năm; đây là TTL dọn session, không phải đồng hồ thi. `Topic.startsAt` inclusive, `endsAt` exclusive cho start/save; submit được phép sau `endsAt`. Evidence: `attempt.service.ts:63-80,351-395`; `be/src/attempt/dto/start-session.dto.ts`; `be/src/topic/topic-schedule.ts:1-78`; `fe/src/app/(app)/topics/[id]/page.tsx:14-16`.
- Resume dùng timestamps DB; không pause/countdown frontend. `QuizAttempt.durationMs` của session được lưu từ `submittedAt - session.startedAt` (mỗi câu cùng duration), session không có cột duration nhưng có thể tính từ hai mốc. Duration đo thời gian tường, bao gồm lúc đóng browser và có thể kéo dài sau expiry vì submit expired vẫn được phép. Evidence: `attempt.service.ts:380-395,839-845,1019-1027`; `be/prisma/schema.prisma:79-101,279-300`.
- Route nộp một câu nhận `startedAt` từ client, nên `durationMs` nhánh này có thể giả mạo. `submittedAt` là server time ở cả hai nhánh. Source of truth session là DB/server, nhưng chưa thể coi elapsed time là thời gian thực sự làm bài. Evidence: `be/src/attempt/dto/submit-attempt.dto.ts`; `attempt.service.ts:499-523`.

## 10. Autosave & Resume

- Không có interval. FE gọi save **ngay mỗi lần chọn một answer**, payload một `currentQuizId` + `selectedAnswer`; `setAnswers` local chạy trước HTTP, `saving` khóa nút chọn và submit trong UI. Không có optimistic concurrency/version. Evidence: `fe/src/app/(app)/topics/[id]/page.tsx:102-128,184-203`.
- API cũng nhận `answers` batch (tối đa 500 keys, string <=64) nhưng chỉ xác thực option của `currentQuizId`/`selectedAnswer`; `dto.answers` batch được merge trực tiếp, sau đó submit loại các label không hợp lệ. JSON merge là read-modify-write, hai save đồng thời có thể mất cập nhật; save có thể đi sau submit vì check status và update không atomic. Submit đọc `session.answers` snapshot DB, không nhận đáp án request. Nếu save cuối chưa tới trước submit, câu đó bị chấm trống hoặc đáp án cũ. Evidence: `be/src/attempt/dto/save-session.dto.ts`; `attempt.service.ts:191-252,258-285,316-324,358-397`.
- Resume từ PostgreSQL, không Redis. Query chọn `IN_PROGRESS` **hoặc `EXPIRED` gần nhất theo `updatedAt`**, sau đó frontend bỏ qua `EXPIRED`; vì vậy một expired row mới hơn có thể che một active row cũ. Cron đánh dấu expired mỗi 5 phút. Evidence: `attempt.service.ts:107-141`; `be/src/attempt/attempt-session-cleanup.service.ts:1-35`; `fe/src/app/(app)/topics/[id]/page.tsx:73-95`.

## 11. Submit & Race Condition

- `submitSession` có transaction và atomic `updateMany` status từ `IN_PROGRESS|EXPIRED` sang `SUBMITTED` **trước** `createMany` attempts. Nếu hai submit cùng session, chỉ một claim có `count=1`; request còn lại báo lỗi 400, không tạo duplicate từ chính cặp submit đó. Transaction rollback claim nếu insert/progress lỗi. Evidence: `be/src/attempt/attempt.service.ts:358-410`; test `be/src/attempt/attempt.service.spec.ts:556-594`.
- Chưa có idempotency kiểu lặp request trả lại cùng result. Không có unique `(sessionId,quizId)`; DB không tự chặn duplicate do đường ghi khác hoặc bug. Route `POST /quiz/:id/attempt` được phép lặp vô hạn và luôn tạo row mới. Evidence: `be/prisma/schema.prisma:79-101`; `attempt.service.ts:469-535`.
- Race còn lại: `expireSessionIfNeeded` dùng `update({id})` không điều kiện status, có thể đổi session vừa submit thành `EXPIRED` nếu chạy trễ; `saveSessionProgress` cũng update theo id sau status check, có thể ghi JSON sau submit mà attempts không đổi. `submitSession` lấy answers/quizzes trước transaction, nên concurrent save/quiz edit có thể không nằm trong kết quả. Evidence: `attempt.service.ts:191-252,258-296,358-410,1316-1333`.

## 12. Course Progress

- `TopicProgress.totalAttempts/correctAttempts/accuracy` cộng dồn tất cả `QuizAttempt`. `isCompleted` set true khi coverage: lấy attempt **mới nhất từng quiz**, đếm đúng / quiz hiện tại >= 0.8. Nhánh submit giữ completion đã true (`existing.isCompleted || coverageComplete`), nhưng hàm sync/reevaluate có thể hạ cờ theo coverage hiện tại. Evidence: `attempt.service.ts:1444-1545`; `be/src/course/course-progress.service.ts:36-159`.
- Course progress: số topic có `isCompleted` / tổng số topic nhân `topicWeight` (hoặc 100 nếu không project), cộng `projectWeight` nếu project APPROVED. Course `COMPLETED` khi mọi topic xong và project được duyệt nếu `hasProject`. Course không có topic được coi đạt milestone topic. Không có enrollment gate trong model/API được audit; course/topic access dựa permission và lịch topic. Evidence: `course-progress.service.ts:418-577`; `be/prisma/schema.prisma:138-213`; `topic-schedule.ts:1-78`.
- Retry có thể đổi latest answer và coverage, cộng thêm attempt vào accuracy; topic/course completion có thể được reevaluate. `evaluateCoursesByTopic` chạy **sau** transaction và được bọc catch chỉ log trong submit, nên lỗi đánh giá course không rollback attempt. Evidence: `attempt.service.ts:400-429,1444-1563`; `course-progress.service.ts:161-175`.

## 13. Certificates

`CourseProgressService.evaluateCourseProgress` upsert `Certificate` khi course vừa chuyển sang `COMPLETED` (theo topic completion và approval project). Không có BullMQ; thực thi đồng bộ qua service, cron duy nhất tìm thấy là cleanup session. Certificate unique `(userId,courseId)`; reevaluate có thể demote course mà vẫn giữ certificate, lần complete lại có thể cập nhật `issuedAt`. Leaderboard hiện không tham gia điều kiện này. Evidence: `be/src/course/course-progress.service.ts:178-181,231-285,591-646`; `be/prisma/schema.prisma:257-270`; `be/src/attempt/attempt-session-cleanup.service.ts:1-35`.

## 14. Project Submissions

Project thuộc **Course**, qua `CourseProjectRequirement`, không thuộc Topic/Quiz. Mỗi `(userId,courseId)` tối đa một submission; có file riêng, status PENDING/APPROVED/REJECTED. Approval tác động course progress, không ghi QuizAttempt hay điểm quiz. Evidence: `be/prisma/schema.prisma:176-254`; `be/src/course/course.service.ts:686-775,1090-1138`; `course-progress.service.ts:445-466,492-536`.

## 15. User Identity / Profiles Integration

`userId` là string từ `req.user.id`/`sub` do `BearerAuthGuard` gắn sau khi `AuthService` gọi Profiles `/me` (OAuth access token). Quiz DB không có User table, profile snapshot hay FK tới user. Evidence: `be/src/auth/guards/auth.guard.ts:25-79`; `be/src/auth/auth.service.ts:205-286`; `be/src/attempt/attempt.service.ts:1229-1250`; `schema.prisma`.

`ProfilesService.resolveUsers(ids)` batch tối đa 100 ID/lần qua `/internal/users`, trả map `id/fullName/email/avatarUrl`; `CourseService.listProjectSubmissions` đã dùng một call cho trang. Có thể tránh N+1 cho trang leaderboard cỡ <=100, nhưng >100 cần phân batch; nếu Profiles lỗi hoặc thiếu secret, map rỗng. Evidence: `be/src/profiles/profiles.service.ts:10-109`; `be/src/course/course.service.ts:1033-1087`. FE `/auth/me` giữ name/avatar/email trong AuthProvider cho **người hiện tại**. Evidence: `fe/src/components/auth-provider.tsx:17-73`.

## 16. Auth & RBAC

OAuth authorization-code + PKCE với Profiles, HttpOnly SameSite=Lax cookies access/refresh, hỗ trợ Bearer header; `/auth/refresh` và FE `request` tự retry một lần sau 401. Auth profile được cache Redis theo hash token. Global guards: throttling Redis 100 req/phút, `BearerAuthGuard`, `RolesGuard`; `@Public` bỏ auth. Evidence: `be/src/auth/auth.service.ts:1-167,205-286,385-422`; `be/src/auth/guards/auth.guard.ts`; `be/src/auth/auth-token.cache.ts`; `be/src/app.module.ts:30-81`; `fe/src/lib/api.ts:35-80`.

Backend chủ yếu dùng decorator `@Permissions`: read content/result và create/update/delete. `RolesGuard` hỗ trợ `@Roles` nhưng khi có permissions sẽ ưu tiên permissions; quyền admin UI là có một trong create/update/delete; mặc định manifest nói delete là admin, create/update là mentor/admin. Không có RBAC nội bộ mới. Evidence: `be/src/auth/guards/roles.guard.ts:36-116`; `be/src/auth/quiz-permissions.ts`; `fe/src/lib/permissions.ts`; `fe/src/app/(app)/admin/page.tsx:70-83`; `docs/profiles-manifest.yaml`.

## 17. Admin Architecture

Một client page `/admin`, nằm trong protected layout/AppShell; menu chỉ hiện khi `canManageContent`. Tabs `courses/topics/quizzes/reviews`; CRUD và review gọi endpoints có permissions tương ứng. Danh sách dùng `PaginationNav`, page 10; chọn course/topic từ các request limit 100. Không có export CSV/Excel kết quả; `exceljs` ở `fe/src/lib/quiz-import.ts` chỉ đọc import và tải file **mẫu import** `.xlsx`. Evidence: `fe/src/app/(app)/admin/page.tsx:1-169,441-555`; `fe/src/components/app-shell.tsx:22-90`; `fe/src/components/ui.tsx:36-57`; `fe/src/lib/quiz-import.ts:194-231`.

## 18. Frontend Architecture

Các page client tự fetch trong `useEffect`, giữ loading/error/pagination bằng state, không có QueryClient/query keys. Shared `request.get/post/put/patch/delete` gắn credentials, unwrap `data`, retry refresh khi 401; `ApiError` chứa status/requestId. Components `Loading`, `ErrorState`, `Empty`, `PaginationNav` tái dùng. Evidence: `fe/src/lib/api.ts:1-83`; `fe/src/components/ui.tsx:5-57`; `fe/src/app/(app)/courses/page.tsx:1-51`; `fe/package.json`.

## 19. API Contract

`ResponseInterceptor` bọc success (trừ `/auth*`, `/health`) thành `{statusCode, message:'Success', data}`; **không có metadata top-level**. Lỗi filter trả `{statusCode, message, error, data}`. Service pagination trả trong `data`: `{items:[…], pagination:{page,limit,total,totalPages,hasNext,hasPrevious}}`. Một vài public/auth endpoint trả raw/redirect. Evidence: `be/src/common/interceptors/response.interceptor.ts:1-47`; `be/src/common/filters/http-exception-envelope.filter.ts:1-77`; `be/src/course/course.service.ts:69-181`; `fe/src/lib/api.ts:49-73`.

## 20. Timezone Handling

Schema dùng Prisma `DateTime`/PostgreSQL `TIMESTAMP(3)` không khai báo timezone; migration xác nhận kiểu cột. Backend tạo `new Date()` và so bằng epoch; JSON trả ISO UTC theo serialization của JS Date. FE `datetime-local` chuyển `new Date(value).toISOString()` và hiển thị `toLocaleString('vi-VN')` **không set `timeZone`**, nên vùng hiển thị phụ thuộc browser. Không tìm thấy cấu hình business timezone `Asia/Ho_Chi_Minh`, UTC policy, hoặc date-fns/dayjs/luxon/moment trong app. Vì PostgreSQL column không có timezone, việc DB session/driver diễn giải múi giờ thực tế là `NOT CONFIRMED` khi không kiểm tra runtime DB. Evidence: `be/prisma/migrations/20260818170000_init/migration.sql:11-211`; `be/prisma/migrations/20260906153000_topic_schedule_window/migration.sql:1-6`; `be/src/topic/topic-schedule.ts:1-78`; `fe/src/lib/format.ts:1-7`; `fe/src/app/(app)/admin/page.tsx:249-261`.

## 21. Existing Analytics

Có `GET /api/progress/me` tổng attempts/correct/accuracy và progress theo topic; `GET /api/progress/me/topic/:id` thống kê quiz theo attempt mới nhất, 10 attempts gần đây; lịch sử session/attempt riêng của user. Không thấy ranking, top score, average score đa user, hoặc leaderboard. Evidence: `be/src/attempt/attempt.controller.ts:80-125`; `be/src/attempt/attempt.service.ts:568-674,716-899,1036-1227`.

## 22. Test Coverage

Unit tests Jest: `be/src/attempt/attempt.service.spec.ts` bao phủ save merge/expiry/owner, schedule, submit blanks, duplicate claim mock, resume expiry, result legacy, abandon; `be/src/topic/topic-schedule.spec.ts`, `topic.service.spec.ts`, `course-progress.service.spec.ts`, `course.service.spec.ts`, `quiz.service.spec.ts`, `certificate.service.spec.ts`, auth/response specs. E2E `be/test/app.e2e-spec.ts` chỉ kiểm tra root envelope. Không thấy frontend test/Playwright. Chưa có test DB concurrency thật, save-vs-submit, hai start đồng thời, timezone hay toàn luồng course→topic→submit→certificate. Evidence: các file `*.spec.ts`, `be/test/app.e2e-spec.ts`; `be/package.json`; `fe/package.json`. Đã chạy ba suite `attempt.service`, `course-progress.service`, `topic-schedule`: **30/30 tests pass**. Chưa chạy toàn suite hoặc đo coverage thực tế.

## 23. CI/CD Relevant Notes

Backend và frontend build riêng. PR CI backend: npm ci, Prisma generate, ESLint, Jest unit, script env test, Nest build; frontend: pnpm install/lint/build/audit. E2E không nằm trong PR CI. Production workflow deploy riêng, chạy `prisma migrate deploy` qua Docker Compose trước app; repo có production config, không thấy staging workflow trong phần đã kiểm tra. Evidence: `.github/workflows/ci.yml:1-48`; `.github/workflows/cicd.yml:1-16,193-327`; `be/package.json`; `fe/package.json`; `be/README.md:29-44`.

## 24. Answers to Required Questions

| # | Answer | Evidence |
|---|---|---|
| 1 | Có đường Course→Topic→Quiz, nhưng Course–Topic là N:M, không phải 1:N. | `be/prisma/schema.prisma:138-173,36-62` |
| 2 | Có, 0..N quiz/topic; không có max ở schema. | `be/prisma/schema.prisma:12-62` |
| 3 | Không ở model hiện tại: Quiz có một `topicId`. Topic đó có thể ở nhiều course. | `be/prisma/schema.prisma:36-62,161-173` |
| 4 | Có, retry topic và nộp câu đơn lặp được. | `attempt.service.ts:33-105,469-535`; `fe/src/app/(app)/topics/[id]/page.tsx:143-150` |
| 5 | Giữ row cũ; retry tạo session/attempt mới. | `attempt.service.ts:67-83,380-397` |
| 6 | Không giới hạn theo quiz/user; một submit topic tạo một attempt/quiz. Số row dữ liệu thật `NOT CONFIRMED` vì không query DB. | `be/prisma/schema.prisma:79-101`; `attempt.service.ts:316-397` |
| 7 | Không có “official score”/quy tắc chọn attempt chính thức. `TopicProgress` dùng latest per quiz cho coverage và cộng mọi attempts cho accuracy. | `be/prisma/schema.prisma:79-122`; `attempt.service.ts:1444-1545` |
| 8 | Câu 1/0; lượt topic = số đúng / tổng quiz lúc submit, 0 nếu không có quiz. | `attempt.service.ts:316-356` |
| 9 | Có elapsed wall time server của session (`submittedAt-startedAt`), không phải active duration; nhánh nộp câu nhận start từ client. | `attempt.service.ts:63-80,380-395,499-505` |
| 10 | Với session hiện đại, có thể chọn `SUBMITTED` sớm nhất theo `submittedAt`; định nghĩa “valid” nghiệp vụ và legacy/multiple session race `NOT CONFIRMED`. | `be/prisma/schema.prisma:279-300`; `attempt.service.ts:358-397,777-786` |
| 11 | Có `QuizAttempt.submittedAt` và `AttemptSession.submittedAt`; ngày business tùy timezone chưa xác lập. | `be/prisma/schema.prisma:79-101,279-300` |
| 12 | Có thể group timestamps sau khi chọn timezone và quy tắc tính lượt; hiện chưa có business timezone/official attempt. | `be/prisma/schema.prisma:79-101,279-300`; mục 20 |
| 13 | Có qua số topic đạt coverage đúng >=80%; không trực tiếp dùng score của session. | `attempt.service.ts:1516-1545`; `course-progress.service.ts:470-536` |
| 14 | Có progress và history cá nhân; không có ranking đa user. | `attempt.service.ts:568-674,1036-1227` |
| 15 | Có batch `resolveUsers` <=100 IDs/call, cần chia batch khi nhiều hơn. | `be/src/profiles/profiles.service.ts:72-109` |
| 16 | Không thấy export utility; chỉ import/template Excel. | `fe/src/lib/quiz-import.ts:194-231`; `fe/src/app/(app)/admin/page.tsx` |
| 17 | `NOT CONFIRMED`: không có business timezone config. Locale `vi-VN` không ấn định timezone. | `fe/src/lib/format.ts:1-7`; `fe/src/app/(app)/history/page.tsx:75-106` |
| 18 | Không có blocker tuyệt đối từ schema, nhưng cần xác định scoring/attempt rule và timezone; xử lý dữ liệu lịch sử thay đổi, race, pagination và Profiles batch để kết quả sạch. | mục 7–11, 15, 20, 25 |

## 25. Risks for Leaderboard Implementation

1. **Grain sai:** `QuizAttempt` là từng câu, `AttemptSession` là lượt cả topic; cộng cả hai hoặc đếm từng câu như một lượt sẽ nhân điểm. Route nộp câu đơn có `sessionId=null`. Evidence: `attempt.service.ts:316-397,469-535`.
2. **Lượt/điểm không cố định:** không có official attempt hoặc score snapshot tổng; history tính lại theo quiz hiện tại. Quiz có thể được sửa/chuyển topic/xóa; delete cascade xóa attempts, và `updateQuiz` không reevaluate coverage ngay. Evidence: `be/prisma/schema.prisma:36-101`; `attempt.service.ts:942-1033`; `quiz.service.ts:597-686`.
3. **Thời gian:** chưa có business timezone; duration tính wall time và có đường client-controlled; expired session có thể submit sau hạn. Evidence: mục 9, 20.
4. **Concurrency:** atomic claim chặn duplicate submit cùng session, nhưng save/expire/start còn race; nhiều active sessions có thể tồn tại. Evidence: mục 7, 10, 11.
5. **Scope/course:** Topic có thể nằm trong nhiều course, còn attempt chỉ giữ topicId, không courseId; cùng kết quả topic sẽ liên hệ được nhiều course. `CourseTopic` có thể thay đổi theo thời gian. Evidence: `be/prisma/schema.prisma:79-101,161-173`; `course.service.ts:483-506`.
6. **Mẫu số và pagination:** FE chỉ lấy 100 quiz của topic, trong khi submit backend chấm toàn bộ quiz; API không áp max quiz/topic. Evidence: `fe/src/app/(app)/topics/[id]/page.tsx:38-95`; `attempt.service.ts:285-356`; `be/prisma/schema.prisma:12-62`.
7. **Profile/permission:** DB chỉ có userId; Profiles batch có ngưỡng 100 và có thể không trả dữ liệu. Endpoint public/admin sẽ cần áp quyền hiện hữu; không có export kết quả sẵn. Evidence: mục 15–17.

## 26. Recommended Integration Points

Nếu bổ sung leaderboard sau audit, điểm nối nghiệp vụ hiện tại là `AttemptService.submitSession` sau transaction claim/tạo attempts, cùng dữ liệu `AttemptSession` và `QuizAttempt`; đường `submitAttempt` riêng phải được quyết định rõ có tham gia hay không. Hiển thị identity có thể dùng `ProfilesService.resolveUsers`; quyền API dùng `@Permissions`/global guards, frontend dùng `request` và `PaginationNav`. Đây chỉ là vị trí tích hợp hiện có, chưa định nghĩa quy tắc leaderboard hay thiết kế mới. Evidence: `be/src/attempt/attempt.service.ts:358-466,469-565`; `be/src/profiles/profiles.service.ts:72-109`; `be/src/auth/quiz-permissions.ts`; `fe/src/lib/api.ts:49-83`; `fe/src/components/ui.tsx:36-57`.

## AUDIT STATUS

| Area | Status |
|---|---|
| Course/Topic/Quiz model | CONFIRMED |
| Attempt model | CONFIRMED |
| Scoring model | CONFIRMED |
| Timing model | PARTIAL (business timezone/runtime DB chưa xác nhận) |
| User identity model | PARTIAL (Profiles runtime chưa xác nhận) |
| Admin architecture | CONFIRMED |
| Leaderboard readiness | NEEDS CHANGES (cần chốt quy tắc và xử lý các rủi ro mục 25) |
