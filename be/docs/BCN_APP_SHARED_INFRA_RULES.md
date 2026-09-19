# BCN App Shared Infrastructure Rules

Tài liệu này dành cho các project trong GitHub Organization `bcn-org` khi chuyển sang sử dụng **PostgreSQL + MinIO + Redis dùng chung** trên server production.

Mục tiêu:

```text
App chỉ chạy application của chính nó
        │
        └── join Docker network: bcn-infra
                │
                ├── postgres:5432
                ├── minio:9000
                └── redis:6379
```

Infrastructure đã được quản lý riêng tại server:

```text
/opt/infrastructure/
├── postgres/
├── minio/
├── redis/
└── monitoring/
```

Các project **không tự tạo PostgreSQL / MinIO / Redis riêng trong production Compose** nữa.

---

# 1. Quy tắc chung

Mỗi app production phải tuân theo:

```text
PostgreSQL
→ dùng PostgreSQL chung
→ database riêng cho app
→ database user riêng cho app

MinIO
→ dùng MinIO chung
→ bucket riêng cho app
→ credential riêng cho app

Redis
→ dùng Redis chung
→ password chung
→ Redis DB 0
→ prefix riêng cho app

Docker
→ app phải join network bcn-infra
```

Ví dụ:

```text
bcn_profiles
├── DB: profiles
├── DB user: profiles_app
├── MinIO bucket: profiles
├── Redis prefix: profiles:
└── Docker network: bcn-infra
```

---

# 2. Không chạy infrastructure riêng trong app

Production Compose của app không được tiếp tục tạo:

```yaml
postgres:
  image: postgres:...

redis:
  image: redis:...

minio:
  image: ...
```

Sai:

```text
bcn_profiles
├── app
├── postgres
├── redis
└── minio
```

Đúng:

```text
bcn_profiles
     │
     └── bcn-infra
          ├── bcn-postgres
          ├── minio-server
          └── bcn-redis
```

---

# 3. Docker network bắt buộc

Infrastructure dùng Docker network:

```text
bcn-infra
```

Trong `docker-compose.prod.yml` của app phải khai báo:

```yaml
networks:
  bcn-infra:
    external: true
```

Service app:

```yaml
services:
  app:
    image: ${IMAGE_NAME}:${IMAGE_TAG}

    container_name: ${PROJECT_NAME}

    restart: unless-stopped

    env_file:
      - .env

    ports:
      - "127.0.0.1:${HOST_PORT}:${APP_PORT}"

    networks:
      - bcn-infra

networks:
  bcn-infra:
    external: true
```

Nếu project có network nội bộ riêng, app có thể join cả hai:

```yaml
services:
  app:
    networks:
      - default
      - bcn-infra

networks:
  bcn-infra:
    external: true
```

---

# 4. Không dùng `localhost` để gọi infrastructure

Bên trong container:

```text
localhost
```

là **chính container đó**.

Không dùng:

```env
DB_HOST=localhost
REDIS_HOST=localhost
MINIO_ENDPOINT=http://localhost:9000
```

Phải dùng Docker DNS:

```env
DB_HOST=postgres
REDIS_HOST=redis
MINIO_ENDPOINT=http://minio:9000
```

Quy tắc:

```text
PostgreSQL → postgres:5432
Redis      → redis:6379
MinIO      → minio:9000
```

---

# 5. PostgreSQL

Mỗi app có:

```text
1 database riêng
1 database user riêng
1 password riêng
```

Ví dụ:

```text
App: bcn_profiles

Database:
profiles

User:
profiles_app

Schema:
public
```

Connection:

```text
postgresql://profiles_app:<PASSWORD>@postgres:5432/profiles?schema=public
```

Ví dụ project khác:

```text
bcn_quizzes
→ DB: quizzes
→ user: quizzes_app

bcn_judge
→ DB: judge
→ user: judge_app
```

App **không được sử dụng**:

```text
bcn_admin
```

hoặc PostgreSQL admin credential.

`bcn_admin` chỉ dành cho quản trị infrastructure.

---

# 6. PostgreSQL ENV

Khuyến nghị tách config và secret:

## GitHub Environment Variables

```text
DB_HOST=postgres
DB_PORT=5432
DB_DATABASE=profiles
DB_USERNAME=profiles_app
DB_SCHEMA=public
```

## GitHub Environment Secrets

```text
DB_PASSWORD=********
```

App có thể tự build `DATABASE_URL` từ các biến trên.

Nếu sử dụng trực tiếp:

```text
DATABASE_URL
```

thì lưu nó dưới GitHub Secret.

> Nếu password có ký tự đặc biệt như `@`, `:`, `/`, `#`, `%`, phải URL-encode khi đặt trực tiếp trong `DATABASE_URL`.

---

# 7. Database migration

Migration vẫn thuộc trách nhiệm của từng project.

Ví dụ:

```text
bcn_profiles
→ chỉ migration DB profiles

bcn_quizzes
→ chỉ migration DB quizzes

bcn_judge
→ chỉ migration DB judge
```

Không dùng `bcn_admin` để application chạy migration.

Migration phải chạy bằng application DB user:

```text
profiles_app
quizzes_app
judge_app
```

Flow deploy khuyến nghị:

```text
Build Image
    ↓
Validate ENV
    ↓
Run Migration
    ↓
Deploy App
    ↓
Health Check
```

---

# 8. Seed data

Seed cũng phải chạy vào database của chính project.

Ví dụ:

```text
bcn_judge
→ judge database
→ judge_app
```

Không seed vào database khác.

Sau khi seed nên verify:

```sql
\dt
```

và:

```sql
SELECT * FROM <table> LIMIT 20;
```

---

# 9. MinIO

MinIO production dùng chung:

```text
Docker hostname:
minio

Port:
9000
```

App kết nối:

```env
MINIO_ENDPOINT=http://minio:9000
```

Không dùng host port:

```text
9010
9011
9012
```

từ application container.

Các port `9010/9011/9012` là port quản trị/access từ host hoặc reverse proxy.

---

# 10. MinIO bucket

Mỗi app dùng bucket riêng.

Ví dụ:

```text
bcn_profiles
→ bucket: profiles

bcn_quizzes
→ bucket: quizzes

bcn_judge
→ bucket: judge
```

Không upload file sang bucket của project khác.

ENV:

```env
MINIO_ENDPOINT=http://minio:9000
MINIO_BUCKET=profiles
```

---

# 11. MinIO credential

Mỗi project có credential riêng.

Ví dụ:

```text
profiles app
→ credential chỉ dành cho profiles bucket

quizzes app
→ credential chỉ dành cho quizzes bucket
```

GitHub Secrets:

```text
MINIO_ACCESS_KEY
MINIO_SECRET_KEY
```

Không dùng MinIO root/admin credential trong app.

Không commit MinIO credential vào source code.

---

# 12. Redis

Redis production dùng chung:

```text
Host:
redis

Port:
6379

Database:
0

Password:
shared infrastructure password
```

Mỗi app phân biệt key bằng prefix.

Ví dụ:

```text
bcn_profiles → profiles:
bcn_quizzes  → quizzes:
bcn_judge    → judge:
```

ENV:

```env
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=********
REDIS_PREFIX=profiles:
```

---

# 13. Quy tắc Redis key

Tất cả key của app phải có prefix.

Convention:

```text
<app>:<module>:<identifier>
```

Ví dụ:

```text
profiles:user:123
profiles:session:abc
profiles:cache:user:123

quizzes:quiz:100
quizzes:leaderboard:global

judge:submission:999
judge:result:999
judge:compile:123
```

Không tạo key chung chung:

```text
user:123
session:abc
cache:data
queue
```

vì có thể trùng với project khác.

---

# 14. Redis prefix không phải security boundary

Các app hiện dùng chung Redis password.

Do đó:

```text
prefix
!=
security isolation
```

Prefix chỉ dùng để:

```text
phân biệt namespace
tránh key collision
dễ debug
dễ cleanup
```

Nếu sau này cần security isolation giữa các app thì infrastructure sẽ nâng cấp sang Redis ACL.

Developer không tự thay đổi mô hình này trong từng project.

---

# 15. BullMQ

Nếu project dùng BullMQ, queue phải có namespace/prefix riêng.

Ví dụ:

```text
judge:compile
judge:execute

profiles:notification

quizzes:score
```

Không dùng cùng một queue name/prefix giữa nhiều app.

Với job queue quan trọng, không tự thay đổi Redis eviction/persistence policy ở phía application.

---

# 16. `.env.example`

Repo phải khai báo đầy đủ ENV cần thiết nhưng không chứa giá trị thật.

Ví dụ:

```env
APP_PORT=
HOST_PORT=

DB_HOST=
DB_PORT=
DB_DATABASE=
DB_USERNAME=
DB_PASSWORD=
DB_SCHEMA=

MINIO_ENDPOINT=
MINIO_BUCKET=
MINIO_ACCESS_KEY=
MINIO_SECRET_KEY=

REDIS_HOST=
REDIS_PORT=
REDIS_PASSWORD=
REDIS_PREFIX=
```

`.gitignore`:

```gitignore
.env
.env.*
!.env.example
```

---

# 17. GitHub Environment `production`

Mỗi repo phải cấu hình:

```text
Settings
→ Environments
→ production
```

Ví dụ `bcn_profiles`:

## Variables

```text
APP_PORT=3000
HOST_PORT=18085

DB_HOST=postgres
DB_PORT=5432
DB_DATABASE=profiles
DB_USERNAME=profiles_app
DB_SCHEMA=public

MINIO_ENDPOINT=http://minio:9000
MINIO_BUCKET=profiles

REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PREFIX=profiles:
```

## Secrets

```text
DB_PASSWORD
MINIO_ACCESS_KEY
MINIO_SECRET_KEY
REDIS_PASSWORD
```

Không lưu:

```text
bcn_admin password
MinIO root credential
```

trong app repo.

---

# 18. CI/CD phải generate production `.env`

Workflow phải map GitHub Variables/Secrets vào:

```text
/opt/apps/<project>/.env
```

Ví dụ:

```text
DB_HOST
DB_PORT
DB_DATABASE
DB_USERNAME
DB_PASSWORD

MINIO_ENDPOINT
MINIO_BUCKET
MINIO_ACCESS_KEY
MINIO_SECRET_KEY

REDIS_HOST
REDIS_PORT
REDIS_PASSWORD
REDIS_PREFIX
```

Runtime `.env`:

```bash
chmod 600 .env
```

---

# 19. ENV validation

Nếu `.env.example` có key mới nhưng GitHub Environment chưa được cấu hình thì:

```text
CI/CD phải FAIL trước Deploy
```

Không deploy application mới với ENV thiếu.

Flow:

```text
Check GitHub ENV
      ↓
Generate .env
      ↓
Validate với .env.example
      ↓
Migration
      ↓
Deploy
```

---

# 20. Health check

Application vẫn phải có:

```text
GET /health
```

và trả:

```text
HTTP 200
```

Ví dụ:

```json
{
  "status": "UP"
}
```

Tùy project, health check có thể kiểm tra dependency quan trọng:

```text
PostgreSQL
Redis
```

nhưng không nên thực hiện query nặng.

---

# 21. Không dùng `depends_on` để quản lý shared infrastructure

PostgreSQL, Redis và MinIO là infrastructure độc lập, không thuộc lifecycle của app.

Không cần:

```yaml
depends_on:
  postgres:
  redis:
  minio:
```

vì các service này không nằm trong Compose của project.

Application phải tự xử lý reconnect/retry khi dependency tạm thời chưa sẵn sàng.

---

# 22. Không expose infrastructure từ app Compose

App Compose không được tự publish:

```text
5432
6379
9000
9001
9002
```

Infrastructure được quản lý tập trung bởi server admin.

Application chỉ expose application port:

```yaml
ports:
  - "127.0.0.1:${HOST_PORT}:${APP_PORT}"
```

---

# 23. Không sửa infrastructure trực tiếp từ project

Developer/project không tự:

```text
restart bcn-postgres
restart bcn-redis
restart minio-server

xóa database
xóa bucket
flush Redis
thay Redis password
thay PostgreSQL admin password
thay MinIO root credential
```

Các thao tác infrastructure phải được thực hiện ở tầng server/admin.

Đặc biệt không chạy:

```text
FLUSHALL
FLUSHDB
```

trên Redis dùng chung.

Vì có thể xóa dữ liệu của tất cả app.

---

# 24. Cleanup Redis

Nếu cần xóa cache của app, chỉ xóa key theo prefix của project.

Ví dụ:

```text
profiles:*
```

Không:

```text
FLUSHDB
FLUSHALL
```

vì Redis DB 0 đang được nhiều project dùng chung.

---

# 25. Khi tạo app mới

Ví dụ:

```text
bcn-orders
```

Yêu cầu infrastructure admin cấp:

```text
PostgreSQL
→ DB: orders
→ user: orders_app
→ password riêng

MinIO
→ bucket: orders
→ credential riêng

Redis
→ dùng Redis chung
→ prefix: orders:
```

Sau đó project cấu hình:

```env
DB_HOST=postgres
DB_PORT=5432
DB_DATABASE=orders
DB_USERNAME=orders_app

MINIO_ENDPOINT=http://minio:9000
MINIO_BUCKET=orders

REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PREFIX=orders:
```

và join:

```text
bcn-infra
```

---

# 26. Checklist migration app cũ

Trước khi chuyển app:

```text
[ ] Backup PostgreSQL cũ
[ ] Tạo database mới trên bcn-postgres
[ ] Tạo DB user riêng
[ ] Restore/migrate dữ liệu
[ ] Tạo MinIO bucket
[ ] Tạo MinIO credential
[ ] Xác định Redis prefix
[ ] App join bcn-infra
[ ] Xóa postgres service khỏi production Compose
[ ] Xóa redis service khỏi production Compose
[ ] Xóa minio service khỏi production Compose
[ ] Update GitHub Variables
[ ] Update GitHub Secrets
[ ] Update .env.example
[ ] Update CI/CD ENV mapping
[ ] Run migration
[ ] Deploy
[ ] Health Check pass
[ ] Verify database data
[ ] Verify MinIO upload/read
[ ] Verify Redis key có đúng prefix
```

Chỉ xóa infrastructure cũ của project sau khi hệ thống mới đã hoạt động ổn định và đã xác nhận backup.

---

# 27. Template production Compose khuyến nghị

```yaml
services:
  app:
    image: ${IMAGE_NAME}:${IMAGE_TAG}

    container_name: ${PROJECT_NAME}

    restart: unless-stopped

    env_file:
      - .env

    ports:
      - "127.0.0.1:${HOST_PORT}:${APP_PORT}"

    networks:
      - bcn-infra

networks:
  bcn-infra:
    external: true
```

Nếu project có service riêng khác, ví dụ worker:

```yaml
services:
  app:
    image: ${IMAGE_NAME}:${IMAGE_TAG}
    env_file:
      - .env
    networks:
      - bcn-infra

  worker:
    image: ${IMAGE_NAME}:${IMAGE_TAG}
    env_file:
      - .env
    command: npm run worker
    networks:
      - bcn-infra

networks:
  bcn-infra:
    external: true
```

Cả app và worker đều có thể truy cập:

```text
postgres
minio
redis
```

---

# 28. Quy tắc nhớ nhanh

```text
POSTGRESQL
postgres:5432
→ database riêng
→ user riêng
→ password riêng

MINIO
minio:9000
→ bucket riêng
→ credential riêng

REDIS
redis:6379
→ password chung
→ DB 0
→ prefix riêng

DOCKER
→ join bcn-infra

SECRET
→ GitHub Environment Secrets

CONFIG
→ GitHub Environment Variables

PRODUCTION
→ không dùng localhost để gọi shared infrastructure
→ không chạy DB/Redis/MinIO riêng trong app
```

---

# Kiến trúc cuối cùng

```text
                         Cloudflare
                              │
                              ▼
                            Nginx
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
      bcn_profiles       bcn_quizzes        bcn_judge
            │                 │                 │
            └─────────────────┼─────────────────┘
                              │
                          bcn-infra
                              │
             ┌────────────────┼────────────────┐
             ▼                ▼                ▼
        bcn-postgres      minio-server      bcn-redis
             │                │                │
      DB + user/app     bucket + cred/app   prefix/app
```
