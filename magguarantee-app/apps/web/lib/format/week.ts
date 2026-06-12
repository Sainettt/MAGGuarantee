// ISO-week helpers for the km-board / km-report week navigator (Phase 7.7).
//
// The week param is the URL source of truth (`?week=YYYY-Www`, contract §0′).
// All math is done in UTC against the date-only (`YYYY-MM-DD`) parts so it is
// timezone-stable — a board cell's `date` is a calendar day, never an instant.
// No date-fns dependency (the web app doesn't ship one); these are tiny pure
// functions covering exactly what the navigator needs.

/** Parses `YYYY-MM-DD` into a UTC-midnight Date. */
function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Formats a UTC Date back to `YYYY-MM-DD`. */
function toIsoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(
    date.getUTCDate(),
  )}`;
}

/** Today as `YYYY-MM-DD` in the local zone (matches the cell `date` semantics). */
export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(
    now.getDate(),
  )}`;
}

/** Monday (ISO weekday 1) of the week containing the given `YYYY-MM-DD`. */
export function mondayOf(iso: string): string {
  const date = parseIsoDate(iso);
  // getUTCDay: 0=Sun..6=Sat. ISO Monday offset: Sun→-6, else 1-day.
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return toIsoDate(date);
}

/** ISO week number (1..53) + ISO-week-year of a `YYYY-MM-DD`. */
export function isoWeek(iso: string): { week: number; year: number } {
  const date = parseIsoDate(iso);
  // ISO 8601: week belongs to the year of its Thursday.
  const day = date.getUTCDay() || 7; // Sun→7
  date.setUTCDate(date.getUTCDate() + 4 - day); // shift to Thursday
  const year = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return { week, year };
}

/** «W24/2026» — ISO-week label for the header tile. */
export function isoWeekLabel(iso: string): string {
  const { week, year } = isoWeek(iso);
  return `W${pad2(week)}/${year}`;
}

/** «2026-W24» — the `?week=` query value for a Monday. */
export function isoWeekParam(iso: string): string {
  const { week, year } = isoWeek(iso);
  return `${year}-W${pad2(week)}`;
}

/** Resolves a `?week=YYYY-Www` (or null) to its Monday `YYYY-MM-DD`. */
export function weekParamToMonday(param: string | null): string {
  if (param) {
    const match = /^(\d{4})-W(\d{2})$/.exec(param);
    if (match) {
      const year = Number(match[1]);
      const week = Number(match[2]);
      // The Monday of ISO week N: start from Jan 4 (always in week 1), find its
      // Monday, then add (N-1) weeks.
      const jan4Monday = parseIsoDate(mondayOf(`${year}-01-04`));
      jan4Monday.setUTCDate(jan4Monday.getUTCDate() + (week - 1) * 7);
      return toIsoDate(jan4Monday);
    }
  }
  return mondayOf(todayIso());
}

/** Adds `weeks` (may be negative) to a Monday `YYYY-MM-DD`, returns the new Monday. */
export function addWeeks(mondayIso: string, weeks: number): string {
  const date = parseIsoDate(mondayIso);
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return toIsoDate(date);
}

/** The 7 `YYYY-MM-DD` days Mon..Sun of the week starting at `mondayIso`. */
export function weekDays(mondayIso: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayIso, i));
}

/** Adds `days` to a `YYYY-MM-DD`. */
export function addDays(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

/** Inclusive day count between two `YYYY-MM-DD` (calendar days, [from..to]). */
export function inclusiveDayCount(fromIso: string, toIso: string): number {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

/** The list of `YYYY-MM-DD` days in the inclusive span [from..to]. */
export function daySpan(fromIso: string, toIso: string): string[] {
  const n = Math.max(0, inclusiveDayCount(fromIso, toIso));
  return Array.from({ length: n }, (_, i) => addDays(fromIso, i));
}

/** «DD.MM» — short day label for a `YYYY-MM-DD`. */
export function formatDayMonth(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

/** «DD.MM.YYYY» — full day label for a `YYYY-MM-DD` (km-cell editor header). */
export function formatDayMonthYear(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

/** Weekday index 0=Mon..6=Sun for a `YYYY-MM-DD` (for the i18n weekday keys). */
export function weekdayIndexMonFirst(iso: string): number {
  const day = parseIsoDate(iso).getUTCDay(); // 0=Sun..6=Sat
  return day === 0 ? 6 : day - 1;
}
