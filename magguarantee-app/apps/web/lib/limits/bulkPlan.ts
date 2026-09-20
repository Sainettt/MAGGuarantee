// `<BulkLimitsDialog>` planning logic (docs/14 §16.4) — everything the dialog
// needs to answer "what exactly will this button write?" WITHOUT touching
// React.
//
// The bulk operation has THREE outcomes per field (set / disable / leave
// alone), which is why the dialog uses a <Select> per km field rather than the
// row's checkbox — a checkbox cannot express "don't touch". The same three-way
// action drives the mandatory per-month «Obecnie → Po zmianie» summary built
// here: overwriting twelve months with one click is irreversible, so the user
// sees each cell's before/after first.
//
// Pure, framework-free, unit-tested (`bulkPlan.test.ts`).

import type { MonthlyLimitDto } from '@magguarantee/shared';

import { parseLimitInput } from './limitState';

export type BulkRangeMode = 'all' | 'range' | 'custom';
export type BulkFieldAction = 'none' | 'set' | 'disable';

export interface BulkFormValues {
  mode: BulkRangeMode;
  /** `range` mode bounds (1..12). Reversed bounds are swapped silently. */
  from: number;
  to: number;
  /** `custom` mode selection (1..12, any order). */
  months: number[];
  kmPerDayAction: BulkFieldAction;
  kmPerDayValue: string;
  kmPerSaturdayAction: BulkFieldAction;
  kmPerSaturdayValue: string;
  /** Empty string ⇒ "bez zmian" (the rate has no on/off state, §16.1). */
  ratePerKm: string;
}

export interface BulkPayload {
  kmPerDay?: number;
  kmPerSaturday?: number;
  ratePerKm?: number;
}

export type BulkPayloadResult =
  | { ok: true; payload: BulkPayload }
  | { ok: false; error: 'valueRequired' | 'noChanges' };

const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/** The months the operation addresses — always sorted, always deduped. */
export function resolveMonths(values: BulkFormValues): number[] {
  if (values.mode === 'all') return [...ALL_MONTHS];
  if (values.mode === 'range') {
    const lo = Math.min(values.from, values.to);
    const hi = Math.max(values.from, values.to);
    const out: number[] = [];
    for (let m = lo; m <= hi; m += 1) out.push(m);
    return out;
  }
  return [...new Set(values.months)].sort((a, b) => a - b);
}

/**
 * Build the wire payload. An omitted key means "leave that column alone" —
 * NEVER `null` (§16.3 hard rule: no UI path writes NULL).
 */
export function buildBulkPayload(values: BulkFormValues): BulkPayloadResult {
  const payload: BulkPayload = {};

  const km = fieldValue(values.kmPerDayAction, values.kmPerDayValue);
  if (km === 'invalid') return { ok: false, error: 'valueRequired' };
  if (km !== undefined) payload.kmPerDay = km;

  const sat = fieldValue(values.kmPerSaturdayAction, values.kmPerSaturdayValue);
  if (sat === 'invalid') return { ok: false, error: 'valueRequired' };
  if (sat !== undefined) payload.kmPerSaturday = sat;

  const rate = parseLimitInput(values.ratePerKm);
  if (rate.kind === 'invalid') return { ok: false, error: 'valueRequired' };
  if (rate.kind === 'value') payload.ratePerKm = rate.value;

  if (
    payload.kmPerDay === undefined &&
    payload.kmPerSaturday === undefined &&
    payload.ratePerKm === undefined
  ) {
    return { ok: false, error: 'noChanges' };
  }
  return { ok: true, payload };
}

function fieldValue(
  action: BulkFieldAction,
  raw: string,
): number | undefined | 'invalid' {
  if (action === 'none') return undefined;
  if (action === 'disable') return 0;
  const parsed = parseLimitInput(raw);
  // "Włącz i ustaw wartość" with an empty box is an error, NOT a silent zero —
  // a silent zero would reproduce the very ambiguity this feature removes.
  if (parsed.kind !== 'value') return 'invalid';
  return parsed.value;
}

// ── Per-month summary ───────────────────────────────────────────────

/**
 * A single cell of the «Obecnie → Po zmianie» table. `none` / `disabled` exist
 * so the "Obecnie" column is NEVER an empty cell (§16.4) — emptiness is what
 * hides the 540 fallback.
 */
export type BulkCellValue =
  | { kind: 'none' }
  | { kind: 'disabled' }
  | { kind: 'number'; value: number }
  | { kind: 'noChange' };

export interface BulkSummaryCell {
  current: BulkCellValue;
  next: BulkCellValue;
  changed: boolean;
}

export interface BulkSummaryRow {
  month: number;
  kmPerDay: BulkSummaryCell;
  kmPerSaturday: BulkSummaryCell;
  ratePerKm: BulkSummaryCell;
  /** At least one column actually moves. */
  changed: boolean;
  /** At least one column that moves currently holds a value (B or C). */
  overwrites: boolean;
}

export interface BulkSummary {
  rows: BulkSummaryRow[];
  /** Months where something actually changes. */
  changedCount: number;
  /** Selected months where nothing changes. */
  noopCount: number;
  /** Months whose existing (non-NULL) values get overwritten. */
  overwriteCount: number;
}

export function buildBulkSummary(
  months: readonly number[],
  rowsByMonth: ReadonlyMap<number, MonthlyLimitDto>,
  payload: BulkPayload,
): BulkSummary {
  const rows = months.map((month) => {
    const row = rowsByMonth.get(month) ?? null;
    const kmPerDay = cell(row?.kmPerDay ?? null, payload.kmPerDay, true);
    const kmPerSaturday = cell(
      row?.kmPerSaturday ?? null,
      payload.kmPerSaturday,
      true,
    );
    const ratePerKm = cell(row?.ratePerKm ?? null, payload.ratePerKm, false);
    const cells = [kmPerDay, kmPerSaturday, ratePerKm];
    return {
      month,
      kmPerDay,
      kmPerSaturday,
      ratePerKm,
      changed: cells.some((c) => c.changed),
      overwrites: cells.some(
        (c) => c.changed && c.current.kind !== 'none',
      ),
    } satisfies BulkSummaryRow;
  });

  return {
    rows,
    changedCount: rows.filter((r) => r.changed).length,
    noopCount: rows.filter((r) => !r.changed).length,
    overwriteCount: rows.filter((r) => r.overwrites).length,
  };
}

function cell(
  current: number | null,
  next: number | undefined,
  offable: boolean,
): BulkSummaryCell {
  const currentValue = describe(current, offable);
  if (next === undefined) {
    return { current: currentValue, next: { kind: 'noChange' }, changed: false };
  }
  const nextValue = describe(next, offable);
  return {
    current: currentValue,
    next: nextValue,
    changed: !sameCell(currentValue, nextValue),
  };
}

function describe(value: number | null, offable: boolean): BulkCellValue {
  if (value == null) return { kind: 'none' };
  // `0` on a km column is "switched off"; on the rate column it is just a
  // price of zero — the rate has no off state (§16.1).
  if (offable && value === 0) return { kind: 'disabled' };
  return { kind: 'number', value };
}

function sameCell(a: BulkCellValue, b: BulkCellValue): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'number' && b.kind === 'number') return a.value === b.value;
  return true;
}
