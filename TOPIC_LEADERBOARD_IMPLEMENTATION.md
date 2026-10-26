# Topic Leaderboard Implementation

## Architecture

Leaderboard có phạm vi `Topic + userId + businessDate`. `Course` chỉ hỗ trợ lọc Topic trong Admin. `AttemptSession` là một lượt làm toàn Topic; `QuizAttempt` vẫn là kết quả từng câu. Backend NestJS ghi snapshot trong transaction của `AttemptService.submitSession`; service `LeaderboardService` đọc snapshot cho API, rank và XLSX. Frontend dùng `request`, state React và các component hiện có.

## Business Rules

- Chỉ `POST /api/attempt/session/:sessionId/submit` tham gia. `POST /api/quiz/:id/attempt` không tham gia.
- Mỗi `(userId, topicId, businessDate)` có một kết quả chính thức: session SUBMITTED đầu tiên trong ngày. Retry vẫn ghi lịch sử và cập nhật progress theo logic cũ; không ghi đè snapshot.
- Không backfill dữ liệu trước khi triển khai. Không có reward, bonus, streak hoặc leaderboard toàn Course.

## Scoring Formula

`score = totalQuestions > 0 ? Math.round(correctCount / totalQuestions * 1000) : 0` tại `be/src/leaderboard/leaderboard-rules.ts`. Mọi câu có trọng số lý thuyết `1000 / totalQuestions`; UI làm tròn hiển thị tối đa hai chữ số thập phân, **không** cộng điểm đã làm tròn theo từng câu. Response submit giữ `score` 0..1 cũ; `leaderboard.attemptScore` là điểm lượt vừa nộp, `leaderboard.score` là điểm chính thức ngày đó.

## Official Attempt Rule

Trong transaction submit, backend lấy khóa PostgreSQL theo `userId:topicId`, rồi lấy `clock_timestamp()` của DB, claim trạng thái session, tạo `QuizAttempt`, cập nhật `TopicProgress`, và `createMany(skipDuplicates)` một snapshot. Unique `(userId,topicId,businessDate)` là hàng rào cuối. Timestamp được gán sau khi có khóa, vì vậy hai session cạnh tranh cùng user/topic được serialize và session có `submittedAt` sớm hơn thắng. Unique `sessionId` ngăn một session có nhiều snapshot.

## Daily Ranking

Theo `score DESC`, `durationMs ASC`, `submittedAt ASC`, `userId ASC`. `ROW_NUMBER()` tạo rank toàn cục trước pagination. Response có `items`, `pagination`, `top3`, `top10Cutoff`, `currentUserRank`, `currentUserResult`, `aroundMe`, `closesAt`. API giữ user ID nội bộ để xác định người dùng hiện tại; giao diện chỉ hiện tên và avatar. Thiếu Profiles thì hiện `Người dùng` và avatar viết tắt.

## Weekly Ranking

Nhóm các snapshot daily cùng Topic từ Monday đến Sunday. `weeklyScore = SUM(score)`, `completedDays = COUNT(*)`, `totalDurationMs = SUM(durationMs)`, `lastSubmittedAt = MAX(submittedAt)`. Thứ tự: `weeklyScore DESC`, `completedDays DESC`, `totalDurationMs ASC`, `lastSubmittedAt ASC`, `userId ASC`. Không tạo ngày giả cho ngày không làm.

## Timezone

Business timezone là `Asia/Ho_Chi_Minh` (UTC+07:00, không đổi giờ mùa hè). Helper chung tại `be/src/leaderboard/leaderboard-rules.ts` gồm `businessDate`, `startOfBusinessDay`, `endOfBusinessDay`, `businessWeekStart`, `businessWeekEnd`. Daily mặc định hôm nay theo giờ Việt Nam. DB lưu ngày nghiệp vụ dạng `YYYY-MM-DD`, tránh phụ thuộc timezone session PostgreSQL. API xác thực ngày đúng format và ngày tồn tại.

## Database Model

`TopicLeaderboardResult`: `id`, `userId`, `topicId`, `sessionId`, `businessDate`, `score`, `correctCount`, `totalQuestions`, `durationMs`, `submittedAt`, `createdAt`; unique session và unique user/topic/day; index topic/day/score và submittedAt. Migration: `be/prisma/migrations/20261011000000_topic_leaderboard/migration.sql`. Snapshot được giữ nguyên khi câu hỏi trong Topic được thêm/sửa; xóa Topic vẫn cascade theo quan hệ dữ liệu hiện hữu. Không lưu tên, avatar hoặc email trong snapshot.

## Endpoints

Tất cả route có tiền tố `/api`. User: `GET /leaderboards/topics/:topicId/daily?date=YYYY-MM-DD&page=1&limit=20` và `/weekly?weekStart=YYYY-MM-DD&page=1&limit=20`. Admin: `GET /admin/leaderboards/topics/:topicId/daily|weekly` cùng query `search` theo full name, và `/daily/export` hoặc `/weekly/export` với `format=xlsx`. Admin route dùng permission `quiz.question.update`; user route dùng `quiz.question.read`. List success giữ envelope `{statusCode,message,data}`; export trả file XLSX. `limit` tối đa 100.

## Frontend UX

Trang Topic hiển thị tổng câu, điểm tối đa, trọng số/câu và quy tắc lượt đầu trước khi bắt đầu; header lúc làm hiển thị điểm ước lượng/câu. Kết quả có điểm lượt vừa nộp, điểm chính thức, hạng và nhãn official/practice. Bảng xếp hạng ở route riêng `/topics/:topicId/leaderboard`, có Top 3, hạng cá nhân, hàng lân cận, phân trang và chọn ngày/tuần trước. Màn đang trả lời chỉ có link phụ mở route này trong tab mới để giữ nguyên attempt; màn kết quả cũng có CTA. Bảng trống và user chưa tham gia có thông điệp riêng.

## Admin UX

Tab “Bảng xếp hạng” trong `/admin` có filter Course → Topic (deduplicate theo Topic ID), Daily/Weekly, ngày/tuần, tìm theo full name, phân trang và export. Bảng responsive chỉ hiện hạng, tên/avatar và điểm trên mobile; desktop thêm số câu đúng hoặc số ngày và thời gian. Không hiển thị User ID hoặc email trên bảng; XLSX vẫn giữ User ID để đối soát. Lọc Course chỉ thay đổi danh sách Topic chọn, không đổi identity của leaderboard.

## Export

ExcelJS trên backend tạo toàn bộ XLSX theo các cột yêu cầu từ một truy vấn ranking nhất quán. Profiles được resolve theo lô tối đa 100 ID, email chỉ xuất hiện ở Admin/API Admin. Tên file lấy từ slug Topic được chuẩn hóa và ngày/tuần nghiệp vụ. Thiếu Profiles sẽ hiện `Unknown` và email trống.

## Race Condition Strategy

Advisory transaction lock theo user/topic đặt trước `submittedAt`; atomic status claim hiện có chặn double-submit cùng session; unique user/topic/day chặn nhiều snapshot. `createMany(skipDuplicates)` không update snapshot cũ. Logic autosave/resume hiện có không bị thay đổi.

## Tests

- `leaderboard-rules.spec.ts`: 8 công thức điểm, nửa đêm VN, biên tuần, date validation.
- `leaderboard-submit.spec.ts`: hai session đồng thời, retry không ghi đè, ngày kế tiếp, Topic khác và snapshot sau khi thêm câu.
- `leaderboard.service.spec.ts`: profile batching >100, export Daily/Weekly đầy đủ với global rank.
- `attempt.service.spec.ts`: route nộp từng câu không tham gia leaderboard và các test cũ.
- Chạy toàn bộ backend unit, backend ESLint/build và frontend lint/build. Kết quả chạy PostgreSQL/browser thật được ghi ở phần dưới; harness browser dùng Playwright Core tạm ngoài repo.

## Local Verification — 2026-10-11

- Chạy `prisma migrate deploy` trên PostgreSQL 16 ở `127.0.0.1:5433`, database thử riêng `bcn_lb_verify_20261011b`: cả 3 migration thành công. Seed Topic `C Basic Flow Test` với 6 câu hỏi. Profiles giả lập cung cấp 10 user và 1 admin; app Quiz không có bảng User riêng.
- Gửi HTTP submit qua NestJS cho 9 user, rồi submit user thứ 10 trong Chrome headless. Lần nộp lại cùng ngày giữ nguyên snapshot đầu tiên và UI hiện nhãn luyện tập. Hai request submit của hai session cùng user/topic chạy đồng thời; chỉ có một snapshot official trong ngày.
- Daily rank đúng thứ tự score, duration, submittedAt. Snapshot cũ giữ nguyên score/correctCount/totalQuestions/duration sau khi admin sửa đáp án, thêm câu rồi xóa câu qua API. Weekly tính Monday 2026-10-05 đến Sunday 2026-10-11; kết quả Monday 2026-10-12 thuộc tuần mới.
- Kiểm tra chính xác 00:00 VN bằng hai request submit thật ở `2026-10-13T16:59:59Z` và `2026-10-13T17:00:00Z` khi đồng hồ PostgreSQL được điều khiển trong database thử: hai bản ghi official thuộc `2026-10-13` và `2026-10-14`. Hàm và cấu hình đồng hồ thử đã được gỡ; submit tiếp với đồng hồ bình thường có timestamp và duration đúng.
- Xuất XLSX Daily/Weekly qua HTTP và đối chiếu từng rank, user ID, score với Admin API. Chrome headless kiểm tra luồng user bắt đầu → trả lời → nộp official → làm lại practice → xem Weekly; luồng admin xem Daily/Weekly và tải cả hai XLSX. Toàn bộ 10 hàng trên bảng admin trong browser khớp rank/user/score của XLSX. Luồng OAuth user và admin cũng được chạy qua browser với Profiles giả lập.
- Lần chạy cuối: backend Jest 102/102 PASS, build PASS, ESLint các file sửa không có error. Ảnh browser tạm tại `/tmp/bcn-lb-user.png` và `/tmp/bcn-lb-admin.png`.
- Integration đã phát hiện và sửa hai lỗi: Prisma không giải mã kiểu `void` từ `pg_advisory_xact_lock` (`$executeRaw`), và `clock_timestamp()` trả thời gian lệch theo timezone PostgreSQL khi đọc trực tiếp (`EXTRACT(EPOCH)` rồi tạo `Date`).

## Known Limitations

- Chưa backfill lịch sử; leaderboard bắt đầu từ migration/release. Không chạy migration trên production trong task này.
- Admin search full name phụ thuộc endpoint internal mới của Profiles; cần deploy Profiles trước khi bật backend Quiz mới.
- `durationMs` là elapsed wall time, gồm cả lúc user rời trang; không có active-focus time. Existing `QuizAttempt.durationMs Int` có giới hạn khoảng 24,8 ngày và có thể khiến submit một session cực lâu thất bại.
- XLSX được tạo trong memory trước khi trả; dataset rất lớn có thể cần streaming writer về sau.
- Profiles trong integration là service giả lập; chưa chạy với tài khoản Profiles thật. Migration chỉ được chạy trên database thử, chưa chạy production. Migrations cần được deploy trước backend mới.
- `npm audit --omit=dev --audit-level high` đạt sau khi cập nhật bản vá tương thích của `compression`, `proxy-addr`, `brace-expansion`; vẫn còn advisory mức moderate từ dependency hiện có.

## Admin Name Search

Quiz gọi `GET /internal/users/search?q=...&page=...` của Profiles bằng Basic client credentials hiện có. Profiles chỉ trả ID của user ACTIVE có `fullName` chứa chuỗi tìm kiếm (trim, không phân biệt hoa/thường), tối đa 100 user/trang; Quiz lấy các ID theo trang rồi lọc `userId IN (...)` **sau** CTE đã tính rank. Không có fallback tìm trực tiếp theo User ID; không có kết quả tên khớp thì trả bảng rỗng. Vì vậy Daily/Weekly đều giữ global rank. Frontend trim và debounce 350 ms; xóa search trả về bảng gốc. Khi search upstream lỗi, UI giữ dữ liệu vừa tải và báo lỗi có nút thử lại. Profile hiển thị được resolve theo lô tối đa 100 ID. `GET /internal/users/eligible` dùng Basic credentials và quyền `quiz.question.read` của app QUIZ cho daily reminder.

## Profiles Production Integration

Quiz dùng cùng Basic header `Authorization: Basic base64(BCN_OAUTH_CLIENT_ID:PROFILES_CLIENT_SECRET)` cho search và batch resolve. Profiles không đọc secret này từ env: nó tìm `Application.clientId` và so secret với hash của `ApplicationClientSecret` đang `ACTIVE`. Endpoint thực tế có tiền tố `/api`: `/api/internal/users/search` và `/api/internal/users`.

| Mục đích | Quiz env | Profiles đối chiếu | Định dạng | Production 2026-10-17 |
| --- | --- | --- | --- | --- |
| Base URL | `PROFILES_API_BASE_URL` | Profiles `APP_PORT` | `http://bcn_profiles:3000/api` | GitHub env khớp; runtime chưa đọc |
| Basic username | `BCN_OAUTH_CLIENT_ID` | `Application.clientId` | `bcn-quiz` | GitHub env có; DB chưa đối chiếu |
| Basic password | `PROFILES_CLIENT_SECRET` | `ApplicationClientSecret.secretHash` ACTIVE | server key do Profiles cấp một lần | GitHub secret có; **401 cho thấy giá trị runtime chưa được Profiles chấp nhận** |

Production log đã xác nhận Quiz nhận 401 ở cả `searchUserIds` và `resolveUsers`. Cần đối chiếu runtime env/key status qua kênh quản trị đã xác thực; không ghi secret ra log hoặc tài liệu. Code hiện phân loại `AuthFailed`, `Timeout`, `UpstreamError` trong server log, giữ lỗi client an toàn. `resolveUsers` vẫn fallback tên `Người dùng` để leaderboard không gián đoạn. Việc sửa hoặc xoay vòng server key trên production cần phê duyệt riêng; sau đó gọi trực tiếp internal search/batch với Basic auth và kiểm tra Admin search trước khi kết luận đã sửa.

## Notification Architecture

Migration `be/prisma/migrations/20261011010000_notifications/migration.sql` tạo enum 7 loại và bảng `notifications`. Bản ghi lưu `userId`, nội dung, Topic/result ID tùy chọn, business date/week start, trạng thái đọc và `dedupKey` unique. Index `(userId,isRead,createdAt)` và `(userId,createdAt)` phục vụ hộp thư. PostgreSQL là source of truth; không lưu email hoặc tên trong notification.

## Notification Types

`LEADERBOARD_RESULT`, `LEADERBOARD_TOP10`, `LEADERBOARD_TOP3`, `LEADERBOARD_RANK_DROPPED`, `DAILY_REMINDER`, `WEEKLY_PROGRESS`, `WEEKLY_SUMMARY`.

## Notification Deduplication

Mỗi official result tạo một key `result:user:topic:date`; loại chính lấy theo rank ưu tiên Top 3, Top 10 rồi Result. Tụt hạng dùng `drop-top3` hoặc `drop-top10` theo user/topic/date. Daily reminder dùng `daily-reminder:user:topic:date`. Weekly dùng `weekly-progress` hoặc `weekly-summary` theo user/topic/weekStart. PostgreSQL unique key và `createManyAndReturn(skipDuplicates)` làm job chạy lại không tạo bản sao. Retry cùng Topic/ngày không tạo official mới nên không tạo notification submit.

## Event-based Notifications

Trong transaction submit, Quiz lấy advisory lock thêm theo Topic/ngày, ghi nhận user ở hạng 3 và 10, insert official snapshot, tính rank mới rồi insert notification. Chỉ khi commit thành công mới publish SSE. Lock Topic/ngày tuần tự hóa các submit cùng Topic/ngày để không bỏ sót mốc tụt hạng; Topic đông người có thể tăng thời gian chờ submit. Publish lỗi chỉ log warning, không làm hỏng kết quả đã commit.

## Scheduled Notifications

Nest Schedule chạy theo `Asia/Ho_Chi_Minh`: daily 19:00, weekly progress thứ Năm 18:00, weekly summary thứ Hai 08:00 cho tuần trước. Daily chỉ xét Topic đang mở và có câu hỏi, user có quyền đọc Quiz, chưa official hoặc hoàn thành Topic; tối đa 2 reminder/user/ngày. Weekly chỉ gửi cho user có ít nhất một official snapshot trong Topic/tuần tương ứng. Summary lấy rank, tổng điểm và số ngày từ cùng truy vấn Weekly hiện có. Job có thể chạy lại an toàn nhờ dedup key.

## Notification APIs

Tất cả route cần auth user hiện tại: `GET /api/notifications?page=1&limit=20&unreadOnly=false` (limit tối đa 100), `GET /api/notifications/unread-count`, `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all`. Quyền sở hữu luôn dựa vào `req.user.id`; notification user khác trả 404 khi đánh dấu đọc. API dùng envelope hiện có và `Cache-Control: private, no-store`.

## Notification UI

AppShell có bell, unread badge tối đa `99+`, panel 20 mục mới nhất và toast 5 giây. Click mục/toast mới đánh dấu đã đọc; notification leaderboard mở `/topics/:id/leaderboard`, reminder/weekly mở trang Topic. Frontend chống thêm trùng theo notification ID và tải lại list/unread count lúc mở SSE hoặc quay lại tab.

## Notification Realtime Transport

### SSE Endpoint

`GET /api/notifications/stream` dùng Nest `@Sse`, event `notification` chứa public notification và unread count; event `ping` sau mỗi 25 giây. Không truyền token/user ID trên URL. Response interceptor giữ nguyên stream thay vì bọc JSON.

### Auth

Native `EventSource` kết nối bằng cookie HttpOnly `quiz_access_token` với `withCredentials: true`; backend kiểm tra cùng BearerAuthGuard và CORS credentials. User ID lấy từ request đã xác thực. Payload không có email, số điện thoại hoặc quyền.

### Heartbeat

Mỗi connection có timer 25 giây, dừng khi Observable bị unsubscribe; disconnect/đóng tab không giữ subscriber hoặc timer.

### Reconnection

EventSource tự reconnect. Không có replay `Last-Event-ID`; khi kết nối lại hoặc focus tab, UI lấy list và unread count từ PostgreSQL để phục hồi event bị lỡ.

### Multiple Tabs

Registry giữ nhiều subscriber cho một user. Publish gửi cho mọi tab đang kết nối của đúng user.

### Multi-instance Strategy

`be/docker-compose.prod.yml` và workflow deploy hiện khai báo một container app Quiz, không có replica; vì vậy dùng registry trong memory. Chưa xác minh số process tại production đang chạy. Nếu scale thành nhiều Nest instance, phải thêm Redis Pub/Sub fan-out trước khi rollout vì in-memory SSE chỉ chuyển event tới client trên cùng instance. PostgreSQL vẫn là nguồn dữ liệu chính.

## Notification Verification (local)

Migration áp dụng bằng `prisma migrate deploy` trên PostgreSQL `bcn_lb_verify_20261011b`. HTTP submit thật với 12 fake Profiles users trên Topic thử: Top 3, Top 10, Result, drop #3→#4 và #10→#11, retry không tạo thông báo, read/read-all/ownership đều pass. Daily reminder job tạo tối đa 2/user, bỏ Topic đóng và chạy lại không trùng; weekly progress/summary chạy lại không trùng. Headless Chrome với 2 tab cùng user nhận badge, toast và panel qua SSE không reload; Admin browser tìm tên `USER 3` vẫn hiện rank #4, xóa tìm kiếm hiện lại bảng. Kiểm tra mở lại browser sau khi lưu notification trong lúc offline: badge và panel phục hồi từ PostgreSQL. Bộ Jest Quiz chạy 113/113; test Profiles internal endpoint 9/9. Frontend lint và build pass; lần build tiếp tục ngày 2026-10-17 dùng mock response cho Google Fonts vì máy thử không tải CSS font trực tiếp được. Profiles trong bài thử là service giả lập; production Profiles và replica count chưa được kiểm chứng qua môi trường chạy thật.
