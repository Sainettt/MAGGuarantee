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
//                                      >= threshold (boundary inclusive — at
//                                      exactly `10.00` the carrier can submit).
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
 *
 * `maxPeriodDays` / `maxDaysAfterUnload` back the date-rule group below
 * (`checkClaimDates`). Both are caller-injectable exactly like
 * `workedDaysThreshold` is for `canSubmitByDuration` — the web form currently
 * hard-codes them (no `GET /app-config` yet) and the api forwards AppConfig.
 */
export const DEFAULTS = {
  workedDaysThreshold: 10,
  vehicleCooldownDays: 6,
  maxPeriodDays: 90,
  maxDaysAfterUnload: 7,
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
 * - `roundDays(239.76) === 9.99`
 * - `roundDays(240)   === 10`
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

/**
 * Convert a day-count → hours and format pl-PL with 2 decimals and an `h`
 * suffix. Used by the `<HoursReadout>` component (docs/14-design-system.md
 * §"Phase 3.1") to render "240,00 h" from a day-count returned by the
 * km-calc engine. Lives next to `formatDaysPl` so both formatters share the
 * same pl-PL `Intl` instance (comma decimal, fixed 2-dp) and the web side
 * never has to re-derive the convention.
 *
 * Non-finite / negative input clamps to `0,00 h` to keep the live-preview
 * label rendering during a half-typed form input rather than crashing.
 *
 * - `formatHoursPl(10)   === '240,00 h'`
 * - `formatHoursPl(8.87) === '212,88 h'`
 * - `formatHoursPl(0)    === '0,00 h'`
 */
export function formatHoursPl(days: number): string {
  const safe = Number.isFinite(days) && days > 0 ? days : 0;
  return `${formatDaysPl(safe * 24)} h`;
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
 * GREATER THAN OR EQUAL TO `workedDaysThreshold` — so exactly `10.00`
 * passes when the threshold is 10; `9.99` does not. Boundary is inclusive.
 *
 * `totalDays` must come from km-calc, not from the raw form input. The
 * carrier-side "Korekta godzin" (hoursAdjusted) field is a *correction*
 * deducted from the route hours per month, not a working-hours total — using
 * it directly would always report 0 unless the carrier filled in stoppage
 * time. The api reads `calc.totalDays` from the same km-calc that drives
 * the right-hand "DNI ROB." breakdown the carrier sees on screen.
 *
 * The earlier calendar-span branch was removed because reaching the worked-
 * days threshold within fewer calendar days requires > 24 hours/day, which
 * is physically impossible. Span was the load-bearing branch, so we collapse
 * the rule to the only signal that actually changes behavior on real data.
 */
export function canSubmitByDuration(input: {
  totalDays: number;
  workedDaysThreshold: number;
}): SubmitGateResult {
  const { totalDays, workedDaysThreshold } = input;
  const days = Number.isFinite(totalDays) && totalDays > 0 ? totalDays : 0;

  if (days >= workedDaysThreshold) {
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
    `Wniosek mozna zlozyc dopiero, gdy przepracowano co najmniej ${threshold} dni ` +
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

// ─── Public API: date-order / future / span / deadline rules ─────────────
//
// WHY THESE DIFFER FROM canSubmitByDuration / cooldownCheck:
// the two gates above are consumed by the *api* — on reject they carry a
// fully-rendered Polish message string that the controller drops verbatim
// into an RFC-7807 problem-details envelope (the api owns no i18n catalog).
//
// The functions below are consumed by the *web* carrier form, which owns the
// next-intl catalog (apps/web/messages/{pl,en}.json). Rendering Polish prose
// here would (a) duplicate the EN translations the form already maintains and
// (b) force the form to string-match prose to localize it. So instead these
// return a discriminated `DateRuleViolation` carrying a STABLE i18n MESSAGE
// KEY + interpolation params; the web maps `key` → `tForm(key, params)`.
//
// Like the gates above, all functions are pure: "today" is INJECTED by the
// caller (no `new Date()` with no args), so unit tests are deterministic and
// the timezone decision (the web passes today-in-Europe/Warsaw) lives at the
// call site, not buried here. `today` is a `'YYYY-MM-DD'` ISO calendar date.

/**
 * A single date-rule violation. `key` is the next-intl message key (relative
 * to the form's `carrier.claims.form` namespace) and `params` are the ICU
 * interpolation values that key expects. Never pre-rendered prose.
 *
 * The `code` discriminator is a stable machine identifier so callers can also
 * branch on the rule without parsing the i18n key.
 */
export type DateRuleViolation =
  | { code: 'date_order'; key: 'violationDateOrder'; params: Record<string, never> }
  | {
      code: 'date_start_future';
      key: 'violationDateStartInFuture';
      params: { date: string };
    }
  | {
      code: 'date_end_future';
      key: 'violationDateEndInFuture';
      params: { date: string };
    }
  | {
      code: 'period_too_long';
      key: 'violationPeriodTooLong';
      params: { maxDays: number; periodDays: number };
    }
  | {
      code: 'deadline_passed';
      key: 'violationDeadline';
      params: { maxDays: number; elapsed: number };
    };

/** `'YYYY-MM-DD'` shape guard — mirrors `z.string().date()` strictness. */
function isIsoDate(s: unknown): s is string {
  return parseIsoDateUtc(typeof s === 'string' ? s : '') !== null;
}

/** Inclusive calendar-day span between two UTC-midnight dates. */
function daysBetweenInclusiveUtc(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY) + 1;
}

/** Non-inclusive calendar-day delta between two UTC-midnight dates. */
function daysBetweenUtc(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/**
 * Evaluate ALL carrier date rules in one pass and return the ordered list of
 * violations (empty ⇒ the dates are acceptable). Mirrors the tier-1 pre-calc
 * checks the api runs in `ClaimsService.submit` and the inline
 * `clientViolations` the web form used to compute by hand.
 *
 * Inputs are the RAW form strings — `dateStart` / `dateEnd` may be empty or
 * malformed mid-edit; this function silently skips any rule whose operands
 * aren't valid ISO dates yet (so a half-filled form produces no noise), which
 * is exactly why Bug 1 (premature date-order error) cannot recur here.
 *
 * Rules (order = display order):
 *   1. date order — start <= end
 *   2. future — end <= today, then start <= today
 *   3. period span — inclusive span <= maxPeriodDays (default 90)
 *   4. deadline — end within maxDaysAfterUnload (default 7) days of today
 *
 * Rules 3 & 4 are only meaningful once order holds, so they're skipped while
 * start > end (the order violation already tells the carrier what to fix).
 */
export function checkClaimDates(input: {
  dateStart: string;
  dateEnd: string;
  /** Today as `'YYYY-MM-DD'` in the business timezone — INJECTED by caller. */
  today: string;
  maxPeriodDays?: number;
  maxDaysAfterUnload?: number;
}): DateRuleViolation[] {
  const maxPeriodDays = input.maxPeriodDays ?? DEFAULTS.maxPeriodDays;
  const maxDaysAfterUnload =
    input.maxDaysAfterUnload ?? DEFAULTS.maxDaysAfterUnload;

  const start = isIsoDate(input.dateStart)
    ? parseIsoDateUtc(input.dateStart)
    : null;
  const end = isIsoDate(input.dateEnd) ? parseIsoDateUtc(input.dateEnd) : null;
  const today = isIsoDate(input.today) ? parseIsoDateUtc(input.today) : null;

  // Need both endpoints to say anything about the pair. Future checks need
  // `today` too. If a single field is present we have no relation to test.
  if (!start || !end) return [];

  const out: DateRuleViolation[] = [];
  const orderOk = start.getTime() <= end.getTime();

  if (!orderOk) {
    out.push({ code: 'date_order', key: 'violationDateOrder', params: {} });
  }

  if (today) {
    if (end.getTime() > today.getTime()) {
      out.push({
        code: 'date_end_future',
        key: 'violationDateEndInFuture',
        params: { date: input.dateEnd },
      });
    }
    if (start.getTime() > today.getTime()) {
      out.push({
        code: 'date_start_future',
        key: 'violationDateStartInFuture',
        params: { date: input.dateStart },
      });
    }
  }

  // Span + deadline only make sense once the period is well-ordered.
  if (orderOk) {
    const periodDays = daysBetweenInclusiveUtc(start, end);
    if (periodDays > maxPeriodDays) {
      out.push({
        code: 'period_too_long',
        key: 'violationPeriodTooLong',
        params: { maxDays: maxPeriodDays, periodDays },
      });
    }
    if (today) {
      const elapsed = daysBetweenUtc(end, today);
      if (elapsed > maxDaysAfterUnload) {
        out.push({
          code: 'deadline_passed',
          key: 'violationDeadline',
          params: { maxDays: maxDaysAfterUnload, elapsed },
        });
      }
    }
  }

  return out;
}
