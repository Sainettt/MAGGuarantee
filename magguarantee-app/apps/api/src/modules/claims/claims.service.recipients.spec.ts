// docs/29 U8 — who gets the internal wniosek mails on the planista side.
//
// Before docs/29 the recipients were the vehicle's CURRENT planista + his free
// text `liderEmail`. Now:
//  - claim WITH an outing → the planista of that trip (snapshot
//    `Delegation.plannerId`), even after the vehicle moved to someone else;
//  - claim WITHOUT an outing → every planista whose journal row overlaps the
//    claim period;
//  - CC → each such planista's CURRENT leader (`liderId → User.email`).
//
// The method under test is private (fire-and-forget notification plumbing);
// it is reached through a typed cast, with a hand-rolled Prisma fake that
// answers the four root-client reads it makes.

import type { AuditWriter } from '../audit/audit.service';
import type { CarriersRepository } from '../carriers/carriers.repository';
import type { DriversRepository } from '../drivers/drivers.repository';
import type { KmCalcService } from '../km-calc/km-calc.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TrailersRepository } from '../trailers/trailers.repository';
import type { VehiclesRepository } from '../vehicles/vehicles.repository';
import type { ClaimRow, ClaimsRepository } from './claims.repository';
import { ClaimsService } from './claims.service';
import type { NrZglService } from './nr-zgl.service';

interface PlannerUser {
  id: string;
  email: string;
  active: boolean;
  deletedAt: Date | null;
  liderUser: { email: string; active: boolean; deletedAt: Date | null } | null;
}

interface Assignment {
  vehicleId: string;
  plannerId: string;
  validFrom: Date;
  validTo: Date | null;
}

interface World {
  delegations: Record<string, { plannerId: string | null }>;
  assignments: Assignment[];
  planners: PlannerUser[];
}

type Recipients = {
  carrierEmail: string | null;
  internalEmails: string[];
  openerEmails: Set<string>;
};

/** Evaluates the overlap `where` the service builds, over the in-memory journal. */
function overlapFilter(where: {
  vehicleId: string;
  validFrom: { lt: Date };
  OR: [{ validTo: null }, { validTo: { gte: Date } }];
}): (a: Assignment) => boolean {
  const start = where.OR[1].validTo.gte;
  return (a) =>
    a.vehicleId === where.vehicleId &&
    a.validFrom < where.validFrom.lt &&
    (a.validTo === null || a.validTo >= start);
}

function makePrisma(world: World): PrismaService {
  const client = {
    user: {
      findMany: jest.fn(
        async (args: { where: { id?: { in: string[] }; role?: unknown } }) => {
          // The staff (admin + pracownik) query — none in these tests.
          if (!args.where.id) return [];
          const ids = new Set(args.where.id.in);
          return world.planners
            .filter((p) => ids.has(p.id) && p.active && p.deletedAt === null)
            .map((p) => ({ email: p.email, liderUser: p.liderUser }));
        },
      ),
    },
    carrier: {
      findFirst: jest.fn(async () => ({
        user: { email: 'carrier@example.com' },
        opiekun: { email: 'opiekun@magtrans.eu' },
      })),
    },
    delegation: {
      findFirst: jest.fn(async (args: { where: { id: string } }) =>
        world.delegations[args.where.id] ?? null,
      ),
    },
    vehiclePlannerAssignment: {
      findMany: jest.fn(async (args: { where: Parameters<typeof overlapFilter>[0] }) =>
        world.assignments.filter(overlapFilter(args.where)).map((a) => ({
          plannerId: a.plannerId,
        })),
      ),
    },
  };
  return { client, tx: client } as unknown as PrismaService;
}

function makeService(world: World): ClaimsService {
  const noop = {} as unknown;
  return new ClaimsService(
    noop as ClaimsRepository,
    noop as CarriersRepository,
    noop as VehiclesRepository,
    noop as DriversRepository,
    noop as TrailersRepository,
    noop as KmCalcService,
    noop as NrZglService,
    makePrisma(world),
    noop as AuditWriter,
  );
}

async function recipientsOf(world: World, claim: Partial<ClaimRow>): Promise<Recipients> {
  const svc = makeService(world);
  const row = {
    carrierId: 'c-1',
    vehicleId: 'v-1',
    delegationId: null,
    dateStart: new Date('2026-09-01T00:00:00.000Z'),
    dateEnd: new Date('2026-09-10T00:00:00.000Z'),
    ...claim,
  } as ClaimRow;
  const collect = (
    svc as unknown as { _collectClaimRecipients: (r: ClaimRow) => Promise<Recipients> }
  )._collectClaimRecipients.bind(svc);
  return collect(row);
}

const OLD: PlannerUser = {
  id: 'p-old',
  email: 'Old.Planner@magtrans.eu',
  active: true,
  deletedAt: null,
  liderUser: { email: 'lider.a@magtrans.eu', active: true, deletedAt: null },
};
const NEW: PlannerUser = {
  id: 'p-new',
  email: 'new.planner@magtrans.eu',
  active: true,
  deletedAt: null,
  liderUser: { email: 'lider.b@magtrans.eu', active: true, deletedAt: null },
};

/** The vehicle was transferred from OLD to NEW on 2026-09-05 12:00. */
const TRANSFER_AT = new Date('2026-09-05T12:00:00.000Z');
const JOURNAL: Assignment[] = [
  { vehicleId: 'v-1', plannerId: 'p-old', validFrom: new Date('2026-01-01T00:00:00.000Z'), validTo: TRANSFER_AT },
  { vehicleId: 'v-1', plannerId: 'p-new', validFrom: TRANSFER_AT, validTo: null },
];

describe('ClaimsService._collectClaimRecipients — planista side (docs/29 U8)', () => {
  it('claim with an outing → the trip-snapshot planista + his current lider, not the vehicle’s new planista', async () => {
    const out = await recipientsOf(
      { delegations: { 'd-1': { plannerId: 'p-old' } }, assignments: JOURNAL, planners: [OLD, NEW] },
      { delegationId: 'd-1' },
    );
    expect(out.internalEmails).toEqual(
      expect.arrayContaining(['old.planner@magtrans.eu', 'lider.a@magtrans.eu']),
    );
    expect(out.internalEmails).not.toContain('new.planner@magtrans.eu');
    expect(out.internalEmails).not.toContain('lider.b@magtrans.eu');
    // The opiekun is still there; the carrier is never an internal recipient.
    expect(out.internalEmails).toContain('opiekun@magtrans.eu');
    expect(out.internalEmails).not.toContain('carrier@example.com');
  });

  it('claim with an outing whose snapshot is empty → no planista recipient', async () => {
    const out = await recipientsOf(
      { delegations: { 'd-1': { plannerId: null } }, assignments: JOURNAL, planners: [OLD, NEW] },
      { delegationId: 'd-1' },
    );
    expect(out.internalEmails).toEqual(['opiekun@magtrans.eu']);
  });

  it('claim without an outing, period across the transfer → both planisci + both leaders', async () => {
    const out = await recipientsOf(
      { delegations: {}, assignments: JOURNAL, planners: [OLD, NEW] },
      {},
    );
    expect(out.internalEmails).toEqual(
      expect.arrayContaining([
        'old.planner@magtrans.eu',
        'lider.a@magtrans.eu',
        'new.planner@magtrans.eu',
        'lider.b@magtrans.eu',
      ]),
    );
  });

  it('claim without an outing, period entirely before the transfer → only the old planista', async () => {
    const out = await recipientsOf(
      { delegations: {}, assignments: JOURNAL, planners: [OLD, NEW] },
      {
        dateStart: new Date('2026-08-01T00:00:00.000Z'),
        dateEnd: new Date('2026-08-20T00:00:00.000Z'),
      },
    );
    expect(out.internalEmails).toContain('old.planner@magtrans.eu');
    expect(out.internalEmails).not.toContain('new.planner@magtrans.eu');
  });

  it('a transfer DURING the last day of the period counts the new planista (whole-day end)', async () => {
    const out = await recipientsOf(
      { delegations: {}, assignments: JOURNAL, planners: [OLD, NEW] },
      {
        dateStart: new Date('2026-09-01T00:00:00.000Z'),
        dateEnd: new Date('2026-09-05T00:00:00.000Z'),
      },
    );
    expect(out.internalEmails).toEqual(
      expect.arrayContaining(['old.planner@magtrans.eu', 'new.planner@magtrans.eu']),
    );
  });

  it('CC is the CURRENT leader; an inactive leader or planista is skipped', async () => {
    const out = await recipientsOf(
      {
        delegations: {},
        assignments: JOURNAL,
        planners: [
          { ...OLD, liderUser: { email: 'lider.a@magtrans.eu', active: false, deletedAt: null } },
          { ...NEW, active: false },
        ],
      },
      {},
    );
    expect(out.internalEmails).toContain('old.planner@magtrans.eu');
    expect(out.internalEmails).not.toContain('lider.a@magtrans.eu');
    expect(out.internalEmails).not.toContain('new.planner@magtrans.eu');
    expect(out.internalEmails).not.toContain('lider.b@magtrans.eu');
  });

  it('a planista without a leader adds no CC', async () => {
    const out = await recipientsOf(
      {
        delegations: { 'd-1': { plannerId: 'p-old' } },
        assignments: JOURNAL,
        planners: [{ ...OLD, liderUser: null }],
      },
      { delegationId: 'd-1' },
    );
    expect(out.internalEmails.sort()).toEqual(
      ['old.planner@magtrans.eu', 'opiekun@magtrans.eu'].sort(),
    );
  });
});
