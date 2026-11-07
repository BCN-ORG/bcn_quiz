#!/usr/bin/env bash
# Withdraw the certificates that were issued AUTOMATICALLY (before admin approval existed) and send each learner back to
# "Chờ duyệt", so an admin reviews them (one by one, or with "Duyệt hàng loạt" on the admin Certificates tab).
#
#   Dry run (default, changes nothing):  withdraw-auto-issued-certificates.sh --container C --db D --user U
#   Apply:                               withdraw-auto-issued-certificates.sh --container C --db D --user U --apply
#   Undo a run (dry run unless --apply): withdraw-auto-issued-certificates.sh --container C --db D --user U \
#                                          --undo certificates_withdraw_backup_<YYYYMMDD> [--apply]
#   From your Mac, nothing stored on the server:
#     ssh <server> 'bash -s -- --container C --db D --user U --apply' < be/scripts/withdraw-auto-issued-certificates.sh
#
# Options:
#   --apply            really change the data (without it the script only reports what it would do)
#   --course X         only this course (id or slug). Refused when X is the id of one course AND the slug of another.
#   --list             also print every candidate (request id, learner id, certificate code; no names or emails)
#   --no-notify        do not create the in-app notification for the learners
#   --undo TABLE       put a previous run back (see below)
#   --container NAME   Postgres container of the Quiz database   (required)
#   --db NAME          database                                  (required)
#   --user NAME        database role                             (required)
#
# WHICH certificates: only live (not revoked) ones whose request is APPROVED, has NO reviewer and carries EXACTLY the note
# 'Cấp tự động trước khi có bước duyệt' (what the migrations wrote for certificates issued by the old automatic code; a
# different spelling or case is NOT matched). A certificate an admin approved (reviewer set) or one already revoked is
# never touched.
#
# WHAT happens, in ONE transaction that first takes a lock and re-selects the rows with FOR UPDATE (so an admin action at
# the same moment cannot be overwritten, and two runs cannot overlap):
#   certificate: revokedAt = now (the public verify page says "không còn hợp lệ"), revokedBy = 'system:bulk-withdraw'.
#                The row and its code are kept.
#   request:     back to PENDING (reviewer fields cleared). Approving it later re-issues the SAME code and issue date if
#                the learner is eligible at that moment (otherwise it waits ON_HOLD). The learner sees "Chờ duyệt".
#   notification: one CERTIFICATE_REVOKED notification per learner, stored in the database (unique key per request and
#                day: applying again the same day after an undo creates none). No live push; it shows on the next fetch.
# Before changing anything the old values are copied to certificates_withdraw_backup_<YYYYMMDD>. If the number of rows
# actually changed differs from the number selected, the whole transaction is rolled back.
#
# --undo TABLE restores, in one transaction, only what is STILL as this script left it: a request that an admin has
# approved, rejected, revoked... since then is not PENDING and is left alone, and so is its certificate. Notifications are
# not removed. Re-running the withdrawal is safe: withdrawn requests are PENDING now, so they no longer match.
set -euo pipefail

CONTAINER=""
DB=""
DBUSER=""
COURSE=""
UNDO_TABLE=""
APPLY=0
NOTIFY=1
LIST=0

usage() { sed -n '2,44p' "$0" 2>/dev/null | sed 's/^# \{0,1\}//' || true; echo "usage: $0 --container N --db N --user N [--course X] [--list] [--no-notify] [--undo TABLE] [--apply]" >&2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --no-notify) NOTIFY=0 ;;
    --list) LIST=1 ;;
    --course) COURSE="${2:?--course needs a value}"; shift ;;
    --undo) UNDO_TABLE="${2:?--undo needs a backup table name}"; shift ;;
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
if [ -n "$UNDO_TABLE" ] && ! [[ "$UNDO_TABLE" =~ ^certificates_withdraw_backup_[0-9]{8}$ ]]; then
  echo "--undo must be a table made by this script: certificates_withdraw_backup_<YYYYMMDD>" >&2
  exit 2
fi

DAY="$(date +%Y%m%d)"
BACKUP="certificates_withdraw_backup_${DAY}"
MODE="DRY RUN (nothing is changed; add --apply)"
[ "$APPLY" -eq 1 ] && MODE="APPLY"
ACTION="withdraw"
[ -n "$UNDO_TABLE" ] && ACTION="undo $UNDO_TABLE"
echo "== mode: $MODE | action: $ACTION | db: $DB@$CONTAINER as $DBUSER | course: ${COURSE:-all} | notify: $NOTIFY"

psql_run() {
  docker exec -i "$CONTAINER" psql -U "$DBUSER" -d "$DB" -X -q -v ON_ERROR_STOP=1 \
    -v apply="$APPLY" -v notify="$NOTIFY" -v list="$LIST" -v course="$COURSE" -v backup="$BACKUP" -v day="$DAY" \
    -v undo_table="${UNDO_TABLE:-none}"
}

# ------------------------------------------------------------------------------------------------------------------
if [ -n "$UNDO_TABLE" ]; then
  psql_run <<'SQL'
\pset format aligned
\pset border 1

-- What is still exactly as the withdrawal left it: the request is still PENDING and the certificate is still revoked by
-- the bulk job. Anything an admin decided since then is not in this list.
\if :apply
  BEGIN;
  SELECT pg_advisory_xact_lock(hashtext('bcn-withdraw-auto-issued-certificates')) AS locked \gset
\endif
CREATE TEMP TABLE restorable AS
SELECT b.cert_id, b.request_id, b.request_status, b.request_reviewed_at, b.request_reviewer_note, b.request_reviewer_id
FROM :"undo_table" b
JOIN certificate_requests r ON r.id = b.request_id AND r.status = 'PENDING'
JOIN certificates c ON c.id = b.cert_id AND c."revokedBy" = 'system:bulk-withdraw'
-- FOR UPDATE only in apply mode would need a template; the advisory lock + the re-checked WHERE below are what protect it
;
SELECT (SELECT count(*) FROM :"undo_table") AS rows_in_backup, (SELECT count(*) FROM restorable) AS still_restorable;
SELECT count(*) AS total_restorable, (count(*) > 0) AS has_any FROM restorable \gset

\if :apply
  \if :has_any
    WITH u AS (
      UPDATE certificates c SET "revokedAt" = NULL, "revokedBy" = NULL, "revokedReason" = NULL
      WHERE c.id IN (SELECT cert_id FROM restorable) AND c."revokedBy" = 'system:bulk-withdraw'
        AND EXISTS (SELECT 1 FROM certificate_requests r JOIN restorable x ON x.request_id = r.id WHERE x.cert_id = c.id AND r.status = 'PENDING')
      RETURNING c.id)
    SELECT count(*) AS certs_restored FROM u \gset
    WITH u AS (
      UPDATE certificate_requests r SET status = x.request_status::"CertificateRequestStatus",
             "reviewedAt" = x.request_reviewed_at, "reviewerNote" = x.request_reviewer_note,
             "reviewerId" = x.request_reviewer_id, "updatedAt" = now()
      FROM restorable x WHERE r.id = x.request_id AND r.status = 'PENDING'
      RETURNING r.id)
    SELECT count(*) AS requests_restored FROM u \gset
    SELECT set_config('wd.expected', :'total_restorable', true) AS a, set_config('wd.certs', :'certs_restored', true) AS b,
           set_config('wd.reqs', :'requests_restored', true) AS c \gset
    DO $do$ BEGIN
      IF current_setting('wd.certs') <> current_setting('wd.expected') OR current_setting('wd.reqs') <> current_setting('wd.expected') THEN
        RAISE EXCEPTION 'undo expected % rows but restored % certificates and % requests: rolled back',
          current_setting('wd.expected'), current_setting('wd.certs'), current_setting('wd.reqs');
      END IF;
    END $do$;
    COMMIT;
    \echo restored: :certs_restored certificates and :requests_restored requests (notifications are not removed).
  \else
    COMMIT;
    \echo nothing to restore: every request in the backup was decided or changed since.
  \endif
\else
  \echo dry run: nothing changed.
\endif
SQL
  echo
  if [ "$APPLY" -eq 1 ]; then echo "== undo done."; else echo "== dry run finished. Re-run with --apply to restore the rows counted above."; fi
  exit 0
fi

# ------------------------------------------------------------------------------------------------------------------
# One SQL template. __BEGIN__ / __LOCK__ are filled in below: the apply run selects the candidates inside the
# transaction with FOR UPDATE; the dry run never locks anything.
read -r -d '' TEMPLATE <<'SQL' || true
\pset format aligned
\pset border 1

-- A --course that is the id of one course AND the slug of another is ambiguous: refuse instead of guessing.
SELECT count(*) AS course_matches FROM courses WHERE :'course' <> '' AND (id = :'course' OR slug = :'course') \gset
SELECT (:course_matches > 1) AS ambiguous \gset
\if :ambiguous
  SELECT set_config('wd.fail', '--course matches more than one course (an id and a slug): use the course id', false) AS x \gset
  DO $do$ BEGIN RAISE EXCEPTION '%', current_setting('wd.fail'); END $do$;
\endif

__BEGIN__

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
  AND (:'course' = '' OR r."courseId" = :'course' OR co.slug = :'course')
__LOCK__;

SELECT course_name AS course, count(*) AS certificates_to_withdraw,
       min(issued_at) AS first_issued, max(issued_at) AS last_issued
FROM cand GROUP BY course_name ORDER BY course_name;
SELECT count(*) AS total_to_withdraw, (count(*) > 0) AS has_any FROM cand \gset
\echo total certificates that match: :total_to_withdraw

\if :list
  SELECT request_id, user_id, code FROM cand ORDER BY course_name, request_id;
\endif

SELECT (SELECT count(*) FROM certificates WHERE "revokedAt" IS NULL) AS live_certificates_in_db,
       (SELECT count(*) FROM certificate_requests WHERE status = 'APPROVED' AND "reviewerId" IS NOT NULL) AS admin_approved_never_touched;

\if :apply
  \if :has_any
    -- 2. Keep the old values so the change can be undone with --undo.
    CREATE TABLE IF NOT EXISTS :"backup" (
      cert_id text, request_id text, user_id text, course_id text, code text,
      request_status text, request_reviewed_at timestamp, request_reviewer_note text, request_reviewer_id text,
      backed_up_at timestamp DEFAULT now()
    );
    INSERT INTO :"backup" (cert_id, request_id, user_id, course_id, code, request_status, request_reviewed_at, request_reviewer_note, request_reviewer_id)
      SELECT cert_id, request_id, user_id, course_id, code, request_status, request_reviewed_at, request_reviewer_note, request_reviewer_id FROM cand;

    -- 3. Withdraw the certificates (kept, but no longer valid).
    WITH u AS (
      UPDATE certificates SET "revokedAt" = now(), "revokedBy" = 'system:bulk-withdraw',
             "revokedReason" = 'Cấp tự động trước khi có bước duyệt; đưa về chờ admin duyệt lại'
      WHERE id IN (SELECT cert_id FROM cand) AND "revokedAt" IS NULL
      RETURNING id)
    SELECT count(*) AS certs_updated FROM u \gset

    -- 4. Back to "Chờ duyệt" (the predicates are checked again on purpose).
    WITH u AS (
      UPDATE certificate_requests SET status = 'PENDING', "reviewedAt" = NULL, "reviewerNote" = NULL, "reviewerId" = NULL,
             "updatedAt" = now()
      WHERE id IN (SELECT request_id FROM cand) AND status = 'APPROVED' AND "reviewerId" IS NULL
        AND "reviewerNote" = 'Cấp tự động trước khi có bước duyệt'
      RETURNING id)
    SELECT count(*) AS reqs_updated FROM u \gset

    -- 5. The numbers must match what was selected, otherwise nothing is kept.
    SELECT set_config('wd.expected', :'total_to_withdraw', true) AS a, set_config('wd.certs', :'certs_updated', true) AS b,
           set_config('wd.reqs', :'reqs_updated', true) AS c \gset
    DO $do$ BEGIN
      IF current_setting('wd.certs') <> current_setting('wd.expected') OR current_setting('wd.reqs') <> current_setting('wd.expected') THEN
        RAISE EXCEPTION 'expected to change % rows but changed % certificates and % requests: rolled back',
          current_setting('wd.expected'), current_setting('wd.certs'), current_setting('wd.reqs');
      END IF;
    END $do$;

    -- 6. Tell the learners (in-app). One per request and day, so a re-run never duplicates.
    \if :notify
      WITH n AS (
        INSERT INTO notifications (id, "userId", type, title, message, "dedupKey")
          SELECT 'wd-' || request_id || '-' || :'day', user_id, 'CERTIFICATE_REVOKED',
                 'Chứng chỉ được đưa về chờ duyệt',
                 'Chứng chỉ khóa học ' || course_name || ' được cấp tự động trước đây nên được đưa về chờ quản trị viên duyệt lại. Bạn không cần làm gì thêm.',
                 'certificate-withdrawn:' || request_id || ':' || :'day'
          FROM cand
        ON CONFLICT ("dedupKey") DO NOTHING
        RETURNING 1)
      SELECT count(*) AS notified FROM n \gset
    \else
      \set notified 0
    \endif

    COMMIT;
    \echo withdrawn: :certs_updated certificates, :reqs_updated requests back to PENDING, :notified notifications. Old values are in :backup
  \else
    COMMIT;
    \echo nothing matches, nothing to do.
  \endif
\else
  \echo dry run: nothing changed.
\endif
SQL

if [ "$APPLY" -eq 1 ]; then
  BEGIN_SQL="BEGIN;
SELECT pg_advisory_xact_lock(hashtext('bcn-withdraw-auto-issued-certificates')) AS locked \\gset"
  LOCK_SQL="FOR UPDATE OF r, c"
else
  BEGIN_SQL=""
  LOCK_SQL=""
fi
SQL_TEXT="${TEMPLATE//__BEGIN__/$BEGIN_SQL}"
SQL_TEXT="${SQL_TEXT//__LOCK__/$LOCK_SQL}"
printf '%s\n' "$SQL_TEXT" | psql_run

echo
if [ "$APPLY" -eq 1 ]; then
  echo "== done. The learners are 'Chờ duyệt' now; review them on the admin 'Chứng chỉ' tab (Duyệt hàng loạt)."
  echo "   To put this run back:  $0 --container $CONTAINER --db $DB --user $DBUSER --undo $BACKUP [--apply]"
  echo "   The backup table $BACKUP holds old values and ids only: drop it when everything is fine:"
  echo "   docker exec $CONTAINER psql -U $DBUSER -d $DB -c 'drop table $BACKUP'"
else
  echo "== dry run finished (add --list to see each candidate). Re-run with --apply to withdraw the certificates counted above."
fi
