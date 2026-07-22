-- Guarantee km for odd Saturdays.
-- Adds `kmPerSaturday`: the guarantee km credited for a single qualifying
-- ("odd") Saturday in the month. NULL is treated as 0 by km-calc (the fallback
-- is owned by the api — km-calc.service / limits.repository — NOT the DB; the
-- column just stores the value, no default).
--
-- Same precision as `kmPerDay` (DECIMAL(8,2); km is Decimal, never Float —
-- see docs/12 §Decimal). Physical table is `monthly_limits` (MonthlyLimit @@map).
-- Nullable, no default -> backfills existing rows to NULL. Additive, no data loss.

-- AlterTable
ALTER TABLE "monthly_limits" ADD COLUMN     "kmPerSaturday" DECIMAL(8,2);
