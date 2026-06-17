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

// ─── App config ─────────────────────────────────────────

type AppConfigEntry = {
  key: string;
  value: string;
  description: string;
};

// Auth-related runtime config (Phase 1) + business-rule defaults (Phase 2).
// See docs/15-auth-strategy.md and docs/12-database-schema.md "AppConfig".
const APP_CONFIG_ENTRIES: AppConfigEntry[] = [
  // Phase 1 — auth
  {
    key: 'password_required',
    value: 'true',
    description: 'If true, /auth/login requires login+password before issuing a 2FA code. If false, email-only auth (code-only) is used.',
  },
  {
    key: 'login_code_ttl_seconds',
    value: '600',
    description: '2FA email code lifetime in seconds (10 min).',
  },
  {
    key: 'login_max_attempts',
    value: '5',
    description: 'Max 2FA code attempts before the session is locked.',
  },
  {
    key: 'login_lockout_seconds',
    value: '300',
    description: '2FA lockout duration after max attempts (5 min).',
  },
  // Phase 2 — claim authorization thresholds & submission window
  {
    key: 'auth_threshold_low',
    value: '1000',
    description: 'EUR — low authorization threshold (claims at/above this require authorization workflow).',
  },
  {
    key: 'auth_threshold_high',
    value: '5000',
    description: 'EUR — high authorization threshold (claims at/above this require AUTORYZACJA — KWOTA MAKSIMA).',
  },
  {
    key: 'min_days_to_submit',
    value: '10',
    description: 'Minimum days that must elapse after dateEnd before a claim may be submitted.',
  },
  // Phase 3 — carrier wniosek submission gating (configurable thresholds + per-vehicle cooldown).
  // Replaces the single `min_days_to_submit` gate with an hours-only duration
  // check plus a per-vehicle anti-spam cooldown. `min_days_to_submit` is kept
  // above for backwards compatibility but the api layer no longer reads it.
  {
    // Semantics (2026-05): the gate is now `round(hours/24, 2) >= N` (was
    // strict `> 9` until this release). Bumped from 9 → 10 to align with the
    // "min 10 worked days" product wording shown to carriers in the form.
    key: 'carrier_rounded_days_override_threshold',
    value: '10',
    description:
      'Próg round(hours/24, 2) >= N — carrier może złożyć wniosek, gdy liczba przepracowanych dni (godziny/24, 2 miejsca) jest większa lub równa N.',
  },
  {
    key: 'carrier_vehicle_cooldown_days',
    value: '6',
    description:
      'Cooldown w dniach między złożeniami wniosków na jeden pojazd (dokładnie 144 godziny od createdAt ostatniego wniosku o statusie != ODRZUCONO).',
  },
  // Phase 3 — claim submission deadline window
  {
    key: 'max_days_after_unloading',
    value: '7',
    description:
      'Days — maximum delay after dateEnd within which a carrier may submit a claim. Past this window the form is rejected. Source: Code.gs:6149.',
  },
  // Phase 3 — claim period sanity bounds (UX guards added 2026-05).
  {
    key: 'max_period_days',
    value: '90',
    description:
      'Days — maximum length of a single claim period (dateEnd − dateStart). Carriers occasionally try to bundle a quarter into one wniosek; this caps the period at a contract-realistic quarter.',
  },
  {
    key: 'max_avg_km_per_day',
    value: '2000',
    description:
      'Km/day — sanity cap on `mileage / drivenDays`. Trucks legitimately do up to ~1500 km/day in 2-driver continuous operation; anything beyond ~2000 is almost always a typo or odometer reset.',
  },
];

// ─── Trailer types (reference catalog) ──────────────────
// Source: legacy Code.gs:465-478. Order preserved to keep historical mapping.

type SeedTrailerType = {
  name: string;
  shortCode: string;
  description: string;
  active: boolean;
};

const SEED_TRAILER_TYPES: SeedTrailerType[] = [
  { name: 'Firanka', shortCode: 'FIR', description: 'Naczepa kurtynowa, boki otwierane', active: true },
  { name: 'Plandeka', shortCode: 'PLA', description: 'Naczepa plandekowa (klasyk)', active: true },
  { name: 'Chłodnia', shortCode: 'CHL', description: 'Naczepa chłodnicza (frigo)', active: true },
  { name: 'Wywrotka', shortCode: 'WYW', description: 'Naczepa samowyładowcza', active: true },
  { name: 'Mega', shortCode: 'MEG', description: 'Naczepa o zwiększonej wysokości', active: true },
  { name: 'Jumbo', shortCode: 'JUM', description: 'Naczepa ekstra wysoka i dluga', active: true },
  { name: 'Frigo', shortCode: 'FRI', description: 'Frigo (synonim chłodni)', active: true },
  { name: 'Niska', shortCode: 'NIS', description: 'Naczepa niskopodłogowa', active: true },
  { name: 'Burtowa', shortCode: 'BUR', description: 'Naczepa burtowa', active: true },
  { name: 'Kontener', shortCode: 'KON', description: 'Platforma pod kontener', active: true },
  { name: 'Cysterna', shortCode: 'CYS', description: 'Cysterna (ADR)', active: true },
  { name: 'HDS', shortCode: 'HDS', description: 'Naczepa z dźwigiem (hakowiec)', active: true },
  { name: 'Walking Floor', shortCode: 'WF', description: 'Podłoga ruchoma (Walking Floor)', active: true },
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
// populated; everything else is left at its default / NULL. `gps=false` keeps
// the `vehicle_gps_device_when_gps_on` CHECK satisfied without a device id.

const DEMO_CARRIER_USER_LOGIN = 'przewoznik1';
const DEMO_CARRIER_OPIEKUN_LOGIN = 'opiekun1';
const DEMO_VEHICLE_PLATE = 'WX 11113';

// ─── Monthly limits (placeholders) ──────────────────────
// Years 2026 and 2027 × 12 months = 24 rows. Admins edit through UI.
// Keying on (year, month) composite unique → idempotent. Years are pinned
// explicitly (rather than "current + next") so the seed produces the same
// 24 rows regardless of when it runs — important for fixture-based tests
// in Phase 3 km-calc and to match docs/17-migration-roadmap.md Phase 3 scope.

const MONTHLY_LIMIT_KM_PER_DAY = '540';
const MONTHLY_LIMIT_RATE_PER_KM = '0.5';
const MONTHLY_LIMIT_YEARS = [2026, 2027];

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

async function seedAppConfig(): Promise<number> {
  for (const c of APP_CONFIG_ENTRIES) {
    await prisma.appConfig.upsert({
      where: { key: c.key },
      create: { key: c.key, value: c.value, description: c.description },
      update: { value: c.value, description: c.description },
    });
  }
  return APP_CONFIG_ENTRIES.length;
}

async function seedTrailerTypes(): Promise<number> {
  for (const t of SEED_TRAILER_TYPES) {
    await prisma.trailerType.upsert({
      where: { name: t.name },
      create: {
        name: t.name,
        shortCode: t.shortCode,
        description: t.description,
        active: t.active,
      },
      // Re-sync metadata (shortCode/description) on rerun; flip active back
      // to seed source-of-truth so disabled-then-renabled is deterministic.
      update: {
        shortCode: t.shortCode,
        description: t.description,
        active: t.active,
      },
    });
  }
  return SEED_TRAILER_TYPES.length;
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
  // composite unique (carrierId, plateNumber). gps=false ⇒ the
  // vehicle_gps_device_when_gps_on CHECK is trivially satisfied.
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
      gps: false,
      dispatchTeamId: demoTeam.id,
    },
    update: {
      dispatchTeamId: demoTeam.id,
    },
  });

  return 1; // one demo vehicle
}

async function seedMonthlyLimits(): Promise<number> {
  let count = 0;
  for (const year of MONTHLY_LIMIT_YEARS) {
    for (let month = 1; month <= 12; month++) {
      await prisma.monthlyLimit.upsert({
        where: { year_month: { year, month } },
        create: {
          year,
          month,
          kmPerDay: MONTHLY_LIMIT_KM_PER_DAY,
          ratePerKm: MONTHLY_LIMIT_RATE_PER_KM,
        },
        // Don't overwrite values on rerun — admin may have tuned them.
        update: {},
      });
      count++;
    }
  }
  return count;
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
  const configCount = await seedAppConfig();
  const trailerTypeCount = await seedTrailerTypes();
  // Teams must be seeded after users (dispatchers) and before the demo fleet
  // (vehicle references the demo team).
  const teamCount = await seedTeams();
  const vehicleCount = await seedDemoFleet();
  const monthlyLimitCount = await seedMonthlyLimits();
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
