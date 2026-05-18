// Carrier-side submission gates — single source of truth.
//
// Lives in `@magguarantee/shared` so the web (Next.js form preview) and the
// api (NestJS controller / service) evaluate the SAME predicates with the
// SAME message strings. AppConfig values are read in the api layer and
// forwarded as parameters; this module must remain Prisma-free and Nest-free
// (per docs/11-folder-structure.md — shared has no runtime ties).
//
// Three independent rules live here:
//   1. `roundDays(hours)`            — canonical hours→days rounding (2 dp).
//   2. `canSubmitByDuration(...)`    — hours-only gate: roundedDays must be
//                                      STRICTLY greater than the threshold.
//                                      Returns RFC-7807-ready Polish messages.
//   3. `cooldownCheck(...)`          — 6-day-per-vehicle anti-spam gate
//                                      (boundary inclusive: 144h passes).
//
// All functions are pure: no Date.now(), no globals, no I/O. Time is always
// injected by the caller so unit tests are deterministic. Polish copy is
// rendered with Intl in the `Europe/Warsaw` zone so the carrier always sees
// his own local clock regardless of where the api process runs.

// ─── Defaults (mirror seed.ts AppConfig entries) ─────────────

/**
 * Defaults match the `AppConfig` rows seeded at
 * `packages/database/prisma/seed.ts`. They exist so callers (tests,
 * preview UIs without an AppConfig fetch) can build a sensible input without
 * round-tripping to the database. The api layer overrides these from
 * AppConfig on every request — never trust the defaults in prod code paths.
 */
export const DEFAULTS = {
  workedDaysThreshold: 9,
  vehicleCooldownDays: 6,
} as const;

// ─── Internals ───────────────────────────────────────────────

const TZ_WARSAW = 'Europe/Warsaw';
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const DAYS_FORMATTER = new Intl.NumberFormat('pl-PL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const DATETIME_FORMATTER = new Intl.DateTimeFormat('pl-PL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TZ_WARSAW,
});

/**
 * Parse `'YYYY-MM-DD'` as a UTC-midnight Date. We use UTC so calendar-span
 * arithmetic (`end - start`) never sees a DST jump that would silently
 * shorten or lengthen the span by an hour. Returns null on malformed input.
 */
function parseIsoDateUtc(s: string): Date | null {
  if (typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(d.getTime()) ||
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return d;
}

// ─── Public API: rounding + formatting ───────────────────────

/**
 * Convert work-hours to fractional days, rounded to 2 decimals.
 *
 * Formula: `Math.round((hours / 24) * 100) / 100`.
 *
 * - `roundDays(107.1) === 4.46`
 * - `roundDays(216)   === 9`
 * - `roundDays(216.24) === 9.01`
 *
 * Negative input is clamped to `0` rather than thrown so the caller (a
 * form preview) never crashes on a typo — undefined behavior contract per
 * the user spec, but we pick the safe value.
 */
export function roundDays(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return Math.round((hours / 24) * 100) / 100;
}

/**
 * Format a day-count for display in pl-PL locale (comma as decimal sep,
 * always 2 fractional digits — matches the rest of the Carrier UI).
 *
 * - `formatDaysPl(4.46) === '4,46'`
 * - `formatDaysPl(10)   === '10,00'`
 */
export function formatDaysPl(days: number): string {
  const safe = Number.isFinite(days) ? days : 0;
  return DAYS_FORMATTER.format(safe);
}

// ─── Public API: duration gate ───────────────────────────────

/**
 * Result of the duration gate. `ok: false` carries a `reason` discriminator
 * and a fully-rendered Polish message so the controller can pass it straight
 * to the RFC-7807 envelope without further string work.
 */
export type SubmitGateResult =
  | { ok: true }
  | { ok: false; reason: 'duration_insufficient'; message: string };

/**
 * Authoritative carrier rule: a claim may be submitted iff `totalDays`
 * (the post-adjustment working-days total from `calcKmGwarantPerMonth`) is
 * STRICTLY GREATER than `workedDaysThreshold` — so exactly `9.00` does NOT
 * pass when the threshold is 9; `9.01` does.
 *
 * `totalDays` must come from km-calc, not from the raw form input. The
 * carrier-side "Korekta godzin" (hoursAdjusted) field is a *correction*
 * deducted from the route hours per month, not a working-hours total — using
 * it directly would always report 0 unless the carrier filled in stoppage
 * time. The api reads `calc.totalDays` from the same km-calc that drives
 * the right-hand "DNI ROB." breakdown the carrier sees on screen.
 *
 * The earlier calendar-span branch was removed because reaching > 9 worked
 * days within fewer than 10 calendar days requires > 24 hours/day, which is
 * physically impossible. Span was the load-bearing branch, so we collapse
 * the rule to the only signal that actually changes behavior on real data.
 */
export function canSubmitByDuration(input: {
  totalDays: number;
  workedDaysThreshold: number;
}): SubmitGateResult {
  const { totalDays, workedDaysThreshold } = input;
  const days = Number.isFinite(totalDays) && totalDays > 0 ? totalDays : 0;

  if (days > workedDaysThreshold) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: 'duration_insufficient',
    message: buildDurationMessage({ days, workedDaysThreshold }),
  };
}

function buildDurationMessage(opts: {
  days: number;
  workedDaysThreshold: number;
}): string {
  const threshold = formatDaysPl(opts.workedDaysThreshold);
  const current = formatDaysPl(opts.days);
  return (
    `Wniosek mozna zlozyc dopiero, gdy przepracowano powyzej ${threshold} dni ` +
    `(aktualnie: ${current} dni przepracowanych).`
  );
}

// ─── Public API: vehicle cooldown ────────────────────────────

/**
 * Result of the per-vehicle cooldown gate. On reject we carry both the
 * machine-readable `nextAllowedAt` Date (for the api to put in the
 * problem-details `extensions`) and a pre-rendered Polish message for the
 * web form.
 */
export type CooldownResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'vehicle_cooldown';
      nextAllowedAt: Date;
      message: string;
    };

/**
 * Compute the earliest moment a new claim is allowed on a vehicle whose
 * previous (non-ODRZUCONO) claim was created at `lastCreatedAt`.
 *
 * Boundary policy: cooldown is `cooldownDays * 24h` AFTER `lastCreatedAt`.
 * Exactly hitting the boundary (`now - last === cooldownDays * 24h`) is
 * allowed — see `cooldownCheck` for the comparison.
 *
 * Negative cooldowns are clamped to 0 (no-op).
 */
export function nextAllowedSubmitAt(
  lastCreatedAt: Date,
  cooldownDays: number,
): Date {
  const safeDays = Number.isFinite(cooldownDays) && cooldownDays > 0
    ? cooldownDays
    : 0;
  return new Date(lastCreatedAt.getTime() + safeDays * MS_PER_DAY);
}

/**
 * Authoritative carrier rule: a new claim on the same vehicle is rejected
 * if `now - lastCreatedAt < cooldownDays * 24h`. Equality passes (the
 * boundary is inclusive — at exactly 144h the carrier can submit again).
 *
 * `lastCreatedAt = null` means there is no previous non-ODRZUCONO claim for
 * this vehicle → always allowed. The last ODRZUCONO claim is intentionally
 * ignored by the caller (controller filters its query) so the carrier can
 * resubmit a rejected claim immediately.
 */
export function cooldownCheck(input: {
  now: Date;
  lastCreatedAt: Date | null;
  cooldownDays: number;
}): CooldownResult {
  const { now, lastCreatedAt, cooldownDays } = input;

  if (lastCreatedAt === null) return { ok: true };

  const safeDays = Number.isFinite(cooldownDays) && cooldownDays > 0
    ? cooldownDays
    : 0;
  if (safeDays === 0) return { ok: true };

  const elapsedMs = now.getTime() - lastCreatedAt.getTime();
  const requiredMs = safeDays * MS_PER_DAY;

  // Inclusive boundary: `elapsedMs >= requiredMs` is OK.
  if (elapsedMs >= requiredMs) return { ok: true };

  const nextAllowedAt = nextAllowedSubmitAt(lastCreatedAt, safeDays);
  return {
    ok: false,
    reason: 'vehicle_cooldown',
    nextAllowedAt,
    message: `Nastepny wniosek na ten pojazd mozna zlozyc od ${DATETIME_FORMATTER.format(nextAllowedAt)}`,
  };
}
