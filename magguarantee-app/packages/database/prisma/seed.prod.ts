// Production bootstrap — run ONCE manually via `npm run seed:prod`.
//
// Seeds ONLY the reference data a fresh production database needs to boot
// (AppConfig keys, TrailerType catalog, MonthlyLimit placeholders, the
// stanowisko → role mapping the Google SSO reads) plus the first admin account.
// NO fake users, NO demo carrier/vehicle/teams.
//
// Idempotent: every write is an upsert, so an accidental re-run is a no-op. In
// particular the admin upsert uses `update: {}` — re-running never resets the
// password or re-flips mustChangePassword on an existing admin.
//
// The admin password comes from SEED_ADMIN_PASSWORD and is REQUIRED — there is
// deliberately no fallback (a hardcoded default is a credential in git). The
// script refuses to start without it, before touching the database. It is a
// one-time bootstrap credential, force-changed on first login
// (mustChangePassword=true); on a re-run against an existing admin the value is
// hashed but never written (`update: {}`).

import bcrypt from 'bcryptjs';

import { PrismaClient, Role } from '../src/generated';
import {
  seedAppConfig,
  seedMonthlyLimits,
  seedStanowiskoRoles,
  seedTrailerTypes,
} from './seed-data';

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12; // matches docs/15-auth-strategy.md
const ADMIN_EMAIL = 'danyil.fiut@magtrans.eu';

/** Reads SEED_ADMIN_PASSWORD or throws — no fallback, see the header comment. */
function requireAdminPassword(): string {
  const value = process.env.SEED_ADMIN_PASSWORD;
  if (value === undefined || value.trim() === '') {
    throw new Error(
      'SEED_ADMIN_PASSWORD is not set (or is empty). Pass the initial admin password explicitly, e.g. ' +
        "`docker compose ... run --rm -T -e SEED_ADMIN_PASSWORD='<strong-password>' api " +
        'node_modules/.bin/tsx prisma/seed.prod.ts`. Nothing was written.',
    );
  }
  return value;
}

async function seedFirstAdmin(prismaClient: PrismaClient, adminPassword: string): Promise<string> {
  const passwordHash = await bcrypt.hash(adminPassword, BCRYPT_ROUNDS);
  await prismaClient.user.upsert({
    where: { email: ADMIN_EMAIL },
    create: {
      login: 'admin',
      email: ADMIN_EMAIL,
      name: 'Danyil Fiut',
      role: Role.admin,
      passwordHash,
      active: true,
      mustChangePassword: true,
      // Explicit, though it is also the column default: the break-glass admin
      // must stay out of the directory reconcile's reach (docs/24 decision #4).
      managedBy: 'local',
    },
    // Never overwrite an existing admin — don't reset the password or re-flip
    // mustChangePassword on a re-run.
    update: {},
  });
  return ADMIN_EMAIL;
}

async function main(): Promise<void> {
  // Fail fast BEFORE any write, so a missing env var never leaves a half-seeded DB.
  const adminPassword = requireAdminPassword();
  const configCount = await seedAppConfig(prisma);
  const trailerTypeCount = await seedTrailerTypes(prisma);
  const monthlyLimitCount = await seedMonthlyLimits(prisma);
  const stanowiskoRoleCount = await seedStanowiskoRoles(prisma);
  const adminEmail = await seedFirstAdmin(prisma, adminPassword);

  console.log('');
  console.log('Production bootstrap complete:');
  console.log(`Seeded AppConfig:    ${configCount} keys`);
  console.log(`Seeded TrailerType:  ${trailerTypeCount} entries`);
  console.log(`Seeded MonthlyLimit: ${monthlyLimitCount} rows`);
  console.log(`Seeded stanowiska:   ${stanowiskoRoleCount} role mappings`);
  console.log(`Seeded admin:        ${adminEmail} (password change forced on first login)`);
  console.log('');
}

main()
  .catch((err) => {
    console.error('[seed:prod] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
