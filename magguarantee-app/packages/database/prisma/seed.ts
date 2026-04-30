// Phase 1 seed — auth slice only.
//
// Idempotent: every upsert keys on a unique business field (login / email /
// config-key), so re-running the script will not duplicate rows.
//
// Out of scope (Phase 2+): trailer types, default monthly limits, claim
// thresholds, etc. See docs/12-database-schema.md and
// docs/17-migration-roadmap.md.

import bcrypt from 'bcryptjs';

import { PrismaClient, Role } from '../src/generated';

const prisma = new PrismaClient();

const DEV_PASSWORD = 'Test1234!';
const BCRYPT_ROUNDS = 12; // matches docs/15-auth-strategy.md

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
  { login: 'dyspozytor1', email: 'dyspozytor1@magtrans.eu', name: 'Dyspozytor 1', role: Role.dyspozytor },
  { login: 'przewoznik1', email: 'przewoznik1@magtrans.eu', name: 'Przewoznik 1', role: Role.przewoznik },
  { login: 'eksport1', email: 'eksport1@magtrans.eu', name: 'Eksport 1', role: Role.eksport },
  { login: 'weryfikator1', email: 'weryfikator1@magtrans.eu', name: 'Weryfikator 1', role: Role.weryfikator },
];

type AppConfigEntry = {
  key: string;
  value: string;
  description: string;
};

// Phase 1 auth-related runtime config. See docs/15-auth-strategy.md.
const APP_CONFIG_ENTRIES: AppConfigEntry[] = [
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
];

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

function printBanner(userCount: number, configCount: number): void {
  const longestLogin = SEED_USERS.reduce((max, u) => Math.max(max, u.login.length), 0);
  const longestEmail = SEED_USERS.reduce((max, u) => Math.max(max, u.email.length), 0);

  console.log('');
  console.log(`Seeded ${userCount} users (password for all: ${DEV_PASSWORD}):`);
  for (const u of SEED_USERS) {
    const login = u.login.padEnd(longestLogin, ' ');
    const email = `(${u.email})`.padEnd(longestEmail + 2, ' ');
    console.log(`  - ${login}   ${email}   role=${u.role}`);
  }
  console.log(`Seeded AppConfig: ${configCount} keys`);
  console.log('');
}

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, BCRYPT_ROUNDS);
  const userCount = await seedUsers(passwordHash);
  const configCount = await seedAppConfig();
  printBanner(userCount, configCount);
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
