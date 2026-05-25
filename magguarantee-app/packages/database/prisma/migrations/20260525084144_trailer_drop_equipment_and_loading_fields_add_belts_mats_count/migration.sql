-- AlterTable
ALTER TABLE "trailers" DROP COLUMN "edschaSlidingRoof",
DROP COLUMN "equipment",
DROP COLUMN "loadFromBack",
DROP COLUMN "loadFromSide",
DROP COLUMN "loadFromTop",
DROP COLUMN "slidingRoof",
ADD COLUMN     "beltsCount" INTEGER,
ADD COLUMN     "matsCount" INTEGER;
