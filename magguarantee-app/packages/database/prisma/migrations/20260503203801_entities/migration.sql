-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('NA WERYFIKACJI', 'ZAAKCEPTOWANO', 'ODRZUCONO', 'REKLAMACJA', 'OCZEKUJE NA AUTORYZACJĘ', 'AUTORYZACJA — KWOTA MAKSIMA');

-- CreateEnum
CREATE TYPE "DelegationStatus" AS ENUM ('zgloszony', 'w_trasie', 'zjechal', 'anulowany');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('MEGA', 'STD', 'COIL');

-- CreateEnum
CREATE TYPE "CertificateL" AS ENUM ('L1', 'L2', 'L3');

-- CreateEnum
CREATE TYPE "EuroNorm" AS ENUM ('III', 'IV', 'V', 'VI');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "company" TEXT,
ADD COLUMN     "liderEmail" TEXT;

-- CreateTable
CREATE TABLE "carriers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "nip" TEXT,
    "vatId" TEXT,
    "contactPerson" TEXT,
    "phone" TEXT,
    "ordersEmail" TEXT,
    "accountEur" TEXT,
    "accountPln" TEXT,
    "paymentTerms" INTEGER,
    "insuranceValue" DECIMAL(12,2),
    "insuranceExpiry" DATE,
    "licenseExpiry" DATE,
    "numberOfPermits" INTEGER,
    "companyAddress" TEXT,
    "opiekunId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "carriers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "carrierId" UUID NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivatedAt" TIMESTAMP(3),
    "createdById" UUID,
    "plannerId" UUID,
    "dispatcherId" UUID,
    "brand" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "notes" TEXT,
    "certificateL" "CertificateL",
    "euro" "EuroNorm",
    "adrClasses" TEXT[],
    "gps" BOOLEAN NOT NULL DEFAULT false,
    "fuelCard" BOOLEAN NOT NULL DEFAULT false,
    "type" "VehicleType",
    "gb" BOOLEAN,
    "it" BOOLEAN,
    "fr" BOOLEAN,
    "agreement" BOOLEAN,
    "contract" BOOLEAN,
    "rateDe" DECIMAL(6,4),
    "rateUe" DECIMAL(6,4),
    "rateExport" DECIMAL(6,4),
    "rateImport" DECIMAL(6,4),
    "wasteAllowed" BOOLEAN NOT NULL DEFAULT false,
    "wasteCountries" TEXT[],
    "cabotageDe" BOOLEAN NOT NULL DEFAULT false,
    "cabotageFr" BOOLEAN NOT NULL DEFAULT false,
    "gpsMobilePhone" TEXT,
    "nextInspectionDate" DATE,
    "sideNumber" TEXT,
    "lastDroveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "carrierId" UUID NOT NULL,
    "loginSlug" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "phone2" TEXT,
    "email" TEXT,
    "driverLicenseNumber" TEXT,
    "licenseExpiry" DATE,
    "bankAccount" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trailers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "carrierId" UUID NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "trailerTypeId" UUID,
    "brand" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "equipment" TEXT,
    "nextInspectionDate" DATE,
    "belts" BOOLEAN,
    "mats" BOOLEAN,
    "innerLength" DECIMAL(8,2),
    "innerWidth" DECIMAL(8,2),
    "innerHeight" DECIMAL(8,2),
    "capacity" DECIMAL(10,2),
    "airSuspension" BOOLEAN,
    "loadFromBack" BOOLEAN,
    "loadFromSide" BOOLEAN,
    "loadFromTop" BOOLEAN,
    "slidingRoof" BOOLEAN,
    "edschaSlidingRoof" BOOLEAN,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "trailers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trailer_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "shortCode" TEXT,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trailer_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claims" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nrZgl" TEXT NOT NULL,
    "carrierId" UUID NOT NULL,
    "vehicleId" UUID,
    "vehiclePlateSnapshot" TEXT NOT NULL,
    "dateStart" TIMESTAMP(0) NOT NULL,
    "dateEnd" TIMESTAMP(0) NOT NULL,
    "timeFrom" TEXT,
    "timeTo" TEXT,
    "drivenDays" DECIMAL(6,2),
    "mileage" DECIMAL(10,2),
    "kmPerDay" DECIMAL(8,2),
    "kmGuaranteed" DECIMAL(10,2),
    "kmDifference" DECIMAL(10,2),
    "paymentEur" DECIMAL(12,2),
    "ratePerKmEffective" DECIMAL(6,4),
    "breakdown" JSONB,
    "status" "ClaimStatus" NOT NULL DEFAULT 'NA WERYFIKACJI',
    "statusChangedAt" TIMESTAMP(3),
    "decidedById" UUID,
    "comment" TEXT,
    "orderNumber" TEXT,
    "orderDate" DATE,
    "authorizationRequired" BOOLEAN NOT NULL DEFAULT false,
    "authorizationDescription" TEXT,
    "authorizationToken" TEXT,
    "authorizationDecidedAt" TIMESTAMP(3),
    "amountRequested" DECIMAL(12,2),
    "amountApproved" DECIMAL(12,2),
    "margin" DECIMAL(12,2),
    "amountMaximum" DECIMAL(12,2),
    "reklamacjaSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "reklamacjaText" TEXT,
    "reklamacjaResponse" TEXT,
    "reklamacjaAmount" DECIMAL(12,2),
    "hoursAdjusted" BOOLEAN NOT NULL DEFAULT false,
    "statusBeforeReklamacja" "ClaimStatus",
    "origDateStart" TIMESTAMP(3),
    "origDateEnd" TIMESTAMP(3),
    "origMileage" DECIMAL(10,2),
    "authScreenshotUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "claimId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER,
    "uploadedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delegations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vehicleId" UUID NOT NULL,
    "trailerId" UUID,
    "driverId" UUID,
    "carrierId" UUID NOT NULL,
    "driverNameSnapshot" TEXT,
    "driverPhoneSnapshot" TEXT,
    "departureAt" TIMESTAMP(3) NOT NULL,
    "departureCountry" TEXT,
    "departurePostalCode" TEXT,
    "plannedReturnAt" TIMESTAMP(3),
    "returnCountry" TEXT,
    "returnPostalCode" TEXT,
    "status" "DelegationStatus" NOT NULL DEFAULT 'zgloszony',
    "actualReturnAt" TIMESTAMP(3),
    "reportedById" UUID,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "delegations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_limits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "kmPerDay" DECIMAL(8,2),
    "ratePerKm" DECIMAL(6,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID,
    "userRole" "Role",
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetKey" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "metadata" JSONB,
    "ipAddress" INET,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_sequences" (
    "yearMonth" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claim_sequences_pkey" PRIMARY KEY ("yearMonth")
);

-- CreateIndex
CREATE UNIQUE INDEX "carriers_userId_key" ON "carriers"("userId");

-- CreateIndex
CREATE INDEX "carriers_opiekunId_idx" ON "carriers"("opiekunId");

-- CreateIndex
CREATE INDEX "carriers_deletedAt_idx" ON "carriers"("deletedAt");

-- CreateIndex
CREATE INDEX "vehicles_plannerId_idx" ON "vehicles"("plannerId");

-- CreateIndex
CREATE INDEX "vehicles_dispatcherId_idx" ON "vehicles"("dispatcherId");

-- CreateIndex
CREATE INDEX "vehicles_active_deletedAt_idx" ON "vehicles"("active", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_carrierId_plateNumber_key" ON "vehicles"("carrierId", "plateNumber");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_loginSlug_key" ON "drivers"("loginSlug");

-- CreateIndex
CREATE INDEX "drivers_carrierId_active_idx" ON "drivers"("carrierId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "trailers_carrierId_plateNumber_key" ON "trailers"("carrierId", "plateNumber");

-- CreateIndex
CREATE UNIQUE INDEX "trailer_types_name_key" ON "trailer_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "claims_nrZgl_key" ON "claims"("nrZgl");

-- CreateIndex
CREATE INDEX "claims_carrierId_status_idx" ON "claims"("carrierId", "status");

-- CreateIndex
CREATE INDEX "claims_vehicleId_idx" ON "claims"("vehicleId");

-- CreateIndex
CREATE INDEX "claims_status_statusChangedAt_idx" ON "claims"("status", "statusChangedAt");

-- CreateIndex
CREATE INDEX "claims_dateStart_idx" ON "claims"("dateStart");

-- CreateIndex
CREATE INDEX "delegations_vehicleId_status_idx" ON "delegations"("vehicleId", "status");

-- CreateIndex
CREATE INDEX "delegations_carrierId_status_idx" ON "delegations"("carrierId", "status");

-- CreateIndex
CREATE INDEX "delegations_status_departureAt_idx" ON "delegations"("status", "departureAt");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_limits_year_month_key" ON "monthly_limits"("year", "month");

-- CreateIndex
CREATE INDEX "audit_log_userId_idx" ON "audit_log"("userId");

-- CreateIndex
CREATE INDEX "audit_log_targetType_targetKey_idx" ON "audit_log"("targetType", "targetKey");

-- CreateIndex
CREATE INDEX "audit_log_action_idx" ON "audit_log"("action");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- AddForeignKey
ALTER TABLE "carriers" ADD CONSTRAINT "carriers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carriers" ADD CONSTRAINT "carriers_opiekunId_fkey" FOREIGN KEY ("opiekunId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "carriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_plannerId_fkey" FOREIGN KEY ("plannerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_dispatcherId_fkey" FOREIGN KEY ("dispatcherId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "carriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trailers" ADD CONSTRAINT "trailers_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "carriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trailers" ADD CONSTRAINT "trailers_trailerTypeId_fkey" FOREIGN KEY ("trailerTypeId") REFERENCES "trailer_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "carriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_attachments" ADD CONSTRAINT "claim_attachments_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_trailerId_fkey" FOREIGN KEY ("trailerId") REFERENCES "trailers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "carriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
