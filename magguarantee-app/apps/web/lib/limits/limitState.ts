// Three-state semantics of a monthly limit column (docs/14 §16.1).
//
//   | DB value        | UI state          | what actually applies        |
//   |-----------------|-------------------|------------------------------|
//   | row missing/NULL| `default`   (A)   | global fallback 540 / 0,50   |
//   | `0`             | `disabled`  (B)   | 0 km — guarantee switched off |
//   | `> 0`           | `active`    (C)   | the configured value          |
//
// EVERY helper here is written so that `0` survives: no `||`, no bare truthy
// test, `??` only. A single `value || 540` in this file would silently pay out
// the guarantee an admin deliberately switched off — that is the whole bug this
// feature exists to kill.
//
// Pure, framework-free, unit-tested (`limitState.test.ts`).

import type { MonthlyLimitDto } from '@magguarantee/shared';

/**
 * Global fallbacks applied by the km-calc engine when a month has no row /
 * a NULL column (`apps/api/src/modules/km-calc/km-calc.service.ts`:
 * `FALLBACK_KM_PER_DAY` / `FALLBACK_RATE_PER_KM`). Duplicated here ONLY to
 * render the "domyślne: 540 km/dz. · 0,50 €/km" hint — they are never used in
 * any calculation on the client. `packages/shared` is frozen for this feature,
 * so they cannot (yet) be imported from a single source.
 */
export const FALLBACK_KM_PER_DAY = 540;
export const FALLBACK_RATE_PER_KM = 0.5;

// ── Input parsing ───────────────────────────────────────────────────

/**
 * Three distinct outcomes — the previous implementation collapsed "empty" into
 * "no change" and rejected `0` as invalid, which is exactly why switching a
 * month off never reached the server.
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

/** Server value → input text. `null` AND `0` both render as an empty buffer. */
export function formatLimitInput(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  return String(value);
}

// ── Row / cell state ────────────────────────────────────────────────

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

export type LimitRowLike = Pick<
  MonthlyLimitDto,
  'kmPerDay' | 'kmPerSaturday'
> | null;

/**
 * The whole month pays nothing: weekdays off AND Saturdays off (a `NULL`
 * Saturday column is behaviourally identical to `0`). Only such a row gets the
 * muted `bg-input/40` surface + the "gwarancja wyłączona" sub-line.
 */
export function isMonthDisabled(row: LimitRowLike): boolean {
  if (row == null) return false;
  return row.kmPerDay === 0 && (row.kmPerSaturday ?? 0) === 0;
}

/** Weekdays off, Saturdays still paying — the month is NOT muted (§16.1). */
export function isMonthSaturdayOnly(row: LimitRowLike): boolean {
  if (row == null) return false;
  return row.kmPerDay === 0 && (row.kmPerSaturday ?? 0) > 0;
}

/**
 * How many months of the rendered year have NO daily configuration at all
 * (missing row or `kmPerDay === NULL`) — drives the page-level
 * `limits.defaultsNotice`. A month with `kmPerDay === 0` is configured.
 */
export function countUnconfiguredMonths(
  rows: readonly MonthlyLimitDto[] | undefined,
  monthsInYear = 12,
): number {
  const configured = new Set<number>();
  for (const row of rows ?? []) {
    if (row.kmPerDay != null) configured.add(row.month);
  }
  let count = 0;
  for (let m = 1; m <= monthsInYear; m += 1) {
    if (!configured.has(m)) count += 1;
  }
  return count;
}
