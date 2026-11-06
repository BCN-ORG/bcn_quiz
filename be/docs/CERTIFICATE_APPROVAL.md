# Chứng chỉ: admin duyệt trước khi cấp

Hoàn thành khóa học **không còn tự cấp chứng chỉ**. Nó tạo một yêu cầu (`certificate_requests`), admin xem điều kiện của học viên theo khóa học *hiện tại* rồi duyệt, từ chối hoặc sau này thu hồi.

## Trạng thái của một yêu cầu (duy nhất cho mỗi học viên + khóa học)

| Từ | Sang | Ai / khi nào |
|---|---|---|
| (chưa có) | `PENDING` | khóa học đạt `COMPLETED` (đủ topic, và đồ án được duyệt nếu có). Dựa trên trạng thái hiện tại, nên cả đường GET/batch lẫn nộp bài đều tạo, và không bao giờ tạo trùng |
| `PENDING` | `ON_HOLD` | khóa học không còn hoàn thành: admin thêm topic, thêm câu hỏi vào topic đã xong, đồ án bị đổi trạng thái... |
| `ON_HOLD` | `PENDING` | học viên hoàn thành lại |
| `PENDING` | `APPROVED` | admin duyệt. Hệ thống kiểm tra lại điều kiện ngay lúc duyệt, không đủ thì trả 409 kèm lý do |
| `PENDING` | `REJECTED` | admin từ chối, **bắt buộc có lý do** (học viên đọc được) |
| `REJECTED` | `PENDING` | học viên bấm "Gửi lại" (chỉ khi khóa học đang hoàn thành) |
| `APPROVED` | `REVOKED` | admin thu hồi, bắt buộc có lý do. Mã chứng chỉ ở trang xác minh báo "không còn hợp lệ" |
| `REVOKED` | `APPROVED` | chỉ admin, nút "Cấp lại": hoàn tác việc thu hồi (cùng mã, cùng ngày cấp, giữ nguyên danh sách topic lúc cấp). **Không** kiểm tra lại nội dung khóa học (chứng chỉ đã duyệt vẫn hợp lệ khi khóa học đổi), nhưng **bắt buộc ghi lý do**; nếu học viên chưa hoàn thành nội dung mới, giao diện hiện cảnh báo |

- Duyệt một yêu cầu `PENDING` luôn phải đủ điều kiện theo khóa học hiện tại; chỉ "Cấp lại" chứng chỉ đã thu hồi mới được miễn bước kiểm tra này.
- Chứng chỉ đã duyệt **không bị ảnh hưởng** khi khóa học đổi sau đó (thêm topic...). Danh sách topic lúc cấp được lưu trong `certificates.metadata`.
- Mọi chuyển trạng thái là cập nhật có điều kiện theo trạng thái hiện tại: hai admin bấm cùng lúc thì chỉ một người thắng.
- Học viên được báo trong ứng dụng (`CERTIFICATE_APPROVED/REJECTED/REVOKED`) và thấy trạng thái ở trang Chứng chỉ và trang khóa học.

## API

Học viên: `GET /certificate/me` (chỉ chứng chỉ còn hiệu lực), `GET /certificate/requests/me`, `POST /certificate/requests/:courseId/resubmit`.
Admin (quyền `quiz.question.update`): `GET /admin/certificate-requests`, `GET /admin/certificate-requests/:id` (có điều kiện thật tại thời điểm xem), `PATCH .../:id/review` `{decision: APPROVE|REJECT, note}`, `PATCH .../:id/revoke` `{reason}`.
Công khai: `GET /certificate/verify/:code` trả `valid:false, revoked:true` cho mã đã thu hồi (không kèm lý do).

## Chạy trên production (bạn chạy, không tự động)

Migration `20261106140000_certificate_requests` chỉ thêm bảng/cột/giá trị enum và **tạo yêu cầu `APPROVED` cho mọi chứng chỉ đã có** (ghi chú "Cấp tự động trước khi có bước duyệt"); không xóa hay sửa chứng chỉ nào.

Trước khi deploy (chỉ đọc), thay `<...>` cho đúng server:

```bash
docker exec -i <QUIZ_DB_CONTAINER> psql -U <DB_USER> -d <DB> -X -q -tA -c \
'SELECT (SELECT count(*) FROM certificates) AS certificates,
        (SELECT count(*) FROM user_course_progresses WHERE status = '"'"'COMPLETED'"'"') AS completed_courses'
```

Sau khi deploy, hai con số này phải khớp với (chứng chỉ → số yêu cầu `APPROVED`), và học viên đã hoàn thành nhưng chưa có chứng chỉ sẽ hiện ở tab "Chứng chỉ" của admin khi hệ thống tính lại tiến độ của họ:

```bash
docker exec -i <QUIZ_DB_CONTAINER> psql -U <DB_USER> -d <DB> -X -q -tA -c \
'SELECT status, count(*) FROM certificate_requests GROUP BY 1 ORDER BY 1'
# kiểm tra bất biến, phải ra 0 dòng: có yêu cầu APPROVED nhưng không có chứng chỉ
docker exec -i <QUIZ_DB_CONTAINER> psql -U <DB_USER> -d <DB> -X -q -tA -c \
'SELECT r.id FROM certificate_requests r LEFT JOIN certificates c ON c.id = r."certificateId" WHERE r.status = '"'"'APPROVED'"'"' AND c.id IS NULL'
```

Hoàn tác: deploy lại bản trước (bản cũ không đọc các bảng/cột mới nên vẫn chạy) rồi, nếu cần, `DROP TABLE certificate_requests; ALTER TABLE certificates DROP COLUMN "revokedAt", DROP COLUMN "revokedBy", DROP COLUMN "revokedReason";`. Giá trị enum thông báo mới không gỡ được và vô hại. Lưu ý: bản cũ lại tự cấp chứng chỉ khi hoàn thành.
