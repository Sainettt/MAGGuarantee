-- Move `company` from `users` to `carriers`.
--
-- Rationale: `company` was a denormalization-leftover from the legacy GAS-sheet
-- migration where every user row had it "generically". In practice only
-- `przewoznik` users (who always have a 1:1 `Carrier` extension) ever populate
-- the field — every other role (admin, pracownik, opiekun, planista, dyspozytor,
-- eksport, weryfikator) is a MAGTRANS-internal employee with `company = NULL`.
--
-- Strategy: ADD the new column on `carriers` first, BACKFILL from `users` via
-- the carrier↔user 1:1 relation, then DROP the old column. Doing it in this
-- order means we never lose data on a non-empty database.

-- Add the column to carriers first.
ALTER TABLE "carriers" ADD COLUMN "company" TEXT;

-- Backfill from users via the carrier↔user relation. Only carrier-bound users
-- ever had a non-null company in practice; the WHERE clause is defensive in
-- case a stray internal user got one set.
UPDATE "carriers"
SET "company" = "users"."company"
FROM "users"
WHERE "carriers"."userId" = "users"."id"
  AND "users"."company" IS NOT NULL;

-- Now drop the source column.
ALTER TABLE "users" DROP COLUMN "company";
