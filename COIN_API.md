# Coin Service API — Tài liệu tích hợp cho BCN Arena

Triển khai theo *COIN_INTEGRATION_API_SPEC v1.0.0*. Tài liệu này mô tả API **đúng như đang chạy**, kể cả những điểm khác hoặc bổ sung so với spec (đánh dấu **⚠️ Khác spec**).

## 1. Tổng quan

| Mục | Giá trị |
| --- | --- |
| Base URL | `https://<host>/api/v1` (host do quản trị bot cung cấp) |
| Định dạng | JSON. Request có body gửi `Content-Type: application/json` |
| Xác thực | `Authorization: Bearer <BCN_COIN_API_KEY>` trên **mọi** request |
| Đơn vị | Coin, số nguyên |

**⚠️ Khác spec: `userId` là Discord user ID.** Ví coin gắn với tài khoản Discord trong server, nên mọi `userId`, `senderId`, `recipientId` là **Discord user ID** (chuỗi 17–20 chữ số, ví dụ `"966153253400231988"`), không phải `usr_hung123`. BCN Arena cần lưu Discord ID của từng người chơi. Gửi ID dạng số (không có dấu ngoặc kép) sẽ bị `400`, vì số lớn như vậy bị JavaScript làm tròn.

Lấy Discord ID: bật **Developer Mode** (User Settings → Advanced), chuột phải vào người dùng → *Copy User ID*.

### Phản hồi

Thành công:

```json
{ "success": true, "data": { ... } }
```

Lỗi (mọi lỗi dưới `/api/v1`, kể cả sai key, JSON hỏng, route không tồn tại):

```json
{
  "success": false,
  "errorCode": "INSUFFICIENT_BALANCE",
  "message": "Số dư Coin không đủ để thực hiện giao dịch",
  "timestamp": "2026-11-19T13:00:00.000Z"
}
```

Luôn xử lý theo `errorCode`. `message` là tiếng Việt, có thể đổi câu chữ.

## 2. Idempotency

`POST /wallets/transfer` và `POST /coins/reward` **bắt buộc** có khóa chống trùng:

- Gửi qua header `Idempotency-Key`, hoặc trường `idempotencyKey` trong body, hoặc cả hai. Gửi cả hai mà **khác nhau** → `400 IDEMPOTENCY_KEY_MISMATCH`.
- Định dạng: 1–128 ký tự gồm chữ, số và `: _ . -`. Ví dụ UUID v4 hoặc `bcn-reward-tower-s1-f7-<discordId>`.
- Một key chỉ dùng cho **một** giao dịch. Key dùng chung cho cả transfer và reward.

| Tình huống | Kết quả |
| --- | --- |
| Key mới | Xử lý bình thường |
| Key đã `SUCCESS`, gọi lại y hệt | `200`, trả **nguyên kết quả cũ**, không cộng/trừ thêm |
| Key đã dùng nhưng khác người gửi/nhận, số tiền hoặc `source` | `409 IDEMPOTENCY_KEY_REUSED` |
| Key đang được xử lý bởi request khác | `409 TRANSACTION_IN_PROGRESS`, đợi vài giây rồi gọi lại |
| Lần trước `FAILED` (ví dụ không đủ tiền) | Gọi lại cùng key sẽ **xử lý lại** và giữ nguyên `transactionId` |

Khi timeout hoặc mất kết nối: gọi lại **y hệt** (cùng key, cùng body), hoặc kiểm tra trước bằng [`GET /coins/check-status/:idempotencyKey`](#endpoint-7-kiểm-tra-trạng-thái-giao-dịch).

## 3. Endpoint

### Endpoint 1: Lấy số dư ví

`GET /wallets/:userId/balance`

```bash
curl https://<host>/api/v1/wallets/966153253400231988/balance \
  -H "Authorization: Bearer $BCN_COIN_API_KEY"
```

```json
{
  "success": true,
  "data": {
    "userId": "966153253400231988",
    "balance": 90,
    "lockedBalance": 0,
    "currency": "COIN",
    "lastSyncedAt": "2026-11-19T13:00:00.000Z",
    "syncStatus": "SYNCED"
  }
}
```

- Thành viên server chưa từng có giao dịch: `balance: 0`.
- Người không ở trong server và chưa có ví: `404 WALLET_NOT_FOUND`.
- **⚠️ Khác spec:** `lockedBalance` luôn là `0` (hệ thống không khóa coin). Số dư đọc trực tiếp từ sổ cái nên luôn `SYNCED`, `lastSyncedAt` là thời điểm đọc.

### Endpoint 2: Đồng bộ lại số dư

`POST /wallets/:userId/sync` (không cần body)

Đọc lại số dư mới nhất. Response giống spec: `userId`, `balance`, `lastSyncedAt`, `syncStatus`. Lỗi giống Endpoint 1.

### Endpoint 3: Chuyển Coin P2P

`POST /wallets/transfer`

| Trường | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `senderId` | string | có | Discord ID người gửi |
| `recipientId` | string | có | Discord ID người nhận, phải đang ở trong server và không phải bot |
| `amount` | number | có | Số nguyên dương |
| `idempotencyKey` | string | có* | *Hoặc header `Idempotency-Key` |
| `description` | string | không | Lời nhắn, tối đa 200 ký tự |

```bash
curl -X POST https://<host>/api/v1/wallets/transfer \
  -H "Authorization: Bearer $BCN_COIN_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: tx-transfer-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" \
  -d '{"senderId":"966153253400231988","recipientId":"1338020421328437278","amount":20,"description":"Thưởng bạn làm bài quiz tốt!"}'
```

```json
{
  "success": true,
  "message": "Chuyển Coin thành công",
  "data": {
    "transactionId": "coin_tx_5f0c2b9a1d3e4f60",
    "senderId": "966153253400231988",
    "recipientId": "1338020421328437278",
    "amount": 20,
    "senderBalance": 70,
    "status": "SUCCESS",
    "createdAt": "2026-11-19T13:06:00.000Z"
  }
}
```

`senderBalance` là số dư người gửi ngay sau giao dịch. Khi gọi lại cùng key, response giữ nguyên giá trị lúc đó.

Lỗi nghiệp vụ:

| HTTP | `errorCode` | Khi nào |
| --- | --- | --- |
| `422` | `INSUFFICIENT_BALANCE` | Người gửi không đủ coin. Không trừ gì |
| `422` | `SELF_TRANSFER_NOT_ALLOWED` | `senderId` trùng `recipientId` |
| `422` | `RECIPIENT_NOT_FOUND` | Người nhận không ở trong server hoặc là bot |
| `422` | `SENDER_NOT_ALLOWED` | **⚠️ Bổ sung:** người gửi là ví hệ thống (ví bot) |
| `404` | `WALLET_NOT_FOUND` | Người gửi chưa có ví |

### Endpoint 4: Lịch sử biến động số dư

`GET /wallets/:userId/transactions?page=1&limit=10&type=ALL`

| Query | Mặc định | Mô tả |
| --- | --- | --- |
| `page` | `1` | Số nguyên ≥ 1 |
| `limit` | `10` | Số nguyên 1–100 |
| `type` | `ALL` | `ALL`, `REWARD`, `TRANSFER_IN`, `TRANSFER_OUT`, `SALARY`, `MINT`, `DEDUCT` (không phân biệt hoa thường) |

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "coin_tx_5f0c2b9a1d3e4f60",
        "type": "TRANSFER_OUT",
        "amount": -20,
        "balanceAfter": 70,
        "title": "Chuyển Coin đến Trần Văn Tuấn",
        "description": "Thưởng bạn làm bài quiz tốt!",
        "counterparty": { "id": "1338020421328437278", "fullName": "Trần Văn Tuấn" },
        "status": "SUCCESS",
        "createdAt": "2026-11-19T13:06:00.000Z"
      },
      {
        "id": "coin_tx_77ab01c2d3e4f5a6",
        "type": "REWARD",
        "amount": 1,
        "balanceAfter": 90,
        "title": "Thưởng vượt tầng Leo Tháp",
        "description": "Leo Tháp Kiến Thức - Tầng 7",
        "counterparty": null,
        "status": "SUCCESS",
        "createdAt": "2026-11-19T12:00:00.000Z"
      }
    ],
    "pagination": { "total": 24, "page": 1, "limit": 10, "totalPages": 3 }
  }
}
```

**⚠️ Khác spec:**

- Lịch sử gồm **mọi** biến động ví, kể cả giao dịch làm trên Discord. Ngoài 3 loại của spec còn có:

  | `type` | Ý nghĩa |
  | --- | --- |
  | `SALARY` | Lương trả bằng lệnh admin trên Discord |
  | `MINT` | Admin cộng coin |
  | `DEDUCT` | Bị trừ coin (phạt), hoặc ví nhận tiền phạt |

  Mua đồ ăn, chợ, đấu giá, lương qua Payroll API hiện là `TRANSFER_IN`/`TRANSFER_OUT`.
- `id` chỉ có với giao dịch tạo qua API này. Giao dịch từ Discord có `id: null`.
- `counterparty.fullName` là tên hiển thị trong server Discord. Không lấy được thì `null`. Giao dịch với ví hệ thống (ví dụ quỹ đồ ăn) có `fullName: "Hệ thống"`.
- `balanceAfter` được tính lùi từ số dư hiện tại.

Người chưa có giao dịch nào: `items: []`, `total: 0`. Tham số sai: `400 INVALID_PAGINATION` hoặc `400 INVALID_TYPE`.

### Endpoint 5: Chi tiết giao dịch

`GET /transactions/:transactionId`

Chỉ tra được giao dịch tạo qua API này (transfer, reward), kể cả giao dịch `FAILED`.

```json
{
  "success": true,
  "data": {
    "id": "coin_tx_5f0c2b9a1d3e4f60",
    "senderId": "966153253400231988",
    "recipientId": "1338020421328437278",
    "amount": 20,
    "fee": 0,
    "type": "TRANSFER_OUT",
    "status": "SUCCESS",
    "idempotencyKey": "tx-transfer-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "description": "Thưởng bạn làm bài quiz tốt!",
    "createdAt": "2026-11-19T13:06:00.000Z"
  }
}
```

- `type`: `TRANSFER_OUT` cho chuyển coin, `REWARD` cho thưởng. Với `REWARD`, `senderId` là ví bot và có thêm `source`, `metadata`.
- Giao dịch `FAILED` có thêm `errorCode`.
- Không tồn tại: `404 TRANSACTION_NOT_FOUND`.

### Endpoint 6: Trả thưởng gameplay

`POST /coins/reward`

| Trường | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `userId` | string | có | Discord ID người nhận, phải đang ở trong server và không phải bot |
| `amount` | number | có | Số nguyên dương |
| `idempotencyKey` | string | có* | *Hoặc header `Idempotency-Key` |
| `source` | string | có | `TOWER_COMPLETION`, `BOSS_BATTLE`, `DAILY_QUEST`, `BOUNTY_COMPLETION` |
| `description` | string | có | Hiển thị cho người dùng, 1–200 ký tự |
| `metadata` | object | không | Dữ liệu ngữ cảnh, tối đa 2 KB khi encode JSON |

```bash
curl -X POST https://<host>/api/v1/coins/reward \
  -H "Authorization: Bearer $BCN_COIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"userId":"966153253400231988","amount":1,"idempotencyKey":"bcn-reward-tower-s1-f7-966153253400231988","source":"TOWER_COMPLETION","description":"Thưởng vượt tầng 7 Leo Tháp","metadata":{"seasonKey":"season_2026_q4","floor":7}}'
```

```json
{
  "success": true,
  "data": {
    "transactionId": "coin_tx_77ab01c2d3e4f5a6",
    "userId": "966153253400231988",
    "amount": 1,
    "newBalance": 91,
    "status": "SUCCESS"
  }
}
```

**⚠️ Khác spec: coin thưởng lấy từ ví bot**, không tự sinh ra. Ví bot phải có đủ coin (quản trị nạp qua Payroll API `POST /api/payroll/topup`). Kiểm tra số dư ví bot bằng Endpoint 1 với Discord ID của bot.

| HTTP | `errorCode` | Khi nào |
| --- | --- | --- |
| `422` | `REWARD_POOL_INSUFFICIENT` | Ví bot không đủ coin. Báo quản trị nạp rồi gọi lại cùng key |
| `422` | `RECIPIENT_NOT_FOUND` | Người nhận không ở trong server hoặc là bot |
| `422` | `RECIPIENT_NOT_ALLOWED` | Người nhận là chính ví bot |
| `400` | `INVALID_SOURCE` / `INVALID_DESCRIPTION` / `INVALID_METADATA` | Sai dữ liệu |

### Endpoint 7: Kiểm tra trạng thái giao dịch

`GET /coins/check-status/:idempotencyKey`

```json
{
  "success": true,
  "data": {
    "idempotencyKey": "bcn-reward-tower-s1-f7-966153253400231988",
    "status": "SUCCESS",
    "transactionId": "coin_tx_77ab01c2d3e4f5a6",
    "amount": 1,
    "createdAt": "2026-11-19T12:00:00.000Z"
  }
}
```

| `status` | Ý nghĩa | Nên làm |
| --- | --- | --- |
| `SUCCESS` | Đã cộng/trừ xong | Không gọi lại |
| `NOT_FOUND` | Chưa từng ghi nhận (`data` chỉ có `idempotencyKey`, `status`) | Gọi lại an toàn |
| `FAILED` | Thất bại, xem `errorCode` | Xử lý nguyên nhân rồi gọi lại cùng key |
| `PENDING` | Đang xử lý | Đợi vài giây rồi kiểm tra lại |

**⚠️ Bổ sung:** ngoài `SUCCESS`/`NOT_FOUND` của spec còn có `FAILED`, `PENDING`. Request bị từ chối vì dữ liệu sai hoặc người nhận không hợp lệ không được ghi nhận, nên trả `NOT_FOUND`.

## 4. Mã lỗi

| HTTP | `errorCode` | Ý nghĩa | Retry? |
| --- | --- | --- | --- |
| `400` | `INVALID_USER_ID` | ID không phải Discord ID dạng chuỗi | Không |
| `400` | `INVALID_AMOUNT` | `amount` không phải số nguyên dương | Không |
| `400` | `MISSING_IDEMPOTENCY_KEY` / `INVALID_IDEMPOTENCY_KEY` / `IDEMPOTENCY_KEY_MISMATCH` | Thiếu hoặc sai key | Không |
| `400` | `INVALID_DESCRIPTION` / `INVALID_SOURCE` / `INVALID_METADATA` | Sai dữ liệu | Không |
| `400` | `INVALID_PAGINATION` / `INVALID_TYPE` | Sai query lịch sử | Không |
| `400` | `INVALID_JSON` | Body không phải JSON hợp lệ | Không |
| `401` | `UNAUTHORIZED` | Thiếu hoặc sai API key | Không |
| `401` | `API_DISABLED` | Server chưa cấu hình API key | Báo quản trị |
| `404` | `WALLET_NOT_FOUND` | Không có ví | Không |
| `404` | `TRANSACTION_NOT_FOUND` | Không có giao dịch | Không |
| `404` | `NOT_FOUND` | Sai đường dẫn | Không |
| `409` | `IDEMPOTENCY_KEY_REUSED` | Key đã dùng cho giao dịch khác | Không, dùng key mới |
| `409` | `TRANSACTION_IN_PROGRESS` | Key đang được xử lý | Có, sau vài giây |
| `422` | `INSUFFICIENT_BALANCE`, `SELF_TRANSFER_NOT_ALLOWED`, `RECIPIENT_NOT_FOUND`, `SENDER_NOT_ALLOWED`, `RECIPIENT_NOT_ALLOWED`, `REWARD_POOL_INSUFFICIENT` | Lỗi nghiệp vụ | Sau khi xử lý nguyên nhân |
| `500` | `TRANSACTION_FAILED` / `INTERNAL_ERROR` | Lỗi máy chủ | Có, cùng key |
| `503` | `SERVICE_UNAVAILABLE` / `REWARD_POOL_NOT_CONFIGURED` | Bot đang khởi động hoặc thiếu cấu hình | Có, sau vài giây |

`409`, `500`, `503` và timeout đều retry an toàn khi giữ nguyên key và body.

## 5. Cấu hình phía server (quản trị bot)

| Biến môi trường | Bắt buộc | Mô tả |
| --- | --- | --- |
| `BCN_COIN_API_KEY` | có | Key cho BCN Arena, **tối thiểu 32 ký tự**. Thiếu thì mọi request trả `401 API_DISABLED`. Tạo bằng `openssl rand -hex 32` |
| `PAYROLL_WALLET_ID` | không | Ví trả thưởng. Mặc định là ví bot (`CLIENT_ID`), dùng chung với Payroll API |
| `PAYROLL_GUILD_ID` | không | Server Discord. Chỉ cần khi bot ở nhiều server |

Key Coin API **tách riêng** với `PAYROLL_API_KEY`. Đổi key chỉ cần sửa `.env` rồi restart bot.

## 6. Checklist

- [x] Base URL và API key: quản trị gửi cho BCN Arena qua kênh riêng.
- [x] `Idempotency-Key` có unique index ở database.
- [x] Phân trang `page`, `limit` cho lịch sử giao dịch.
- [x] Mã lỗi nghiệp vụ `INSUFFICIENT_BALANCE`, `RECIPIENT_NOT_FOUND`.
- [ ] BCN Arena lưu Discord ID cho người chơi.
- [ ] Nạp coin cho ví bot trước khi bật trả thưởng.
- [ ] Gọi API qua HTTPS.
