# Deploy trên shared infrastructure BCN

Yêu cầu Docker Compose >= 2.30 (hỗ trợ `env_file.format: raw` để giữ nguyên ký tự đặc biệt trong secret). Production Compose chỉ chạy app và join external network `bcn-infra`. PostgreSQL (`postgres:5432`), Redis (`redis:6379`, DB 0), MinIO (`minio:9000`) và monitoring được admin quản lý tại `/opt/infrastructure`. Local dùng cùng Postgres/Redis/MinIO với `bcn_profiles` (host `5433` / `6379` / `9010`).

## Cấu hình GitHub

Tạo Environment **production** ở mỗi repository. Những key không có `# optional` trong `.env.example` bắt buộc phải cấu hình; workflow dừng trước migration/deploy khi thiếu. Key optional dùng giá trị mẫu nếu chưa cấu hình. Khi thêm ENV bắt buộc, thêm vào `.env.example` không có `# optional`.

| App | Database | DB user | Bucket | Redis prefix | APP_PORT | HOST_PORT | FE_HOST_PORT | Domain |
|---|---|---|---|---|---|---|---|---|
| bcn_profiles | profiles | profiles_app | profiles | profiles: | 3000 | 18085 | 18087 | profiles.bcn.id.vn |
| bcn_quiz | quizzes | quizzes_app | quizzes | quizzes: | 3001 | 18086 | 18088 | quizzes.bcn.id.vn |

Nginx (managed on server): `/api/` → `127.0.0.1:18086`, `/` → `127.0.0.1:18088`.

Variables: `APP_PORT`, `HOST_PORT`, `FE_APP_PORT`, `FE_HOST_PORT`, `DB_HOST=postgres`, `DB_PORT=5432`, `DB_DATABASE`, `DB_USERNAME`, `DB_SCHEMA=public`, `REDIS_HOST=redis`, `REDIS_PORT=6379`, `REDIS_PREFIX`, `MINIO_ENDPOINT=https://storage.bcn.id.vn`, `MINIO_BUCKET`, `MINIO_FORCE_PATH_STYLE=true`, `PROFILES_API_BASE_URL=http://bcn_profiles:3000/api`, `BCN_OAUTH_ISSUER=https://profiles.bcn.id.vn/api`, `BCN_OAUTH_CLIENT_ID=bcn-quiz`, `BCN_OAUTH_REDIRECT_URI=https://quizzes.bcn.id.vn/api/auth/callback`, `BCN_OAUTH_SUCCESS_REDIRECT_URL=https://quizzes.bcn.id.vn/dashboard`, `NEXT_PUBLIC_API_URL=https://quizzes.bcn.id.vn/api`, `NEXT_PUBLIC_PROFILES_APP_URL=https://profiles.bcn.id.vn`. Public endpoint phải là origin HTTPS không có subpath; reverse proxy giữ nguyên Host và path để chữ ký hợp lệ. Nếu dùng region khác mặc định, cấu hình `MINIO_REGION`. Prod `FE_APP_PORT=3000` (port trong container Next).

Secrets: `DB_PASSWORD`, `REDIS_PASSWORD` dùng chung do admin cấp, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` chỉ có quyền bucket của app, `PROFILES_CLIENT_SECRET` là server key của application `bcn-quiz`. Không đưa `PROFILES_CLIENT_SECRET` vào frontend.

Không dùng PostgreSQL/MinIO admin credential. Không cần cấu hình `POSTGRES_*`, Cloudinary hoặc secret `DATABASE_URL`/`REDIS_URL`. CI tự URL-encode mật khẩu DB và tạo `DATABASE_URL`; Redis kết nối trực tiếp host/port/password với DB 0. `APP_PORT` được ưu tiên, `PORT` vẫn hỗ trợ local cũ.

## Chuẩn bị server và chuyển dữ liệu

Admin phải tạo DB/user, cấp quyền schema/migration, tạo bucket và credential trước. Domain S3 public cần proxy tới MinIO, cho phép PUT, giới hạn request phù hợp file 20 MB. Bucket cần CORS cho origin frontend (ví dụ `https://quizzes.bcn.id.vn`) với `GET`, `HEAD`, `PUT`, cho phép header `Content-Type`. Nginx chuyển tới `127.0.0.1:9010`, giữ nguyên Host `storage.bcn.id.vn`. URL file hiện lưu dạng cố định: cần policy đọc cho các object được ứng dụng công khai, hoặc proxy đọc tương ứng; app không tự thay đổi bucket policy.

Backup database cũ, restore dữ liệu vào DB mới với user app và xác nhận dữ liệu trước deploy. File Cloudinary cũ không được tự chuyển bằng việc deploy code: cần copy file sang bucket app, cập nhật URL và object key trong DB. Có thể giữ URL cũ để tiếp tục hiển thị trong giai đoạn chuyển; mọi upload mới và metadata file mới phải dùng MinIO. Phối hợp cập nhật frontend cùng phiên bản backend mới.

Workflow không remove orphan services, không xóa volume và không restart shared infrastructure. Stack cũ cần được admin dọn sau khi backup và chuyển dữ liệu được xác nhận. Khi chuyển lần đầu, rollback về stack cũ cần admin xử lý vì cấu hình database và upload đã thay đổi. Rollback image không tự đảo ngược database migration.

## Luồng deploy

Push `main` → test/build image BE và FE theo Git SHA → validate ENV → kiểm tra `bcn-infra` → generate `.env` quyền `600` tại `/opt/apps/<app>` → pull → migration bằng user app → cập nhật `app` + `web` → `GET /api/health` và `GET /`.

CI tạo thêm `.env.compose` chứa `IMAGE_NAME`, `IMAGE_TAG`, `APP_PORT`, `HOST_PORT`, `FE_IMAGE_NAME`, `FE_IMAGE_TAG`, `FE_APP_PORT`, `FE_HOST_PORT` để Compose nội suy cấu hình mà không parse secret. Luôn dùng `--env-file .env.compose`.

Deploy thủ công sau khi đã điền `.env` từ mẫu (thêm `IMAGE_NAME`, `IMAGE_TAG`, `FE_IMAGE_NAME`, `FE_IMAGE_TAG`, và `DATABASE_URL` đã URL-encode password; tạo `.env.compose` với các key nêu trên, giá trị trùng `.env`):

```bash
docker network inspect bcn-infra
chmod 600 .env
docker compose --env-file .env.compose -f docker-compose.prod.yml config --quiet
docker compose --env-file .env.compose -f docker-compose.prod.yml pull
docker compose --env-file .env.compose -f docker-compose.prod.yml run --rm --no-deps --entrypoint npx app prisma migrate deploy
docker compose --env-file .env.compose -f docker-compose.prod.yml up -d app web
curl --fail http://127.0.0.1:18086/api/health
curl --fail http://127.0.0.1:18088/
```

Ứng dụng chỉ bind host port trên `127.0.0.1`; Nginx proxy đến port này. Không mở port DB/Redis/MinIO từ Compose app. Entrypoint không tự migration mỗi restart; stack local dùng `RUN_MIGRATIONS=true`.

## Frontend upload/download MinIO

Giữ route xin chữ ký hiện có. Response trả `provider`, `method=PUT`, `uploadUrl`, `downloadUrl`, `publicId`, `secureUrl`, `maxBytes`, `expiresAt`. PUT và GET được ký trực tiếp bằng `https://storage.bcn.id.vn`, có hiệu lực 5 phút; frontend dùng nguyên URL, không thay hostname/path/query. `MINIO_FORCE_PATH_STYLE=true` ánh xạ sang `pathStyle: true` của SDK.

```javascript
async function uploadToMinio(upload, file) {
  if (!file.size || file.size > upload.maxBytes) throw new Error('File quá lớn hoặc rỗng');
  const response = await fetch(upload.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!response.ok) throw new Error('Upload thất bại');
  return { secureUrl: upload.secureUrl, publicId: upload.publicId };
}
const response = await fetch(upload.downloadUrl);
const file = await response.blob();
```

PUT gửi file trực tiếp, không dùng FormData. Presigned PUT không giới hạn dung lượng bằng POST policy: frontend kiểm tra `maxBytes`, backend kiểm tra dung lượng object thật bằng HEAD trước lưu metadata, proxy giới hạn request. MinIO không tự chuyển WebP/quality; frontend xử lý ảnh trước upload nếu cần.

Avatar lưu `{avatar: secureUrl, avatarPublicId: publicId}`; ảnh quiz/topic/course lưu `{imageUrl: secureUrl, imagePublicId: publicId}`. Project files dùng `secureUrl`, `publicId` kèm metadata hiện có. Không lưu URL có chữ ký vào DB vì chúng hết hạn: `secureUrl` là địa chỉ cố định để đối chiếu metadata, `downloadUrl` dùng tải object private. Backend có `createDownloadUrl(key)` để cấp lại URL sau khi kiểm tra quyền truy cập ở endpoint nghiệp vụ; không có endpoint tải chung bỏ qua phân quyền. API đọc metadata hiện có vẫn trả URL cố định, cần tích hợp cấp lại signed GET tại luồng đọc nếu dùng bucket private lâu dài.

Định dạng ENV: [Docker Compose raw env_file](https://docs.docker.com/reference/compose-file/services/#format).

SDK presigned PUT/GET: [MinIO JavaScript API](https://github.com/minio/minio-js/blob/master/docs/API.md).
