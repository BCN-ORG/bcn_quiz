#!/usr/bin/env bash
# Withdraw the certificates that were issued AUTOMATICALLY (before admin approval existed) and send each learner back to
# "Chờ duyệt", so an admin reviews them (one by one, or with "Duyệt hàng loạt" on the admin Certificates tab).
#
#   Dry run (default, changes nothing):   withdraw-auto-issued-certificates.sh --container C --db D --user U
#   Apply:                                withdraw-auto-issued-certificates.sh --container C --db D --user U --apply
#   Only one course (id or slug):         ... --course frontend-co-ban
#   From your Mac, nothing stored on the server:
#     ssh <server> 'bash -s -- --container C --db D --user U --apply' < be/scripts/withdraw-auto-issued-certificates.sh
#
# Options:
#   --apply            really change the data (without it the script only reports what it would do)
#   --course X         only this course (id or slug); default: every course
#   --no-notify        do not create the in-app notification for the learners
#   --container NAME   Postgres container of the Quiz database   (required)
#   --db NAME          database                                  (required)
#   --user NAME        database role                             (required)
#
# WHICH certificates: only live (not revoked) ones whose request is APPROVED, has NO reviewer and carries the note
# 'Cấp tự động trước khi có bước duyệt' (what the migrations wrote for certificates issued by the old automatic code).
# A certificate an admin approved (reviewer set) or one already revoked is never touched.
#
# WHAT happens to each one, in ONE transaction:
#   certificate: revokedAt = now (the public verify page says "không còn hợp lệ"), revokedBy = 'system:bulk-withdraw'.
#                The row and its code are kept.
#   request:     back to PENDING (reviewer fields cleared). Approving it later re-issues the SAME code if the learner is
#                eligible at that moment (otherwise it waits ON_HOLD). The learner sees "Chờ duyệt".
#   notification: one CERTIFICATE_REVOKED notification per learner (unique key per request and day, safe to re-run).
# Before changing anything the old values are copied to certificates_withdraw_backup_<YYYYMMDD>.
#
# Re-running is safe: withdrawn requests are PENDING now, so they no longer match.
# Undo (put them back exactly as they were), for one backup table:
#   update certificates c set "revokedAt"=null, "revokedBy"=null, "revokedReason"=null
#     from certificates_withdraw_backup_<YYYYMMDD> b where c.id=b.cert_id;
#   update certificate_requests r set status=b.request_status, "reviewedAt"=b.request_reviewed_at,
#     "reviewerNote"=b.request_reviewer_note, "reviewerId"=b.request_reviewer_id
#     from certificates_withdraw_backup_<YYYYMMDD> b where r.id=b.request_id and r.status='PENDING';
#   (a request an admin has approved or rejected since then is not PENDING and is left alone)
set -euo pipefail

CONTAINER=""
DB=""
DBUSER=""
COURSE=""
APPLY=0
NOTIFY=1

usage() { sed -n '2,38p' "$0" 2>/dev/null | sed 's/^# \{0,1\}//' || true; echo "usage: $0 --container N --db N --user N [--course X] [--no-notify] [--apply]" >&2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --no-notify) NOTIFY=0 ;;
    --course) COURSE="${2:?--course needs a value}"; shift ;;
    --container) CONTAINER="${2:?--container needs a value}"; shift ;;
    --db) DB="${2:?--db needs a value}"; shift ;;
    --user) DBUSER="${2:?--user needs a value}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage; exit 2 ;;
  esac
  shift
done

if [ -z "$CONTAINER" ] || [ -z "$DB" ] || [ -z "$DBUSER" ]; then
  echo "--container, --db and --user are required (this script never guesses which database to change)" >&2
  exit 2
fi
if [ -n "$COURSE" ] && ! [[ "$COURSE" =~ ^[A-Za-z0-9_-]{1,64}$ ]]; then
  echo "--course must be a course id or slug (letters, digits, - and _)" >&2
  exit 2
fi

BACKUP="certificates_withdraw_backup_$(date +%Y%m%d)"
MODE="DRY RUN (nothing is changed; add --apply)"
[ "$APPLY" -eq 1 ] && MODE="APPLY"
echo "== mode: $MODE | db: $DB@$CONTAINER as $DBUSER | course: ${COURSE:-all} | notify: $NOTIFY"

docker exec -i "$CONTAINER" psql -U "$DBUSER" -d "$DB" -X -q -v ON_ERROR_STOP=1 \
  -v apply="$APPLY" -v notify="$NOTIFY" -v course="$COURSE" -v backup="$BACKUP" <<'SQL'
\pset format aligned
\pset border 1

-- 1. The certificates that match (see the header for the exact rule).
CREATE TEMP TABLE cand AS
SELECT r.id            AS request_id,
       r."userId"      AS user_id,
       r."courseId"    AS course_id,
       co.name         AS course_name,
       c.id            AS cert_id,
       c."certificateCode" AS code,
       c."issuedAt"    AS issued_at,
       r.status::text  AS request_status,
       r."reviewedAt"  AS request_reviewed_at,
       r."reviewerNote" AS request_reviewer_note,
       r."reviewerId"  AS request_reviewer_id
FROM certificate_requests r
JOIN certificates c ON c.id = r."certificateId"
JOIN courses co ON co.id = r."courseId"
WHERE r.status = 'APPROVED'
  AND r."reviewerId" IS NULL
  AND r."reviewerNote" = 'Cấp tự động trước khi có bước duyệt'
  AND c."revokedAt" IS NULL
  AND (:'course' = '' OR r."courseId" = :'course' OR co.slug = :'course');

SELECT course_name AS course, count(*) AS certificates_to_withdraw,
       min(issued_at) AS first_issued, max(issued_at) AS last_issued
FROM cand GROUP BY course_name ORDER BY course_name;
SELECT count(*) AS total_to_withdraw, (count(*) > 0) AS has_any FROM cand \gset
\echo total certificates that match: :total_to_withdraw

SELECT (SELECT count(*) FROM certificates WHERE "revokedAt" IS NULL) AS live_certificates_in_db,
       (SELECT count(*) FROM certificate_requests WHERE status = 'APPROVED' AND "reviewerId" IS NOT NULL) AS admin_approved_never_touched;

\if :apply
  \if :has_any
    BEGIN;

    -- 2. Keep the old values so the change can be undone.
    CREATE TABLE IF NOT EXISTS :"backup" (
      cert_id text, request_id text, user_id text, course_id text, code text,
      request_status text, request_reviewed_at timestamp, request_reviewer_note text, request_reviewer_id text,
      backed_up_at timestamp DEFAULT now()
    );
    INSERT INTO :"backup" (cert_id, request_id, user_id, course_id, code, request_status, request_reviewed_at, request_reviewer_note, request_reviewer_id)
      SELECT cert_id, request_id, user_id, course_id, code, request_status, request_reviewed_at, request_reviewer_note, request_reviewer_id FROM cand;

    -- 3. Withdraw the certificates (kept, but no longer valid).
    UPDATE certificates SET "revokedAt" = now(), "revokedBy" = 'system:bulk-withdraw',
           "revokedReason" = 'Cấp tự động trước khi có bước duyệt; đưa về chờ admin duyệt lại'
    WHERE id IN (SELECT cert_id FROM cand) AND "revokedAt" IS NULL;

    -- 4. Back to "Chờ duyệt".
    UPDATE certificate_requests SET status = 'PENDING', "reviewedAt" = NULL, "reviewerNote" = NULL, "reviewerId" = NULL,
           "updatedAt" = now()
    WHERE id IN (SELECT request_id FROM cand) AND status = 'APPROVED';

    -- 5. Tell the learners (in-app). One per request and day, so a re-run never duplicates.
    \if :notify
      INSERT INTO notifications (id, "userId", type, title, message, "dedupKey")
        SELECT 'wd-' || request_id || '-' || to_char(now(), 'YYYYMMDD'), user_id, 'CERTIFICATE_REVOKED',
               'Chứng chỉ được đưa về chờ duyệt',
               'Chứng chỉ khóa học ' || course_name || ' được cấp tự động trước đây nên được đưa về chờ quản trị viên duyệt lại. Bạn không cần làm gì thêm.',
               'certificate-withdrawn:' || request_id || ':' || to_char(now(), 'YYYYMMDD')
        FROM cand
      ON CONFLICT ("dedupKey") DO NOTHING;
    \endif

    COMMIT;
    \echo withdrawn: :total_to_withdraw certificates. Old values are in :backup
  \else
    \echo nothing matches, nothing to do.
  \endif
\else
  \echo dry run: nothing changed.
\endif
SQL

echo
if [ "$APPLY" -eq 1 ]; then
  echo "== done. The learners are 'Chờ duyệt' now; review them on the admin 'Chứng chỉ' tab (Duyệt hàng loạt)."
  echo "   The backup table $BACKUP holds old values only (no personal data except ids): drop it when everything is fine:"
  echo "   docker exec $CONTAINER psql -U $DBUSER -d $DB -c 'drop table $BACKUP'"
else
  echo "== dry run finished. Re-run with --apply to withdraw the certificates listed above."
fi
