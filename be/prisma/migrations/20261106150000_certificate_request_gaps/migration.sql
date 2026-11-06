-- Closes the gaps left by the first backfill. Data only, idempotent (ON CONFLICT DO NOTHING), nothing is deleted or changed.
-- 1) A live certificate without a request (issued by an old instance while 20261106140000 was being deployed) is recorded
--    as an already APPROVED request, so it shows on the learner's Certificates page and in the admin tab.
INSERT INTO "certificate_requests" ("id", "userId", "courseId", "status", "requestedAt", "reviewedAt", "reviewerNote", "certificateId", "updatedAt")
SELECT 'legacy-' || c."id", c."userId", c."courseId", 'APPROVED', c."issuedAt", c."issuedAt",
       'Cấp tự động trước khi có bước duyệt', c."id", CURRENT_TIMESTAMP
FROM "certificates" c
WHERE c."revokedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "certificate_requests" r WHERE r."userId" = c."userId" AND r."courseId" = c."courseId")
ON CONFLICT DO NOTHING;

-- 2) A learner whose stored course progress is COMPLETED but who has neither a certificate nor a request gets a PENDING
--    request, the state the progress code now maintains. Approve re-checks eligibility live, so a stale COMPLETED is
--    simply put on hold when the admin opens it.
INSERT INTO "certificate_requests" ("id", "userId", "courseId", "status", "requestedAt", "updatedAt")
SELECT 'bf-' || p."id", p."userId", p."courseId", 'PENDING', COALESCE(p."completedAt", CURRENT_TIMESTAMP), CURRENT_TIMESTAMP
FROM "user_course_progresses" p
WHERE p."status" = 'COMPLETED'
  AND NOT EXISTS (SELECT 1 FROM "certificates" c WHERE c."userId" = p."userId" AND c."courseId" = p."courseId" AND c."revokedAt" IS NULL)
  AND NOT EXISTS (SELECT 1 FROM "certificate_requests" r WHERE r."userId" = p."userId" AND r."courseId" = p."courseId")
ON CONFLICT DO NOTHING;
