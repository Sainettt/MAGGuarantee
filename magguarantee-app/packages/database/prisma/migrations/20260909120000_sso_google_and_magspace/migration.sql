-- Google SSO + MAGSpace as the employee directory (docs/24, трек A).
--
-- MAGSpace (same VPS, own compose stack) becomes the source of truth for WHO
-- works here and in WHAT position (stanowisko). Google answers "who is this",
-- MAGSpace answers "is this an active employee and on which stanowisko", and a
-- mapping table owned by an admin turns that stanowisko into a MAGGuarantee
-- role. Accounts are provisioned on first successful sign-in and re-synced by a
-- reconcile job; termination in MAGSpace revokes access here.
--
-- This migration is forward-only and fully additive: two enums, six nullable /
-- defaulted columns on "users", and one new table. Nothing is dropped, renamed
-- or backfilled — every existing row keeps `authProvider = 'local'` and
-- `managedBy = 'local'`, which is exactly right: they were all created by hand
-- through `POST /users` and must stay out of the reconcile's reach.
--
--   1. Enums "AuthProvider" and "UserManagedBy".
--   2. "users" gains:
--        authProvider       — how the account signs in.
--        managedBy          — who owns `role`/`active`. 'magspace' rows are
--                             driven by the directory and read-only in the UI.
--        googleSub          — Google's stable subject id. The first link is by
--                             e-mail, every later login matches on this, because
--                             a Workspace e-mail can be renamed and `sub` cannot.
--        magspaceEmployeeId — MAGSpace `Employee.id`. It is a **cuid**, not a
--                             uuid, hence TEXT and not UUID.
--        directorySyncedAt  — last successful sync from the directory.
--        roleOverride       — role granted BY HAND for the stanowiska the
--                             mapping deliberately leaves unmapped. See §3.
--   3. Table "stanowisko_role_mappings" — stanowisko code → role.
--
-- ── §3. Why `roleOverride` exists ───────────────────────────────────────────
-- Two MAGTRANS stanowiska hold people with different access needs: CONTROLLING
-- is two people, one `weryfikator` and one `pracownik`; HANDEL_* holds a couple
-- of `eksport` users among planners. Those three roles are the sensitive ones
-- (wniosek verification, money), so they are NEVER derived from a stanowisko —
-- an admin grants them per person. Without a dedicated column such a user would
-- be deprovisioned on every reconcile run ("their stanowisko has no mapping"),
-- and moving them to `managedBy = 'local'` would throw away the automatic
-- revoke-on-termination that is the whole point of the integration.
-- So: `roleOverride IS NOT NULL` ⇒ the reconcile leaves the role alone and does
-- not treat an unmapped stanowisko as grounds to disable, while still syncing
-- `active`/`name` and still revoking when the person is terminated.

-- ── 1. Enums ────────────────────────────────────────────────────────────────
CREATE TYPE "AuthProvider" AS ENUM ('local', 'google');
CREATE TYPE "UserManagedBy" AS ENUM ('local', 'magspace');

-- ── 2. users ────────────────────────────────────────────────────────────────
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "authProvider" "AuthProvider" NOT NULL DEFAULT 'local',
ADD COLUMN     "directorySyncedAt" TIMESTAMP(3),
ADD COLUMN     "googleSub" TEXT,
ADD COLUMN     "magspaceEmployeeId" TEXT,
ADD COLUMN     "managedBy" "UserManagedBy" NOT NULL DEFAULT 'local',
ADD COLUMN     "roleOverride" "Role";

-- CreateIndex
CREATE UNIQUE INDEX "users_googleSub_key" ON "users"("googleSub");

-- CreateIndex
CREATE UNIQUE INDEX "users_magspaceEmployeeId_key" ON "users"("magspaceEmployeeId");

-- CreateIndex
-- The reconcile scans every magspace-managed row on each run.
CREATE INDEX "users_managedBy_idx" ON "users"("managedBy");

-- Defence in depth for the single most important rule of this feature: the
-- `admin` role is LOCAL ONLY and is never handed out by the directory, and
-- `przewoznik` is not an employee role at all. Both are already rejected by the
-- Zod schemas on the api side; the constraint makes a bug there unable to
-- escalate anyone. Prisma enums cannot be narrowed per column, so this is a
-- CHECK rather than a separate type.
ALTER TABLE "users"
  ADD CONSTRAINT "user_role_override_not_privileged"
  CHECK ("roleOverride" IS NULL OR "roleOverride" NOT IN ('admin', 'przewoznik'));

-- ── 3. stanowisko_role_mappings ─────────────────────────────────────────────
-- CreateTable
CREATE TABLE "stanowisko_role_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "stanowiskoCode" TEXT NOT NULL,
    "stanowiskoName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stanowisko_role_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stanowisko_role_mappings_stanowiskoCode_key" ON "stanowisko_role_mappings"("stanowiskoCode");

-- Same rule as `user_role_override_not_privileged`, on the other road into a
-- role: no stanowisko may ever map to `admin` or `przewoznik`.
ALTER TABLE "stanowisko_role_mappings"
  ADD CONSTRAINT "stanowisko_role_mapping_role_not_privileged"
  CHECK ("role" NOT IN ('admin', 'przewoznik'));
