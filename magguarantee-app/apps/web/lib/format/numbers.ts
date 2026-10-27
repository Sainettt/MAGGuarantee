// Display formatters for the employee claims panel. Tiny wrappers around
// `Intl.NumberFormat` / `Intl.DateTimeFormat` — kept here so the table cell
// renderers and the modal stay readable. PL locale is the default (matches
// the panel's default language).

const PL_NUM = new Intl.NumberFormat('pl-PL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const PL_DATE_SHORT = new Intl.DateTimeFormat('pl-PL', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
});

const PL_DATE_FULL = new Intl.DateTimeFormat('pl-PL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const PL_DATE_TIME = new Intl.DateTimeFormat('pl-PL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

// Wall-clock twins of PL_DATE_FULL / PL_DATE_TIME — same fields, pinned to UTC
// so the printed calendar date / clock IS the ISO string's raw UTC part (see
// `formatWallClockDate` below).
const PL_WALL_CLOCK_DATE = new Intl.DateTimeFormat('pl-PL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});

const PL_WALL_CLOCK_DATE_TIME = new Intl.DateTimeFormat('pl-PL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

/** "€ 1 250,00" — used in table doplata column and recalc badge. */
export function formatEur(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `€ ${PL_NUM.format(value)}`;
}

/** "1 250,00" — full km value (pl-PL grouping, 2 dp). Used for the read-only
 *  mileage on the carrier new-claim form. `—` for null/non-finite. */
export function formatKm(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return '—';
  return PL_NUM.format(km);
}

/** "3.2k" — compact km label for table; under 1000 falls back to raw. */
export function formatKmCompact(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return '—';
  if (km >= 1000) {
    return `${(km / 1000).toFixed(1)}k`;
  }
  return Math.round(km).toString();
}

/** "dd.MM.yy" — table period column. */
export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return PL_DATE_SHORT.format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/** "dd.MM.yyyy" — modal header / full-row contexts. */
export function formatDateFull(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return PL_DATE_FULL.format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/** "dd.MM.yyyy, HH:mm" — created/updated timestamps in detail surfaces. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return PL_DATE_TIME.format(new Date(iso));
  } catch {
    return iso.slice(0, 16).replace('T', ' ');
  }
}

// ── Wall-clock / date-only display (UTC-pinned) ──────────────────────────────
//
// The display twins of `actualIsoToDatetimeLocal` (lib/format/datetimeLocal.ts)
// for two kinds of values whose calendar date IS the UTC date part of the ISO:
//
//   • wall-clock LABELLED UTC — `Delegation.actualDepartureAt` /
//     `actualReturnAt` (the weryfikator types 23:30, the api stores
//     `…T23:30:00Z`; docs/19 #16) and `Vehicle.lastDroveAt` when it was copied
//     from `actualReturnAt`;
//   • date-only UTC-midnight values — `YYYY-MM-DD` strings and the
//     `…T00:00:00.000Z` dates the api writes for calendar days (daily-km
//     `lastDroveAt`, the claim period `dateStart` / `dateEnd`).
//
// The browser-local `formatDateFull` / `formatDateTime` above would shift these
// by the viewer's offset (a Warsaw browser prints `2026-10-27T23:30:00Z` as
// 28.10.2026; a browser west of UTC prints `2026-07-15` as 14.07.2026). These
// helpers pin `timeZone: 'UTC'`, so the raw UTC date / clock is printed as-is.
//
// NEVER use them for TRUE instants (`departureAt`, `createdAt`, `verifiedAt`,
// …) — those are correctly rendered browser-local by the helpers above.

/** "dd.MM.yyyy" — wall-clock-labelled-UTC or date-only value, printed verbatim. */
export function formatWallClockDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return PL_WALL_CLOCK_DATE.format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/** "dd.MM.yyyy, HH:mm" — wall-clock-labelled-UTC value, printed verbatim. */
export function formatWallClockDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return PL_WALL_CLOCK_DATE_TIME.format(new Date(iso));
  } catch {
    return iso.slice(0, 16).replace('T', ' ');
  }
}
