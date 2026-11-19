# TÀI LIỆU ĐẶC TẢ TÍCH HỢP HỆ THỐNG COIN (COIN SERVICE API SPECIFICATION)

* **Phiên bản:** `1.0.0`
* **Dự án:** BCN Arena & BCN System
* **Ngày phát hành:** 19/11/2026
* **Đối tượng:** Đội ngũ phát triển Backend / Đối tác cung cấp dịch vụ Coin (Coin Service)

---

## 1. TỔNG QUAN KIẾN TRÚC

BCN Arena bao gồm các tính năng sử dụng Coin:
1. **Ví cá nhân (Personal Wallet):** Xem số dư Coin, trạng thái đồng bộ, làm mới số dư.
2. **Chuyển Coin P2P (Transfer):** Người dùng tặng / chuyển Coin cho nhau.
3. **Lịch sử giao dịch (History):** Tra cứu biến động số dư, chi tiết từng giao dịch.
4. **Cơ chế thưởng Gameplay (Rewards):** Cộng Coin tự động khi người chơi vượt tầng **Leo Tháp**, tiêu diệt **Boss Tuần**, hoàn thành **Quiz** và giải quyết **Nhiệm vụ Freelancer (Bounties)**.
5. **Đối soát & Bù trừ (Reconciliation):** Đảm bảo tính toàn vẹn dữ liệu khi có sự cố mạng.

```mermaid
sequenceDiagram
    autonumber
    actor User as Người chơi (BCN Arena)
    participant Arena as BCN Arena Backend
    participant CoinSvc as External Coin Service

    User->>Arena: Mở Dashboard / Ví Coin
    Arena->>CoinSvc: GET /api/v1/wallets/:userId/balance
    CoinSvc-->>Arena: 200 OK (balance, lastSyncedAt)
    Arena-->>User: Hiển thị 90 Coin

    User->>Arena: Chuyển 20 Coin cho bạn bè
    Arena->>CoinSvc: POST /api/v1/wallets/transfer (idempotencyKey)
    CoinSvc-->>Arena: 200 OK (newBalance: 70)
    Arena-->>User: Thông báo chuyển thành công

    Note over Arena,CoinSvc: Người chơi vượt tầng Leo Tháp
    Arena->>CoinSvc: POST /api/v1/coins/reward (idempotencyKey, amount: 1)
    CoinSvc-->>Arena: 200 OK (newBalance: 71)
```

---

## 2. QUY CHUẨN XÁC THỰC & KỸ THUẬT CHUNG

### 2.1. Authentication (Xác thực giữa 2 hệ thống)
Mọi request từ BCN Arena gửi sang Coin Service đều đi kèm API Key qua HTTP Header:
```http
Authorization: Bearer <BCN_COIN_API_KEY>
Content-Type: application/json
Accept: application/json
```

### 2.2. Cơ chế Idempotency (Bắt buộc)
Các request làm biến đổi số dư (`POST /wallets/transfer` và `POST /coins/reward`) **bắt buộc** phải hỗ trợ khóa chống trùng lặp `idempotencyKey`:
* Định dạng: UUID v4 hoặc tiền tố có ngữ cảnh (ví dụ: `bcn-tower-s1-f7-usr_hung123`).
* Khi Coin Service nhận được request có `idempotencyKey` đã xử lý thành công trước đó, phải trả về ngay kết quả giao dịch cũ với mã `200 OK`, **tuyệt đối không thực hiện cộng/trừ số dư lần thứ hai**.

### 2.3. Mã lỗi chuẩn HTTP (Error Codes)
* `200 OK`: Xử lý thành công.
* `400 Bad Request`: Dữ liệu gửi lên sai định dạng hoặc thiếu trường bắt buộc.
* `401 Unauthorized`: API Key không hợp lệ hoặc hết hạn.
* `404 Not Found`: Không tìm thấy ví của người dùng hoặc giao dịch.
* `422 Unprocessable Entity`: Lỗi nghiệp vụ (ví dụ: không đủ số dư, tự chuyển cho chính mình).
* `500 Internal Server Error`: Lỗi máy chủ Coin Service.

Cấu trúc JSON phản hồi lỗi chung:
```json
{
  "success": false,
  "errorCode": "INSUFFICIENT_BALANCE",
  "message": "Số dư Coin không đủ để thực hiện giao dịch",
  "timestamp": "2026-11-19T13:00:00.000Z"
}
```

---

## 3. DANH SÁCH CÁC ENDPOINT CHI TIẾT

### Endpoint 1: Lấy số dư ví (Get Wallet Balance)
Tra cứu số dư Coin khả dụng của một tài khoản.

* **Method:** `GET`
* **Path:** `/api/v1/wallets/:userId/balance`
* **Path Parameters:**
  * `userId` (string, required): Mã người dùng BCN Arena (ví dụ: `usr_hung123` hoặc UUID).

#### Ví dụ Request (cURL):
```bash
curl -X GET "https://coin-api.domain.com/api/v1/wallets/usr_hung123/balance" \
  -H "Authorization: Bearer bcn_secret_token_xyz"
```

#### Ví dụ Response (`200 OK`):
```json
{
  "success": true,
  "data": {
    "userId": "usr_hung123",
    "balance": 90,
    "lockedBalance": 0,
    "currency": "COIN",
    "lastSyncedAt": "2026-11-19T13:00:00.000Z",
    "syncStatus": "SYNCED"
  }
}
```

---

### Endpoint 2: Đồng bộ lại số dư (Sync Wallet Balance)
Kích hoạt đối soát và làm mới số dư ví từ sổ cái kế toán lõi khi người dùng ấn nút "Làm mới số dư".

* **Method:** `POST`
* **Path:** `/api/v1/wallets/:userId/sync`
* **Path Parameters:**
  * `userId` (string, required): Mã người dùng.

#### Ví dụ Response (`200 OK`):
```json
{
  "success": true,
  "data": {
    "userId": "usr_hung123",
    "balance": 90,
    "lastSyncedAt": "2026-11-19T13:05:00.000Z",
    "syncStatus": "SYNCED"
  }
}
```

---

### Endpoint 3: Chuyển Coin P2P (Transfer Coin)
Người dùng chuyển Coin cho tài khoản khác trong hệ thống.

* **Method:** `POST`
* **Path:** `/api/v1/wallets/transfer`
* **Headers:**
  * `Idempotency-Key` (string, required): Mã chống trùng giao dịch.

#### Request Body Schema:
| Trường | Kiểu | Bắt buộc | Mô tả |
|:---|:---:|:---:|:---|
| `senderId` | string | Có | Mã người gửi |
| `recipientId` | string | Có | Mã người nhận |
| `amount` | number | Có | Số Coin chuyển (số nguyên dương $> 0$) |
| `idempotencyKey`| string | Có | Khóa chống trùng lặp |
| `description` | string | Không | Lời nhắn / Ghi chú chuyển tiền |

#### Ví dụ Request:
```json
{
  "senderId": "usr_hung123",
  "recipientId": "usr_tuan456",
  "amount": 20,
  "idempotencyKey": "tx-transfer-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "description": "Thưởng bạn làm bài quiz tốt!"
}
```

#### Ví dụ Response Thành Công (`200 OK`):
```json
{
  "success": true,
  "message": "Chuyển Coin thành công",
  "data": {
    "transactionId": "coin_tx_88991122",
    "senderId": "usr_hung123",
    "recipientId": "usr_tuan456",
    "amount": 20,
    "senderBalance": 70,
    "status": "SUCCESS",
    "createdAt": "2026-11-19T13:06:00.000Z"
  }
}
```

#### Mã lỗi nghiệp vụ (`422 Unprocessable Entity`):
* `INSUFFICIENT_BALANCE`: Số dư khả dụng của người gửi không đủ.
* `SELF_TRANSFER_NOT_ALLOWED`: `senderId` trùng `recipientId`.
* `RECIPIENT_NOT_FOUND`: Người nhận không tồn tại hoặc ví bị khóa.

---

### Endpoint 4: Lịch sử biến động số dư (Transaction History)
Lấy danh sách các giao dịch (cộng thưởng, chuyển tiền, nhận tiền) của người dùng có phân trang.

* **Method:** `GET`
* **Path:** `/api/v1/wallets/:userId/transactions`
* **Query Parameters:**
  * `page` (number, default: 1): Số trang.
  * `limit` (number, default: 10): Số lượng bản ghi mỗi trang.
  * `type` (string, optional): Lọc theo loại (`ALL`, `REWARD`, `TRANSFER_IN`, `TRANSFER_OUT`).

#### Ví dụ Response (`200 OK`):
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "coin_tx_88991122",
        "type": "TRANSFER_OUT",
        "amount": -20,
        "balanceAfter": 70,
        "title": "Chuyển Coin đến Trần Văn Tuấn",
        "description": "Thưởng bạn làm bài quiz tốt!",
        "counterparty": {
          "id": "usr_tuan456",
          "fullName": "Trần Văn Tuấn"
        },
        "status": "SUCCESS",
        "createdAt": "2026-11-19T13:06:00.000Z"
      },
      {
        "id": "coin_tx_88990011",
        "type": "REWARD",
        "amount": 1,
        "balanceAfter": 90,
        "title": "Thưởng vượt tầng Leo Tháp",
        "description": "Leo Tháp Kiến Thức - Tầng 7",
        "status": "SUCCESS",
        "createdAt": "2026-11-19T12:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 24,
      "page": 1,
      "limit": 10,
      "totalPages": 3
    }
  }
}
```

---

### Endpoint 5: Tra cứu chi tiết giao dịch (Transaction Detail)
* **Method:** `GET`
* **Path:** `/api/v1/transactions/:transactionId`

#### Ví dụ Response (`200 OK`):
```json
{
  "success": true,
  "data": {
    "id": "coin_tx_88991122",
    "senderId": "usr_hung123",
    "recipientId": "usr_tuan456",
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

---

### Endpoint 6: Trả thưởng gameplay (Credit Reward)
Hệ thống BCN Arena chủ động gọi API này để phát thưởng Coin cho người dùng.

* **Method:** `POST`
* **Path:** `/api/v1/coins/reward`
* **Headers:**
  * `Idempotency-Key` (string, required): Khóa định danh sự kiện nhận thưởng.

#### Request Body Schema:
| Trường | Kiểu | Bắt buộc | Mô tả |
|:---|:---:|:---:|:---|
| `userId` | string | Có | Mã người nhận thưởng |
| `amount` | number | Có | Số Coin thưởng ($> 0$) |
| `idempotencyKey`| string | Có | Khóa chống nhận thưởng 2 lần |
| `source` | string | Có | Nguồn thưởng (`TOWER_COMPLETION`, `BOSS_BATTLE`, `DAILY_QUEST`, `BOUNTY_COMPLETION`) |
| `description` | string | Có | Diễn giải thưởng hiển thị cho người dùng |
| `metadata` | object | Không | Dữ liệu ngữ cảnh (mã mùa giải, tầng, nhiệm vụ...) |

#### Ví dụ Request:
```json
{
  "userId": "usr_hung123",
  "amount": 1,
  "idempotencyKey": "bcn-reward-tower-s1-f7-usr_hung123",
  "source": "TOWER_COMPLETION",
  "description": "Thưởng vượt tầng 7 Leo Tháp",
  "metadata": {
    "seasonKey": "season_2026_q4",
    "floor": 7,
    "attemptId": "att_998877"
  }
}
```

#### Ví dụ Response (`200 OK`):
```json
{
  "success": true,
  "data": {
    "transactionId": "coin_tx_99223311",
    "userId": "usr_hung123",
    "amount": 1,
    "newBalance": 91,
    "status": "SUCCESS"
  }
}
```

---

### Endpoint 7: Đối soát trạng thái giao dịch (Check Status)
Dùng khi request trả thưởng hoặc chuyển coin gặp sự cố mạng (HTTP Timeout / Network Error) để BCN Arena kiểm tra lại trạng thái trước khi retry.

* **Method:** `GET`
* **Path:** `/api/v1/coins/check-status/:idempotencyKey`

#### Response khi đã xử lý thành công (`200 OK`):
```json
{
  "success": true,
  "data": {
    "idempotencyKey": "bcn-reward-tower-s1-f7-usr_hung123",
    "status": "SUCCESS",
    "transactionId": "coin_tx_99223311",
    "amount": 1,
    "createdAt": "2026-11-19T12:00:00.000Z"
  }
}
```

#### Response khi chưa từng ghi nhận giao dịch:
```json
{
  "success": true,
  "data": {
    "idempotencyKey": "bcn-reward-tower-s1-f7-usr_hung123",
    "status": "NOT_FOUND"
  }
}
```

---

## 4. CHECKLIST DÀNH CHO BÊN TÍCH HỢP

- [ ] Đã cấp `Base URL` (Staging / Production) và `API Key` cho BCN Arena.
- [ ] Đã whitelist địa chỉ IP / Domain của BCN Arena Server (nếu có Firewall).
- [ ] Đã cài đặt cơ chế khóa `Idempotency-Key` ở tầng Database (Unique Index).
- [ ] Đã hỗ trợ phân trang cho danh sách giao dịch (`page`, `limit`).
- [ ] Đã trả về đầy đủ các mã lỗi nghiệp vụ (`INSUFFICIENT_BALANCE`, `RECIPIENT_NOT_FOUND`).
- [ ] Thời gian phản hồi API trung bình $< 300\text{ms}$ cho các tác vụ lấy số dư.
