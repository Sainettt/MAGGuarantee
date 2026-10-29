-- Km limits per ISO week instead of per month (decision 2026-10-29, docs/17
-- «Доработка (2026-10-29)», stage 2). Rules: docs/12 §«LIMITY KM →
-- WeeklyLimit» → «Перенос `monthly_limits` → `weekly_limits` (2026-10-29)».
--
-- The guarantee km/day, the EUR/km rate and the Saturday km are now set per
-- ISO 8601 week (Monday–Sunday, numbered 1..52/53, a week belongs to the year
-- of its THURSDAY). One `weekly_limits` row = (isoYear, isoWeek, kmPerDay,
-- ratePerKm, kmPerSaturday). The three-valued semantics are unchanged: no row /
-- NULL = not configured (the api substitutes 540 / 0.5 / 0), `0` = switched off
-- by an admin, `> 0` = the value. Hence NO DEFAULT on the three value columns.
--
-- This migration:
--   1. Creates `weekly_limits` + the (isoYear, isoWeek) unique index. The DDL is
--      identical to `prisma migrate diff` from the previous schema.
--   2. Unrolls every `monthly_limits` row into the ISO weeks it owns:
--        * A week row is created only if the month of the week's THURSDAY has a
--          `monthly_limits` row. Every Thursday names exactly one ISO week, so
--          each week is produced at most once. All other weeks stay without a
--          row (= fallback), exactly as their month was before.
--        * `kmPerDay`, `ratePerKm` come from the Thursday's month: a week that
--          straddles two months takes the values of the month holding its
--          Thursday (W14 2026 = 30.03–05.04 → April). NULL stays NULL, 0 stays 0.
--        * `kmPerSaturday` carries over the old PAYOUTS, not the raw value. Until
--          now only the 1st / 3rd / 5th Saturday of a month was paid. The week
--          takes `kmPerSaturday` of the month holding its SATURDAY (may differ
--          from the Thursday's month: W18 2026 has Thu 30.04 but Sat 02.05, the
--          1st Saturday of May → May's value) if that Saturday's ordinal in its
--          month, floor((day - 1) / 7) + 1, is odd; otherwise `0`. If the
--          Saturday's month has no row, or its `kmPerSaturday` is NULL, the
--          week gets NULL, odd or even: that month never configured Saturdays,
--          and the old Saturday fallback was 0 anyway (NULL and 0 pay the same).
--      So right after this migration every claim period computes the same
--      amount as under the monthly rule; from here on the admin edits weeks.
--
-- `monthly_limits` is NOT touched: the api still reads it until stage 3, and it
-- is dropped by its own migration in stage 5. The table has no `deletedAt`, so
-- there is no soft-delete to filter. Rows with a month outside 1..12 (no CHECK
-- forbids them, but the api never wrote or read one) are skipped instead of
-- failing the deploy.
--
-- Time zone independent: only DATE arithmetic (date + integer) and EXTRACT on
-- DATE values, never timestamptz. EXTRACT(ISOYEAR / WEEK / ISODOW) return ISO
-- values directly. `updatedAt` has no DB default (Prisma `@updatedAt`), so it is
-- set explicitly; `createdAt` takes its column default. Both use
-- CURRENT_TIMESTAMP like the earlier backfills.
--
-- Safe to re-run: `ON CONFLICT ("isoYear", "isoWeek") DO NOTHING` — a second
-- pass of step 2 inserts 0 rows and never overwrites a week (unrolled or edited
-- by an admin). The whole script runs in Postgres' implicit transaction.
--
-- Post-migration check (staging, then prod) — `weekly_rows` must equal
-- `expected_rows` (ISO weeks whose Thursday falls in a month with a row):
--
--   SELECT (SELECT count(*) FROM "weekly_limits") AS weekly_rows,
--          count(*) AS expected_rows
--     FROM "monthly_limits" AS ml
--    CROSS JOIN LATERAL generate_series(0, 30) AS i
--    WHERE ml."month" BETWEEN 1 AND 12
--      AND EXTRACT(MONTH FROM make_date(ml."year", ml."month", 1) + i) = ml."month"
--      AND EXTRACT(ISODOW FROM make_date(ml."year", ml."month", 1) + i) = 4;
--
-- and `kmPerSaturday > 0` only on weeks whose Saturday is an odd Saturday of
-- its month — this must return 0 rows:
--
--   SELECT "isoYear", "isoWeek", "kmPerSaturday"
--     FROM "weekly_limits"
--    WHERE "kmPerSaturday" > 0
--      AND (EXTRACT(DAY FROM to_date(format('%s-%s-6', "isoYear", "isoWeek"),
--                                    'IYYY-IW-ID'))::int - 1) / 7 % 2 = 1;

-- ── 1. New table ────────────────────────────────────────────────────────────
-- CreateTable
CREATE TABLE "weekly_limits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "isoYear" INTEGER NOT NULL,
    "isoWeek" INTEGER NOT NULL,
    "kmPerDay" DECIMAL(8,2),
    "ratePerKm" DECIMAL(6,4),
    "kmPerSaturday" DECIMAL(8,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_limits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "weekly_limits_isoYear_isoWeek_key" ON "weekly_limits"("isoYear", "isoWeek");

-- ── 2. Unroll monthly_limits into ISO weeks ─────────────────────────────────
WITH "week_thursdays" AS (
  -- Every Thursday of every configured month: the month's first Thursday
  -- (1st + days to ISODOW 4) plus 0..4 weeks, kept while still in the month.
  SELECT ml."kmPerDay",
         ml."ratePerKm",
         t."thursday",
         t."thursday" + 2 AS "saturday"
    FROM "monthly_limits" AS ml
   CROSS JOIN LATERAL (
     SELECT make_date(ml."year", ml."month", 1)
            + (11 - EXTRACT(ISODOW FROM make_date(ml."year", ml."month", 1))::int) % 7
            + 7 * k AS "thursday"
       FROM generate_series(0, 4) AS k
   ) AS t
   WHERE ml."month" BETWEEN 1 AND 12
     AND EXTRACT(MONTH FROM t."thursday") = ml."month"
)
INSERT INTO "weekly_limits" ("isoYear", "isoWeek", "kmPerDay", "ratePerKm", "kmPerSaturday", "updatedAt")
SELECT EXTRACT(ISOYEAR FROM w."thursday")::int,
       EXTRACT(WEEK FROM w."thursday")::int,
       w."kmPerDay",
       w."ratePerKm",
       CASE
         -- Saturday's month has no row, or never configured Saturdays.
         WHEN sm."kmPerSaturday" IS NULL THEN NULL
         -- 1st / 3rd / 5th Saturday of its month — was paid before.
         WHEN ((EXTRACT(DAY FROM w."saturday")::int - 1) / 7 + 1) % 2 = 1 THEN sm."kmPerSaturday"
         -- 2nd / 4th Saturday — was not paid.
         ELSE 0
       END,
       CURRENT_TIMESTAMP
  FROM "week_thursdays" AS w
  LEFT JOIN "monthly_limits" AS sm
         ON sm."year" = EXTRACT(YEAR FROM w."saturday")::int
        AND sm."month" = EXTRACT(MONTH FROM w."saturday")::int
ON CONFLICT ("isoYear", "isoWeek") DO NOTHING;
