-- Leader flag on staff accounts (docs/28, stage L1).
--
-- MAGTRANS wants five "leader roles" — lider_planista, lider_dyspozytor,
-- lider_daf (opiekun), lider_pracownik, lider_eksport. The first scenario is a
-- planista asking to hand a vehicle over to another planista, approved by the
-- planners' lead. This migration only lays the data down; no runtime behaviour
-- of any role changes until the api (L2) and web (L3) stages read it.
--
-- ── Why a flag and not five new `Role` values (docs/28 §0) ─────────────────
-- A leader is the SAME kind of user as the base role — same scope keys
-- (`plannerId`, `teamId`, `opiekunId`), same panel, same `@Roles`. Leadership
-- only ADDS permissions on top. So "lider_planista" is stored as the pair
-- `role = 'planista'` + `lider = true`, and `enum Role` is left untouched.
-- Five new enum members would have to be threaded through every `@Roles`, every
-- scope branch and every `Record<Role, …>` in the codebase, and a single miss
-- is either a hole (`OpiekunOwnershipGuard` lets any non-`opiekun` role through,
-- so a "lider_opiekun" would bypass ownership) or a 403. Never add `lider_*` to
-- `enum Role` (docs/28 §7 R1).
--
-- This migration is forward-only and fully additive: one NOT NULL column with a
-- constant default on each of two tables, plus two CHECK constraints. Nothing is
-- dropped, renamed or backfilled. Every existing row gets `lider = false`, which
-- is exactly right — nobody is a leader before this feature — so both CHECKs
-- validate trivially on an existing database. No index: leaders number in the
-- single digits per role.
--
--   1. "users"                    gains `lider`.
--   2. "stanowisko_role_mappings" gains `lider` — the flag a stanowisko hands out
--      together with its role at SSO sign-in / reconcile (docs/28 §2).
--   3. CHECK `user_lider_requires_lider_role` and
--      CHECK `stanowisko_role_mapping_lider_requires_lider_role`.
--
-- ── §3. The invariant: lider ⇒ role ∈ LIDER_ROLES ─────────────────────────
-- LIDER_ROLES = planista, dyspozytor, opiekun, pracownik, eksport. `admin` does
-- not need it (can do everything), `przewoznik` is not an employee, and
-- `weryfikator` was not requested. The list lives in three places, like the
-- assignable-role rule does today: shared Zod (`LIDER_ROLES`, user-facing
-- message), the api service (partial PATCH), and these CHECKs (the guarantee).
-- Extending it = one line in shared `LIDER_ROLES` + a new migration that drops
-- and re-adds both constraints with the longer list.
--
-- `roleOverride` is deliberately NOT part of the users CHECK. It is an input to
-- the directory sync, not the effective role: whatever the sync derives from it
-- is written to `role` and hits `user_lider_requires_lider_role` anyway, so the
-- table can never hold an invalid effective pair. What the DB cannot do is
-- reject a bad (roleOverride, lider) pair EARLY — without that, the next
-- reconcile would fail on this CHECK. Rejecting it up front with a 422 on
-- `PATCH /users` is the api service's job (L2, docs/28 §7 R2).
--
-- No data is backfilled, including the two mapping rows the seed marks as
-- leaders (PLANISTA_LIDER, DYSPOZYTOR_KIEROWNIK): on an already-seeded database
-- an admin may have re-pointed them, and granting leadership there is an admin
-- action in `/employee/sso` once L3 ships, not something a schema migration
-- should do silently on prod.

-- ── 1. users ────────────────────────────────────────────────────────────────
-- AlterTable
ALTER TABLE "users" ADD COLUMN "lider" BOOLEAN NOT NULL DEFAULT false;

-- ── 2. stanowisko_role_mappings ─────────────────────────────────────────────
-- AlterTable
ALTER TABLE "stanowisko_role_mappings" ADD COLUMN "lider" BOOLEAN NOT NULL DEFAULT false;

-- ── 3. CHECK constraints ────────────────────────────────────────────────────
-- A leader must sit on one of the LIDER_ROLES. Prisma cannot express a
-- conditional rule across two columns, hence raw SQL.
ALTER TABLE "users"
  ADD CONSTRAINT "user_lider_requires_lider_role"
  CHECK (NOT "lider" OR "role" IN ('planista', 'dyspozytor', 'opiekun', 'pracownik', 'eksport'));

-- Same rule on the other road into a (role, lider) pair: a stanowisko may only
-- hand out leadership together with one of the LIDER_ROLES, otherwise every
-- sign-in / reconcile from that stanowisko would write an invalid user row.
ALTER TABLE "stanowisko_role_mappings"
  ADD CONSTRAINT "stanowisko_role_mapping_lider_requires_lider_role"
  CHECK (NOT "lider" OR "role" IN ('planista', 'dyspozytor', 'opiekun', 'pracownik', 'eksport'));
