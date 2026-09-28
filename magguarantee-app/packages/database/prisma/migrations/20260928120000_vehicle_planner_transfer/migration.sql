-- Vehicle planner transfer: request → approval, planista history, User.liderId
-- (docs/29 §2, step 1 of §5).
--
-- After creation a vehicle changes its planista ONLY through a transfer request
-- that an admin or the current planista's lider approves (R1–R4, R7). Every
-- delegation remembers the planista of its own period (R5), and each vehicle
-- gets a journal of planista assignments. "Who is whose lider" becomes a real
-- FK (`users.liderId`) instead of the CC e-mail `users.liderEmail` (R8).
--
-- Forward-only and additive: nothing is dropped, renamed or retyped. Unlike the
-- earlier greenfield migrations this one MUST run on an already-populated
-- database (pre-prod staging holds real-shaped data), so every backfill below is
-- idempotent — guarded by `IS NULL` / `NOT EXISTS`, a re-run changes nothing —
-- and every hand-added constraint is created AFTER the data it would check is in
-- place. The whole script runs in Postgres' implicit transaction: any failure
-- rolls all of it back.
--
--   1. Generated DDL (identical to `prisma migrate diff` from the previous
--      schema): enums `PlannerTransferStatus`, `PlannerAssignmentSource`;
--      columns `users.liderId`, `delegations.plannerId`; tables
--      `vehicle_planner_transfers`, `vehicle_planner_assignments`; indexes; FKs.
--   2. Hand-added (Prisma DSL cannot express them): two partial unique indexes
--      and six CHECK constraints.
--   3. Backfills: users.liderId ← liderEmail (with a NOTICE report),
--      delegations.plannerId ← vehicles.plannerId, one open `backfill`
--      history row per vehicle that has a planista.
--
-- `users.liderEmail` stays in this release (not read by the api any more) and
-- is dropped by a SEPARATE later migration once the unmatched values have been
-- reviewed (R8; docs/23 "Откат": dropping a column is its own release).
--
-- Backfill limitation (docs/29 §2 note): who led a vehicle before this release
-- is unknown, so every existing delegation is attributed to the vehicle's
-- CURRENT planista and every history row starts at vehicles.createdAt. Exact
-- history starts at deploy time.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Generated DDL
-- ════════════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "PlannerTransferStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "PlannerAssignmentSource" AS ENUM ('create', 'transfer', 'backfill');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "liderId" UUID;

-- AlterTable
ALTER TABLE "delegations" ADD COLUMN     "plannerId" UUID;

-- CreateTable
CREATE TABLE "vehicle_planner_transfers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vehicleId" UUID NOT NULL,
    "fromPlannerId" UUID NOT NULL,
    "toPlannerId" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "status" "PlannerTransferStatus" NOT NULL DEFAULT 'pending',
    "reason" TEXT NOT NULL,
    "decisionComment" TEXT,
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_planner_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_planner_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vehicleId" UUID NOT NULL,
    "plannerId" UUID NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "source" "PlannerAssignmentSource" NOT NULL,
    "transferId" UUID,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_planner_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_planner_transfers_vehicleId_createdAt_idx" ON "vehicle_planner_transfers"("vehicleId", "createdAt");

-- CreateIndex
CREATE INDEX "vehicle_planner_transfers_status_createdAt_idx" ON "vehicle_planner_transfers"("status", "createdAt");

-- CreateIndex
CREATE INDEX "vehicle_planner_transfers_fromPlannerId_status_idx" ON "vehicle_planner_transfers"("fromPlannerId", "status");

-- CreateIndex
CREATE INDEX "vehicle_planner_transfers_requestedById_status_idx" ON "vehicle_planner_transfers"("requestedById", "status");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_planner_assignments_transferId_key" ON "vehicle_planner_assignments"("transferId");

-- CreateIndex
CREATE INDEX "vehicle_planner_assignments_vehicleId_validFrom_idx" ON "vehicle_planner_assignments"("vehicleId", "validFrom");

-- CreateIndex
CREATE INDEX "vehicle_planner_assignments_plannerId_idx" ON "vehicle_planner_assignments"("plannerId");

-- CreateIndex
CREATE INDEX "users_liderId_idx" ON "users"("liderId");

-- CreateIndex
CREATE INDEX "delegations_plannerId_status_idx" ON "delegations"("plannerId", "status");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_liderId_fkey" FOREIGN KEY ("liderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_plannerId_fkey" FOREIGN KEY ("plannerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_planner_transfers" ADD CONSTRAINT "vehicle_planner_transfers_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_planner_transfers" ADD CONSTRAINT "vehicle_planner_transfers_fromPlannerId_fkey" FOREIGN KEY ("fromPlannerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_planner_transfers" ADD CONSTRAINT "vehicle_planner_transfers_toPlannerId_fkey" FOREIGN KEY ("toPlannerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_planner_transfers" ADD CONSTRAINT "vehicle_planner_transfers_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_planner_transfers" ADD CONSTRAINT "vehicle_planner_transfers_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_planner_assignments" ADD CONSTRAINT "vehicle_planner_assignments_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_planner_assignments" ADD CONSTRAINT "vehicle_planner_assignments_plannerId_fkey" FOREIGN KEY ("plannerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_planner_assignments" ADD CONSTRAINT "vehicle_planner_assignments_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "vehicle_planner_transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_planner_assignments" ADD CONSTRAINT "vehicle_planner_assignments_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. HAND-ADDED — not producible by the Prisma schema DSL
-- ════════════════════════════════════════════════════════════════════════════
-- Both tables are new and empty at this point, so every constraint below
-- validates trivially. The backfill in §3 writes only rows that satisfy them.

-- At most ONE pending request per vehicle (U4). Terminal rows (approved /
-- rejected / cancelled) are excluded, so a vehicle accumulates any number of
-- closed requests. The api answers 409 on a second filing; this index is the
-- guarantee under concurrency.
CREATE UNIQUE INDEX "VehiclePlannerTransfer_pending_vehicle_key" ON "vehicle_planner_transfers"("vehicleId") WHERE "status" = 'pending';

-- At most ONE open assignment (validTo IS NULL) per vehicle — the row whose
-- plannerId must equal vehicles.plannerId. Closed rows are unlimited.
CREATE UNIQUE INDEX "VehiclePlannerAssignment_open_vehicle_key" ON "vehicle_planner_assignments"("vehicleId") WHERE "validTo" IS NULL;

-- A transfer goes to ANOTHER planista (U2).
ALTER TABLE "vehicle_planner_transfers"
  ADD CONSTRAINT "vehicle_planner_transfer_distinct_planners"
  CHECK ("fromPlannerId" <> "toPlannerId");

-- The reason is mandatory at filing (U3) — NOT NULL alone would accept ''.
ALTER TABLE "vehicle_planner_transfers"
  ADD CONSTRAINT "vehicle_planner_transfer_reason_not_blank"
  CHECK (btrim("reason") <> '');

-- `decidedAt` is the moment the request left `pending` (approve / reject /
-- cancel): NULL exactly while pending. `decidedById` is NOT part of the rule —
-- its FK is ON DELETE SET NULL and must stay able to fire.
ALTER TABLE "vehicle_planner_transfers"
  ADD CONSTRAINT "vehicle_planner_transfer_closed_has_decided_at"
  CHECK (("status" = 'pending') = ("decidedAt" IS NULL));

-- A rejection carries its reason (U3). The approval comment stays optional.
ALTER TABLE "vehicle_planner_transfers"
  ADD CONSTRAINT "vehicle_planner_transfer_rejection_has_comment"
  CHECK ("status" <> 'rejected' OR btrim(COALESCE("decisionComment", '')) <> '');

-- A closed assignment cannot end before it began. `>=`, not `>`: Postgres
-- now() is fixed per transaction, so a create + immediate close inside one
-- transaction yields validTo = validFrom.
ALTER TABLE "vehicle_planner_assignments"
  ADD CONSTRAINT "vehicle_planner_assignment_valid_range"
  CHECK ("validTo" IS NULL OR "validTo" >= "validFrom");

-- A `transfer` row always points at the request that opened it, and only a
-- `transfer` row does (the FK is RESTRICT, so the link cannot be nulled later).
ALTER TABLE "vehicle_planner_assignments"
  ADD CONSTRAINT "vehicle_planner_assignment_transfer_link"
  CHECK (("source" = 'transfer') = ("transferId" IS NOT NULL));

-- ════════════════════════════════════════════════════════════════════════════
-- 3. BACKFILLS — idempotent, safe on a populated database
-- ════════════════════════════════════════════════════════════════════════════
-- `updatedAt` of existing users / delegations is deliberately NOT bumped: these
-- are data-migration writes, not user edits.
--
-- The RAISE NOTICE report is printed by psql; `prisma migrate deploy` may not
-- relay server NOTICEs. The report can be reproduced at any time while
-- `liderEmail` still exists — see the verification query in docs/12
-- §«Миграции» (row 20260928120000_vehicle_planner_transfer).

-- 3a. users.liderId ← users.liderEmail (R8).
-- Source rows: role = 'planista' (U9: liderId lives only on planista rows),
-- liderEmail non-blank, liderId still NULL (idempotence). Target: exactly ONE
-- user with role = 'planista' AND lider = true AND deletedAt IS NULL whose
-- e-mail matches case-insensitively (surrounding blanks ignored), not the row
-- itself. An ambiguous match (two targets differing only in e-mail case) is
-- left unmatched and reported rather than guessed.
DO $$
DECLARE
  v_linked        integer;
  v_unmatched     integer := 0;
  v_not_planista  integer;
  v_row           record;
BEGIN
  UPDATE "users" AS u
     SET "liderId" = t."id"
    FROM "users" AS t
   WHERE u."role" = 'planista'
     AND u."liderId" IS NULL
     AND NULLIF(btrim(u."liderEmail"), '') IS NOT NULL
     AND t."role" = 'planista'
     AND t."lider" = true
     AND t."deletedAt" IS NULL
     AND t."id" <> u."id"
     AND lower(btrim(t."email")) = lower(btrim(u."liderEmail"))
     AND (
       SELECT count(*)
         FROM "users" AS t2
        WHERE t2."role" = 'planista'
          AND t2."lider" = true
          AND t2."deletedAt" IS NULL
          AND t2."id" <> u."id"
          AND lower(btrim(t2."email")) = lower(btrim(u."liderEmail"))
     ) = 1;
  GET DIAGNOSTICS v_linked = ROW_COUNT;

  FOR v_row IN
    SELECT u."login", u."liderEmail", (u."deletedAt" IS NOT NULL) AS deleted
      FROM "users" AS u
     WHERE u."role" = 'planista'
       AND u."liderId" IS NULL
       AND NULLIF(btrim(u."liderEmail"), '') IS NOT NULL
     ORDER BY u."login"
  LOOP
    v_unmatched := v_unmatched + 1;
    RAISE NOTICE 'liderId backfill: UNMATCHED planista % (liderEmail=%)%',
      v_row."login", v_row."liderEmail",
      CASE WHEN v_row.deleted THEN ' [soft-deleted user]' ELSE '' END;
  END LOOP;

  SELECT count(*) INTO v_not_planista
    FROM "users"
   WHERE "role" <> 'planista'
     AND NULLIF(btrim("liderEmail"), '') IS NOT NULL;

  RAISE NOTICE 'liderId backfill: % planista row(s) linked now; % planista row(s) whose liderEmail resolved to no eligible lider (UNMATCHED); % non-planista row(s) with a liderEmail ignored (liderId is planista-only)',
    v_linked, v_unmatched, v_not_planista;
END $$;

-- 3b. delegations.plannerId ← the vehicle's CURRENT planista (R5 snapshot).
-- All rows, soft-deleted included: the snapshot is history, not a live scope.
-- Rows of a vehicle without a planista stay NULL.
DO $$
DECLARE
  v_filled  integer;
  v_left    integer;
BEGIN
  UPDATE "delegations" AS d
     SET "plannerId" = v."plannerId"
    FROM "vehicles" AS v
   WHERE d."vehicleId" = v."id"
     AND d."plannerId" IS NULL
     AND v."plannerId" IS NOT NULL;
  GET DIAGNOSTICS v_filled = ROW_COUNT;

  SELECT count(*) INTO v_left FROM "delegations" WHERE "plannerId" IS NULL;

  RAISE NOTICE 'delegations.plannerId backfill: % row(s) filled now; % row(s) left NULL (vehicle has no planista)',
    v_filled, v_left;
END $$;

-- 3c. One OPEN `backfill` history row per vehicle that has a planista, from
-- vehicles.createdAt (the business creation date the api uses as the vehicle's
-- lifecycle anchor; `addedAt` is an unused legacy column). All vehicles,
-- soft-deleted included, so "vehicles.plannerId = open row" holds for every
-- row. NOT EXISTS makes a re-run a no-op and keeps the partial unique happy.
DO $$
DECLARE
  v_opened integer;
BEGIN
  INSERT INTO "vehicle_planner_assignments" ("vehicleId", "plannerId", "validFrom", "source", "updatedAt")
  SELECT v."id", v."plannerId", v."createdAt", 'backfill', CURRENT_TIMESTAMP
    FROM "vehicles" AS v
   WHERE v."plannerId" IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM "vehicle_planner_assignments" AS a
        WHERE a."vehicleId" = v."id"
          AND a."validTo" IS NULL
     );
  GET DIAGNOSTICS v_opened = ROW_COUNT;

  RAISE NOTICE 'vehicle_planner_assignments backfill: % open row(s) created', v_opened;
END $$;
