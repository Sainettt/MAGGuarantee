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
  MONTHLY_LIMIT_RATE_PER_KM,
  MONTHLY_LIMIT_YEARS,
  seedAppConfig,
  seedMonthlyLimits,
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
};

const SEED_USERS: SeedUser[] = [
  { login: 'admin', email: 'admin@magtrans.eu', name: 'Admin', role: Role.admin },
  { login: 'pracownik1', email: 'pracownik1@magtrans.eu', name: 'Pracownik 1', role: Role.pracownik },
  { login: 'opiekun1', email: 'opiekun1@magtrans.eu', name: 'Opiekun 1', role: Role.opiekun },
  { login: 'planista1', email: 'planista1@magtrans.eu', name: 'Planista 1', role: Role.planista },
  // Two dispatchers — both members of dispatch team 1.1.13 (Phase 11). A team
  // normally has 2 dispatchers (by shift), so the demo team is fully populated.
  { login: 'dyspozytor1', email: 'dyspozytor1@magtrans.eu', name: 'Dyspozytor 1', role: Role.dyspozytor },
  { login: 'dyspozytor2', email: 'dyspozytor2@magtrans.eu', name: 'Dyspozytor 2', role: Role.dyspozytor },
  { login: 'przewoznik1', email: 'przewoznik1@magtrans.eu', name: 'Przewoznik 1', role: Role.przewoznik },
  { login: 'eksport1', email: 'eksport1@magtrans.eu', name: 'Eksport 1', role: Role.eksport },
  { login: 'weryfikator1', email: 'weryfikator1@magtrans.eu', name: 'Weryfikator 1', role: Role.weryfikator },
];

// ─── Dispatch teams (Phase 11) ──────────────────────────
// Two teams seeded end-to-end so the dispatch UI is populated right after
// `db seed`, with no manual setup:
//   - `1.1.13` — fully staffed (dyspozytor1 + dyspozytor2) and assigned the
//     demo vehicle below.
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
    dispatcherLogins: ['dyspozytor1', 'dyspozytor2'],
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
        passwordHash,
        active: true,
      },
      update: {
        // Keep existing user untouched on rerun — but ensure email/name/role
        // stay in sync with the seed source-of-truth so dev environments
        // converge after edits to this file.
        email: u.email,
        name: u.name,
        role: u.role,
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
    },
    update: {
      dispatchTeamId: demoTeam.id,
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
): void {
  const longestLogin = SEED_USERS.reduce((max, u) => Math.max(max, u.login.length), 0);
  const longestEmail = SEED_USERS.reduce((max, u) => Math.max(max, u.email.length), 0);

  console.log('');
  console.log(`Seeded ${userCount} users (password for all: ${DEV_PASSWORD}):`);
  for (const u of SEED_USERS) {
    const login = u.login.padEnd(longestLogin, ' ');
    const email = `(${u.email})`.padEnd(longestEmail + 2, ' ');
    console.log(`  - ${login}   ${email}   role=${u.role}`);
  }
  console.log(`Seeded AppConfig:   ${configCount} keys`);
  console.log(`Seeded TrailerType: ${trailerTypeCount} entries`);
  console.log(
    `Seeded Team:        ${teamCount} teams ` +
      `(${DEMO_TEAM_CODE}=2 dyspozytorów + ${vehicleCount} pojazd, ${EMPTY_TEAM_CODE}=pusty)`,
  );
  console.log(`Seeded Vehicle:     ${vehicleCount} demo vehicle (plate ${DEMO_VEHICLE_PLATE})`);
  console.log(
    `Seeded MonthlyLimit: ${monthlyLimitCount} rows (years ${MONTHLY_LIMIT_YEARS.join(', ')}, ` +
      `kmPerDay=${MONTHLY_LIMIT_KM_PER_DAY}, ratePerKm=${MONTHLY_LIMIT_RATE_PER_KM})`,
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
  printBanner(userCount, configCount, trailerTypeCount, teamCount, vehicleCount, monthlyLimitCount);
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
