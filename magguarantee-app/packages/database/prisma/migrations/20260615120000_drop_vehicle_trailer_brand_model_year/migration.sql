-- Drop the brand / model / year attribute columns from `vehicles` and
-- `trailers` (user-confirmed full removal — UI + API + DB). These descriptive
-- fields are being removed from the product entirely; the km-guarantee flow
-- never depended on them.
--
-- The DB is greenfield (empty + seed-only, no production data per CLAUDE.md),
-- so a plain DROP COLUMN is correct — no data preservation, no backfill, no
-- down-migration. Adjacent columns (`vehicles.notes`, `trailers.notes`, the
-- trailer dimension/equipment fields, etc.) are intentionally left intact.

-- AlterTable
ALTER TABLE "vehicles" DROP COLUMN "brand";

-- AlterTable
ALTER TABLE "vehicles" DROP COLUMN "model";

-- AlterTable
ALTER TABLE "vehicles" DROP COLUMN "year";

-- AlterTable
ALTER TABLE "trailers" DROP COLUMN "brand";

-- AlterTable
ALTER TABLE "trailers" DROP COLUMN "model";

-- AlterTable
ALTER TABLE "trailers" DROP COLUMN "year";
