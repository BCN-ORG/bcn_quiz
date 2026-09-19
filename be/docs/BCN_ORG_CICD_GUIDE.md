# Hướng dẫn CI/CD cho project trong `bcn-org`

Tài liệu này dành cho thành viên khi tạo hoặc đưa một project mới vào GitHub Organization `bcn-org`.

Mục tiêu là để mọi project có cùng flow:

```text
Code
→ GitHub
→ CI
→ Build Docker Image
→ GHCR
→ Self-hosted Runner
→ Ubuntu Server
→ Docker Compose
→ Health Check
→ Nginx / Domain
```

Developer **không cần SSH server để deploy**.
Thông thường chỉ cần:

```bash
git push origin main
```

---

# 1. Mục tiêu

Các project thuộc GitHub Organization:

```text
bcn-org
```

sử dụng chung CI/CD:

```text
Dev push main
      ↓
GitHub Actions
      ↓
Test
      ↓
Build Docker Image
      ↓
Push GHCR
      ↓
BCN Organization Runner
      ↓
Ubuntu Server
      ↓
/opt/apps/<project>
      ↓
Docker Compose
      ↓
Health Check
      ↓
Nginx / Domain
```

---

# 2. Những gì hệ thống đã có sẵn

Infra đã setup:

```text
GitHub Organization
→ bcn-org

Organization Runner
→ bcn-org-production-01

Container Registry
→ ghcr.io/bcn-org

Production Server
→ Docker + Docker Compose

Application directory
→ /opt/apps/<project>

Reverse Proxy
→ Nginx

Container dashboard
→ Portainer

Uptime monitoring
→ Uptime Kuma
```

Developer **không cần tạo Self-hosted Runner riêng cho từng repo**.

Runner production dùng các labels:

```text
self-hosted
linux
production
docker
bcn-org
```

---

# 3. Project cần có những file gì?

Mỗi project tối thiểu cần:

```text
my-project/
├── .github/
│   └── workflows/
│       └── cicd.yml
│
├── Dockerfile
├── docker-compose.prod.yml
├── .env.example
├── .dockerignore
├── .gitignore
└── source code
```

---

# 4. Dockerfile

Project bắt buộc phải build được bằng Docker.

Ví dụ Node.js:

```dockerfile
FROM node:24-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

Trước khi push nên test local:

```bash
docker build -t my-project:test .
```

Nếu project cần test runtime Docker:

```bash
docker run --rm -p 3000:3000 my-project:test
```

---

# 5. `.env.example`

Repo **không commit file `.env` thật**.

Chỉ commit schema ENV:

```env
APP_PORT=
HOST_PORT=
DB_HOST=
DB_NAME=
DB_USERNAME=
DB_PASSWORD=
JWT_SECRET=
```

`.gitignore`:

```gitignore
.env
.env.*
!.env.example
```

Phân loại config:

```text
GitHub Variables
→ config không nhạy cảm

GitHub Secrets
→ password / token / API key / secret key
```

Ví dụ Variables:

```text
APP_PORT
HOST_PORT
DB_HOST
DB_NAME
REDIS_HOST
APP_DOMAIN
```

Ví dụ Secrets:

```text
DB_PASSWORD
JWT_SECRET
OPENAI_API_KEY
SMTP_PASSWORD
```

---

# 6. Tạo GitHub Environment

Trong repo:

```text
Settings
→ Environments
→ New environment
```

Tên:

```text
production
```

Sau đó thêm:

## Environment Variables

Ví dụ:

```text
APP_PORT=3000
HOST_PORT=18082
DB_HOST=postgres
DB_NAME=my_project
```

## Environment Secrets

Ví dụ:

```text
DB_PASSWORD=********
JWT_SECRET=********
```

Workflow phải có:

```yaml
environment: production
```

> `HOST_PORT` phải được cấp riêng cho từng project để tránh trùng với service khác.

---

# 7. Health endpoint là bắt buộc

Backend/service nên có endpoint:

```text
GET /health
```

Ví dụ response:

```json
{
  "status": "UP"
}
```

và trả:

```text
HTTP 200 OK
```

CI/CD sử dụng endpoint này để xác nhận version mới deploy thành công.

Ví dụ:

```text
http://127.0.0.1:<HOST_PORT>/health
```

---

# 8. `docker-compose.prod.yml`

Ví dụ project đơn giản:

```yaml
services:
  app:
    image: ${IMAGE_NAME}:${IMAGE_TAG}

    container_name: my-project

    restart: unless-stopped

    env_file:
      - .env

    ports:
      - "127.0.0.1:${HOST_PORT}:${APP_PORT}"
```

Nên bind app vào:

```text
127.0.0.1
```

nếu application được public thông qua Nginx.

Không nên:

```yaml
ports:
  - "0.0.0.0:18082:3000"
```

nếu không có lý do cụ thể.

---

# 9. Workflow CI/CD

Tạo file:

```text
.github/workflows/cicd.yml
```

Template cơ bản:

```yaml
name: CI/CD

on:
  push:
    branches:
      - main

  workflow_dispatch:

permissions:
  contents: read
  packages: write

env:
  PROJECT_NAME: my-project
  PROJECT_DIR: /opt/apps/my-project
  IMAGE_NAME: ghcr.io/bcn-org/my-project

jobs:

  # =========================================================
  # CI
  # =========================================================
  ci:
    name: Build & Push Image

    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Test
        run: |
          echo "Run project tests here"

      - name: Login GHCR
        uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build & Push Docker Image
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            ${{ env.IMAGE_NAME }}:${{ github.sha }}
            ${{ env.IMAGE_NAME }}:latest


  # =========================================================
  # CD
  # =========================================================
  deploy:
    name: Deploy Production

    needs:
      - ci

    runs-on:
      - self-hosted
      - linux
      - production
      - docker
      - bcn-org

    environment: production

    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Login GHCR
        uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      # =====================================================
      # CHECK ENV
      # =====================================================
      - name: Check Environment Configuration
        env:
          APP_PORT_VALUE: ${{ vars.APP_PORT }}
          HOST_PORT_VALUE: ${{ vars.HOST_PORT }}

        run: |
          set -e

          check_env() {
            NAME="$1"
            VALUE="$2"

            if [ -z "$VALUE" ]; then
              echo "❌ $NAME is EMPTY"
              exit 1
            fi

            echo "✅ $NAME configured"
          }

          check_env "APP_PORT" "$APP_PORT_VALUE"
          check_env "HOST_PORT" "$HOST_PORT_VALUE"

      # =====================================================
      # PREPARE
      # =====================================================
      - name: Prepare Project Directory
        run: |
          set -e

          mkdir -p "${PROJECT_DIR}"

          cp docker-compose.prod.yml \
            "${PROJECT_DIR}/docker-compose.yml"

      # =====================================================
      # GENERATE .ENV
      # =====================================================
      - name: Generate Production ENV
        env:
          APP_PORT_VALUE: ${{ vars.APP_PORT }}
          HOST_PORT_VALUE: ${{ vars.HOST_PORT }}

        run: |
          set -e

          cd "${PROJECT_DIR}"

          {
            printf 'IMAGE_NAME=%s\n' "${IMAGE_NAME}"
            printf 'IMAGE_TAG=%s\n' "${GITHUB_SHA}"

            printf 'APP_PORT=%s\n' "${APP_PORT_VALUE}"
            printf 'HOST_PORT=%s\n' "${HOST_PORT_VALUE}"

            printf 'APP_VERSION=%s\n' "${GITHUB_SHA}"
          } > .env

          chmod 600 .env

      # =====================================================
      # VALIDATE
      # =====================================================
      - name: Validate Environment
        run: |
          set -e

          cd "${PROJECT_DIR}"

          FAILED=0

          while IFS='=' read -r KEY _; do

            KEY="${KEY//$'\r'/}"

            [ -z "$KEY" ] && continue

            case "$KEY" in
              \#*)
                continue
                ;;
            esac

            VALUE=$(grep -m1 "^${KEY}=" .env | cut -d= -f2- || true)

            if [ -z "$VALUE" ]; then
              echo "❌ Missing ENV: $KEY"
              FAILED=1
            else
              echo "✅ ENV OK: $KEY"
            fi

          done < "${GITHUB_WORKSPACE}/.env.example"

          if [ "$FAILED" -eq 1 ]; then
            echo "❌ Environment validation failed"
            exit 1
          fi

          echo "✅ Environment validation passed"

      # =====================================================
      # DEPLOY
      # =====================================================
      - name: Pull Image
        run: |
          set -e

          cd "${PROJECT_DIR}"

          docker compose pull app

      - name: Deploy
        run: |
          set -e

          cd "${PROJECT_DIR}"

          docker compose up -d --remove-orphans

      # =====================================================
      # HEALTH CHECK
      # =====================================================
      - name: Health Check
        env:
          HOST_PORT_VALUE: ${{ vars.HOST_PORT }}

        run: |
          for i in {1..15}; do

            if curl \
              --fail \
              --silent \
              "http://127.0.0.1:${HOST_PORT_VALUE}/health"
            then
              echo
              echo "✅ Application healthy"
              exit 0
            fi

            echo "Attempt $i/15 failed..."
            sleep 2

          done

          echo "❌ Health check failed"

          docker logs "${PROJECT_NAME}" --tail 100 || true

          exit 1
```

---

# 10. Những phần developer phải sửa trong template

Ví dụ repo:

```text
bcn-org/quiz-service
```

thì sửa:

```yaml
env:
  PROJECT_NAME: quiz-service
  PROJECT_DIR: /opt/apps/quiz-service
  IMAGE_NAME: ghcr.io/bcn-org/quiz-service
```

Quy ước:

```text
PROJECT_NAME
→ tên service/container

PROJECT_DIR
→ /opt/apps/<project-name>

IMAGE_NAME
→ ghcr.io/bcn-org/<repo-name>
```

Không copy nguyên tên project cũ sang repo mới.

---

# 11. Khi project có thêm ENV

Ví dụ project cần:

```text
JWT_SECRET
```

Thêm vào `.env.example`:

```env
JWT_SECRET=
```

Tạo GitHub Secret:

```text
Settings
→ Environments
→ production
→ Add environment secret
```

Ví dụ:

```text
JWT_SECRET=********
```

Workflow thêm:

```yaml
env:
  JWT_SECRET_VALUE: ${{ secrets.JWT_SECRET }}
```

và khi generate `.env`:

```bash
printf 'JWT_SECRET=%s\n' "${JWT_SECRET_VALUE}"
```

Nguyên tắc:

```text
ENV mới
=
.env.example
+
GitHub Variable/Secret
+
cicd.yml mapping
```

Nếu thiếu config production:

```text
Pipeline phải FAIL trước Deploy
```

Version production cũ phải tiếp tục chạy.

---

# 12. Push production lần đầu

Sau khi hoàn tất setup:

```bash
git add .

git commit -m "setup ci cd"

git push origin main
```

Flow:

```text
GitHub
   ↓
CI
   ↓
Build Docker Image
   ↓
GHCR
   ↓
Organization Runner
   ↓
/opt/apps/<project>
   ↓
Docker Compose
   ↓
Health Check
```

Không SSH production server để copy source code hoặc deploy thủ công nếu không có tình huống đặc biệt.

---

# 13. Khi update code

Sau khi sửa code:

```bash
git add .

git commit -m "update feature"

git push origin main
```

CI/CD tự:

```text
Build NEW_SHA
      ↓
Push GHCR
      ↓
Pull image mới
      ↓
Recreate container
      ↓
Health Check
```

Production image có dạng:

```text
ghcr.io/bcn-org/<repo>:<git-sha>
```

Ví dụ:

```text
ghcr.io/bcn-org/quiz-service:c3b812a...
```

Nhờ đó có thể trace:

```text
Git Commit
=
Docker Image
=
Production Version
```

---

# 14. Sau khi deploy thành công

Kiểm tra:

```text
GitHub
→ Actions
→ CI/CD
```

Các step chính phải xanh:

```text
✅ Test
✅ Build Image
✅ Push GHCR

✅ Check ENV
✅ Generate ENV
✅ Validate ENV
✅ Pull Image
✅ Deploy
✅ Health Check
```

Nếu `Health Check` fail:

1. Xem log trực tiếp trong GitHub Actions.
2. Kiểm tra container trên Portainer.
3. Xem container logs.
4. Kiểm tra ENV, port, database, Redis hoặc dependency liên quan.
5. Fix code/config rồi push lại.

---

# Lưu ý quan trọng

## 1. Không commit secrets

Không commit:

```text
.env
password
token
API key
JWT secret
private key
database password
```

Nếu secret bị commit hoặc lộ trong log/chat:

```text
Rotate secret ngay
```

---

## 2. Không tạo Runner riêng cho từng project

Các project trong `bcn-org` dùng Organization Runner:

```text
bcn-org-production-01
```

Không cần cài GitHub Runner mới khi tạo repo mới.

---

## 3. Không deploy production bằng `latest`

CI có thể push:

```text
latest
```

nhưng production nên deploy:

```text
${GITHUB_SHA}
```

để biết chính xác version đang chạy.

---

## 4. Không tự ý xóa volume

Đặc biệt không chạy tùy tiện:

```bash
docker compose down -v
```

vì `-v` có thể xóa Docker volumes.

Database, MinIO, Redis hoặc dữ liệu persistent phải được kiểm tra trước khi xóa.

---

## 5. Không sửa production container trực tiếp bằng Portainer

Portainer dùng để:

```text
Xem container
Xem port
Xem image
Xem logs
Xem CPU/RAM
Restart khi cần xử lý nhanh
```

Không dùng Portainer để thay đổi configuration production lâu dài.

Source of truth phải là:

```text
GitHub Repository
+
GitHub Environment
+
Docker Compose
+
CI/CD
```

Nếu sửa trực tiếp trong Portainer, lần CI/CD tiếp theo có thể ghi đè cấu hình.

---

## 6. Luôn validate ENV trước khi deploy

Flow đúng:

```text
Check ENV
   ↓
Generate .env
   ↓
Validate
   ↓
Pull Image
   ↓
Deploy
```

Không nên:

```text
Deploy
   ↓
mới phát hiện thiếu ENV
```

Nếu config thiếu, deployment phải dừng trước khi thay container production.

---

## 7. Mỗi project phải có HOST_PORT riêng

Ví dụ:

```text
cicd-demo       18080
hello-service   18081
quiz-service    18082
profile-service 18083
```

Trước khi cấp port mới có thể kiểm tra:

```bash
docker ps
```

hoặc:

```bash
sudo ss -tulpn
```

---

## 8. App public qua Nginx chỉ nên bind localhost

Khuyến nghị:

```yaml
ports:
  - "127.0.0.1:${HOST_PORT}:${APP_PORT}"
```

Flow:

```text
Internet
   ↓
Nginx :443
   ↓
127.0.0.1:<HOST_PORT>
   ↓
Docker Container
```

Không expose container thẳng ra Internet nếu không cần thiết.

---

## 9. GitHub Environment thay đổi không tự trigger deploy

Nếu chỉ sửa:

```text
Variables
Secrets
```

trong GitHub Environment thì workflow không tự chạy lại.

Có thể vào:

```text
GitHub
→ Actions
→ CI/CD
→ Run workflow
```

để deploy lại config mới.

---

## 10. Health Check nên kiểm tra app thật sự ready

`/health` không nên chỉ trả `200` một cách giả tạo nếu app phụ thuộc vào thành phần bắt buộc khác.

Tùy project có thể kiểm tra:

```text
Application started
Database connection
Redis connection
Required dependency
```

nhưng tránh health check quá nặng.

---

## 11. Production deploy chỉ từ `main`

Khuyến nghị workflow team:

```text
feature/*
   ↓
Pull Request
   ↓
Review / Test
   ↓
Merge main
   ↓
Production Deploy
```

Không sử dụng branch cá nhân để deploy production.

---

## 12. Khi có lỗi

Flow debug khuyến nghị:

```text
GitHub Actions
      ↓
Step nào fail?
      ↓
Portainer
      ↓
Container state / logs / image / port
      ↓
Fix code/config
      ↓
Push lại
```

Không sửa nóng production nếu lỗi có thể xử lý qua source code và CI/CD.
