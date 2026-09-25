// Phase 2 seed — auth slice + reference data.
//
// Idempotent: every upsert keys on a unique business field (login / email /
// config-key / trailer-type-name / (year, month)), so re-running the script
// will not duplicate rows. Existing rows are kept in sync with the seed
// source-of-truth where it makes sense (users), or left untouched where the
// admin is expected to edit through the UI (monthly limits).
//
// Out of scope: real claims, carriers, vehicles, etc. Those are created via
// the API in dev/prod.

import bcrypt from 'bcryptjs';

import { PrismaClient, Role } from '../src/generated';
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
};

const SEED_USERS: SeedUser[] = [
  { login: 'admin', email: 'admin@magtrans.eu', name: 'Admin', role: Role.admin },
  { login: 'pracownik1', email: 'pracownik1@magtrans.eu', name: 'Pracownik 1', role: Role.pracownik },
  { login: 'opiekun1', email: 'opiekun1@magtrans.eu', name: 'Opiekun 1', role: Role.opiekun },
  { login: 'planista1', email: 'planista1@magtrans.eu', name: 'Planista 1', role: Role.planista },
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
  // permissions on top (none yet — they arrive with the permissions layer).
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
// panel) is visible immediately after seeding. Only DB-NOT-NULL fields are
// populated; everything else is left at its default / NULL. `gpsMobilePhone`
// (GPS tracker device id) is NOT NULL since 2026-06-17, so a value is supplied.

const DEMO_CARRIER_USER_LOGIN = 'przewoznik1';
const DEMO_CARRIER_OPIEKUN_LOGIN = 'opiekun1';
const DEMO_VEHICLE_PLATE = 'WX 11113';
const DEMO_TRAILER_PLATE = 'WX 99999';
const DEMO_DRIVER_SLUG = 'andrii.kowal';

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

async function seedDemoFleet(): Promise<number> {
  // Resolve the demo carrier's backing user + the opiekun (both seeded above).
  const carrierUser = await prisma.user.findUniqueOrThrow({
    where: { login: DEMO_CARRIER_USER_LOGIN },
  });
  const opiekun = await prisma.user.findUniqueOrThrow({
    where: { login: DEMO_CARRIER_OPIEKUN_LOGIN },
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
  // composite unique (carrierId, plateNumber). `gpsMobilePhone` (GPS tracker
  // device id) is NOT NULL, so a demo value is supplied.
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

  await prisma.vehicle.upsert({
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
      gpsMobilePhone: 'MOB126',
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
      dispatchTeamId: demoTeam.id,
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

  // One demo trailer (supplies the new NOT-NULL sideClearanceCm + the new
  // roof/box/beams fields). Idempotent via (carrierId, plateNumber).
  const stdTrailerType = await prisma.trailerType.findUniqueOrThrow({
    where: { name: 'STD' },
  });
  await prisma.trailer.upsert({
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
  await prisma.driver.upsert({
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

  return 1; // one demo vehicle
}

// ─── Output ─────────────────────────────────────────────

function printBanner(
  userCount: number,
  configCount: number,
  trailerTypeCount: number,
  teamCount: number,
  vehicleCount: number,
  monthlyLimitCount: number,
  stanowiskoRoleCount: number,
): void {
  const longestLogin = SEED_USERS.reduce((max, u) => Math.max(max, u.login.length), 0);
  const longestEmail = SEED_USERS.reduce((max, u) => Math.max(max, u.email.length), 0);

  console.log('');
  // Never echo the password itself — seed output ends up in CI / container
  // logs. The shared dev password lives in DEV_PASSWORD at the top of this file.
  console.log(`Seeded ${userCount} users (shared dev password — see DEV_PASSWORD in prisma/seed.ts):`);
  for (const u of SEED_USERS) {
    const login = u.login.padEnd(longestLogin, ' ');
    const email = `(${u.email})`.padEnd(longestEmail + 2, ' ');
    console.log(`  - ${login}   ${email}   role=${u.role}${u.lider ? ' (lider)' : ''}`);
  }
  const demoTeamDispatcherCount =
    SEED_TEAMS.find((t) => t.code === DEMO_TEAM_CODE)?.dispatcherLogins.length ?? 0;
  console.log(`Seeded AppConfig:   ${configCount} keys`);
  console.log(`Seeded TrailerType: ${trailerTypeCount} entries`);
  console.log(
    `Seeded Team:        ${teamCount} teams ` +
      `(${DEMO_TEAM_CODE}=${demoTeamDispatcherCount} dyspozytorów + ${vehicleCount} pojazd, ` +
      `${EMPTY_TEAM_CODE}=pusty)`,
  );
  console.log(`Seeded Vehicle:     ${vehicleCount} demo vehicle (plate ${DEMO_VEHICLE_PLATE})`);
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
  const vehicleCount = await seedDemoFleet();
  const monthlyLimitCount = await seedMonthlyLimits(prisma);
  const stanowiskoRoleCount = await seedStanowiskoRoles(prisma);
  printBanner(
    userCount,
    configCount,
    trailerTypeCount,
    teamCount,
    vehicleCount,
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
