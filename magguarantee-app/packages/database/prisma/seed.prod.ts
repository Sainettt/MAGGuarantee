// Production bootstrap — run ONCE manually via `npm run seed:prod`.
//
// Seeds ONLY the reference data a fresh production database needs to boot
// (AppConfig keys, TrailerType catalog, MonthlyLimit placeholders) plus the
// first admin account. NO fake users, NO demo carrier/vehicle/teams.
//
// Idempotent: every write is an upsert, so an accidental re-run is a no-op. In
// particular the admin upsert uses `update: {}` — re-running never resets the
// password or re-flips mustChangePassword on an existing admin.
//
// The admin password comes from SEED_ADMIN_PASSWORD; the fallback is a one-time
// bootstrap credential, force-changed on first login (mustChangePassword=true).

import bcrypt from 'bcryptjs';

import { PrismaClient, Role } from '../src/generated';
import {
  seedAppConfig,
  seedMonthlyLimits,
  seedTrailerTypes,
} from './seed-data';

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12; // matches docs/15-auth-strategy.md
const ADMIN_EMAIL = 'danyil.fiut@magtrans.eu';
// Fallback is a one-time bootstrap credential — force-changed on first login.
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'MagTrans%2026';

async function seedFirstAdmin(prismaClient: PrismaClient): Promise<string> {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS);
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
    },
    // Never overwrite an existing admin — don't reset the password or re-flip
    // mustChangePassword on a re-run.
    update: {},
  });
  return ADMIN_EMAIL;
}

async function main(): Promise<void> {
  const configCount = await seedAppConfig(prisma);
  const trailerTypeCount = await seedTrailerTypes(prisma);
  const monthlyLimitCount = await seedMonthlyLimits(prisma);
  const adminEmail = await seedFirstAdmin(prisma);

  console.log('');
  console.log('Production bootstrap complete:');
  console.log(`Seeded AppConfig:    ${configCount} keys`);
  console.log(`Seeded TrailerType:  ${trailerTypeCount} entries`);
  console.log(`Seeded MonthlyLimit: ${monthlyLimitCount} rows`);
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
