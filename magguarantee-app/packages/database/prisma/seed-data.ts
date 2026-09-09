// Shared seed data — used by both the dev/staging seed (prisma/seed.ts) and the
// production one-shot bootstrap (prisma/seed.prod.ts).
//
// This module holds ONLY the reference-data the two seeds have in common:
// AppConfig keys, the TrailerType catalog, the MonthlyLimit placeholders and
// the stanowisko → role mapping the Google SSO reads.
// It deliberately does NOT instantiate a PrismaClient — each seed entrypoint
// owns its own client and passes it into these functions, so a single run never
// opens two clients.
//
// All four functions are idempotent: they upsert on a unique business field
// (config-key / trailer-type-name / (year, month) / stanowisko-code).

import { PrismaClient, Role } from '../src/generated';

// ─── App config ─────────────────────────────────────────

export type AppConfigEntry = {
  key: string;
  value: string;
  description: string;
};

// Auth-related runtime config (Phase 1) + business-rule defaults (Phase 2).
// See docs/15-auth-strategy.md and docs/12-database-schema.md "AppConfig".
export const APP_CONFIG_ENTRIES: AppConfigEntry[] = [
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
  // Phase 2 — claim submission window.
  // NOTE: the old `auth_threshold_low` / `auth_threshold_high` config keys were
  // removed 2026-07-24 together with the manual authorization flow. No code read
  // them — the live over-threshold gate is hardcoded in shared `getAuthThreshold`.
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
// MAGTRANS naczepa catalog. `shortCode` intentionally mirrors `name` for this
// 6-entry set (explicit product spec, not a copy error).

export type SeedTrailerType = {
  name: string;
  shortCode: string;
  description: string;
  active: boolean;
};

export const SEED_TRAILER_TYPES: SeedTrailerType[] = [
  { name: 'STD', shortCode: 'STD', description: 'Naczepa standardowa', active: true },
  { name: 'P-MEGA', shortCode: 'P-MEGA', description: 'Naczepa P-Mega', active: true },
  { name: 'MEGA', shortCode: 'MEGA', description: 'Naczepa Mega', active: true },
  { name: 'IZO', shortCode: 'IZO', description: 'Naczepa izotermiczna', active: true },
  { name: 'CHŁO', shortCode: 'CHŁO', description: 'Naczepa chłodnicza', active: true },
  { name: 'COIL', shortCode: 'COIL', description: 'Naczepa coilmulde (rolki stali)', active: true },
];

// ─── Monthly limits (placeholders) ──────────────────────
// Years 2026 and 2027 × 12 months = 24 rows. Admins edit through UI.
// Keying on (year, month) composite unique → idempotent. Years are pinned
// explicitly (rather than "current + next") so the seed produces the same
// 24 rows regardless of when it runs — important for fixture-based tests
// in Phase 3 km-calc and to match docs/17-migration-roadmap.md Phase 3 scope.

export const MONTHLY_LIMIT_KM_PER_DAY = '540';
export const MONTHLY_LIMIT_RATE_PER_KM = '0.5';
// Guarantee km credited for a single qualifying ("odd") Saturday. Placeholder
// fake-data value (half of kmPerDay=540) — carries NO business meaning, just
// makes the feature demoable. NULL would be treated as 0 by km-calc; we seed a
// non-null value so the odd-Saturday credit shows up out of the box.
export const MONTHLY_LIMIT_KM_PER_SATURDAY = '270';
export const MONTHLY_LIMIT_YEARS = [2026, 2027];

// ─── stanowisko → rola (Google SSO, docs/24 §4) ─────────

export type SeedStanowiskoRole = {
  code: string;
  name: string;
  role: Role;
};

/**
 * Seed content of `StanowiskoRoleMapping` — 6 of the 17 stanowiska MAGSpace
 * publishes. Only positions whose access is unambiguous are mapped; an admin
 * edits the rest through `/employee/sso`.
 *
 * The eleven codes deliberately left out fall into two groups:
 *
 *   - **Manual approval** — `HANDEL_SPEDYTOR`, `HANDEL_LIDER`,
 *     `HANDEL_KIEROWNIK`, `CONTROLLING`. These hold people with different needs
 *     under one job title (CONTROLLING is two people, one `weryfikator` and one
 *     `pracownik`; a couple of `eksport` users sit among the HANDEL planners).
 *     `pracownik`, `weryfikator` and `eksport` gate wniosek verification and
 *     money, so they are never granted by job title — an admin grants them per
 *     person via `User.roleOverride`.
 *   - **No access** — `KAM`, `KAM_KIEROWNIK`, `KIEROWNIK_ODDZIALU`, `IT`,
 *     `WINDYKACJA`, `ASYSTENT`, `REKRUTER`. The last five need either nothing
 *     or a local `admin` account, and `admin` is never derived from a
 *     stanowisko (docs/24 decision #4).
 *
 * A missing row means the sign-in fails with `SSO_NO_ROLE` and the admins are
 * e-mailed — fail-closed by design, not an oversight.
 *
 * `name` is a snapshot of the Polish label MAGSpace serves so the admin table
 * still reads sensibly while the directory is unreachable; the live value wins
 * whenever `/internal/v1/stanowiska` answers.
 */
export const SEED_STANOWISKO_ROLES: SeedStanowiskoRole[] = [
  { code: 'DYSPOZYTOR', name: 'Dyspozytor', role: Role.dyspozytor },
  { code: 'DYSPOZYTOR_KIEROWNIK', name: 'Dyspozytor kierownik', role: Role.dyspozytor },
  { code: 'PLANISTA', name: 'Planista', role: Role.planista },
  { code: 'PLANISTA_LIDER', name: 'Planista lider', role: Role.planista },
  { code: 'PLANISTA_MLODSZY', name: 'Planista młodszy', role: Role.planista },
  // The only source of the `opiekun` role.
  { code: 'DAF', name: 'DAF', role: Role.opiekun },
];

// ─── Seed functions ─────────────────────────────────────
// Each takes the caller-owned PrismaClient so a single seed run uses one client.

export async function seedAppConfig(prisma: PrismaClient): Promise<number> {
  for (const c of APP_CONFIG_ENTRIES) {
    await prisma.appConfig.upsert({
      where: { key: c.key },
      create: { key: c.key, value: c.value, description: c.description },
      update: { value: c.value, description: c.description },
    });
  }
  return APP_CONFIG_ENTRIES.length;
}

export async function seedTrailerTypes(prisma: PrismaClient): Promise<number> {
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

export async function seedMonthlyLimits(prisma: PrismaClient): Promise<number> {
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
          kmPerSaturday: MONTHLY_LIMIT_KM_PER_SATURDAY,
        },
        // Don't overwrite values on rerun — admin may have tuned them.
        update: {},
      });
      count++;
    }
  }
  return count;
}

export async function seedStanowiskoRoles(prisma: PrismaClient): Promise<number> {
  for (const m of SEED_STANOWISKO_ROLES) {
    await prisma.stanowiskoRoleMapping.upsert({
      where: { stanowiskoCode: m.code },
      create: { stanowiskoCode: m.code, stanowiskoName: m.name, role: m.role },
      // Don't overwrite the role on rerun — an admin may have re-pointed it
      // through /employee/sso, and the seed must not silently undo that. The
      // display name is refreshed because it is only a cache of MAGSpace's.
      update: { stanowiskoName: m.name },
    });
  }
  return SEED_STANOWISKO_ROLES.length;
}
