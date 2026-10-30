import { Injectable, Logger } from '@nestjs/common';

import {
  calcKmGwarant,
  FALLBACK_KM_PER_DAY,
  FALLBACK_KM_PER_SATURDAY,
  FALLBACK_RATE_PER_KM,
  formatIsoWeekKey,
  isoWeekOfDate,
  isoWeeksInYear,
  type IsoWeekRef,
  type KmCalcResult,
  type WeekLimit,
} from '@magguarantee/shared';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Tracking input for the service. Mirrors the shape consumed by the engine
 * in `@magguarantee/shared`, but takes ISO date strings only (the API layer
 * is the boundary where Postgres → JSON happens).
 */
export interface KmCalcServiceInput {
  /** `YYYY-MM-DD` (inclusive). */
  dateStart: string;
  /** `YYYY-MM-DD` (inclusive). */
  dateEnd: string;
  /** `HH:mm` or null/undefined. */
  timeFrom?: string | null;
  /** `HH:mm` or null/undefined. */
  timeTo?: string | null;
  /** Optional downtime correction (hours). */
  hoursAdjusted?: number;
  /**
   * Per-week limits SNAPSHOT (`'YYYY-Www' → WeekLimit`) that must win over
   * whatever `weekly_limits` says today. Rebuilt from a wniosek's persisted
   * `Claim.breakdown` via `limitsSnapshotFromBreakdown` so a recalc of an
   * existing wniosek never silently adopts retroactively edited limits
   * (docs/01-overview.md «Заморозка лимитов»).
   *
   * Merge order is PER ISO WEEK: snapshot ▸ live DB row (per field, see
   * `mergeLimits`) ▸ global fallback. A week absent from the snapshot — e.g.
   * the weryfikator moved `dateEnd` into a new week — is priced from the live
   * DB, which is the only data that exists for it.
   */
  limitsSnapshot?: Record<string, WeekLimit>;
}

/**
 * Raw `weekly_limits` row as loaded from the DB. Every column is
 * independently nullable, and `null` ≠ `0`:
 *  - `null` ⇒ NOT configured ⇒ the global fallback fills THAT field in;
 *  - `0`    ⇒ deliberately switched off ⇒ stays `0` all the way into km-calc.
 * See docs/19-known-quirks.md#weeklyLimit-fallback.
 */
export interface StoredWeekLimit {
  kmPerDay: number | null;
  ratePerKm: number | null;
  kmPerSaturday: number | null;
}

/**
 * Optional runtime overrides of the km/day and EUR/km fallbacks. The defaults
 * are the shared engine constants (`FALLBACK_KM_PER_DAY` = 540,
 * `FALLBACK_RATE_PER_KM` = 0.5 — legacy `Code.gs:31-32`), so the api, the web
 * and the engine agree on one value. The Saturday fallback has NO override: it
 * is pinned at `FALLBACK_KM_PER_SATURDAY` (0) — see `_resolveFallback`.
 */
const APP_CONFIG_KEY_KM_PER_DAY = 'km_dziennie_default';
const APP_CONFIG_KEY_RATE_PER_KM = 'stawka_eur_default';

/**
 * Phase 3 — km-calc service, per ISO week since 2026-10-29.
 *
 * Loads the `weekly_limits` rows of the ISO weeks the period touches, builds a
 * `'YYYY-Www' → WeekLimit` map (per-field fallback merge, snapshot wins per
 * week), resolves the fallback (AppConfig override or the shared constants)
 * and delegates to `calcKmGwarant` from `@magguarantee/shared`
 * (docs/01-overview.md §«Расчёт гарантии»).
 *
 * Week enumeration goes through the shared ISO-week helpers (string in /
 * string out, integer day numbers inside), so it never depends on the
 * process `TZ`.
 *
 * Reference: `Code.gs:850-940` (`getMonthLimit` + `calcKmGwarantPerMonth`),
 * with the limits unit moved from months to ISO weeks.
 */
@Injectable()
export class KmCalcService {
  private readonly logger = new Logger(KmCalcService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Compute the km-calc result. Never throws on invalid date ranges — the
   * engine returns an empty result, which the caller is expected to validate
   * (e.g. `kmGuaranteed === 0`) before persisting a claim.
   */
  async calc(input: KmCalcServiceInput): Promise<KmCalcResult> {
    const weeks = isoWeeksOfPeriod(input.dateStart, input.dateEnd);

    // Both reads stay parallel; the per-field fallback merge happens here,
    // AFTER the join, because `_loadWeeklyLimits` must not depend on the
    // fallback (that would serialise the two queries for no reason). An
    // unparseable / inverted range loads nothing — the engine returns its
    // empty shape with the resolved fallback rate (one error path, not two).
    const [stored, fallback] = await Promise.all([
      weeks === null ? Promise.resolve({}) : this._loadWeeklyLimits(weeks),
      this._resolveFallback(),
    ]);

    return calcKmGwarant({
      dateStart: input.dateStart,
      dateEnd: input.dateEnd,
      timeFrom: input.timeFrom ?? null,
      timeTo: input.timeTo ?? null,
      hoursAdjusted: input.hoursAdjusted ?? 0,
      limits: mergeLimits(stored, fallback, input.limitsSnapshot),
      fallback,
    });
  }

  /**
   * Does `weekly_limits` carry a row for EVERY ISO week the period touches?
   * Answers the "is the guarantee unconfigured, or deliberately switched
   * off?" question the claims-submit violation text (and the admin
   * diagnostics bucket) needs — a `kmGuaranteed === 0` with all rows present
   * is an admin decision, without them it is a configuration hole. The
   * existence of a row is what counts (docs/04-data-model.md): an all-NULL
   * row is still "configured" here.
   *
   * Returns `true` for an invalid/inverted range (there is nothing to
   * configure, and the caller already has a date violation for that).
   */
  async hasConfiguredLimits(
    dateStartIso: string,
    dateEndIso: string,
  ): Promise<boolean> {
    const weeks = isoWeeksOfPeriod(dateStartIso, dateEndIso);
    if (weeks === null || weeks.length === 0) return true;

    const rows = await this.prisma.client.weeklyLimit.findMany({
      where: { OR: weeks.map(({ isoYear, isoWeek }) => ({ isoYear, isoWeek })) },
      select: { isoYear: true, isoWeek: true },
    });
    const present = new Set(rows.map((r) => weekKey(r.isoYear, r.isoWeek)));
    return weeks.every((w) => present.has(weekKey(w.isoYear, w.isoWeek)));
  }

  // ── Internals ───────────────────────────────────────────

  /**
   * Load the `weekly_limits` rows of exactly the given ISO weeks. Returns the
   * RAW nullable columns keyed by `YYYY-Www` — the fallback merge is
   * `mergeLimits`'s job (it needs the fallback, which is resolved in
   * parallel with this query).
   */
  private async _loadWeeklyLimits(
    weeks: readonly IsoWeekRef[],
  ): Promise<Record<string, StoredWeekLimit>> {
    if (weeks.length === 0) return {};

    const rows = await this.prisma.client.weeklyLimit.findMany({
      where: { OR: weeks.map(({ isoYear, isoWeek }) => ({ isoYear, isoWeek })) },
      select: {
        isoYear: true,
        isoWeek: true,
        kmPerDay: true,
        ratePerKm: true,
        kmPerSaturday: true,
      },
    });

    const out: Record<string, StoredWeekLimit> = {};
    for (const row of rows) {
      out[weekKey(row.isoYear, row.isoWeek)] = {
        kmPerDay: decimalToNumber(row.kmPerDay),
        ratePerKm: decimalToNumber(row.ratePerKm),
        kmPerSaturday: decimalToNumber(row.kmPerSaturday),
      };
    }
    return out;
  }

  /**
   * Resolve the fallback used for a week with no `weekly_limits` row (or a
   * NULL column). km/day and EUR/km: `AppConfig` first (`km_dziennie_default`,
   * `stawka_eur_default`), else the shared engine constants. km/Saturday:
   * always `FALLBACK_KM_PER_SATURDAY` (0) — no override on purpose (a
   * positive value would silently re-enable every switched-off Saturday, see
   * docs/19-known-quirks.md#weeklyLimit-fallback).
   */
  private async _resolveFallback(): Promise<Required<WeekLimit>> {
    const cfg = await this.prisma.client.appConfig.findMany({
      where: {
        key: { in: [APP_CONFIG_KEY_KM_PER_DAY, APP_CONFIG_KEY_RATE_PER_KM] },
      },
      select: { key: true, value: true },
    });
    let kmPerDay = FALLBACK_KM_PER_DAY;
    let ratePerKm = FALLBACK_RATE_PER_KM;
    for (const row of cfg) {
      if (row.key === APP_CONFIG_KEY_KM_PER_DAY) {
        kmPerDay = this._positiveOr(row.value, kmPerDay, 'kmCalc.fallback.invalid_km_per_day');
      } else if (row.key === APP_CONFIG_KEY_RATE_PER_KM) {
        ratePerKm = this._positiveOr(row.value, ratePerKm, 'kmCalc.fallback.invalid_rate_per_km');
      }
    }
    return { kmPerDay, ratePerKm, kmPerSaturday: FALLBACK_KM_PER_SATURDAY };
  }

  /** A positive finite AppConfig value, else `fallback` (logged — a typo in config). */
  private _positiveOr(raw: string, fallback: number, logMsg: string): number {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    this.logger.warn({ msg: logMsg, value: raw });
    return fallback;
  }
}

// ─── Pure helpers ────────────────────────────────────────

/**
 * Build the `'YYYY-Www' → WeekLimit` map km-calc consumes.
 *
 * The merge is PER FIELD (feature «wyłączane limity gwarancji», 2026-09-20;
 * docs/19-known-quirks.md#weeklyLimit-fallback):
 *  - a row where all three columns are NULL ≡ no row at all (skipped — the
 *    engine applies the fallback to the whole week);
 *  - each NULL column is filled from the global fallback INDEPENDENTLY, so
 *    `{kmPerDay: 300, ratePerKm: NULL}` prices at 300 km/day @ 0.5 EUR/km and
 *    `{kmPerDay: 0, ratePerKm: NULL}` stays switched OFF (never 540);
 *  - `kmPerSaturday` is copied only when present: omitting the key lets the
 *    engine fold it to the Saturday fallback (0, "no Saturday guarantee"),
 *    which is the documented opt-in behaviour.
 *
 * `snapshot` (when supplied) wins PER WEEK over the merged live row — a
 * wniosek is re-priced with the limits it was originally priced with. Weeks
 * missing from the snapshot keep the live values; weeks missing from both are
 * left out entirely and the engine applies the global fallback.
 *
 * Exported for unit testing — the service method is the only production caller.
 */
export function mergeLimits(
  stored: Record<string, StoredWeekLimit>,
  fallback: WeekLimit,
  snapshot?: Record<string, WeekLimit>,
): Record<string, WeekLimit> {
  const out: Record<string, WeekLimit> = {};
  for (const [key, row] of Object.entries(stored)) {
    // A completely empty row carries no admin intent — treat it as "no row"
    // so the engine's own fallback path handles the week.
    if (
      row.kmPerDay === null &&
      row.ratePerKm === null &&
      row.kmPerSaturday === null
    ) {
      continue;
    }
    out[key] = {
      kmPerDay: row.kmPerDay ?? fallback.kmPerDay,
      ratePerKm: row.ratePerKm ?? fallback.ratePerKm,
      // Absent ⇒ omit ⇒ engine folds to 0 (no Saturday guarantee that week).
      ...(row.kmPerSaturday !== null
        ? { kmPerSaturday: row.kmPerSaturday }
        : {}),
    };
  }
  if (snapshot) {
    for (const [key, limit] of Object.entries(snapshot)) {
      out[key] = limit;
    }
  }
  return out;
}

/**
 * Every ISO week `[dateStartIso … dateEndIso]` touches, ascending — or `null`
 * when either date is not a real `YYYY-MM-DD` day or the range is inverted.
 *
 * Time-zone independent: both ends are mapped to their ISO week by the shared
 * string-in helper, and the walk between them is pure week arithmetic (with
 * the 52/53-week roll-over of `isoWeeksInYear`) — no `Date` anywhere.
 *
 * Exported for unit testing.
 */
export function isoWeeksOfPeriod(
  dateStartIso: string,
  dateEndIso: string,
): IsoWeekRef[] | null {
  const first = isoWeekOfDate(dateStartIso);
  const last = isoWeekOfDate(dateEndIso);
  // Strict `YYYY-MM-DD` strings (validated above) sort as dates.
  if (first === null || last === null || dateStartIso > dateEndIso) return null;

  const out: IsoWeekRef[] = [];
  let { isoYear, isoWeek } = first;
  while (
    isoYear < last.isoYear ||
    (isoYear === last.isoYear && isoWeek <= last.isoWeek)
  ) {
    out.push({ isoYear, isoWeek });
    if (isoWeek >= isoWeeksInYear(isoYear)) {
      isoYear += 1;
      isoWeek = 1;
    } else {
      isoWeek += 1;
    }
  }
  return out;
}

/**
 * `YYYY-Www` key of a stored `(isoYear, isoWeek)` pair. A row that is out of
 * range (the DB has no CHECK — Zod guards the writes) gets a key no period
 * week can match, so it is simply never used.
 */
function weekKey(isoYear: number, isoWeek: number): string {
  return formatIsoWeekKey(isoYear, isoWeek) ?? `invalid:${isoYear}-${isoWeek}`;
}

function decimalToNumber(
  v: { toNumber(): number } | number | null | undefined,
): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  if (typeof (v as { toNumber?: () => number }).toNumber === 'function') {
    return (v as { toNumber(): number }).toNumber();
  }
  return null;
}
