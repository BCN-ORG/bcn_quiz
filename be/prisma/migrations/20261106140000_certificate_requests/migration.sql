-- Certificates are issued only after an admin approves a request. Additive: nothing is deleted or rewritten.
CREATE TYPE "CertificateRequestStatus" AS ENUM ('PENDING', 'ON_HOLD', 'APPROVED', 'REJECTED', 'REVOKED');

ALTER TABLE "certificates"
  ADD COLUMN "revokedAt" TIMESTAMP(3),
  ADD COLUMN "revokedBy" TEXT,
  ADD COLUMN "revokedReason" TEXT;

CREATE TABLE "certificate_requests" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "status" "CertificateRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resubmittedAt" TIMESTAMP(3),
  "reviewerId" TEXT,
  "reviewerNote" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "certificateId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "certificate_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "certificate_requests_userId_courseId_key" ON "certificate_requests"("userId", "courseId");
CREATE INDEX "certificate_requests_status_requestedAt_idx" ON "certificate_requests"("status", "requestedAt");
CREATE INDEX "certificate_requests_courseId_status_idx" ON "certificate_requests"("courseId", "status");

ALTER TABLE "certificate_requests" ADD CONSTRAINT "certificate_requests_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "certificate_requests" ADD CONSTRAINT "certificate_requests_certificateId_fkey"
  FOREIGN KEY ("certificateId") REFERENCES "certificates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TYPE "NotificationType" ADD VALUE 'CERTIFICATE_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'CERTIFICATE_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'CERTIFICATE_REVOKED';

-- Everyone who already holds a certificate keeps it: it becomes an APPROVED request (issued before approval existed).
INSERT INTO "certificate_requests" ("id", "userId", "courseId", "status", "requestedAt", "reviewedAt", "reviewerNote", "certificateId", "updatedAt")
SELECT 'legacy-' || c."id", c."userId", c."courseId", 'APPROVED', c."issuedAt", c."issuedAt",
       'Cấp tự động trước khi có bước duyệt', c."id", CURRENT_TIMESTAMP
FROM "certificates" c;
