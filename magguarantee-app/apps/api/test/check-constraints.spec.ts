/**
 * Integration tests for the phase3_blocks SQL CHECK constraints.
 *
 * These tests connect to the local Postgres instance referenced by
 * `DATABASE_URL` and verify that:
 *   1. `claim_accepted_payment_complete` rejects ZAAKCEPTOWANO with NULL
 *      `orderNumber`/`orderDate`/`amountApproved`.
 *   2. `vehicle_gps_device_when_gps_on` rejects `gps=true` with NULL
 *      `gpsMobilePhone`.
 *
 * Each test is self-contained: it creates the minimum needed parent rows
 * (User → Carrier → Vehicle), executes the bad insert via raw SQL, and
 * tears its data down. A constraint violation is recognized by Postgres'
 * sqlState `23514` (check_violation).
 *
 * Skipped when `DATABASE_URL` is not set (e.g. unit-test-only CI lane).
 */

import { prisma } from '@magguarantee/database';

const SKIP_REASON = 'DATABASE_URL not set — skipping constraint integration tests';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

if (!process.env.DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.log(SKIP_REASON);
}

interface ConstraintError {
  code?: string;
  meta?: { code?: string };
  message: string;
}

/**
 * Prisma wraps Postgres errors. The raw `executeRawUnsafe` path surfaces
 * the underlying SQLSTATE via `code` (Prisma `P2010`) plus `meta.code`
 * (`23514` = check_violation).
 */
function isCheckViolation(err: unknown): boolean {
  const e = err as ConstraintError;
  if (!e || typeof e !== 'object') return false;
  if (e.meta?.code === '23514') return true;
  return /23514|check_violation|check constraint/i.test(e.message);
}

describeIfDb('phase3_blocks CHECK constraints', () => {
  let userId: string;
  let carrierId: string;
  let opiekunId: string;
  const cleanupIds: { vehicles: string[]; claims: string[] } = {
    vehicles: [],
    claims: [],
  };

  beforeAll(async () => {
    // Create an opiekun + carrier we can attach vehicles/claims to.
    const opiekun = await prisma.user.create({
      data: {
        login: `checktest-op-${Date.now()}`,
        email: `checktest-op-${Date.now()}@example.com`,
        passwordHash: 'placeholder',
        role: 'opiekun',
        name: 'Check Op',
      },
    });
    opiekunId = opiekun.id;

    const carrierUser = await prisma.user.create({
      data: {
        login: `checktest-car-${Date.now()}`,
        email: `checktest-car-${Date.now()}@example.com`,
        passwordHash: 'placeholder',
        role: 'przewoznik',
        name: 'Check Carrier',
      },
    });
    userId = carrierUser.id;

    const carrier = await prisma.carrier.create({
      data: {
        userId: carrierUser.id,
        opiekunId: opiekun.id,
        contactPerson: 'Test',
        phone: '+480000',
        ordersEmail: 'orders@example.com',
        accountEur: 'PL00',
        insuranceValue: 100000,
        insuranceExpiry: new Date('2027-01-01'),
        licenseExpiry: new Date('2027-01-01'),
        companyAddress: 'ul. Testowa 1',
      },
    });
    carrierId = carrier.id;
  });

  afterAll(async () => {
    for (const id of cleanupIds.claims) {
      await prisma.claim.deleteMany({ where: { id } });
    }
    for (const id of cleanupIds.vehicles) {
      await prisma.vehicle.deleteMany({ where: { id } });
    }
    if (carrierId) {
      await prisma.carrier.deleteMany({ where: { id: carrierId } });
    }
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    if (opiekunId) {
      await prisma.user.deleteMany({ where: { id: opiekunId } });
    }
    await prisma.$disconnect();
  });

  it('vehicle_gps_device_when_gps_on rejects gps=true + gpsMobilePhone=NULL', async () => {
    let caught: unknown;
    try {
      await prisma.vehicle.create({
        data: {
          carrierId,
          plateNumber: `CHK-GPS-${Date.now()}`,
          certificateL: 'L1',
          euro: 'V',
          type: 'STD',
          rateDe: 0.5,
          rateUe: 0.5,
          rateExport: 0.5,
          rateImport: 0.5,
          gps: true,
          gpsMobilePhone: null,
        },
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(isCheckViolation(caught)).toBe(true);
  });

  it('vehicle_gps_device_when_gps_on accepts gps=false + gpsMobilePhone=NULL', async () => {
    const v = await prisma.vehicle.create({
      data: {
        carrierId,
        plateNumber: `CHK-NOGPS-${Date.now()}`,
        certificateL: 'L1',
        euro: 'V',
        type: 'STD',
        rateDe: 0.5,
        rateUe: 0.5,
        rateExport: 0.5,
        rateImport: 0.5,
        gps: false,
        gpsMobilePhone: null,
      },
    });
    cleanupIds.vehicles.push(v.id);
    expect(v.id).toBeTruthy();
  });

  it('claim_accepted_payment_complete rejects ZAAKCEPTOWANO with NULL orderNumber', async () => {
    // First make a vehicle to anchor the claim to.
    const vehicle = await prisma.vehicle.create({
      data: {
        carrierId,
        plateNumber: `CHK-CL-${Date.now()}`,
        certificateL: 'L1',
        euro: 'V',
        type: 'STD',
        rateDe: 0.5,
        rateUe: 0.5,
        rateExport: 0.5,
        rateImport: 0.5,
      },
    });
    cleanupIds.vehicles.push(vehicle.id);

    let caught: unknown;
    try {
      // Insert a ZAAKCEPTOWANO row with null orderNumber — must be rejected.
      await prisma.claim.create({
        data: {
          nrZgl: `CHK-CL-${Date.now()}`,
          carrierId,
          vehicleId: vehicle.id,
          vehiclePlateSnapshot: vehicle.plateNumber,
          dateStart: new Date('2026-04-01'),
          dateEnd: new Date('2026-04-30'),
          timeFrom: '08:00',
          timeTo: '17:00',
          drivenDays: 20,
          mileage: 8000,
          kmPerDay: 400,
          kmGuaranteed: 10800,
          kmDifference: 2800,
          paymentEur: 1400,
          ratePerKmEffective: 0.5,
          amountRequested: 1400,
          status: 'ZAAKCEPTOWANO',
          // The CHECK demands orderNumber, orderDate, amountApproved.
          orderNumber: null,
          orderDate: null,
          amountApproved: null,
        },
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(isCheckViolation(caught)).toBe(true);
  });

  it('claim_accepted_payment_complete accepts NA_WERYFIKACJI with NULL orderNumber', async () => {
    const vehicle = await prisma.vehicle.create({
      data: {
        carrierId,
        plateNumber: `CHK-CL2-${Date.now()}`,
        certificateL: 'L1',
        euro: 'V',
        type: 'STD',
        rateDe: 0.5,
        rateUe: 0.5,
        rateExport: 0.5,
        rateImport: 0.5,
      },
    });
    cleanupIds.vehicles.push(vehicle.id);

    const claim = await prisma.claim.create({
      data: {
        nrZgl: `CHK-CL2-${Date.now()}`,
        carrierId,
        vehicleId: vehicle.id,
        vehiclePlateSnapshot: vehicle.plateNumber,
        dateStart: new Date('2026-04-01'),
        dateEnd: new Date('2026-04-30'),
        timeFrom: '08:00',
        timeTo: '17:00',
        drivenDays: 20,
        mileage: 8000,
        kmPerDay: 400,
        kmGuaranteed: 10800,
        kmDifference: 2800,
        paymentEur: 1400,
        ratePerKmEffective: 0.5,
        amountRequested: 1400,
        // NA_WERYFIKACJI is the carrier-submit default — NULL fields ok.
        status: 'NA_WERYFIKACJI',
        orderNumber: null,
        orderDate: null,
        amountApproved: null,
      },
    });
    cleanupIds.claims.push(claim.id);
    expect(claim.id).toBeTruthy();
  });
});
