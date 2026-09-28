// docs/29 §3.5 — the planner transfer workflow over an in-memory world.
//
// The fakes below keep ONE shared state (users, vehicles, requests, journal,
// trips) so a test can file → decide → look at every table afterwards, and
// then read the trips through the real `DelegationsService` scope to prove
// the before/after visibility of the old and the new planista (R5/R6).

import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { DelegationStatus, Role } from '@magguarantee/shared';

import { AuditContext, type AuditContextStore } from '../../common/audit';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type { CarrierReadinessService } from '../carriers/carrier-readiness.service';
import type { CarriersRepository } from '../carriers/carriers.repository';
import type {
  DelegationListFilters,
  DelegationRow,
  DelegationsRepository,
} from '../delegations/delegations.repository';
import { DelegationsService } from '../delegations/delegations.service';
import type { DriversRepository } from '../drivers/drivers.repository';
import type { TrailersRepository } from '../trailers/trailers.repository';
import type { UserRow, UsersRepository } from '../users/users.repository';
import type {
  PlannerAssignmentRow,
  VehiclePlannerAssignmentsRepository,
} from '../vehicles/vehicle-planner-assignments.repository';
import type {
  ClosePlannerTransferData,
  PlannerTransferListFilters,
  PlannerTransferPersonRow,
  PlannerTransferRow,
  VehiclePlannerTransfersRepository,
} from '../vehicles/vehicle-planner-transfers.repository';
import type { VehicleRow, VehiclesRepository } from '../vehicles/vehicles.repository';
import { PlannerTransfersService } from './planner-transfers.service';

// ─── the world ───────────────────────────────────────────────

interface Person {
  id: string;
  role: Role;
  lider: boolean;
  active: boolean;
  liderId: string | null;
}

interface StoredTransfer {
  id: string;
  vehicleId: string;
  fromPlannerId: string;
  toPlannerId: string;
  requestedById: string;
  status: PlannerTransferRow['status'];
  reason: string;
  decisionComment: string | null;
  decidedById: string | null;
  decidedAt: Date | null;
  createdAt: Date;
}

interface StoredAssignment {
  id: string;
  vehicleId: string;
  plannerId: string;
  validFrom: Date;
  validTo: Date | null;
  source: PlannerAssignmentRow['source'];
  transferId: string | null;
  actorId: string | null;
}

interface Trip {
  id: string;
  vehicleId: string;
  plannerId: string | null;
  status: DelegationStatus;
}

interface World {
  people: Map<string, Person>;
  vehicle: { id: string; active: boolean; plannerId: string | null; opiekunId: string };
  transfers: StoredTransfer[];
  assignments: StoredAssignment[];
  trips: Trip[];
  locks: string[];
  /** Force the next `closeIfPending` to lose a race (0 rows). */
  loseNextClose: boolean;
}

// People of the story:
//   p-old  — current planista of v-1, led by lider-a
//   p-new  — target planista, led by lider-b
//   lider-a / lider-b — planisci with the lider flag
//   p-plain — a planista without the flag and without a leader
//   op-1  — opiekun of the vehicle's carrier;  op-2 — another opiekun
//   admin — admin
function makeWorld(): World {
  const people = new Map<string, Person>();
  const add = (p: Person): void => {
    people.set(p.id, p);
  };
  add({ id: 'admin', role: 'admin', lider: false, active: true, liderId: null });
  add({ id: 'op-1', role: 'opiekun', lider: false, active: true, liderId: null });
  add({ id: 'op-2', role: 'opiekun', lider: false, active: true, liderId: null });
  add({ id: 'lider-a', role: 'planista', lider: true, active: true, liderId: null });
  add({ id: 'lider-b', role: 'planista', lider: true, active: true, liderId: null });
  add({ id: 'p-old', role: 'planista', lider: false, active: true, liderId: 'lider-a' });
  add({ id: 'p-new', role: 'planista', lider: false, active: true, liderId: 'lider-b' });
  add({ id: 'p-plain', role: 'planista', lider: false, active: true, liderId: null });
  return {
    people,
    vehicle: { id: 'v-1', active: true, plannerId: 'p-old', opiekunId: 'op-1' },
    transfers: [],
    assignments: [
      {
        id: 'a-0',
        vehicleId: 'v-1',
        plannerId: 'p-old',
        validFrom: new Date('2026-01-01T00:00:00.000Z'),
        validTo: null,
        source: 'backfill',
        transferId: null,
        actorId: null,
      },
    ],
    trips: [
      { id: 't-zgl', vehicleId: 'v-1', plannerId: 'p-old', status: 'zgloszony' },
      { id: 't-got', vehicleId: 'v-1', plannerId: 'p-old', status: 'gotowy' },
      { id: 't-wtr', vehicleId: 'v-1', plannerId: 'p-old', status: 'w_trasie' },
      { id: 't-zje', vehicleId: 'v-1', plannerId: 'p-old', status: 'zjechal' },
      { id: 't-anu', vehicleId: 'v-1', plannerId: 'p-old', status: 'anulowany' },
    ],
    locks: [],
    loseNextClose: false,
  };
}

function personRow(w: World, id: string): PlannerTransferPersonRow {
  const p = w.people.get(id)!;
  return { id, login: id, name: id.toUpperCase(), role: p.role, lider: p.lider };
}

function transferRow(w: World, t: StoredTransfer): PlannerTransferRow {
  const from = w.people.get(t.fromPlannerId)!;
  return {
    ...t,
    updatedAt: t.decidedAt ?? t.createdAt,
    vehicle: {
      id: w.vehicle.id,
      plateNumber: 'WA0001',
      sideNumber: '117',
      active: w.vehicle.active,
      carrierId: 'c-1',
      carrier: { id: 'c-1', login: 'pwz', name: 'Pwz' },
    },
    fromPlanner: {
      ...personRow(w, t.fromPlannerId),
      liderId: from.liderId,
      leader: from.liderId ? { id: from.liderId, login: from.liderId, name: null } : null,
    },
    toPlanner: personRow(w, t.toPlannerId),
    requestedBy: personRow(w, t.requestedById),
    decidedBy: t.decidedById ? personRow(w, t.decidedById) : null,
  };
}

function vehicleRow(w: World): VehicleRow {
  return {
    id: w.vehicle.id,
    carrierId: 'c-1',
    plateNumber: 'WA0001',
    active: w.vehicle.active,
    plannerId: w.vehicle.plannerId,
    opiekun: { id: w.vehicle.opiekunId, login: 'op', name: 'Op' },
  } as VehicleRow;
}

let seq = 0;

function makeService(w: World): PlannerTransfersService {
  const transfers = {
    findById: jest.fn(async (id: string) => {
      const t = w.transfers.find((x) => x.id === id);
      return t ? transferRow(w, t) : null;
    }),
    findPendingByVehicle: jest.fn(async (vehicleId: string) => {
      const t = w.transfers.find((x) => x.vehicleId === vehicleId && x.status === 'pending');
      return t ? transferRow(w, t) : null;
    }),
    create: jest.fn(async (data: Omit<StoredTransfer, 'id' | 'status' | 'decisionComment' | 'decidedById' | 'decidedAt' | 'createdAt'>) => {
      // The partial unique index: one pending per vehicle.
      if (w.transfers.some((x) => x.vehicleId === data.vehicleId && x.status === 'pending')) {
        throw Object.assign(new Error('P2002'), { code: 'P2002' });
      }
      seq += 1;
      const t: StoredTransfer = {
        ...data,
        id: `tr-${seq}`,
        status: 'pending',
        decisionComment: null,
        decidedById: null,
        decidedAt: null,
        createdAt: new Date(Date.UTC(2026, 8, 1, 0, seq)),
      };
      w.transfers.push(t);
      return transferRow(w, t);
    }),
    list: jest.fn(async (f: PlannerTransferListFilters) =>
      w.transfers
        .filter((t) => f.statuses.includes(t.status))
        .filter((t) => !f.requestedById || t.requestedById === f.requestedById)
        .filter(
          (t) =>
            !f.fromPlannerLiderId ||
            w.people.get(t.fromPlannerId)?.liderId === f.fromPlannerLiderId,
        )
        .map((t) => transferRow(w, t)),
    ),
    listByVehicle: jest.fn(async (vehicleId: string) =>
      w.transfers.filter((t) => t.vehicleId === vehicleId).map((t) => transferRow(w, t)),
    ),
    closeIfPending: jest.fn(
      async (id: string, data: ClosePlannerTransferData, onlyRequestedById?: string) => {
        if (w.loseNextClose) {
          w.loseNextClose = false;
          return 0;
        }
        const t = w.transfers.find(
          (x) =>
            x.id === id &&
            x.status === 'pending' &&
            (!onlyRequestedById || x.requestedById === onlyRequestedById),
        );
        if (!t) return 0;
        Object.assign(t, data);
        return 1;
      },
    ),
  } as unknown as VehiclePlannerTransfersRepository;

  const assignments = {
    listByVehicle: jest.fn(async (vehicleId: string) =>
      w.assignments
        .filter((a) => a.vehicleId === vehicleId)
        .map(
          (a): PlannerAssignmentRow => ({
            ...a,
            planner: personRow(w, a.plannerId),
            actor: a.actorId ? personRow(w, a.actorId) : null,
            transfer: null,
          }),
        ),
    ),
    closeOpen: jest.fn(async (vehicleId: string, at: Date) => {
      const open = w.assignments.filter((a) => a.vehicleId === vehicleId && a.validTo === null);
      for (const a of open) a.validTo = at;
      return open.length;
    }),
    openFromTransfer: jest.fn(
      async (d: { vehicleId: string; plannerId: string; validFrom: Date; transferId: string; actorId: string }) => {
        w.assignments.push({ ...d, id: `a-${w.assignments.length}`, validTo: null, source: 'transfer' });
      },
    ),
  } as unknown as VehiclePlannerAssignmentsRepository;

  const vehicles = {
    findById: jest.fn(async (id: string) => (id === w.vehicle.id ? vehicleRow(w) : null)),
    lockForUpdate: jest.fn(async (id: string) => {
      w.locks.push(id);
      return true;
    }),
    setPlanner: jest.fn(async (_id: string, plannerId: string) => {
      w.vehicle.plannerId = plannerId;
    }),
  } as unknown as VehiclesRepository;

  const users = {
    findById: jest.fn(async (id: string) => {
      const p = w.people.get(id);
      return p ? ({ ...p, login: id, name: id } as unknown as UserRow) : null;
    }),
  } as unknown as UsersRepository;

  const delegations = {
    reassignPlannerSnapshot: jest.fn(
      async (a: { vehicleId: string; fromPlannerId: string; toPlannerId: string; statuses: readonly DelegationStatus[] }) => {
        let n = 0;
        for (const t of w.trips) {
          if (t.vehicleId === a.vehicleId && t.plannerId === a.fromPlannerId && a.statuses.includes(t.status)) {
            t.plannerId = a.toPlannerId;
            n += 1;
          }
        }
        return n;
      },
    ),
  } as unknown as DelegationsRepository;

  return new PlannerTransfersService(transfers, assignments, vehicles, users, delegations);
}

function as(w: World, id: string): AuthUser {
  const p = w.people.get(id)!;
  return {
    sub: id,
    login: id,
    email: `${id}@magtrans.eu`,
    name: id,
    role: p.role,
    lider: p.lider,
    mustChangePassword: false,
  };
}

/** Runs a mutation inside an audit context (what the interceptor does). */
async function audited<T>(fn: () => Promise<T>): Promise<{ result: T; store: AuditContextStore }> {
  const store: AuditContextStore = { actor: { userId: 'x', userRole: 'admin' }, ipAddress: null };
  const result = await AuditContext.run(store, fn);
  return { result, store };
}

/** Files the standard request p-old → p-new by the opiekun; returns its id. */
async function fileStandard(w: World, svc: PlannerTransfersService): Promise<string> {
  const out = await svc.request(as(w, 'op-1'), 'v-1', {
    toPlannerId: 'p-new',
    reason: 'Planista przechodzi do eksportu',
  });
  return out.id;
}

function codeOf(err: unknown): string | undefined {
  const body = (err as { getResponse?: () => unknown }).getResponse?.() as
    | { extensions?: { code?: string } }
    | undefined;
  return body?.extensions?.code;
}

async function expectRejection(
  p: Promise<unknown>,
  type: typeof ForbiddenException | typeof ConflictException | typeof UnprocessableEntityException,
  code?: string,
): Promise<void> {
  try {
    await p;
    throw new Error('expected a rejection');
  } catch (err) {
    expect(err).toBeInstanceOf(type);
    if (code) expect(codeOf(err)).toBe(code);
  }
}

// ─── filing ──────────────────────────────────────────────────

describe('PlannerTransfersService.request — who may file (R2, U1, U2, U4)', () => {
  it('the opiekun of the carrier files a pending request p-old → p-new', async () => {
    const w = makeWorld();
    const svc = makeService(w);
    const { result, store } = await audited(() =>
      svc.request(as(w, 'op-1'), 'v-1', { toPlannerId: 'p-new', reason: 'Zmiana regionu' }),
    );
    expect(result).toMatchObject({
      status: 'pending',
      fromPlanner: { id: 'p-old', leader: { id: 'lider-a' } },
      toPlanner: { id: 'p-new' },
      requestedBy: { id: 'op-1', role: 'opiekun' },
      viewerCanCancel: true,
      viewerCanDecide: false,
    });
    expect(store.metadata).toMatchObject({ vehicleId: 'v-1', toPlannerId: 'p-new' });
    // Filing changes nothing else.
    expect(w.vehicle.plannerId).toBe('p-old');
  });

  it('the CURRENT planista may file for his own vehicle', async () => {
    const w = makeWorld();
    const out = await makeService(w).request(as(w, 'p-old'), 'v-1', {
      toPlannerId: 'p-new',
      reason: 'Za dużo aut',
    });
    expect(out.requestedBy.id).toBe('p-old');
  });

  it.each([
    ['an opiekun of ANOTHER carrier', 'op-2'],
    ['a planista who is not the current one', 'p-new'],
    ['the lider of the current planista', 'lider-a'],
    ['an admin (U1 — he only decides)', 'admin'],
  ])('%s is refused with 403 PLANNER_TRANSFER_REQUEST_FORBIDDEN', async (_l, who) => {
    const w = makeWorld();
    await expectRejection(
      makeService(w).request(as(w, who), 'v-1', { toPlannerId: 'p-plain', reason: 'Powód' }),
      ForbiddenException,
      'PLANNER_TRANSFER_REQUEST_FORBIDDEN',
    );
    expect(w.transfers).toHaveLength(0);
  });

  it('a second pending request for the vehicle is 409 PLANNER_TRANSFER_ALREADY_PENDING', async () => {
    const w = makeWorld();
    const svc = makeService(w);
    await fileStandard(w, svc);
    await expectRejection(
      svc.request(as(w, 'p-old'), 'v-1', { toPlannerId: 'p-plain', reason: 'Inny powód' }),
      ConflictException,
      'PLANNER_TRANSFER_ALREADY_PENDING',
    );
  });

  it('a concurrent filing that loses at the unique index is 409 too (P2002)', async () => {
    const w = makeWorld();
    const svc = makeService(w);
    // Simulate the race: the pre-check sees nothing, the insert collides.
    w.transfers.push({
      id: 'tr-race',
      vehicleId: 'v-1',
      fromPlannerId: 'p-old',
      toPlannerId: 'p-plain',
      requestedById: 'p-old',
      status: 'pending',
      reason: 'x',
      decisionComment: null,
      decidedById: null,
      decidedAt: null,
      createdAt: new Date(),
    });
    const repo = (svc as unknown as { transfers: { findPendingByVehicle: jest.Mock } }).transfers;
    repo.findPendingByVehicle.mockResolvedValueOnce(null);
    await expectRejection(
      svc.request(as(w, 'op-1'), 'v-1', { toPlannerId: 'p-new', reason: 'Powód' }),
      ConflictException,
      'PLANNER_TRANSFER_ALREADY_PENDING',
    );
  });

  it('a switched-off vehicle is 422 PLANNER_TRANSFER_VEHICLE_INACTIVE', async () => {
    const w = makeWorld();
    w.vehicle.active = false;
    await expectRejection(
      makeService(w).request(as(w, 'op-1'), 'v-1', { toPlannerId: 'p-new', reason: 'Powód' }),
      UnprocessableEntityException,
      'PLANNER_TRANSFER_VEHICLE_INACTIVE',
    );
  });

  it.each([
    ['the current planista himself', 'p-old', undefined],
    ['an inactive planista', 'p-new', (w: World) => (w.people.get('p-new')!.active = false)],
    ['a non-planista', 'op-2', undefined],
    ['an unknown user', 'nobody', undefined],
  ])('target = %s → 422 PLANNER_TRANSFER_TARGET_INVALID', async (_l, target, mutate) => {
    const w = makeWorld();
    mutate?.(w);
    await expectRejection(
      makeService(w).request(as(w, 'op-1'), 'v-1', { toPlannerId: target, reason: 'Powód' }),
      UnprocessableEntityException,
      'PLANNER_TRANSFER_TARGET_INVALID',
    );
  });
});

// ─── the decision matrix (R3, R4, U10) ───────────────────────

describe('PlannerTransfersService — decision matrix', () => {
  it.each([
    ['admin', 'admin'],
    ['the lider of fromPlanner', 'lider-a'],
  ])('%s may approve', async (_l, who) => {
    const w = makeWorld();
    const svc = makeService(w);
    const id = await fileStandard(w, svc);
    const out = await svc.approve(as(w, who), id, {});
    expect(out.status).toBe('approved');
    expect(out.decidedBy?.id).toBe(who);
  });

  it.each([
    ['the lider of the TARGET planista', 'lider-b'],
    ['a plain planista (the current one, no flag)', 'p-old'],
    ['a planista without any link', 'p-plain'],
  ])('%s is 403 PLANNER_TRANSFER_NOT_DECIDER', async (_l, who) => {
    const w = makeWorld();
    const svc = makeService(w);
    const id = await fileStandard(w, svc);
    await expectRejection(svc.approve(as(w, who), id, {}), ForbiddenException, 'PLANNER_TRANSFER_NOT_DECIDER');
    await expectRejection(
      svc.reject(as(w, who), id, { reason: 'Nie' }),
      ForbiddenException,
      'PLANNER_TRANSFER_NOT_DECIDER',
    );
    expect(w.transfers[0]?.status).toBe('pending');
  });

  it('another lider (leads nobody involved) is 403', async () => {
    const w = makeWorld();
    w.people.set('lider-c', { id: 'lider-c', role: 'planista', lider: true, active: true, liderId: null });
    const svc = makeService(w);
    const id = await fileStandard(w, svc);
    await expectRejection(svc.approve(as(w, 'lider-c'), id, {}), ForbiddenException, 'PLANNER_TRANSFER_NOT_DECIDER');
  });

  it('a lider whose flag was REMOVED is 403 even though the link stays (U10)', async () => {
    const w = makeWorld();
    const svc = makeService(w);
    const id = await fileStandard(w, svc);
    w.people.get('lider-a')!.lider = false; // p-old.liderId still points at lider-a
    await expectRejection(svc.approve(as(w, 'lider-a'), id, {}), ForbiddenException, 'PLANNER_TRANSFER_NOT_DECIDER');
  });

  it('the lider who would RECEIVE the vehicle is 403 PLANNER_TRANSFER_DECIDER_IS_TARGET (R4)', async () => {
    const w = makeWorld();
    const svc = makeService(w);
    const out = await svc.request(as(w, 'op-1'), 'v-1', { toPlannerId: 'lider-a', reason: 'Do lidera' });
    await expectRejection(
      svc.approve(as(w, 'lider-a'), out.id, {}),
      ForbiddenException,
      'PLANNER_TRANSFER_DECIDER_IS_TARGET',
    );
    // …and only an admin can decide it.
    await expect(svc.approve(as(w, 'admin'), out.id, {})).resolves.toMatchObject({ status: 'approved' });
  });

  it('the lider who FILED the request is 403 PLANNER_TRANSFER_DECIDER_IS_REQUESTER (R4)', async () => {
    const w = makeWorld();
    const svc = makeService(w);
    // Filed when lider-a still had another role — not reachable through
    // `request()` today, the rule must still hold on the row.
    w.transfers.push({
      id: 'tr-self',
      vehicleId: 'v-1',
      fromPlannerId: 'p-old',
      toPlannerId: 'p-new',
      requestedById: 'lider-a',
      status: 'pending',
      reason: 'Mój wniosek',
      decisionComment: null,
      decidedById: null,
      decidedAt: null,
      createdAt: new Date(),
    });
    await expectRejection(
      svc.approve(as(w, 'lider-a'), 'tr-self', {}),
      ForbiddenException,
      'PLANNER_TRANSFER_DECIDER_IS_REQUESTER',
    );
  });

  it('a planista with no leader: only an admin decides (R4)', async () => {
    const w = makeWorld();
    w.vehicle.plannerId = 'p-plain';
    const svc = makeService(w);
    const out = await svc.request(as(w, 'op-1'), 'v-1', { toPlannerId: 'p-new', reason: 'Powód' });
    expect(out.fromPlanner.leader).toBeNull();
    await expectRejection(svc.approve(as(w, 'lider-a'), out.id, {}), ForbiddenException);
    await expect(svc.approve(as(w, 'admin'), out.id, {})).resolves.toMatchObject({ status: 'approved' });
  });
});

// ─── the approval transaction (docs/29 §3.2, R6, U6) ─────────

describe('PlannerTransfersService.approve — the hand-over', () => {
  it('locks the vehicle, moves planista + journal (one `now`) + only zgloszony/gotowy trips', async () => {
    const w = makeWorld();
    const svc = makeService(w);
    const id = await fileStandard(w, svc);
    const { result, store } = await audited(() =>
      svc.approve(as(w, 'lider-a'), id, { comment: 'OK' }),
    );

    expect(w.locks).toEqual(['v-1']);
    expect(w.vehicle.plannerId).toBe('p-new');
    expect(result).toMatchObject({ status: 'approved', decisionComment: 'OK', viewerCanDecide: false });

    const [closed, opened] = w.assignments;
    expect(closed?.validTo).toBeInstanceOf(Date);
    expect(opened).toMatchObject({
      plannerId: 'p-new',
      source: 'transfer',
      transferId: id,
      actorId: 'lider-a',
      validTo: null,
    });
    // ONE instant: the old row ends exactly where the new one starts.
    expect(opened?.validFrom.getTime()).toBe(closed?.validTo?.getTime());
    expect(w.transfers[0]?.decidedAt?.getTime()).toBe(opened?.validFrom.getTime());

    const byId = Object.fromEntries(w.trips.map((t) => [t.id, t.plannerId]));
    expect(byId).toEqual({
      't-zgl': 'p-new',
      't-got': 'p-new',
      't-wtr': 'p-old', // the old planista brings it home (R6)
      't-zje': 'p-old',
      't-anu': 'p-old',
    });
    expect(store.metadata).toMatchObject({ movedDelegations: 2, fromPlannerId: 'p-old', toPlannerId: 'p-new' });
    expect(store.before).toMatchObject({ status: 'pending' });
  });

  it('stale: the vehicle changed planista meanwhile → 409 PLANNER_TRANSFER_PLANNER_CHANGED, nothing moves', async () => {
    const w = makeWorld();
    const svc = makeService(w);
    const id = await fileStandard(w, svc);
    w.vehicle.plannerId = 'p-plain';
    await expectRejection(svc.approve(as(w, 'admin'), id, {}), ConflictException, 'PLANNER_TRANSFER_PLANNER_CHANGED');
    expect(w.transfers[0]?.status).toBe('pending');
    expect(w.trips.every((t) => t.plannerId === 'p-old')).toBe(true);
  });

  it('already decided (e.g. a concurrent approval won) → 409 PLANNER_TRANSFER_NOT_PENDING', async () => {
    const w = makeWorld();
    const svc = makeService(w);
    const id = await fileStandard(w, svc);
    await svc.approve(as(w, 'admin'), id, {});
    await expectRejection(svc.approve(as(w, 'lider-a'), id, {}), ConflictException, 'PLANNER_TRANSFER_NOT_PENDING');
  });

  it('losing the compare-and-set close → 409, and nothing is handed over', async () => {
    const w = makeWorld();
    const svc = makeService(w);
    const id = await fileStandard(w, svc);
    w.loseNextClose = true;
    await expectRejection(svc.approve(as(w, 'admin'), id, {}), ConflictException, 'PLANNER_TRANSFER_NOT_PENDING');
    expect(w.vehicle.plannerId).toBe('p-old');
    expect(w.assignments).toHaveLength(1);
  });

  it('vehicle switched off since filing → 422 PLANNER_TRANSFER_VEHICLE_INACTIVE', async () => {
    const w = makeWorld();
    const svc = makeService(w);
    const id = await fileStandard(w, svc);
    w.vehicle.active = false;
    await expectRejection(svc.approve(as(w, 'admin'), id, {}), UnprocessableEntityException, 'PLANNER_TRANSFER_VEHICLE_INACTIVE');
  });

  it('target deactivated since filing → 422 PLANNER_TRANSFER_TARGET_INVALID (still rejectable)', async () => {
    const w = makeWorld();
    const svc = makeService(w);
    const id = await fileStandard(w, svc);
    w.people.get('p-new')!.active = false;
    await expectRejection(svc.approve(as(w, 'admin'), id, {}), UnprocessableEntityException, 'PLANNER_TRANSFER_TARGET_INVALID');
    await expect(svc.reject(as(w, 'admin'), id, { reason: 'Planista odszedł' })).resolves.toMatchObject({
      status: 'rejected',
    });
  });
});

// ─── reject / cancel ─────────────────────────────────────────

describe('PlannerTransfersService.reject / cancel', () => {
  it('reject stores the reason and the decider, nothing moves', async () => {
    const w = makeWorld();
    const svc = makeService(w);
    const id = await fileStandard(w, svc);
    const out = await svc.reject(as(w, 'lider-a'), id, { reason: 'Brak zgody' });
    expect(out).toMatchObject({ status: 'rejected', decisionComment: 'Brak zgody', decidedBy: { id: 'lider-a' } });
    expect(w.vehicle.plannerId).toBe('p-old');
  });

  it('a stale request (planista changed) can still be rejected', async () => {
    const w = makeWorld();
    const svc = makeService(w);
    const id = await fileStandard(w, svc);
    w.vehicle.plannerId = 'p-plain';
    await expect(svc.reject(as(w, 'admin'), id, { reason: 'Nieaktualny' })).resolves.toMatchObject({
      status: 'rejected',
    });
  });

  it('the author cancels his pending request; decidedBy = the author', async () => {
    const w = makeWorld();
    const svc = makeService(w);
    const id = await fileStandard(w, svc);
    const out = await svc.cancel(as(w, 'op-1'), id);
    expect(out).toMatchObject({ status: 'cancelled', decidedBy: { id: 'op-1' }, viewerCanCancel: false });
    expect(w.transfers[0]?.decidedAt).toBeInstanceOf(Date);
  });

  it('someone else cannot cancel it → 403 PLANNER_TRANSFER_CANCEL_NOT_AUTHOR', async () => {
    const w = makeWorld();
    const svc = makeService(w);
    const id = await fileStandard(w, svc);
    await expectRejection(svc.cancel(as(w, 'p-old'), id), ForbiddenException, 'PLANNER_TRANSFER_CANCEL_NOT_AUTHOR');
  });

  it('cancelling a decided request → 409 PLANNER_TRANSFER_NOT_PENDING', async () => {
    const w = makeWorld();
    const svc = makeService(w);
    const id = await fileStandard(w, svc);
    await svc.reject(as(w, 'admin'), id, { reason: 'Nie' });
    await expectRejection(svc.cancel(as(w, 'op-1'), id), ConflictException, 'PLANNER_TRANSFER_NOT_PENDING');
  });
});

// ─── lists (docs/14 §17.12 A1) ───────────────────────────────

describe('PlannerTransfersService.list — scopes and viewer flags', () => {
  const base = { status: 'pending' as const, limit: 50 };

  it('scope=decide: admin sees all; a lider sees his planisci’s; the target’s lider does not', async () => {
    const w = makeWorld();
    const svc = makeService(w);
    await fileStandard(w, svc);
    expect((await svc.list(as(w, 'admin'), { ...base, scope: 'decide' })).items).toHaveLength(1);
    const a = await svc.list(as(w, 'lider-a'), { ...base, scope: 'decide' });
    expect(a.items).toHaveLength(1);
    expect(a.items[0]).toMatchObject({ viewerCanDecide: true, viewerBlockedReason: null });
    expect((await svc.list(as(w, 'lider-b'), { ...base, scope: 'decide' })).items).toHaveLength(0);
  });

  it('scope=decide keeps a row the lider may not decide, flagged with the reason', async () => {
    const w = makeWorld();
    const svc = makeService(w);
    await svc.request(as(w, 'op-1'), 'v-1', { toPlannerId: 'lider-a', reason: 'Do lidera' });
    const out = await svc.list(as(w, 'lider-a'), { ...base, scope: 'decide' });
    expect(out.items[0]).toMatchObject({ viewerCanDecide: false, viewerBlockedReason: 'target' });
  });

  it.each(['p-plain', 'op-1'])('scope=decide for %s (no admin, no lider) → 403', async (who) => {
    const w = makeWorld();
    await expectRejection(
      makeService(w).list(as(w, who), { ...base, scope: 'decide' }),
      ForbiddenException,
      'PLANNER_TRANSFER_NOT_DECIDER',
    );
  });

  it('scope=mine: the author sees his own; the target planista sees nothing (U11)', async () => {
    const w = makeWorld();
    const svc = makeService(w);
    await fileStandard(w, svc);
    const mine = await svc.list(as(w, 'op-1'), { ...base, scope: 'mine' });
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0]?.viewerCanCancel).toBe(true);
    expect((await svc.list(as(w, 'p-new'), { ...base, scope: 'mine' })).items).toHaveLength(0);
  });

  it('status=decided lists every terminal status', async () => {
    const w = makeWorld();
    const svc = makeService(w);
    const id = await fileStandard(w, svc);
    await svc.cancel(as(w, 'op-1'), id);
    const out = await svc.list(as(w, 'admin'), { ...base, status: 'decided', scope: 'decide' });
    expect(out.items.map((i) => i.status)).toEqual(['cancelled']);
  });
});

// ─── history visibility (U11) ────────────────────────────────

describe('PlannerTransfersService.history — who sees the journal (U11)', () => {
  it.each([
    ['admin', 'admin'],
    ['the opiekun of the carrier', 'op-1'],
    ['the current planista', 'p-old'],
    ['the lider of the current planista', 'lider-a'],
  ])('%s may read it', async (_l, who) => {
    const w = makeWorld();
    const svc = makeService(w);
    await fileStandard(w, svc);
    const out = await svc.history(as(w, who), 'v-1');
    expect(out.currentPlannerId).toBe('p-old');
    expect(out.assignments).toHaveLength(1);
    expect(out.transfers[0]?.status).toBe('pending');
  });

  it.each([
    ['another opiekun', 'op-2'],
    ['the target of the pending request', 'p-new'],
    ['the target’s lider', 'lider-b'],
    ['an unrelated planista', 'p-plain'],
  ])('%s is 403', async (_l, who) => {
    const w = makeWorld();
    const svc = makeService(w);
    await fileStandard(w, svc);
    await expectRejection(svc.history(as(w, who), 'v-1'), ForbiddenException);
  });

  it('the lider loses it once his flag is removed; the previous planista loses it after a transfer', async () => {
    const w = makeWorld();
    const svc = makeService(w);
    const id = await fileStandard(w, svc);
    await svc.approve(as(w, 'admin'), id, {});
    await expectRejection(svc.history(as(w, 'p-old'), 'v-1'), ForbiddenException);
    await expect(svc.history(as(w, 'p-new'), 'v-1')).resolves.toMatchObject({ currentPlannerId: 'p-new' });
    w.people.get('lider-b')!.lider = false;
    await expectRejection(svc.history(as(w, 'lider-b'), 'v-1'), ForbiddenException);
  });
});

// ─── trip visibility before / after (R5, R6 — through the real scope) ──

describe('trip visibility of the old and the new planista across a transfer', () => {
  function tripRow(t: Trip): DelegationRow {
    const d = new Date('2026-09-01T08:00:00.000Z');
    return {
      id: t.id,
      vehicleId: t.vehicleId,
      vehicle: null,
      plannerId: t.plannerId,
      planner: null,
      trailerId: 'trl-1',
      trailer: null,
      driverId: 'drv-1',
      driver: null,
      carrierId: 'c-1',
      carrier: null,
      driverNameSnapshot: null,
      driverPhoneSnapshot: null,
      departureAt: d,
      departureCountry: 'PL',
      departurePostalCode: '00-001',
      plannedReturnAt: d,
      returnCountry: 'PL',
      returnPostalCode: '00-001',
      status: t.status,
      actualDepartureAt: null,
      actualReturnAt: null,
      reportedById: null,
      reportedBy: null,
      reportedAt: d,
      verifiedById: null,
      verifiedBy: null,
      verifiedAt: null,
      readyById: null,
      readyBy: null,
      readyAt: null,
      spedOrderNumber: null,
      notes: null,
      claimId: null,
      createdAt: d,
      updatedAt: d,
      deletedAt: null,
    };
  }

  function tripsService(w: World): DelegationsService {
    const repo = {
      list: jest.fn(async (f: DelegationListFilters) =>
        w.trips.filter((t) => !f.plannerId || t.plannerId === f.plannerId).map(tripRow),
      ),
      findById: jest.fn(async (id: string) => {
        const t = w.trips.find((x) => x.id === id);
        return t ? tripRow(t) : null;
      }),
    } as unknown as DelegationsRepository;
    const noop = {} as unknown;
    return new DelegationsService(
      repo,
      noop as CarriersRepository,
      noop as VehiclesRepository,
      noop as DriversRepository,
      noop as TrailersRepository,
      noop as CarrierReadinessService,
    );
  }

  const ids = async (svc: DelegationsService, who: AuthUser): Promise<string[]> =>
    (await svc.list(who, { limit: 50 } as Parameters<DelegationsService['list']>[1])).items
      .map((i) => i.id)
      .sort();

  it('before: the old planista sees all five, the new one none; after: split by R6', async () => {
    const w = makeWorld();
    const trips = tripsService(w);
    expect(await ids(trips, as(w, 'p-old'))).toEqual(['t-anu', 't-got', 't-wtr', 't-zgl', 't-zje']);
    expect(await ids(trips, as(w, 'p-new'))).toEqual([]);

    const svc = makeService(w);
    await svc.approve(as(w, 'admin'), await fileStandard(w, svc), {});

    // The old planista keeps what he led and brings `w_trasie` home.
    expect(await ids(trips, as(w, 'p-old'))).toEqual(['t-anu', 't-wtr', 't-zje']);
    // The new one gets only the trips that had not left yet.
    expect(await ids(trips, as(w, 'p-new'))).toEqual(['t-got', 't-zgl']);
    // …and by id, the same split.
    await expect(trips.getOne(as(w, 'p-new'), 't-wtr')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(trips.getOne(as(w, 'p-old'), 't-wtr')).resolves.toMatchObject({ plannerId: 'p-old' });
    await expect(trips.getOne(as(w, 'p-old'), 't-zgl')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
