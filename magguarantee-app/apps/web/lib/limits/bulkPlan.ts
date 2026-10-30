// Bulk editing planning (docs/14 §18.6.2) — everything the multi-week panel
// needs to answer "what exactly will «Zastosuj do N tygodni» write?" WITHOUT
// touching React: the payload, the per-week «Obecnie → Po zmianie» rows, the
// in-tile before → after preview and the «Wypełnij wartościami tyg. N» fill.
//
// The operation has THREE outcomes per km field (set / disable / leave alone),
// which is why the panel uses a <Select> per km field rather than a checkbox —
// a checkbox cannot express "don't touch". «Nie ruszaj» and «ustaw 0» are two
// different items. The rate has no on/off state: empty = no change.
//
// Pure, framework-free, unit-tested (`bulkPlan.test.ts`).

import { parseLimitInput, type WeekLimitValues } from './limitState';

export type BulkFieldAction = 'none' | 'set' | 'disable';

export interface BulkFormValues {
  kmPerDayAction: BulkFieldAction;
  kmPerDayValue: string;
  kmPerSaturdayAction: BulkFieldAction;
  kmPerSaturdayValue: string;
  /** Empty string ⇒ "bez zmian" (the rate has no on/off state, §16.1). */
  ratePerKm: string;
}

export const EMPTY_BULK_FORM: BulkFormValues = Object.freeze({
  kmPerDayAction: 'none',
  kmPerDayValue: '',
  kmPerSaturdayAction: 'none',
  kmPerSaturdayValue: '',
  ratePerKm: '',
});

/** The form differs from the untouched default (drives `errorNoChanges`). */
export function isBulkFormTouched(values: BulkFormValues): boolean {
  return (
    values.kmPerDayAction !== 'none' ||
    values.kmPerSaturdayAction !== 'none' ||
    values.ratePerKm.trim() !== ''
  );
}

export interface BulkPayload {
  kmPerDay?: number;
  kmPerSaturday?: number;
  ratePerKm?: number;
}

export type BulkPayloadResult =
  | { ok: true; payload: BulkPayload }
  | { ok: false; error: 'valueRequired' | 'noChanges' };

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

/**
 * «Wypełnij wartościami tyg. N» (fill-down): pre-fill the form from one week.
 * A NULL value becomes «Bez zmian» — NULL is never copied; `0` becomes
 * «Wyłącz (0 km)»; a number becomes «Włącz i ustaw» with that number. Only a
 * pre-fill: nothing is written until «Zastosuj».
 */
export function fillFromWeek(values: WeekLimitValues): BulkFormValues {
  const km = (value: number | null): [BulkFieldAction, string] => {
    if (value == null) return ['none', ''];
    if (value === 0) return ['disable', ''];
    return ['set', String(value)];
  };
  const [kmPerDayAction, kmPerDayValue] = km(values.kmPerDay);
  const [kmPerSaturdayAction, kmPerSaturdayValue] = km(values.kmPerSaturday);
  return {
    kmPerDayAction,
    kmPerDayValue,
    kmPerSaturdayAction,
    kmPerSaturdayValue,
    ratePerKm: values.ratePerKm == null ? '' : String(values.ratePerKm),
  };
}

// ── Per-week summary ────────────────────────────────────────────────

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
  /** Raw stored value (`null` = not configured) — the tile preview reads it. */
  currentRaw: number | null;
  current: BulkCellValue;
  next: BulkCellValue;
  /** The value that would be written, when this field is in the payload. */
  nextRaw?: number;
  changed: boolean;
}

export interface BulkSummaryRow {
  isoWeek: number;
  kmPerDay: BulkSummaryCell;
  kmPerSaturday: BulkSummaryCell;
  ratePerKm: BulkSummaryCell;
  /** At least one column actually moves. */
  changed: boolean;
  /** At least one column that moves currently holds a stored value (B or C). */
  overwrites: boolean;
}

export interface BulkSummary {
  rows: BulkSummaryRow[];
  /** Weeks where something actually changes. */
  changedCount: number;
  /** Selected weeks where nothing changes. */
  noopCount: number;
  /** Weeks whose existing (non-NULL) values get overwritten. */
  overwriteCount: number;
}

export function buildBulkSummary(
  weeks: readonly number[],
  valuesByWeek: (isoWeek: number) => WeekLimitValues,
  payload: BulkPayload,
): BulkSummary {
  const rows = weeks.map((isoWeek) => {
    const current = valuesByWeek(isoWeek);
    const kmPerDay = cell(current.kmPerDay, payload.kmPerDay, 'km');
    const kmPerSaturday = cell(
      current.kmPerSaturday,
      payload.kmPerSaturday,
      'saturday',
    );
    const ratePerKm = cell(current.ratePerKm, payload.ratePerKm, 'rate');
    const cells = [kmPerDay, kmPerSaturday, ratePerKm];
    return {
      isoWeek,
      kmPerDay,
      kmPerSaturday,
      ratePerKm,
      changed: cells.some((c) => c.changed),
      overwrites: cells.some((c) => c.changed && c.currentRaw != null),
    } satisfies BulkSummaryRow;
  });

  return {
    rows,
    changedCount: rows.filter((r) => r.changed).length,
    noopCount: rows.filter((r) => !r.changed).length,
    overwriteCount: rows.filter((r) => r.overwrites).length,
  };
}

type CellKind = 'km' | 'saturday' | 'rate';

function cell(
  current: number | null,
  next: number | undefined,
  kind: CellKind,
): BulkSummaryCell {
  const currentValue = describe(current, kind);
  if (next === undefined) {
    return {
      currentRaw: current,
      current: currentValue,
      next: { kind: 'noChange' },
      changed: false,
    };
  }
  const nextValue = describe(next, kind);
  return {
    currentRaw: current,
    current: currentValue,
    next: nextValue,
    nextRaw: next,
    changed: !sameCell(currentValue, nextValue),
  };
}

function describe(value: number | null, kind: CellKind): BulkCellValue {
  // The Saturday's NULL and 0 are the same thing — "no Saturday guarantee"
  // (its fallback is 0, §18.3) — so switching a NULL Saturday "off" is no
  // change at all and must not be counted (or previewed as «— → —»).
  if (kind === 'saturday') {
    return value == null || value === 0
      ? { kind: 'disabled' }
      : { kind: 'number', value };
  }
  if (value == null) return { kind: 'none' };
  // `0` on km/day is "switched off"; on the rate it is just a price of zero —
  // the rate has no off state (§16.1).
  if (kind === 'km' && value === 0) return { kind: 'disabled' };
  return { kind: 'number', value };
}

function sameCell(a: BulkCellValue, b: BulkCellValue): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'number' && b.kind === 'number') return a.value === b.value;
  return true;
}
