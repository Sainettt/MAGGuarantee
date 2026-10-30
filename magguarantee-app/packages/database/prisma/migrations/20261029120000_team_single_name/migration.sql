-- Team: collapse the `code` (N.N.N, unique) + optional `name` pair into ONE
-- required, unique, free-form `name` («Nazwa zespołu»). The admin tab lists
-- dispatcher teams only (the planista is picked separately on the vehicle), so
-- a second label next to the identifier was noise. No format is enforced any
-- more — MAGTRANS numbers its dispatch teams (`1.23`), but that is a
-- convention, not a rule.
--
-- The old optional `name` column is DROPPED (seed-only DB, no real data), then
-- `code` is RENAMED to `name` so every existing team keeps its identifier. The
-- unique index follows the rename. Forward-only, no down-migration.

-- DropIndex
DROP INDEX "teams_code_key";

-- AlterTable
ALTER TABLE "teams" DROP COLUMN "name";
ALTER TABLE "teams" RENAME COLUMN "code" TO "name";

-- CreateIndex
CREATE UNIQUE INDEX "teams_name_key" ON "teams"("name");
