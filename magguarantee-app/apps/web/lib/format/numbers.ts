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

/** "€ 1 250,00" — used in table doplata column and recalc badge. */
export function formatEur(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `€ ${PL_NUM.format(value)}`;
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
