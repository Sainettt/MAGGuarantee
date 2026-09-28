// docs/29 — the vehicles side of the planner transfer:
//  - R1: `PATCH /vehicles/:id` refuses `plannerId` for EVERY role with 422
//    `VEHICLE_PLANNER_CHANGE_REQUIRES_TRANSFER` (Zod refine → pipe → 422);
//  - R7: `POST /vehicles` opens the `create` row of the planista journal in
//    the same insert (validFrom = createdAt, actor = creator);
//  - U6: switching a vehicle off (deactivate / PATCH active=false /
//    soft-delete) cancels its pending transfer request, closed by the caller.

import 'reflect-metadata';

import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';

import {
  UpdateVehicleSchema,
  VEHICLE_PLANNER_CHANGE_REQUIRES_TRANSFER,
} from '@magguarantee/shared';

import { AuditContext, type AuditContextStore } from '../../common/audit';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type { CarriersRepository } from '../carriers/carriers.repository';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';
import type { TeamsRepository } from '../teams/teams.repository';
import type { UsersRepository } from '../users/users.repository';
import type { VehicleAttachmentsRepository } from './vehicle-attachments.repository';
import type { VehicleDailyKmService } from './vehicle-daily-km.service';
import type { VehiclePlannerTransfersRepository } from './vehicle-planner-transfers.repository';
import { VehiclesController } from './vehicles.controller';
import { VehiclesRepository, type VehicleRow } from './vehicles.repository';
import { VehiclesService } from './vehicles.service';

const NOW = new Date('2026-09-28T10:00:00.000Z');

function user(role: AuthUser['role'], sub = `u-${role}`): AuthUser {
  return { sub, login: role, email: `${role}@magtrans.eu`, name: role, role, mustChangePassword: false };
}

function makeVehicle(overrides: Partial<VehicleRow> = {}): VehicleRow {
  return {
    id: 'v-1',
    carrierId: 'c-1',
    plateNumber: 'WA0001',
    active: true,
    notes: null,
    certificateL: true,
    euro: 'VI',
    fuelCard: false,
    fuelCardNumber: null,
    fuelCardExpiry: null,
    fuelCardPin: null,
    type: 'STD',
    gb: true,
    it: true,
    fr: false,
    agreement: null,
    rateDe: 0.5,
    rateUe: 0.5,
    rateExport: 0.5,
    rateImport: 0.5,
    wasteAllowed: false,
    wasteCountries: [],
    cabotageDe: false,
    cabotageFr: false,
    adr: false,
    adrClasses: [],
    gpsMobilePhone: null,
    sideNumber: null,
    lastDroveAt: null,
    plannerId: 'p-1',
    planner: { id: 'p-1', login: 'plan', name: 'Plan' },
    dispatchTeamId: null,
    dispatchTeam: null,
    carrier: { id: 'c-1', login: 'pwz', name: 'Pwz' },
    opiekun: { id: 'op-1', login: 'op', name: 'Op' },
    attachments: [],
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

// ── R1 — PATCH refuses plannerId ─────────────────────────────

describe('UpdateVehicleSchema — plannerId is refused with a machine code (docs/29 R1)', () => {
  const pipe = new ZodValidationPipe(UpdateVehicleSchema);
  const meta = { type: 'body' as const };

  it.each([
    ['a uuid', '7d0f5d0e-8f2a-4a8b-9c4e-2b1a3c4d5e6f'],
    ['null ("remove the planista")', null],
    ['any string', 'whatever'],
  ])('422 VEHICLE_PLANNER_CHANGE_REQUIRES_TRANSFER for %s', (_label, value) => {
    try {
      pipe.transform({ notes: 'x', plannerId: value }, meta);
      throw new Error('expected a 422');
    } catch (err) {
      expect(err).toBeInstanceOf(UnprocessableEntityException);
      const body = (err as UnprocessableEntityException).getResponse() as {
        extensions?: { code?: string };
      };
      expect(body.extensions?.code).toBe(VEHICLE_PLANNER_CHANGE_REQUIRES_TRANSFER);
    }
  });

  it('a body without plannerId passes and the output never carries it', () => {
    const out = pipe.transform({ notes: 'x' }, meta) as Record<string, unknown>;
    expect(out).toEqual({ notes: 'x' });
    expect('plannerId' in out).toBe(false);
  });

  it('a shape error next to it keeps the plain 400', () => {
    expect(() => pipe.transform({ plannerId: 'x', rateDe: 'abc' }, meta)).toThrow(
      BadRequestException,
    );
  });

  it('applies to admin too — the controller refuses before reaching the service', async () => {
    const update = jest.fn();
    const controller = new VehiclesController(
      { update } as unknown as VehiclesService,
      {} as VehicleDailyKmService,
    );
    // Multipart text part, exactly what a stale edit form would send.
    await expect(
      controller.update(user('admin'), 'v-1', { plannerId: 'p-2', notes: 'x' }, {}),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(update).not.toHaveBeenCalled();
  });
});

// ── R7 — create opens the journal ────────────────────────────

describe('VehiclesRepository.create — the `create` journal row (docs/29 R7)', () => {
  function capture(): { repo: VehiclesRepository; create: jest.Mock } {
    const create = jest.fn(async (args: { data: Record<string, unknown> }) => ({
      ...makeVehicle(),
      ...args.data,
      rateDe: null,
      rateUe: null,
      rateExport: null,
      rateImport: null,
      planner: null,
      dispatchTeam: null,
      carrier: null,
      attachments: [],
    }));
    const prisma = { tx: { vehicle: { create } } } as unknown as PrismaService;
    return { repo: new VehiclesRepository(prisma), create };
  }

  const base = {
    carrierId: 'c-1',
    plateNumber: 'WA0009',
    certificateL: true,
    euro: 'VI' as const,
    type: 'STD' as const,
  };

  it('nests a `create` row: planner = the vehicle planista, validFrom = createdAt, actor = creator', async () => {
    const { repo, create } = capture();
    await repo.create({ ...base, plannerId: 'p-1', createdById: 'u-admin' });
    const data = (create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    const nested = (data.plannerAssignments as { create: Record<string, unknown> }).create;
    expect(nested).toEqual({
      plannerId: 'p-1',
      validFrom: data.createdAt,
      source: 'create',
      actorId: 'u-admin',
    });
    expect(data.createdAt).toBeInstanceOf(Date);
    expect(data.plannerId).toBe('p-1');
  });

  it('no planista → no journal row', async () => {
    const { repo, create } = capture();
    await repo.create({ ...base, plannerId: null });
    const data = (create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(data.plannerAssignments).toBeUndefined();
  });
});

// ── U6 — switching the vehicle off cancels its pending request ──

describe('VehiclesService — deactivation cancels the pending transfer (docs/29 U6)', () => {
  function build(vehicle: VehicleRow): {
    svc: VehiclesService;
    cancelPending: jest.Mock;
  } {
    const rows = new Map([[vehicle.id, vehicle]]);
    const vehicles = {
      findById: jest.fn(async (id: string) => rows.get(id) ?? null),
      setActive: jest.fn(async (id: string, active: boolean) => {
        const next = { ...rows.get(id)!, active };
        rows.set(id, next);
        return next;
      }),
      update: jest.fn(async (id: string, patch: Partial<VehicleRow>) => {
        const next = { ...rows.get(id)!, ...patch };
        rows.set(id, next);
        return next;
      }),
      softDelete: jest.fn(async () => undefined),
    } as unknown as VehiclesRepository;
    const cancelPending = jest.fn(async () => 1);
    const transfers = {
      cancelPendingForVehicle: cancelPending,
    } as unknown as VehiclePlannerTransfersRepository;
    const svc = new VehiclesService(
      vehicles,
      {} as UsersRepository,
      {} as CarriersRepository,
      { softDelete: jest.fn() } as unknown as VehicleAttachmentsRepository,
      {} as StorageService,
      {} as TeamsRepository,
      undefined,
      undefined,
      transfers,
    );
    return { svc, cancelPending };
  }

  async function inAudit<T>(fn: () => Promise<T>): Promise<AuditContextStore> {
    const store: AuditContextStore = {
      actor: { userId: 'u-opiekun', userRole: 'opiekun' },
      ipAddress: null,
    };
    await AuditContext.run(store, fn);
    return store;
  }

  it('POST /:id/deactivate cancels it, closed by the caller, and notes it in the audit row', async () => {
    const { svc, cancelPending } = build(makeVehicle());
    const store = await inAudit(() => svc.deactivate('v-1', user('opiekun')));
    expect(cancelPending).toHaveBeenCalledWith('v-1', 'u-opiekun', expect.any(Date));
    expect(store.metadata).toMatchObject({ cancelledPlannerTransfers: 1 });
  });

  it('PATCH active=false cancels it too', async () => {
    const { svc, cancelPending } = build(makeVehicle());
    await svc.update('v-1', { active: false }, [], user('admin', 'u-adm'));
    expect(cancelPending).toHaveBeenCalledWith('v-1', 'u-adm', expect.any(Date));
  });

  it('a PATCH that keeps the vehicle on does not touch the request', async () => {
    const { svc, cancelPending } = build(makeVehicle());
    await svc.update('v-1', { notes: 'x' }, [], user('admin'));
    await svc.update('v-1', { active: true }, [], user('admin'));
    expect(cancelPending).not.toHaveBeenCalled();
  });

  it('soft-delete cancels it (a removed vehicle can never be handed over)', async () => {
    const { svc, cancelPending } = build(makeVehicle());
    await svc.softDelete('v-1', user('admin', 'u-adm'));
    expect(cancelPending).toHaveBeenCalledWith('v-1', 'u-adm', expect.any(Date));
  });
});
