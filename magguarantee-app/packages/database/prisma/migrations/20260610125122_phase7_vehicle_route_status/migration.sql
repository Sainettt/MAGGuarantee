-- CreateEnum
CREATE TYPE "VehicleRouteStatus" AS ENUM ('w_trasie', 'zjechal');

-- CreateEnum
CREATE TYPE "VehicleStatusSource" AS ENUM ('manual', 'gps');

-- CreateTable
CREATE TABLE "vehicle_route_statuses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vehicleId" UUID NOT NULL,
    "status" "VehicleRouteStatus" NOT NULL,
    "source" "VehicleStatusSource" NOT NULL DEFAULT 'manual',
    "notedById" UUID,
    "notedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_route_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_route_statuses_vehicleId_notedAt_idx" ON "vehicle_route_statuses"("vehicleId", "notedAt");

-- CreateIndex
CREATE INDEX "vehicle_route_statuses_notedAt_idx" ON "vehicle_route_statuses"("notedAt");

-- AddForeignKey
ALTER TABLE "vehicle_route_statuses" ADD CONSTRAINT "vehicle_route_statuses_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_route_statuses" ADD CONSTRAINT "vehicle_route_statuses_notedById_fkey" FOREIGN KEY ("notedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

