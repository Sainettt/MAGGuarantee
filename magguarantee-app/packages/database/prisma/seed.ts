// Phase 2 seed — auth slice + reference data.
//
// Idempotent: every upsert keys on a unique business field (login / email /
// config-key / trailer-type-name / (year, month)), so re-running the script
// will not duplicate rows. Existing rows are kept in sync with the seed
// source-of-truth where it makes sense (users), or left untouched where the
// admin is expected to edit through the UI (monthly limits).
//
// Out of scope: real claims and the bulk of carriers / vehicles — those are
// created via the API. The seed only builds a small demo fleet: one carrier,
// three vehicles, and the docs/29 planner-transfer scenario (transfer requests
// in every status, a vehicle with two planista-history rows and delegations on
// both sides of the transfer). Rows without a unique business key (history,
// transfer requests, delegations) use FIXED ids, so a re-run upserts the same
// rows instead of appending new ones.

import bcrypt from 'bcryptjs';

import {
  DelegationStatus,
  PlannerAssignmentSource,
  PlannerTransferStatus,
  PrismaClient,
  Role,
} from '../src/generated';
import {
  MONTHLY_LIMIT_KM_PER_DAY,
  MONTHLY_LIMIT_KM_PER_SATURDAY,
  MONTHLY_LIMIT_RATE_PER_KM,
  MONTHLY_LIMIT_YEARS,
  seedAppConfig,
  seedMonthlyLimits,
  seedStanowiskoRoles,
  seedTrailerTypes,
} from './seed-data';

const prisma = new PrismaClient();

const DEV_PASSWORD = 'Test1234!';
const BCRYPT_ROUNDS = 12; // matches docs/15-auth-strategy.md

// ─── Users ──────────────────────────────────────────────

type SeedUser = {
  login: string;
  email: string;
  name: string;
  role: Role;
  // Leader flag (docs/28) — an add-on over `role`, NOT a role of its own. Only
  // valid for roles in `LIDER_ROLES` (planista, dyspozytor, opiekun, pracownik,
  // eksport); anything else fails CHECK `user_lider_requires_lider_role`.
  // Omitted = false.
  lider?: boolean;
  // planista only (docs/29 U9) — login of this planista's leader, written to
  // `User.liderId`. Must be a planista with `lider: true`, not the user himself.
  // Omitted = no leader (then only an admin decides his transfer requests, R4).
  liderLogin?: string;
};

const SEED_USERS: SeedUser[] = [
  { login: 'admin', email: 'admin@magtrans.eu', name: 'Admin', role: Role.admin },
  { login: 'pracownik1', email: 'pracownik1@magtrans.eu', name: 'Pracownik 1', role: Role.pracownik },
  { login: 'opiekun1', email: 'opiekun1@magtrans.eu', name: 'Opiekun 1', role: Role.opiekun },
  // Planisci (docs/29): planista1 and planista2 report to planistalider1, whose
  // transfer decisions cover their vehicles; planista3 has NO leader, so only an
  // admin decides his requests (R4).
  { login: 'planista1', email: 'planista1@magtrans.eu', name: 'Planista 1', role: Role.planista, liderLogin: 'planistalider1' },
  { login: 'planista2', email: 'planista2@magtrans.eu', name: 'Planista 2', role: Role.planista, liderLogin: 'planistalider1' },
  { login: 'planista3', email: 'planista3@magtrans.eu', name: 'Planista 3 (bez lidera)', role: Role.planista },
  // Two shift dispatchers — both members of dispatch team 1.1.13 (Phase 11). A
  // team normally has 2 dispatchers (by shift); the dispatchers' lead
  // `dyspozytorlider1` below sits in the same team (docs/28 §3.1).
  { login: 'dyspozytor1', email: 'dyspozytor1@magtrans.eu', name: 'Dyspozytor 1', role: Role.dyspozytor },
  { login: 'dyspozytor2', email: 'dyspozytor2@magtrans.eu', name: 'Dyspozytor 2', role: Role.dyspozytor },
  { login: 'przewoznik1', email: 'przewoznik1@magtrans.eu', name: 'Przewoznik 1', role: Role.przewoznik },
  { login: 'eksport1', email: 'eksport1@magtrans.eu', name: 'Eksport 1', role: Role.eksport },
  { login: 'weryfikator1', email: 'weryfikator1@magtrans.eu', name: 'Weryfikator 1', role: Role.weryfikator },
  // Leaders (docs/28) — one per role in `LIDER_ROLES`. Same base role, same
  // scope and panel as the plain accounts above; `lider: true` only adds
  // permissions on top — so far one: planistalider1 decides the vehicle-transfer
  // requests of the planisci whose `liderId` points at him (docs/29 R3).
  { login: 'planistalider1', email: 'planistalider1@magtrans.eu', name: 'Planista lider 1', role: Role.planista, lider: true },
  { login: 'dyspozytorlider1', email: 'dyspozytorlider1@magtrans.eu', name: 'Dyspozytor lider 1', role: Role.dyspozytor, lider: true },
  { login: 'opiekunlider1', email: 'opiekunlider1@magtrans.eu', name: 'Opiekun lider 1', role: Role.opiekun, lider: true },
  { login: 'pracowniklider1', email: 'pracowniklider1@magtrans.eu', name: 'Pracownik lider 1', role: Role.pracownik, lider: true },
  { login: 'eksportlider1', email: 'eksportlider1@magtrans.eu', name: 'Eksport lider 1', role: Role.eksport, lider: true },
];

// ─── Dispatch teams (Phase 11) ──────────────────────────
// Two teams seeded end-to-end so the dispatch UI is populated right after
// `db seed`, with no manual setup:
//   - `1.1.13` — fully staffed (dyspozytor1 + dyspozytor2 on shifts, plus the
//     dispatchers' lead dyspozytorlider1 — docs/28 §3.1; whether a lead
//     belongs to one team or spans all is still open, docs/28 §8 q.3) and
//     assigned the demo vehicle below.
//   - `9.9.9`  — intentionally empty (no dispatchers) to exercise the UI's
//     "Brak dyspozytorów" state.
// `Team` uses an `active` flag, not soft-delete (see docs/04-data-model.md).

const DEMO_TEAM_CODE = '1.1.13';
const EMPTY_TEAM_CODE = '9.9.9';

type SeedTeam = {
  code: string;
  name: string | null;
  active: boolean;
  // dispatcher logins (must exist in SEED_USERS with role=dyspozytor)
  dispatcherLogins: string[];
};

const SEED_TEAMS: SeedTeam[] = [
  {
    code: DEMO_TEAM_CODE,
    name: 'Zespół DAF 1.1.13',
    active: true,
    dispatcherLogins: ['dyspozytor1', 'dyspozytor2', 'dyspozytorlider1'],
  },
  {
    code: EMPTY_TEAM_CODE,
    name: null,
    active: true,
    dispatcherLogins: [],
  },
];

// ─── Demo carrier + vehicle (Phase 11 end-to-end) ───────
// A minimal Carrier (extends przewoznik1) plus one Vehicle assigned to the
// demo team, so the full dispatch flow (vehicle form, modals, dispatcher
// panel) is visible immediately after seeding.

// Fields the vehicle EDIT form requires to save (shared `VehicleEditFormSchema`
// + the api's post-update rules), applied to every demo vehicle on create AND
// update so an already-seeded dev DB is repaired by the next seed run:
//   - all four EUR/km rates (the form has no "leave empty" for them);
//   - at least 2 of the gb / it / fr access flags;
//   - no `gpsMobilePhone`: a GPS device id makes a live `gps` attachment (umowa
//     GPS scan) mandatory, and the seed does not upload files to MinIO. The
//     column is nullable again since 2026-07, so NULL is a valid demo state.
const DEMO_VEHICLE_EDITABLE = {
  rateDe: 0.55,
  rateUe: 0.5,
  rateExport: 0.6,
  rateImport: 0.45,
  gb: true,
  it: true,
  fr: false,
  gpsMobilePhone: null,
} as const;

const DEMO_CARRIER_USER_LOGIN = 'przewoznik1';
const DEMO_CARRIER_OPIEKUN_LOGIN = 'opiekun1';
const DEMO_VEHICLE_PLATE = 'WX 11113';
const DEMO_VEHICLE_PLANNER_LOGIN = 'planista1';
const DEMO_TRAILER_PLATE = 'WX 99999';
const DEMO_DRIVER_SLUG = 'andrii.kowal';

// ─── Planner transfer demo (docs/29) ────────────────────
// Two more vehicles of the demo carrier:
//   - TRANSFERRED — planista1 → planista2 via an APPROVED request (decided by
//     planistalider1, the lider of planista1). Two history rows (closed
//     `create` + open `transfer`) and four delegations: two led by planista1
//     (one of them was `w_trasie` at approval, so it stayed with him — R6), two
//     by planista2 (one still `zgloszony`). Plus a PENDING request
//     planista2 → planista3 filed by opiekun1 — decidable by admin or
//     planistalider1.
//   - LEADERLESS — led by planista3 (no lider): a REJECTED, a CANCELLED and a
//     PENDING request; the pending one only an admin can decide (R4).
// Timestamps are offsets from each vehicle's `createdAt`, which the seed sets
// in the past on first insert and never moves — a re-run rewrites the same
// values (deterministic, no drift).
const TRANSFERRED_VEHICLE_PLATE = 'WX 22224';
const LEADERLESS_VEHICLE_PLATE = 'WX 33335';
const TRANSFERRED_VEHICLE_AGE_DAYS = 60;
const LEADERLESS_VEHICLE_AGE_DAYS = 30;

// Fixed ids (valid v4-shaped uuids) of the seeded rows that have no unique
// business key. `5eed0029` = "seed, docs/29".
const seedId = (n: number): string => `5eed0029-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const SEED_IDS = {
  // vehicle_planner_assignments
  assignDemoCreate: seedId(0x101),
  assignTransferredCreate: seedId(0x102),
  assignTransferredTransfer: seedId(0x103),
  assignLeaderlessCreate: seedId(0x104),
  // vehicle_planner_transfers
  transferApproved: seedId(0x201),
  transferPendingLider: seedId(0x202),
  transferRejected: seedId(0x203),
  transferCancelled: seedId(0x204),
  transferPendingAdminOnly: seedId(0x205),
  // delegations (all on the TRANSFERRED vehicle)
  delegationOldReturned: seedId(0x301),
  delegationOldInTransitAtApproval: seedId(0x302),
  delegationNewReturned: seedId(0x303),
  delegationNewReported: seedId(0x304),
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** `base` + `days` (fractional allowed). */
const plusDays = (base: Date, days: number): Date => new Date(base.getTime() + days * DAY_MS);
/** Date-only value (UTC midnight) for `@db.Date` columns. */
const dateOnly = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

// MonthlyLimit placeholders, AppConfig and TrailerType reference data live in
// ./seed-data (shared with the production bootstrap). The km/day and rate/km
// constants are imported above for the dev banner output.

// ─── Seed functions ─────────────────────────────────────

async function seedUsers(passwordHash: string): Promise<number> {
  for (const u of SEED_USERS) {
    await prisma.user.upsert({
      where: { login: u.login },
      create: {
        login: u.login,
        email: u.email,
        name: u.name,
        role: u.role,
        lider: u.lider ?? false,
        passwordHash,
        active: true,
      },
      update: {
        // Keep existing user untouched on rerun — but ensure email/name/role
        // (and the lider flag, written in the same UPDATE as `role` so the
        // CHECK sees the final pair) stay in sync with the seed source-of-truth
        // so dev environments converge after edits to this file.
        email: u.email,
        name: u.name,
        role: u.role,
        lider: u.lider ?? false,
        active: true,
      },
    });
  }

  // Second pass — `liderId` points at another seeded user, which must exist
  // first. Written for every seeded planista (NULL when `liderLogin` is omitted)
  // so a re-run converges; the deprecated `liderEmail` is left alone.
  for (const u of SEED_USERS) {
    if (u.role !== Role.planista) continue;
    const lider = u.liderLogin
      ? await prisma.user.findUniqueOrThrow({ where: { login: u.liderLogin } })
      : null;
    await prisma.user.update({
      where: { login: u.login },
      data: { liderId: lider?.id ?? null },
    });
  }
  return SEED_USERS.length;
}

async function seedTeams(): Promise<number> {
  for (const t of SEED_TEAMS) {
    // Upsert the team by its unique code → idempotent.
    const team = await prisma.team.upsert({
      where: { code: t.code },
      create: { code: t.code, name: t.name, active: t.active },
      update: { name: t.name, active: t.active },
    });

    // Assign / re-assign the team's dispatchers (User.teamId). Set-once per
    // rerun: we point exactly the listed dispatchers at this team. (We don't
    // unassign dispatchers no longer listed — the demo set is stable.)
    for (const login of t.dispatcherLogins) {
      await prisma.user.update({
        where: { login },
        data: { teamId: team.id },
      });
    }
  }
  return SEED_TEAMS.length;
}

type DemoFleet = {
  carrierId: string;
  carrierUserId: string;
  opiekunId: string;
  dispatchTeamId: string;
  trailerId: string;
  driverId: string;
  driverName: string;
  driverPhone: string;
};

async function seedDemoFleet(): Promise<DemoFleet> {
  // Resolve the demo carrier's backing user + the opiekun (both seeded above).
  const carrierUser = await prisma.user.findUniqueOrThrow({
    where: { login: DEMO_CARRIER_USER_LOGIN },
  });
  const opiekun = await prisma.user.findUniqueOrThrow({
    where: { login: DEMO_CARRIER_OPIEKUN_LOGIN },
  });
  // Every vehicle gets its first planista at creation (docs/29 R7).
  const demoPlanner = await prisma.user.findUniqueOrThrow({
    where: { login: DEMO_VEHICLE_PLANNER_LOGIN },
  });
  const demoTeam = await prisma.team.findUniqueOrThrow({
    where: { code: DEMO_TEAM_CODE },
  });

  // Carrier extends przewoznik1 (1:1 on userId). Only DB-NOT-NULL fields are
  // populated; idempotent via the unique userId.
  const carrier = await prisma.carrier.upsert({
    where: { userId: carrierUser.id },
    create: {
      userId: carrierUser.id,
      company: 'Demo Przewoźnik Sp. z o.o.',
      nip: '1234567890',
      contactPerson: 'Jan Kowalski',
      phone: '+48600100200',
      ordersEmail: 'zlecenia@demo-przewoznik.pl',
      accountEur: 'PL00102030405060708090100110',
      insuranceValue: '500000.00',
      companyAddress: 'ul. Przykładowa 1, 00-001 Warszawa',
      opiekunId: opiekun.id,
    },
    update: {
      opiekunId: opiekun.id,
    },
  });

  // One vehicle assigned to the demo dispatch team. Idempotent via the
  // composite unique (carrierId, plateNumber). Carries DEMO_VEHICLE_EDITABLE so
  // the edit form saves.
  //
  // Guarantee Watchdog (план 2026-07-07): the demo vehicle is guaranteed
  // (agreement=true) so the watchdog board/banner has something to show in dev.
  // `agreementSince` is stamped ~3 weeks in the past (date-only) — a plausible
  // guarantee-enable date. With no delegations seeded, the watchdog anchors on
  // agreementSince, which (being > 10 working days ago) puts the vehicle in a
  // violated/counting state on the board. NO episodes are seeded — the journal
  // table starts empty and is populated by the cron.
  const agreementSince = new Date();
  agreementSince.setUTCDate(agreementSince.getUTCDate() - 21);
  agreementSince.setUTCHours(0, 0, 0, 0); // date-only → UTC midnight

  // Fuel-card demo values (fuelCard=true → detail fields populated). NOTE: the
  // vehicle has agreement=true but NO `agreement` VehicleAttachment (porozumienie
  // scan) is seeded — this is INTENTIONAL so the UI demonstrates the fuel-card
  // BLOCKED warning (card blocked unless agreement=true AND a live agreement scan).
  const fuelCardExpiry = new Date();
  fuelCardExpiry.setUTCFullYear(fuelCardExpiry.getUTCFullYear() + 2);
  fuelCardExpiry.setUTCHours(0, 0, 0, 0); // date-only → UTC midnight

  const demoVehicle = await prisma.vehicle.upsert({
    where: {
      carrier_plate_unique: {
        carrierId: carrier.id,
        plateNumber: DEMO_VEHICLE_PLATE,
      },
    },
    create: {
      carrierId: carrier.id,
      plateNumber: DEMO_VEHICLE_PLATE,
      certificateL: true,
      euro: 'VI',
      type: 'STD',
      ...DEMO_VEHICLE_EDITABLE,
      plannerId: demoPlanner.id,
      createdById: opiekun.id,
      dispatchTeamId: demoTeam.id,
      agreement: true,
      agreementSince,
      // fuel card + details (16-digit number, future expiry, 4-digit PIN)
      fuelCard: true,
      fuelCardNumber: '1234567890123456',
      fuelCardExpiry,
      fuelCardPin: '1234',
      // ADR permit + top-level classes ("1".."9")
      adr: true,
      adrClasses: ['3', '8'],
      // waste haulage — valid WasteCountry enum members
      wasteAllowed: true,
      wasteCountries: ['DE', 'PL'],
    },
    update: {
      plannerId: demoPlanner.id,
      dispatchTeamId: demoTeam.id,
      ...DEMO_VEHICLE_EDITABLE,
      agreement: true,
      agreementSince,
      fuelCard: true,
      fuelCardNumber: '1234567890123456',
      fuelCardExpiry,
      fuelCardPin: '1234',
      adr: true,
      adrClasses: ['3', '8'],
      wasteAllowed: true,
      wasteCountries: ['DE', 'PL'],
    },
  });
  // Its planista history: one open `create` row (docs/29 R7). No delegations on
  // this vehicle — the watchdog demo above depends on that.
  await upsertAssignment({
    id: SEED_IDS.assignDemoCreate,
    vehicleId: demoVehicle.id,
    plannerId: demoPlanner.id,
    validFrom: demoVehicle.createdAt,
    validTo: null,
    source: PlannerAssignmentSource.create,
    transferId: null,
    actorId: opiekun.id,
  });

  // One demo trailer (supplies the new NOT-NULL sideClearanceCm + the new
  // roof/box/beams fields). Idempotent via (carrierId, plateNumber).
  const stdTrailerType = await prisma.trailerType.findUniqueOrThrow({
    where: { name: 'STD' },
  });
  const trailer = await prisma.trailer.upsert({
    where: {
      carrierId_plateNumber: {
        carrierId: carrier.id,
        plateNumber: DEMO_TRAILER_PLATE,
      },
    },
    create: {
      carrierId: carrier.id,
      plateNumber: DEMO_TRAILER_PLATE,
      trailerTypeId: stdTrailerType.id,
      sideClearanceCm: 270,
      belts: true,
      beltsCount: 12,
      mats: true,
      matsCount: 6,
      beams: true,
      beamsCount: 3,
      liftingRoof: true,
      slidingRoof: true,
      edscha: true,
      palletBox: true,
      certXl: true,
      multilock: true,
    },
    update: {
      trailerTypeId: stdTrailerType.id,
      sideClearanceCm: 270,
    },
  });

  // One demo driver (supplies the new required nationality + languages).
  // Idempotent via the unique loginSlug.
  const driver = await prisma.driver.upsert({
    where: { loginSlug: DEMO_DRIVER_SLUG },
    create: {
      carrierId: carrier.id,
      loginSlug: DEMO_DRIVER_SLUG,
      firstName: 'Andrii',
      lastName: 'Kowal',
      phone: '+48600300400',
      idDocumentNumber: 'AB1234567',
      nationality: 'UA',
      languages: ['UA', 'PL', 'RU'],
      adr: true,
      adrClasses: ['3'],
    },
    update: {
      carrierId: carrier.id,
      nationality: 'UA',
      languages: ['UA', 'PL', 'RU'],
    },
  });

  return {
    carrierId: carrier.id,
    carrierUserId: carrierUser.id,
    opiekunId: opiekun.id,
    dispatchTeamId: demoTeam.id,
    trailerId: trailer.id,
    driverId: driver.id,
    driverName: `${driver.firstName} ${driver.lastName}`,
    driverPhone: driver.phone,
  };
}

// ─── Planner transfer demo (docs/29) ────────────────────

type SeedAssignment = {
  id: string;
  vehicleId: string;
  plannerId: string;
  validFrom: Date;
  validTo: Date | null;
  source: PlannerAssignmentSource;
  transferId: string | null;
  actorId: string | null;
};

/**
 * Upserts one planista-history row by its fixed id. For an OPEN row, any other
 * open row of the same vehicle is closed first — on a dev DB that already went
 * through migration 20260928120000 the vehicle may carry a `backfill` row, and
 * the partial unique index "one open row per vehicle" would reject ours.
 */
async function upsertAssignment(a: SeedAssignment): Promise<void> {
  if (a.validTo === null) {
    await prisma.vehiclePlannerAssignment.updateMany({
      where: { vehicleId: a.vehicleId, validTo: null, id: { not: a.id } },
      data: { validTo: new Date() },
    });
  }
  const { id, ...data } = a;
  await prisma.vehiclePlannerAssignment.upsert({ where: { id }, create: a, update: data });
}

type SeedTransfer = {
  id: string;
  vehicleId: string;
  fromPlannerId: string;
  toPlannerId: string;
  requestedById: string;
  status: PlannerTransferStatus;
  reason: string;
  decisionComment: string | null;
  decidedById: string | null;
  decidedAt: Date | null;
  createdAt: Date;
};

/**
 * Upserts one transfer request by its fixed id. A PENDING one is skipped when
 * the vehicle already has another pending request (e.g. filed through the UI
 * on a dev DB) — the partial unique index allows only one, and the seed must
 * not cancel someone's real request.
 *
 * A non-approved one first drops the history row it may own: approving a seed
 * request through the UI on a dev DB opens a `transfer` row linked to it, and
 * the re-run below resets the request to pending. Only an approved request may
 * own a row (1:1 `transferId`), and the stale one would fail its next approval
 * with P2002. If the dropped row was the vehicle's open one, the seed's own
 * open row (upsertAssignment) is the open one after the run — whether it is
 * upserted after the requests (TRANSFERRED) or before them (LEADERLESS, where
 * it has already closed the stale row).
 */
async function upsertTransfer(t: SeedTransfer): Promise<boolean> {
  if (t.status === PlannerTransferStatus.pending) {
    const other = await prisma.vehiclePlannerTransfer.findFirst({
      where: { vehicleId: t.vehicleId, status: PlannerTransferStatus.pending, id: { not: t.id } },
    });
    if (other) {
      console.warn(`[seed] vehicle ${t.vehicleId} already has pending transfer ${other.id} — seed request ${t.id} skipped`);
      return false;
    }
  }
  if (t.status !== PlannerTransferStatus.approved) {
    await prisma.vehiclePlannerAssignment.deleteMany({ where: { transferId: t.id } });
  }
  const { id, ...data } = t;
  await prisma.vehiclePlannerTransfer.upsert({ where: { id }, create: t, update: data });
  return true;
}

type SeedDelegation = {
  id: string;
  status: DelegationStatus;
  plannerId: string;
  departureAt: Date;
  plannedReturnAt: Date;
  actualReturnAt: Date | null; // zjechal only
};

async function seedPlannerTransferDemo(fleet: DemoFleet): Promise<{ vehicles: number; transfers: number; delegations: number }> {
  const byLogin = async (login: string) => prisma.user.findUniqueOrThrow({ where: { login } });
  const [admin, planista1, planista2, planista3, planistaLider, eksport, weryfikator] = await Promise.all([
    byLogin('admin'),
    byLogin('planista1'),
    byLogin('planista2'),
    byLogin('planista3'),
    byLogin('planistalider1'),
    byLogin('eksport1'),
    byLogin('weryfikator1'),
  ]);

  const upsertVehicle = async (plateNumber: string, plannerId: string, ageDays: number) => {
    const createdAt = plusDays(new Date(), -ageDays);
    return prisma.vehicle.upsert({
      where: { carrier_plate_unique: { carrierId: fleet.carrierId, plateNumber } },
      create: {
        carrierId: fleet.carrierId,
        plateNumber,
        certificateL: true,
        type: 'MEGA',
        ...DEMO_VEHICLE_EDITABLE,
        plannerId,
        createdById: fleet.opiekunId,
        dispatchTeamId: fleet.dispatchTeamId,
        // Set once — every seeded timestamp below is an offset from it.
        createdAt,
        addedAt: createdAt,
      },
      // `createdAt` deliberately not rewritten: it is the anchor of the scenario.
      update: { plannerId, dispatchTeamId: fleet.dispatchTeamId, ...DEMO_VEHICLE_EDITABLE },
    });
  };

  // ── TRANSFERRED: planista1 → planista2 (approved), then pending → planista3 ──
  const transferred = await upsertVehicle(
    TRANSFERRED_VEHICLE_PLATE,
    planista2.id,
    TRANSFERRED_VEHICLE_AGE_DAYS,
  );
  const t0 = transferred.createdAt;
  const approvedAt = plusDays(t0, 40);

  // Requests first — the `transfer` history row references the approved one.
  let transfers = 0;
  if (
    await upsertTransfer({
      id: SEED_IDS.transferApproved,
      vehicleId: transferred.id,
      fromPlannerId: planista1.id,
      toPlannerId: planista2.id,
      requestedById: planista1.id, // the then-current planista (R2)
      status: PlannerTransferStatus.approved,
      reason: 'Zmiana podziału regionów — pojazd jeździ głównie na trasach planisty 2.',
      decisionComment: 'Zgoda.',
      decidedById: planistaLider.id, // lider of fromPlanner (R3)
      decidedAt: approvedAt,
      createdAt: plusDays(t0, 38),
    })
  )
    transfers++;
  if (
    await upsertTransfer({
      id: SEED_IDS.transferPendingLider,
      vehicleId: transferred.id,
      fromPlannerId: planista2.id,
      toPlannerId: planista3.id,
      requestedById: fleet.opiekunId, // opiekun of the carrier (R2)
      status: PlannerTransferStatus.pending,
      reason: 'Planista 2 przechodzi do innego działu — prośba o przekazanie pojazdu.',
      decisionComment: null,
      decidedById: null,
      decidedAt: null,
      createdAt: plusDays(t0, 57),
    })
  )
    transfers++;

  await upsertAssignment({
    id: SEED_IDS.assignTransferredCreate,
    vehicleId: transferred.id,
    plannerId: planista1.id,
    validFrom: t0,
    validTo: approvedAt,
    source: PlannerAssignmentSource.create,
    transferId: null,
    actorId: fleet.opiekunId,
  });
  await upsertAssignment({
    id: SEED_IDS.assignTransferredTransfer,
    vehicleId: transferred.id,
    plannerId: planista2.id,
    validFrom: approvedAt,
    validTo: null,
    source: PlannerAssignmentSource.transfer,
    transferId: SEED_IDS.transferApproved,
    actorId: planistaLider.id,
  });

  // Delegations on both sides of the transfer. `plannerId` is the snapshot of
  // the planista of each delegation's period (R5/R6). At most one active
  // (zgloszony/gotowy/w_trasie) delegation per vehicle — here only the last one.
  const delegations: SeedDelegation[] = [
    {
      // Returned long before the transfer — stays with planista1.
      id: SEED_IDS.delegationOldReturned,
      status: DelegationStatus.zjechal,
      plannerId: planista1.id,
      departureAt: plusDays(t0, 5),
      plannedReturnAt: plusDays(t0, 15),
      actualReturnAt: plusDays(t0, 15),
    },
    {
      // Was `w_trasie` at approval (departed day 36, back day 45) — the old
      // planista finishes it (R6), so the snapshot stays planista1.
      id: SEED_IDS.delegationOldInTransitAtApproval,
      status: DelegationStatus.zjechal,
      plannerId: planista1.id,
      departureAt: plusDays(t0, 36),
      plannedReturnAt: plusDays(t0, 46),
      actualReturnAt: plusDays(t0, 45),
    },
    {
      // First delegation after the transfer — planista2.
      id: SEED_IDS.delegationNewReturned,
      status: DelegationStatus.zjechal,
      plannerId: planista2.id,
      departureAt: plusDays(t0, 47),
      plannedReturnAt: plusDays(t0, 55),
      actualReturnAt: plusDays(t0, 55),
    },
    {
      // Reported, not departed yet — would move to planista3 if the pending
      // request above is approved (R6).
      id: SEED_IDS.delegationNewReported,
      status: DelegationStatus.zgloszony,
      plannerId: planista2.id,
      departureAt: plusDays(t0, 62),
      plannedReturnAt: plusDays(t0, 72),
      actualReturnAt: null,
    },
  ];
  for (const d of delegations) {
    const departed = d.status === DelegationStatus.w_trasie || d.status === DelegationStatus.zjechal;
    const ready = departed || d.status === DelegationStatus.gotowy;
    const data = {
      vehicleId: transferred.id,
      trailerId: fleet.trailerId,
      driverId: fleet.driverId,
      carrierId: fleet.carrierId,
      driverNameSnapshot: fleet.driverName,
      driverPhoneSnapshot: fleet.driverPhone,
      departureAt: d.departureAt,
      departureCountry: 'PL',
      departurePostalCode: '05-800',
      plannedReturnAt: dateOnly(d.plannedReturnAt),
      returnCountry: 'PL',
      returnPostalCode: '05-800',
      status: d.status,
      actualDepartureAt: departed ? d.departureAt : null,
      actualReturnAt: d.actualReturnAt,
      reportedById: fleet.carrierUserId,
      reportedAt: plusDays(d.departureAt, -4),
      readyById: ready ? eksport.id : null,
      readyAt: ready ? plusDays(d.departureAt, -1) : null,
      spedOrderNumber: ready ? `SPED/${d.id.slice(-4)}` : null,
      verifiedById: departed ? weryfikator.id : null,
      verifiedAt: d.actualReturnAt ?? (departed ? d.departureAt : null),
      plannerId: d.plannerId,
      createdAt: plusDays(d.departureAt, -4),
    };
    await prisma.delegation.upsert({ where: { id: d.id }, create: { id: d.id, ...data }, update: data });
  }
  // OstatnioJezdzilo — the api bumps it on `zjechal`; mirror that here.
  const lastReturn = delegations
    .map((d) => d.actualReturnAt)
    .filter((x): x is Date => x !== null)
    .reduce((a, b) => (a > b ? a : b));
  await prisma.vehicle.update({ where: { id: transferred.id }, data: { lastDroveAt: lastReturn } });

  // ── LEADERLESS: planista3 (no lider) — rejected, cancelled, pending ─────────
  const leaderless = await upsertVehicle(
    LEADERLESS_VEHICLE_PLATE,
    planista3.id,
    LEADERLESS_VEHICLE_AGE_DAYS,
  );
  const l0 = leaderless.createdAt;
  await upsertAssignment({
    id: SEED_IDS.assignLeaderlessCreate,
    vehicleId: leaderless.id,
    plannerId: planista3.id,
    validFrom: l0,
    validTo: null,
    source: PlannerAssignmentSource.create,
    transferId: null,
    actorId: fleet.opiekunId,
  });
  const leaderlessTransfers: SeedTransfer[] = [
    {
      id: SEED_IDS.transferRejected,
      vehicleId: leaderless.id,
      fromPlannerId: planista3.id,
      toPlannerId: planista1.id,
      requestedById: planista3.id,
      status: PlannerTransferStatus.rejected,
      reason: 'Za dużo pojazdów w obsłudze.',
      decisionComment: 'Planista 1 nie ma obecnie wolnych mocy — proszę spróbować za miesiąc.',
      decidedById: admin.id, // planista3 has no lider → admin only (R4)
      decidedAt: plusDays(l0, 4),
      createdAt: plusDays(l0, 3),
    },
    {
      id: SEED_IDS.transferCancelled,
      vehicleId: leaderless.id,
      fromPlannerId: planista3.id,
      toPlannerId: planista2.id,
      requestedById: fleet.opiekunId,
      status: PlannerTransferStatus.cancelled,
      reason: 'Przewoźnik prosi o planistę mówiącego po niemiecku.',
      decisionComment: null,
      decidedById: fleet.opiekunId, // cancelled by its author
      decidedAt: new Date(plusDays(l0, 10).getTime() + 2 * HOUR_MS),
      createdAt: plusDays(l0, 10),
    },
    {
      id: SEED_IDS.transferPendingAdminOnly,
      vehicleId: leaderless.id,
      fromPlannerId: planista3.id,
      toPlannerId: planista1.id,
      requestedById: planista3.id,
      status: PlannerTransferStatus.pending,
      reason: 'Ponowna prośba — planista 1 zwolnił moce.',
      decisionComment: null,
      decidedById: null,
      decidedAt: null,
      createdAt: plusDays(l0, 25),
    },
  ];
  for (const t of leaderlessTransfers) if (await upsertTransfer(t)) transfers++;

  return { vehicles: 2, transfers, delegations: delegations.length };
}

// ─── Output ─────────────────────────────────────────────

function printBanner(
  userCount: number,
  configCount: number,
  trailerTypeCount: number,
  teamCount: number,
  transferDemo: { vehicles: number; transfers: number; delegations: number },
  monthlyLimitCount: number,
  stanowiskoRoleCount: number,
): void {
  const vehicleCount = 1 + transferDemo.vehicles;
  const longestLogin = SEED_USERS.reduce((max, u) => Math.max(max, u.login.length), 0);
  const longestEmail = SEED_USERS.reduce((max, u) => Math.max(max, u.email.length), 0);

  console.log('');
  // Never echo the password itself — seed output ends up in CI / container
  // logs. The shared dev password lives in DEV_PASSWORD at the top of this file.
  console.log(`Seeded ${userCount} users (shared dev password — see DEV_PASSWORD in prisma/seed.ts):`);
  for (const u of SEED_USERS) {
    const login = u.login.padEnd(longestLogin, ' ');
    const email = `(${u.email})`.padEnd(longestEmail + 2, ' ');
    const tags = [u.lider ? 'lider' : null, u.liderLogin ? `lider=${u.liderLogin}` : null].filter(Boolean);
    console.log(`  - ${login}   ${email}   role=${u.role}${tags.length ? ` (${tags.join(', ')})` : ''}`);
  }
  const demoTeamDispatcherCount =
    SEED_TEAMS.find((t) => t.code === DEMO_TEAM_CODE)?.dispatcherLogins.length ?? 0;
  console.log(`Seeded AppConfig:   ${configCount} keys`);
  console.log(`Seeded TrailerType: ${trailerTypeCount} entries`);
  console.log(
    `Seeded Team:        ${teamCount} teams ` +
      `(${DEMO_TEAM_CODE}=${demoTeamDispatcherCount} dyspozytorów + ${vehicleCount} pojazdy, ` +
      `${EMPTY_TEAM_CODE}=pusty)`,
  );
  console.log(
    `Seeded Vehicle:     ${vehicleCount} demo vehicles (${DEMO_VEHICLE_PLATE}; ` +
      `${TRANSFERRED_VEHICLE_PLATE} przekazany planista1→planista2; ${LEADERLESS_VEHICLE_PLATE} planista3 bez lidera)`,
  );
  console.log(
    `Seeded docs/29:     ${transferDemo.transfers} transfer requests (approved/rejected/cancelled/2×pending), ` +
      `${transferDemo.delegations} delegations on ${TRANSFERRED_VEHICLE_PLATE}`,
  );
  console.log(
    `Seeded MonthlyLimit: ${monthlyLimitCount} rows (years ${MONTHLY_LIMIT_YEARS.join(', ')}, ` +
      `kmPerDay=${MONTHLY_LIMIT_KM_PER_DAY}, ratePerKm=${MONTHLY_LIMIT_RATE_PER_KM}, ` +
      `kmPerSaturday=${MONTHLY_LIMIT_KM_PER_SATURDAY})`,
  );
  console.log(
    `Seeded StanowiskoRoleMapping: ${stanowiskoRoleCount} rows ` +
      '(pozostałe stanowiska bez mapowania — admin uzupełnia w /employee/sso)',
  );
  console.log('');
}

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, BCRYPT_ROUNDS);
  const userCount = await seedUsers(passwordHash);
  const configCount = await seedAppConfig(prisma);
  const trailerTypeCount = await seedTrailerTypes(prisma);
  // Teams must be seeded after users (dispatchers) and before the demo fleet
  // (vehicle references the demo team).
  const teamCount = await seedTeams();
  const fleet = await seedDemoFleet();
  // After the fleet (carrier / trailer / driver) and the users (planisci, their
  // lider, eksport, weryfikator) it references.
  const transferDemo = await seedPlannerTransferDemo(fleet);
  const monthlyLimitCount = await seedMonthlyLimits(prisma);
  const stanowiskoRoleCount = await seedStanowiskoRoles(prisma);
  printBanner(
    userCount,
    configCount,
    trailerTypeCount,
    teamCount,
    transferDemo,
    monthlyLimitCount,
    stanowiskoRoleCount,
  );
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
