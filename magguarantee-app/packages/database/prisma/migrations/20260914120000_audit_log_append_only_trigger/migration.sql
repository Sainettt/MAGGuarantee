-- audit_log becomes append-only AT THE DATABASE LEVEL
-- (logging/audit-trail audit 2026-08-14, item 7).
--
-- Until now "append-only" was a code convention: the api only ever calls
-- `auditLog.create`. Nothing stopped a buggy repository method, a mistyped
-- `deleteMany`, a test helper pointed at the wrong database or an injected DML
-- statement from rewriting or erasing the trail. This migration adds a plpgsql
-- guard that RAISEs on every write except INSERT:
--
--   DELETE    → always rejected (row-level BEFORE trigger).
--   TRUNCATE  → always rejected (statement-level BEFORE trigger). This also
--               covers `TRUNCATE "users" CASCADE`, which would cascade here.
--   UPDATE    → rejected, with exactly ONE exception (see below).
--
-- ── The one allowed UPDATE ─────────────────────────────────────────────────
-- FK "audit_log_userId_fkey" (migration 20260503203801_entities) is
-- `ON DELETE SET NULL`. When a user row is hard-deleted (today: only the 1:1
-- shadow login inside the carrier hard-delete, carriers.repository), Postgres
-- runs an internal `UPDATE audit_log SET "userId" = NULL` — and row triggers DO
-- fire for it. That path must keep working, so the guard lets an UPDATE through
-- iff ALL of the following hold:
--   1. OLD."userId" IS NOT NULL and NEW."userId" IS NULL;
--   2. every other column is unchanged — compared as
--      `to_jsonb(row) - 'userId'`, so a column added to audit_log later is
--      covered automatically, without touching this function;
--   3. the referenced user no longer exists. The FK action is an AFTER trigger
--      on "users", so by the time it runs the deleted row is invisible. This
--      stops a direct `UPDATE audit_log SET "userId" = NULL` from anonymising
--      the entries of a user who still exists (soft-deleted users still exist).
-- Side effect, on purpose: `ON UPDATE CASCADE` of "users"."id" is rejected too.
-- User ids are generated uuids and are never rewritten; re-pointing audit rows
-- at another id is exactly the kind of rewrite this guard exists to block.
--
-- ── No escape hatch in the app's reach ─────────────────────────────────────
-- Deliberately NO session flag (e.g. `SET LOCAL magguarantee.allow_audit_purge`):
-- any role can set a custom GUC, so such a flag would be available to the very
-- code paths this guard defends against. No seed, test or api code deletes or
-- truncates audit_log today. A dev reset uses `prisma migrate reset`, which
-- drops the schema (DROP does not fire DML triggers). A genuine purge (future
-- retention policy, RODO request) must be an explicit, reviewed migration or an
-- owner session that runs
--   ALTER TABLE "audit_log" DISABLE TRIGGER "audit_log_append_only_row";
--   ... purge ...
--   ALTER TABLE "audit_log" ENABLE TRIGGER "audit_log_append_only_row";
-- inside one transaction (use "audit_log_append_only_truncate" for TRUNCATE).
--
-- ── Threat model ───────────────────────────────────────────────────────────
-- This protects against application bugs and against compromised/injected
-- DML issued through the app. It does NOT protect against the table owner or a
-- superuser: they can DISABLE/DROP the trigger or set
-- `session_replication_role = replica`. The app currently connects as the
-- compose POSTGRES_USER, which is a superuser in the official image — a
-- separate non-owner runtime role is an infra follow-up, not part of this
-- migration. Offsite backups remain the defence against a hostile owner.
--
-- Forward-only, no data touched. Error: SQLSTATE P0001 (raise_exception), message
-- prefixed `AUDIT_LOG_APPEND_ONLY:`.

-- ── 1. Guard function ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "audit_log_append_only_guard"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."userId" IS NOT NULL
       AND NEW."userId" IS NULL
       AND (to_jsonb(NEW) - 'userId') = (to_jsonb(OLD) - 'userId')
       AND NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = OLD."userId")
    THEN
      -- FK action ON DELETE SET NULL after a user hard-delete.
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'AUDIT_LOG_APPEND_ONLY: UPDATE of audit_log row % is not allowed', OLD."id"
      USING HINT = 'audit_log is append-only; the only permitted UPDATE is the FK action ON DELETE SET NULL of "userId" after a user hard-delete.';
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'AUDIT_LOG_APPEND_ONLY: DELETE of audit_log row % is not allowed', OLD."id"
      USING HINT = 'audit_log is append-only. A deliberate purge is a reviewed migration, see docs/12-database-schema.md.';
  ELSIF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'AUDIT_LOG_APPEND_ONLY: TRUNCATE of audit_log is not allowed'
      USING HINT = 'audit_log is append-only. A deliberate purge is a reviewed migration, see docs/12-database-schema.md.';
  END IF;
  RETURN NULL;
END;
$$;

-- ── 2. Triggers ───────────────────────────────────────────────────────────
-- Row-level: UPDATE + DELETE (needs OLD/NEW).
CREATE TRIGGER "audit_log_append_only_row"
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION "audit_log_append_only_guard"();

-- TRUNCATE triggers can only be statement-level.
CREATE TRIGGER "audit_log_append_only_truncate"
  BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_log_append_only_guard"();
