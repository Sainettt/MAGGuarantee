// EU calendar — Easter computation + heavy-vehicle ban days across the EU.
//
// Faithful port of `calcEasterGS` and `getEUBanDaysGS` from `Code.gs:5908+`.
// Pure TypeScript: no Node, Nest, Prisma or date-fns imports — both the API
// (NestJS) and the web (Next.js) bundle the same code.
//
// Convention: dates returned by these helpers are *calendar* dates with no
// timezone semantics. Internally we use `new Date(year, month, day)` which
// produces a local-time midnight Date; downstream code only ever reads
// `getFullYear/getMonth/getDate` so DST and offset don't affect the keys.

/**
 * Compute Western (Gregorian) Easter Sunday for a given year, using
 * Gauss's algorithm — same formulae and intermediate variables as the
 * GAS reference at `Code.gs:5908`. Returns a local-midnight Date.
 */
export function calcEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// ─── Fixed national / EU bans (port of `getEUBanDaysGS`) ───────────

/**
 * Fixed-date heavy-vehicle ban days across DE, IT, AT, FR, BE, NL, LU, PL.
 * Mirrors the exact list at `Code.gs:5930-5939`.
 */
const FIXED_BANS: ReadonlyArray<readonly [month: number, day: number, label: string]> = [
  [1, 1, 'Nowy Rok'],
  [1, 6, 'Trzech Kroli (DE/IT/AT)'],
  [5, 1, 'Swieto Pracy'],
  [6, 2, 'Dzien Republiki (IT)'],
  [7, 14, 'Dzien Bastylii (FR)'],
  [7, 21, 'Dzien Belgii (BE)'],
  [8, 15, 'Wniebowziecie NMP'],
  [10, 3, 'Dzien Jednosci (DE)'],
  [10, 26, 'Dzien Narodowy (AT)'],
  [11, 1, 'Wszystkich Swietych'],
  [11, 11, 'Dzien Niepodleglosci (FR/BE)'],
  [12, 8, 'Niepokalane Poczecie (IT/AT)'],
  [12, 25, 'Boze Narodzenie'],
  [12, 26, 'Sw. Szczepana'],
];

/**
 * Easter-relative bans (offset in days from Easter Sunday).
 * Mirrors the list at `Code.gs:5948-5954`.
 */
const EASTER_RELATIVE_BANS: ReadonlyArray<readonly [offset: number, label: string]> = [
  [-2, 'Wielki Piatek (DE/NL)'],
  [1, 'Poniedzialek Wielkanocny'],
  [39, 'Wniebowstapienie'],
  [50, 'Poniedzialek Zielonych Swiatek'],
  [60, 'Boze Cialo (DE/AT/IT)'],
];

/**
 * `YYYY-MM-DD` formatter — distinct from the `dd.MM.yyyy` GAS used,
 * but only ever consumed internally. Pure date arithmetic; no TZ parsing.
 */
export function fmtIsoDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${m < 10 ? '0' : ''}${m}-${day < 10 ? '0' : ''}${day}`;
}

/**
 * Returns a map of `YYYY-MM-DD` → human label for EU heavy-vehicle ban days
 * across the given inclusive year range. The label is the same string
 * persisted on the holiday tables above (`'Nowy Rok'`, `'Wielki Piatek (DE/NL)'`,
 * …) so callers can render WHY a particular day was excluded.
 *
 * By default (`includeSaturdays = false`) any holiday whose date falls on a
 * Saturday or Sunday is dropped — matches `Code.gs:5943` and `Code.gs:5959`.
 * Reason: the weekday branch of km-calc already excludes weekends, so listing
 * them as bans would be redundant for that path.
 *
 * The per-week Saturday guarantee (`kmPerSaturday`, see `km-calc.ts`) needs
 * to know which *Saturday* holidays land inside a period so a guaranteed
 * Saturday that falls on a ban day is NOT paid. Pass `includeSaturdays = true` to keep Saturday
 * holidays in the map (Sundays are still dropped — they are always skipped by
 * km-calc regardless). km-calc itself routes weekday vs Saturday lookups, so a
 * single map carrying Saturday holidays never affects the weekday counting
 * (that branch is gated on `!isWeekend`).
 */
export function getEUBanDays(
  yearFrom: number,
  yearTo: number,
  includeSaturdays = false,
): Map<string, string> {
  const bans = new Map<string, string>();
  if (yearFrom > yearTo) return bans;

  // When Saturdays are wanted only Sunday (dow 0) is dropped; otherwise both
  // weekend days are dropped (legacy default).
  const isDropped = (dow: number): boolean =>
    includeSaturdays ? dow === 0 : dow === 0 || dow === 6;

  for (let y = yearFrom; y <= yearTo; y++) {
    for (const [month, day, label] of FIXED_BANS) {
      const dd = new Date(y, month - 1, day);
      if (!isDropped(dd.getDay())) {
        bans.set(fmtIsoDateKey(dd), label);
      }
    }
    const easter = calcEaster(y);
    for (const [offset, label] of EASTER_RELATIVE_BANS) {
      const dd2 = new Date(easter);
      dd2.setDate(dd2.getDate() + offset);
      if (!isDropped(dd2.getDay())) {
        bans.set(fmtIsoDateKey(dd2), label);
      }
    }
  }
  return bans;
}
