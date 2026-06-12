-- Phase 7 (REWORK 2026-06-12 #3, see docs/20 §0′) — replace the route-status
-- log with a per-(vehicle, day) km board owned by the `weryfikator` role.
--
-- Forward-only: the DB is greenfield (no real data, never in production), so
-- the route-status table + enum are DROPPED outright rather than migrated. The
-- derived motion status (w_ruchu/nie_jezdzi/nieznany) is computed at read time
-- and is NOT stored. `VehicleStatusSource` is reused as-is (manual/gps).

-- CreateEnum
CREATE TYPE "VehicleDayState" AS ENUM ('drove', 'idle');

-- DropForeignKey
ALTER TABLE "vehicle_route_statuses" DROP CONSTRAINT "vehicle_route_statuses_vehicleId_fkey";

-- DropForeignKey
ALTER TABLE "vehicle_route_statuses" DROP CONSTRAINT "vehicle_route_statuses_notedById_fkey";

-- DropTable
DROP TABLE "vehicle_route_statuses";

-- DropEnum
DROP TYPE "VehicleRouteStatus";

-- CreateTable
CREATE TABLE "vehicle_daily_km" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vehicleId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "km" INTEGER,
    "state" "VehicleDayState" NOT NULL,
    "source" "VehicleStatusSource" NOT NULL DEFAULT 'manual',
    "notedById" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_daily_km_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_daily_km_date_idx" ON "vehicle_daily_km"("date");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_daily_km_vehicleId_date_key" ON "vehicle_daily_km"("vehicleId", "date");

-- AddForeignKey
ALTER TABLE "vehicle_daily_km" ADD CONSTRAINT "vehicle_daily_km_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_daily_km" ADD CONSTRAINT "vehicle_daily_km_notedById_fkey" FOREIGN KEY ("notedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
