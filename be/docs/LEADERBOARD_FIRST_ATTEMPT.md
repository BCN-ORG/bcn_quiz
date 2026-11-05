# Bảng xếp hạng: chỉ lần làm đầu tiên của topic được tính điểm

Từ migration `20261105180000_leaderboard_first_attempt_only`, mỗi user chỉ có **một** kết quả chính thức cho mỗi topic: lần nộp thành công đầu tiên (mãi mãi, không phụ thuộc ngày/tuần). Các lần sau là ôn tập: vẫn lưu bài làm và cập nhật tiến độ khóa học, nhưng không tạo dòng bảng xếp hạng, không gửi thông báo, không đổi hạng.

- Cột `topic_leaderboard_results."isCounted"`: `true` = kết quả chính thức, `NULL` = dòng cũ bị trùng (giữ làm lịch sử, mọi truy vấn xếp hạng bỏ qua). Unique `(userId, topicId, isCounted)` bảo đảm tối đa một dòng `true` cho mỗi user/topic.
- Migration **không xóa dòng nào**: dòng sớm nhất (theo `submittedAt`) của mỗi user/topic được đánh dấu `true`, các dòng còn lại để `NULL`.
- Hệ quả: điểm tuần của một số user giảm và hạng đổi (đúng chủ đích). Bảng tuần tính theo từng topic nên giờ chỉ còn "kết quả lần đầu rơi vào tuần đó"; cột "Số ngày" luôn là 1.

## Chạy trên production (bạn chạy, không tự động)

Thay `<QUIZ_DB_CONTAINER>`, `<DB_USER>`, `<DB>` bằng giá trị của server (`docker ps`, `\du`). Chỉ chạy bằng quyền của bạn.

### 1. Trước khi deploy: đếm ảnh hưởng (chỉ đọc) và sao lưu

```bash
docker exec -i <QUIZ_DB_CONTAINER> psql -U <DB_USER> -d <DB> -X -q -tA <<'SQL'
WITH ranked AS (
  SELECT id, "userId", "topicId",
         ROW_NUMBER() OVER (PARTITION BY "userId","topicId" ORDER BY "submittedAt","businessDate",id) AS rn
  FROM topic_leaderboard_results
)
SELECT count(*) AS total_rows,
       count(*) FILTER (WHERE rn > 1) AS rows_that_stop_counting,
       count(DISTINCT "userId") FILTER (WHERE rn > 1) AS users_affected,
       count(DISTINCT "topicId") FILTER (WHERE rn > 1) AS topics_affected
FROM ranked;
SQL

# Sao lưu riêng bảng kết quả (không chứa tên/email, chỉ userId)
docker exec <QUIZ_DB_CONTAINER> pg_dump -U <DB_USER> -d <DB> -t topic_leaderboard_results > topic_leaderboard_results_$(date +%Y%m%d).sql
```

### 2. Deploy (push lên `main` chạy `prisma migrate deploy` như thường lệ)

### 3. Sau khi deploy: kiểm tra bất biến (phải ra 0 dòng)

Trong lúc deploy, bản code cũ có thể còn chạy và chèn dòng `isCounted = NULL`. Một user mà *mọi* dòng đều NULL sẽ không có kết quả chính thức.

```bash
docker exec -i <QUIZ_DB_CONTAINER> psql -U <DB_USER> -d <DB> -X -q -tA -c \
'SELECT "userId","topicId" FROM topic_leaderboard_results GROUP BY 1,2 HAVING NOT bool_or("isCounted" IS TRUE)'
```

Nếu có dòng, sửa bằng cách đánh dấu dòng sớm nhất của từng cặp (an toàn khi chạy lại):

```bash
docker exec -i <QUIZ_DB_CONTAINER> psql -U <DB_USER> -d <DB> -X -q -tA -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
UPDATE topic_leaderboard_results r SET "isCounted" = TRUE
FROM (
  SELECT DISTINCT ON (t."userId", t."topicId") t.id
  FROM topic_leaderboard_results t
  WHERE NOT EXISTS (SELECT 1 FROM topic_leaderboard_results c
                    WHERE c."userId" = t."userId" AND c."topicId" = t."topicId" AND c."isCounted" IS TRUE)
  ORDER BY t."userId", t."topicId", t."submittedAt", t."businessDate", t.id
) f WHERE r.id = f.id;
COMMIT;
SQL
```

### Hoàn tác

Bản code cũ chạy được khi cột còn tồn tại (nó không ghi cột này). Muốn quay về hành vi cũ hoàn toàn:
1. Deploy lại bản trước.
2. `ALTER TABLE topic_leaderboard_results DROP COLUMN "isCounted";` (xóa luôn index unique mới). Không mất dòng nào; mọi dòng cũ lại được tính như trước.
