// km limit DTO contracts (`/api/v1/limits/*`, docs/13-api-design.md
// «Limits — `/api/v1/limits`»). Limits are kept per ISO 8601 WEEK in
// `weekly_limits` (docs/12 §«LIMITY KM → WeeklyLimit»; per calendar month
// until 2026-10-29).
//
// `GET /limits?year=2026` (ISO year) returns the raw `weekly_limits` rows; the
// frontend fills the missing weeks in with `isoWeeksOfYear` from
// `domain/iso-week.ts`. `PUT /limits/:isoWeek` (`YYYY-Www`) upserts one row by
// `(isoYear, isoWeek)`; `POST /limits/bulk` applies one partial payload to a
// list of weeks of one ISO year in one transaction.
//
// ── Three-state semantics of every limit column ───────────────────────────
// (feature «wyłączane limity gwarancji», 2026-09-20)
//
//   | DB state            | meaning                  | km-calc                |
//   |---------------------|--------------------------|------------------------|
//   | no row / column NULL| NOT configured           | global fallback        |
//   |                     |                          | (540 km/d, 0.5 EUR/km, |
//   |                     |                          |  0 km/Saturday)        |
//   | `0`                 | deliberately turned OFF  | 0 km for that week     |
//   | `> 0`               | the configured value     | as given               |
//
// The fallbacks are the `FALLBACK_*` constants in `domain/km-calc.ts` and are
// substituted PER FIELD. `kmPerSaturday` pays the Saturday of THAT week at the
// week's `ratePerKm`; for it `null` and `0` behave the same (the Saturday is
// not paid), since its fallback is `0`.
//
// That is why the write schemas below are `nonnegative()` and NOT
// `positive()`: `0` is a first-class, meaningful value (admin switching the
// guarantee off for a week), while "unset" is expressed by OMITTING the key
// (or by the row/column simply not existing). See
// docs/19-known-quirks.md#weeklyLimit-fallback.
//
// The Prisma column types are Decimal(8,2) for `kmPerDay` / `kmPerSaturday`
// and Decimal(6,4) for `ratePerKm`. We don't pin the same scale on the wire:
// numbers come in as user input (form coercion via `z.coerce.number()`) and
// Prisma rounds to the column scale on insert. There is no DB-level CHECK for
// `>= 0` — these schemas are the ONLY guard against negative values, so keep
// them on every write path.

import { z } from 'zod';

import { isoWeeksInYear } from '../domain/iso-week';
import { IsoWeekKeySchema, UuidSchema } from './common';

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
