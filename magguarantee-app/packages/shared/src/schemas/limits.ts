// Phase 4.5 — km limit DTO contracts (`/api/v1/limits/*`,
// docs/13-api-design.md#limits).
//
// ⚠️ 2026-10-29: limits move from calendar months to ISO WEEKS. The weekly
// contracts (`WeeklyLimitDtoSchema`, `UpdateWeeklyLimitSchema`,
// `BulkUpdateWeeklyLimitsSchema`, `IsoWeekParamSchema`, …) live at the BOTTOM
// of this file and are the target. The monthly ones directly below stay only
// until the api limits module switches over (stage 4 of «Доработка
// (2026-10-29)», docs/17) and are removed in stage 5.
//
// Weekly: `GET /limits?year=2026` (ISO year) returns the raw `weekly_limits`
// rows; the frontend fills the missing weeks in with `isoWeeksOfYear` from
// `domain/iso-week.ts`. `PUT /limits/:isoWeek` (`YYYY-Www`) upserts one row by
// `(isoYear, isoWeek)`; `POST /limits/bulk` applies one partial payload to a
// list of weeks of one ISO year.
//
// Monthly (legacy): `PUT /limits/:yearMonth` upserts a single row by
// `(year, month)`; `POST /limits/bulk` applies one partial payload to a whole
// range of months of one year.
//
// ── Three-state semantics of every limit column ───────────────────────────
// (feature «wyłączane limity gwarancji», 2026-09-20)
//
//   | DB state            | meaning                  | km-calc                |
//   |---------------------|--------------------------|------------------------|
//   | no row / column NULL| NOT configured           | global fallback        |
//   |                     |                          | (540 km/d, 0.5 EUR/km, |
//   |                     |                          |  0 km/Saturday)        |
//   | `0`                 | deliberately turned OFF  | 0 km for that month    |
//   | `> 0`               | the configured value     | as given               |
//
// That is why the write schemas below are `nonnegative()` and NOT
// `positive()`: `0` is a first-class, meaningful value (admin switching the
// guarantee off for a month), while "unset" is expressed by OMITTING the key
// (or by the row/column simply not existing). See
// docs/19-known-quirks.md#monthlyLimit-fallback.
//
// The Prisma column types are Decimal(8,2) for `kmPerDay` and Decimal(6,4)
// for `ratePerKm`. We don't pin the same scale on the wire: numbers come in
// as user input (form coercion via `z.coerce.number()`) and Prisma rounds to
// the column scale on insert. There is no DB-level CHECK for `>= 0` (no
// migration shipped with this feature) — these schemas are the ONLY guard
// against negative values, so keep them on every write path.

import { z } from 'zod';

import { isoWeeksInYear } from '../domain/iso-week';
import { IsoWeekKeySchema, UuidSchema } from './common';

/**
 * Read-row shape of `monthly_limits`. Returned by `GET /limits?year=...`.
 *
 * Decimal columns surface as `number` in JSON. All three columns are
 * nullable in the schema — admin may seed one without the others, and
 * `null` ≠ `0`: `null` means "not configured" (km-calc substitutes the
 * global fallback for THAT field), `0` means "switched off".
 */
export const MonthlyLimitDtoSchema = z.object({
  id: UuidSchema,
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  /** Daily km guarantee. `null` ⇒ fallback (540); `0` ⇒ guarantee OFF. */
  kmPerDay: z.number().nullable(),
  /** EUR per km. `null` ⇒ fallback (0.5); `0` ⇒ km are priced at zero. */
  ratePerKm: z.number().nullable(),
  /**
   * Guarantee km credited for a single qualifying ("odd" — 1st/3rd/5th)
   * Saturday of the month. `null` (or `0`) turns the odd-Saturday feature OFF
   * for the month (km-calc then treats Saturdays as ordinary, fully-excluded
   * weekends — the fallback for this field is `0`, i.e. OFF).
   * Column is `Decimal(8,2)`, surfaced as `number`.
   */
  kmPerSaturday: z.number().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type MonthlyLimitDto = z.infer<typeof MonthlyLimitDtoSchema>;

export const MonthlyLimitListSchema = z.array(MonthlyLimitDtoSchema);
export type MonthlyLimitListDto = z.infer<typeof MonthlyLimitListSchema>;

/**
 * Query-param schema for `GET /limits?year=YYYY`. Year is required; the
 * service returns the (≤12) rows matching `year`. Range is generous on
 * purpose — the schema has no business reason to cap historical years.
 */
export const ListMonthlyLimitsFiltersSchema = z
  .object({
    year: z.coerce.number().int().min(2000).max(2100),
  })
  .strict();
export type ListMonthlyLimitsFilters = z.infer<
  typeof ListMonthlyLimitsFiltersSchema
>;

/**
 * Body schema for `PUT /limits/:yearMonth`. At least one of the three fields
 * must be present (full row replace is intentionally not supported — the
 * UI surfaces inputs one at a time and a no-op PUT is meaningless).
 *
 * All three fields are NON-NEGATIVE decimals — `0` is a legal, meaningful
 * value ("switched off for this month", see the table at the top of this
 * file), so a payload of nothing but zeros is valid. Omitting a key leaves
 * the stored column untouched; there is no "clear back to NULL" verb on this
 * endpoint (to reset a month to the global fallback the row has to be removed
 * at the DB level — the UI never offers it).
 *
 * The schema does NOT enforce the column scale (Decimal(8,2) / Decimal(6,4))
 * — Prisma rounds on persist, which matches the existing seed/import pipeline.
 */
export const UpdateMonthlyLimitSchema = z
  .object({
    /** Daily km guarantee. `0` ⇒ the month pays no weekday guarantee at all. */
    kmPerDay: z.coerce.number().nonnegative().optional(),
    /** EUR per km. `0` ⇒ the month's km are priced at zero. */
    ratePerKm: z.coerce.number().nonnegative().optional(),
    /**
     * Guarantee km per qualifying Saturday. `> 0` turns the odd-Saturday
     * feature ON for the month, `0` turns it OFF explicitly (Saturdays fall
     * back to ordinary, fully-excluded weekends). Both directions are
     * reachable through this endpoint.
     */
    kmPerSaturday: z.coerce.number().nonnegative().optional(),
  })
  .refine(
    (v) =>
      v.kmPerDay !== undefined ||
      v.ratePerKm !== undefined ||
      v.kmPerSaturday !== undefined,
    {
      message:
        'At least one of `kmPerDay`, `ratePerKm`, or `kmPerSaturday` must be provided.',
    },
  );
export type UpdateMonthlyLimitDto = z.infer<typeof UpdateMonthlyLimitSchema>;

/**
 * Body schema for `POST /limits/bulk` — apply ONE partial payload to several
 * months of a single year in one transaction.
 *
 * Motivation: with `0` meaning "guarantee off", switching a season off used to
 * require 12 separate `PUT`s; a single forgotten month would silently fall
 * back to the global 540 km/day. Bulk makes the whole range atomic.
 *
 * Field semantics are IDENTICAL to `UpdateMonthlyLimitSchema` (nonnegative,
 * at least one value required, omitted keys leave the stored column
 * untouched) — only the addressing differs (`year` + `months[]` instead of
 * the `:yearMonth` path param).
 */
export const BulkUpdateMonthlyLimitsSchema = z
  .object({
    year: z.coerce.number().int().min(2000).max(2100),
    /** 1..12, non-empty, no duplicates. Order is irrelevant. */
    months: z
      .array(z.coerce.number().int().min(1).max(12))
      .min(1, { message: '`months` must contain at least one month.' })
      .refine((m) => new Set(m).size === m.length, {
        message: '`months` must not contain duplicates.',
      }),
    kmPerDay: z.coerce.number().nonnegative().optional(),
    ratePerKm: z.coerce.number().nonnegative().optional(),
    kmPerSaturday: z.coerce.number().nonnegative().optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.kmPerDay !== undefined ||
      v.ratePerKm !== undefined ||
      v.kmPerSaturday !== undefined,
    {
      message:
        'At least one of `kmPerDay`, `ratePerKm`, or `kmPerSaturday` must be provided.',
    },
  );
export type BulkUpdateMonthlyLimitsDto = z.infer<
  typeof BulkUpdateMonthlyLimitsSchema
>;

/**
 * Path-param schema for `PUT /limits/:yearMonth`. The path carries a
 * `YYYY-MM` token; the service parses it into `{year, month}` after Zod
 * validates the textual shape. Two-digit month is required so the URL is
 * stable (`2026-5` is rejected — must be `2026-05`).
 */
export const YearMonthParamSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/u, {
    message: 'yearMonth must be in `YYYY-MM` format (e.g. `2026-05`).',
  });
export type YearMonthParam = z.infer<typeof YearMonthParamSchema>;

// ═══ Weekly limits (ISO weeks, 2026-10-29) ════════════════════════════════
//
// Same three-state semantics as above, per ISO week (docs/12 §«LIMITY KM →
// WeeklyLimit»): no row / NULL ⇒ fallback (540 km/day, 0.5 EUR/km, 0 km for
// the Saturday — `FALLBACK_*` in `domain/km-calc.ts`), `0` ⇒ switched off,
// `> 0` ⇒ the value. `kmPerSaturday` pays the Saturday of THAT week at the
// week's `ratePerKm`; the "odd Saturday of the month" rule is gone.

/** "At least one of the three values" — shared by both weekly write schemas. */
function hasAnyWeeklyValue(v: {
  kmPerDay?: number;
  ratePerKm?: number;
  kmPerSaturday?: number;
}): boolean {
  return (
    v.kmPerDay !== undefined ||
    v.ratePerKm !== undefined ||
    v.kmPerSaturday !== undefined
  );
}

const AT_LEAST_ONE_VALUE_MESSAGE =
  'At least one of `kmPerDay`, `ratePerKm`, or `kmPerSaturday` must be provided.';

/**
 * Read-row shape of `weekly_limits`, returned by `GET /limits?year=...`.
 * Every limit column is nullable and `null` ≠ `0`: `null` ⇒ not configured
 * (km-calc substitutes the fallback for THAT field), `0` ⇒ switched off.
 */
export const WeeklyLimitDtoSchema = z.object({
  id: UuidSchema,
  /** ISO year — the calendar year of the week's Thursday. */
  isoYear: z.number().int(),
  /** 1..52, or 1..53 in a 53-week ISO year. */
  isoWeek: z.number().int().min(1).max(53),
  /** km/day for Mon–Fri. `null` ⇒ fallback (540); `0` ⇒ weekday guarantee OFF. */
  kmPerDay: z.number().nullable(),
  /** EUR/km for the weekdays and the Saturday. `null` ⇒ fallback (0.5); `0` ⇒ priced at zero. */
  ratePerKm: z.number().nullable(),
  /** km for the week's Saturday. `null` and `0` behave the same: the Saturday is not paid. */
  kmPerSaturday: z.number().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type WeeklyLimitDto = z.infer<typeof WeeklyLimitDtoSchema>;

export const WeeklyLimitListSchema = z.array(WeeklyLimitDtoSchema);
export type WeeklyLimitListDto = z.infer<typeof WeeklyLimitListSchema>;

/**
 * Query-param schema for `GET /limits?year=YYYY`. `year` is the ISO YEAR: the
 * service returns the (≤ 53) `weekly_limits` rows with `isoYear = year`.
 */
export const ListWeeklyLimitsFiltersSchema = z
  .object({
    year: z.coerce.number().int().min(2000).max(2100),
  })
  .strict();
export type ListWeeklyLimitsFilters = z.infer<typeof ListWeeklyLimitsFiltersSchema>;

/**
 * Body schema for `PUT /limits/:isoWeek` — partial, all three values
 * NON-NEGATIVE and coerced (`0` is a legal "switch off"), at least one
 * required. An omitted key leaves the stored column untouched; there is no
 * "clear back to NULL" through the API.
 */
export const UpdateWeeklyLimitSchema = z
  .object({
    /** km/day for Mon–Fri. `0` ⇒ the week pays no weekday guarantee. */
    kmPerDay: z.coerce.number().nonnegative().optional(),
    /** EUR/km of the week. `0` ⇒ the week's km are priced at zero. */
    ratePerKm: z.coerce.number().nonnegative().optional(),
    /** km for the week's Saturday. `> 0` pays it, `0` switches it off. */
    kmPerSaturday: z.coerce.number().nonnegative().optional(),
  })
  .refine(hasAnyWeeklyValue, { message: AT_LEAST_ONE_VALUE_MESSAGE });
export type UpdateWeeklyLimitDto = z.infer<typeof UpdateWeeklyLimitSchema>;

/**
 * Body schema for `POST /limits/bulk` — ONE partial payload applied to several
 * weeks of a single ISO year in one transaction (docs/13 «Limits»).
 *
 * Field semantics are identical to `UpdateWeeklyLimitSchema`; only the
 * addressing differs: `isoYear` + `weeks[]` (1..53, non-empty, no duplicates,
 * each ≤ the number of weeks of `isoYear` — W53 of a 52-week year is a 400).
 * No cross-year ranges.
 */
export const BulkUpdateWeeklyLimitsSchema = z
  .object({
    isoYear: z.coerce.number().int().min(2000).max(2100),
    /** ISO week numbers of `isoYear`. Order is irrelevant. */
    weeks: z
      .array(z.coerce.number().int().min(1).max(53))
      .min(1, { message: '`weeks` must contain at least one week.' })
      .refine((w) => new Set(w).size === w.length, {
        message: '`weeks` must not contain duplicates.',
      }),
    kmPerDay: z.coerce.number().nonnegative().optional(),
    ratePerKm: z.coerce.number().nonnegative().optional(),
    kmPerSaturday: z.coerce.number().nonnegative().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const weeksInYear = isoWeeksInYear(v.isoYear);
    v.weeks.forEach((week, index) => {
      if (week > weeksInYear) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['weeks', index],
          message: `ISO year ${v.isoYear} has only ${weeksInYear} weeks.`,
        });
      }
    });
    if (!hasAnyWeeklyValue(v)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: AT_LEAST_ONE_VALUE_MESSAGE });
    }
  });
export type BulkUpdateWeeklyLimitsDto = z.infer<typeof BulkUpdateWeeklyLimitsSchema>;

/**
 * Path-param schema for `PUT /limits/:isoWeek`: a `YYYY-Www` key with a
 * two-digit week (`2026-W05`; `2026-W5` is rejected) of a week that exists —
 * `2027-W53` is a 400 because 2027 has 52 weeks. The service turns it into
 * `{ isoYear, isoWeek }` with `parseIsoWeekKey`.
 */
export const IsoWeekParamSchema = IsoWeekKeySchema;
export type IsoWeekParam = z.infer<typeof IsoWeekParamSchema>;
