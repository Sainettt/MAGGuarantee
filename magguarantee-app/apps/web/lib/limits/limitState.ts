// Three-state semantics of a weekly limit value (docs/14 §16.1, §18.3).
//
//   | DB value        | UI state          | what actually applies        |
//   |-----------------|-------------------|------------------------------|
//   | row missing/NULL| `default`   (A)   | shared fallback 540 / 0,50   |
//   | `0`             | `disabled`  (B)   | 0 km — guarantee switched off |
//   | `> 0`           | `active`    (C)   | the configured value          |
//
// Since 2026-10-29 limits are per ISO week (`weekly_limits`) and the fallback
// is applied PER FIELD, so every helper here looks at one value at a time.
// The Saturday is the exception: its fallback is 0, so its NULL and its `0`
// mean the same thing ("no Saturday guarantee") and render the same («—»).
//
// EVERY helper here is written so that `0` survives: no `||`, no bare truthy
// test, `??` only. A single `value || 540` in this file would silently pay out
// the guarantee an admin deliberately switched off — that is the whole bug the
// three-state feature exists to kill.
//
// The fallback numbers are the shared engine constants (`FALLBACK_*` in
// `@magguarantee/shared`) — never a web copy. Here they are only DISPLAYED
// («540 dom.»); no calculation on the client pays anything out.
//
// Pure, framework-free, unit-tested (`limitState.test.ts`).

import {
  FALLBACK_KM_PER_DAY,
  FALLBACK_RATE_PER_KM,
  isoWeeksOfYear,
  type WeeklyLimitDto,
} from '@magguarantee/shared';

// ── Input parsing ───────────────────────────────────────────────────

/**
 * Three distinct outcomes — collapsing "empty" into "no change" and rejecting
 * `0` as invalid is exactly why switching a week off once never reached the
 * server.
 */
export type LimitInputParse =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | { kind: 'value'; value: number };

/**
 * Parse a raw text input into one of the three outcomes. Accepts the PL comma
 * decimal separator. `0` is a first-class VALUE (guarantee off), never
 * `invalid`; only negatives / non-numbers are invalid.
 */
export function parseLimitInput(raw: string): LimitInputParse {
  const trimmed = raw.trim();
  if (trimmed === '') return { kind: 'empty' };
  const normalized = trimmed.replace(',', '.');
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return { kind: 'invalid' };
  return { kind: 'value', value: n };
}

/** Server value → input text. `null` renders as an empty buffer, `0` as "0". */
export function formatLimitInput(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  return String(value);
}

// ── Value state ─────────────────────────────────────────────────────

export type GuaranteeState = 'default' | 'disabled' | 'active';

/** `null`/absent ⇒ A, `0` ⇒ B, anything else ⇒ C. */
export function guaranteeState(
  value: number | null | undefined,
): GuaranteeState {
  if (value == null || !Number.isFinite(value)) return 'default';
  return value === 0 ? 'disabled' : 'active';
}

/** The checkbox answers "does the guarantee apply?" — so NULL is CHECKED. */
export function isGuaranteeChecked(value: number | null | undefined): boolean {
  return guaranteeState(value) !== 'disabled';
}

/** The three limit values of one week (a missing row ⇒ all `null`). */
export type WeekLimitValues = Pick<
  WeeklyLimitDto,
  'kmPerDay' | 'ratePerKm' | 'kmPerSaturday'
>;

export type WeekLimitField = keyof WeekLimitValues;

export const WEEK_LIMIT_FIELDS: readonly WeekLimitField[] = [
  'kmPerDay',
  'kmPerSaturday',
  'ratePerKm',
];

/** A week without a row: every value falls back. */
export const EMPTY_WEEK_VALUES: WeekLimitValues = Object.freeze({
  kmPerDay: null,
  ratePerKm: null,
  kmPerSaturday: null,
});

/** The three values of a row, `null` for a missing row. */
export function weekValues(
  row: WeekLimitValues | null | undefined,
): WeekLimitValues {
  if (row == null) return EMPTY_WEEK_VALUES;
  return {
    kmPerDay: row.kmPerDay,
    ratePerKm: row.ratePerKm,
    kmPerSaturday: row.kmPerSaturday,
  };
}

/**
 * The week pays nothing: weekdays off AND no Saturday (a NULL Saturday is
 * behaviourally identical to `0`). ONLY such a tile is muted (`bg-input/40`,
 * §18.3) — a NULL `kmPerDay` pays the 540 fallback, so it is never muted, and
 * neither is a past week.
 */
export function isWeekDisabled(values: WeekLimitValues): boolean {
  return values.kmPerDay === 0 && (values.kmPerSaturday ?? 0) === 0;
}

/** Weekdays off, the Saturday still paying — NOT muted (§16.1). */
export function isWeekSaturdayOnly(values: WeekLimitValues): boolean {
  return values.kmPerDay === 0 && (values.kmPerSaturday ?? 0) > 0;
}

/**
 * «Nie ma konfiguracji» (§18.3): NULL km/day OR NULL rate. The rate counts
 * too — a NULL rate under configured kilometres silently prices them at the
 * 0,50 fallback, and it used to look like an empty input. The Saturday never
 * counts: its NULL already means "off", there is no hidden payout.
 */
export function isWeekUnconfigured(values: WeekLimitValues): boolean {
  return values.kmPerDay == null || values.ratePerKm == null;
}

/**
 * Week numbers of `isoYear` that are not configured (see
 * {@link isWeekUnconfigured}) — a missing row counts. Drives the page-level
 * `limits.defaultsNotice` and its «Zaznacz te tygodnie».
 */
export function unconfiguredWeeks(
  isoYear: number,
  rows: readonly WeeklyLimitDto[] | undefined,
): number[] {
  const byWeek = new Map<number, WeeklyLimitDto>();
  for (const row of rows ?? []) {
    if (row.isoYear === isoYear) byWeek.set(row.isoWeek, row);
  }
  return isoWeeksOfYear(isoYear)
    .filter((info) => isWeekUnconfigured(weekValues(byWeek.get(info.isoWeek))))
    .map((info) => info.isoWeek);
}

// ── Display descriptors (tile, panel, changes table) ────────────────

/**
 * How one value reads. `default` carries the fallback that applies; `off` is
 * a switched-off km/day; `none` is a Saturday without a guarantee (NULL or 0);
 * `value` is a number — including a rate of `0`, which is a price, not "off".
 */
export type LimitDisplay =
  | { kind: 'default'; value: number }
  | { kind: 'off' }
  | { kind: 'none' }
  | { kind: 'value'; value: number };

export function describeLimit(
  field: WeekLimitField,
  value: number | null | undefined,
): LimitDisplay {
  if (field === 'kmPerSaturday') {
    return value == null || value === 0
      ? { kind: 'none' }
      : { kind: 'value', value };
  }
  if (value == null) {
    return {
      kind: 'default',
      value: field === 'kmPerDay' ? FALLBACK_KM_PER_DAY : FALLBACK_RATE_PER_KM,
    };
  }
  if (field === 'kmPerDay' && value === 0) return { kind: 'off' };
  return { kind: 'value', value };
}

/** km/day that actually applies: NULL ⇒ the 540 fallback, `0` stays `0`. */
export function effectiveKmPerDay(value: number | null | undefined): number {
  return value ?? FALLBACK_KM_PER_DAY;
}

/** km for the Saturday that actually apply: NULL ⇒ 0 (its fallback is "off"). */
export function effectiveKmPerSaturday(value: number | null | undefined): number {
  return value ?? 0;
}

/**
 * «Maks. w tygodniu (bez świąt)» — 5 weekdays + the Saturday (§18.5.1). A
 * typo check for the admin (5400 instead of 540 reads as 27 000 km), never
 * part of any payout.
 */
export function maxWeeklyKm(kmPerDay: number, kmPerSaturday: number): number {
  return 5 * kmPerDay + kmPerSaturday;
}

// ── Number formatting (pl-PL, §18.2) ────────────────────────────────

const KM_FORMAT = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 });
const RATE_FORMAT = new Intl.NumberFormat('pl-PL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

/** `540`, `3 000`, `540,5`. */
export function formatKmValue(value: number): string {
  return KM_FORMAT.format(value);
}

/** `0,50`, `0,525`, `0,5125` — 2 to 4 decimals. */
export function formatRateValue(value: number): string {
  return RATE_FORMAT.format(value);
}

/** Field-aware number format: the rate gets 2–4 decimals, km do not. */
export function formatLimitNumber(field: WeekLimitField, value: number): string {
  return field === 'ratePerKm' ? formatRateValue(value) : formatKmValue(value);
}
