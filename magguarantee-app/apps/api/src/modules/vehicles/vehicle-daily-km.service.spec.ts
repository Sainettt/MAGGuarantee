import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { VehicleDayState, VehicleStatusSource } from '@magguarantee/database';
import {
  businessTodayIso,
  startOfBusinessTodayUtc,
  type SetVehicleDailyKmDto,
} from '@magguarantee/shared';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CarriersRepository } from '../carriers/carriers.repository';
import {
  VehicleDailyKmRepository,
  type VehicleDailyKmRow,
} from './vehicle-daily-km.repository';
import {
  resolveWeekWindow,
  VehicleDailyKmService,
} from './vehicle-daily-km.service';
import {
  VehiclesRepository,
  type VehicleBoardRow,
  type VehicleBoardScope,
} from './vehicles.repository';

const VEHICLE_ID = 'veh-1';
const WER_SUB = 'wer-1';

function auth(
  role: AuthUser['role'],
  sub: string,
  teamId: string | null = 'team-1',
): AuthUser {
  return {
    sub,
    login: 'actor',
    email: 'actor@magtrans.eu',
    name: 'Actor',
    role,
    mustChangePassword: false,
    teamId,
  };
}

function kmRow(overrides: Partial<VehicleDailyKmRow> = {}): VehicleDailyKmRow {
  return {
    id: 'dk-1',
    vehicleId: VEHICLE_ID,
    date: new Date('2026-06-08T00:00:00.000Z'),
    km: 540,
    state: VehicleDayState.drove,
    source: VehicleStatusSource.manual,
    notedById: WER_SUB,
    notedBy: { id: WER_SUB, name: 'Weryfikator' },
    notes: null,
    updatedAt: new Date('2026-06-08T09:00:00.000Z'),
    ...overrides,
  };
}

function boardVehicle(overrides: Partial<VehicleBoardRow> = {}): VehicleBoardRow {
  return {
    id: VEHICLE_ID,
    plateNumber: 'PL123',
    sideNumber: 'B-12',
    carrier: { id: 'car-1', name: 'Carrier C' },
    opiekun: { id: 'op-1', name: 'Opiekun O' },
    plannerName: 'Planner P',
    ...overrides,
  };
}

function makeService(opts: {
  vehicle?: { lastDroveAt: Date | null } | null;
  boardVehicles?: VehicleBoardRow[];
  weekRows?: VehicleDailyKmRow[];
  history?: VehicleDailyKmRow[];
  droveIds?: Set<string>;
  /** przewoznik → resolved own carrier id (null = no profile). */
  myCarrierId?: string | null;
  /** opiekun → supervised carrier id set. */
  opiekunCarrierIds?: string[];
} = {}) {
  const vehicle =
    opts.vehicle === undefined ? { lastDroveAt: null } : opts.vehicle;

  const findByIdSpy = jest.fn(async (_id: string) =>
    vehicle ? (vehicle as unknown) : null,
  );
  const updateSpy = jest.fn(
    async (_id: string, _data: Record<string, unknown>) => ({}),
  );
  const listActiveForBoardSpy = jest.fn(
    async (_scope?: VehicleBoardScope) => opts.boardVehicles ?? [],
  );
  const vehicles = {
    findById: findByIdSpy,
    update: updateSpy,
    listActiveForBoard: listActiveForBoardSpy,
  } as unknown as VehiclesRepository;

  const findIdByUserIdSpy = jest.fn(
    async (_userId: string): Promise<string | null> =>
      opts.myCarrierId === undefined ? null : opts.myCarrierId,
  );
  const listIdsForOpiekunSpy = jest.fn(
    async (_opiekunId: string): Promise<string[]> =>
      opts.opiekunCarrierIds ?? [],
  );
  const carriers = {
    findIdByUserId: findIdByUserIdSpy,
    listIdsForOpiekun: listIdsForOpiekunSpy,
  } as unknown as CarriersRepository;

  const upsertSpy = jest.fn(
    async (data: {
      vehicleId: string;
      date: Date;
      km: number | null;
      state: VehicleDayState;
      source: VehicleStatusSource;
      notedById: string | null;
      notes: string | null;
    }): Promise<VehicleDailyKmRow> =>
      kmRow({
        vehicleId: data.vehicleId,
        date: data.date,
        km: data.km,
        state: data.state,
        source: data.source,
        notedById: data.notedById,
        notes: data.notes,
        notedBy: data.notedById ? { id: data.notedById, name: 'W' } : null,
      }),
  );
  const listByVehicleSpy = jest.fn(
    async (
      _id: string,
      _from: Date | null,
      _to: Date | null,
    ): Promise<VehicleDailyKmRow[]> => opts.history ?? [],
  );
  const listForWeekSpy = jest.fn(
    async (
      _ids: string[],
      _start: Date,
      _end: Date,
    ): Promise<VehicleDailyKmRow[]> => opts.weekRows ?? [],
  );
  const vehicleIdsWithDroveInWeekSpy = jest.fn(
    async (
      _ids: string[],
      _start: Date,
      _end: Date,
    ): Promise<Set<string>> => opts.droveIds ?? new Set(),
  );
  const sumDroveKmSpy = jest.fn(async () => 0);
  const dailyKm = {
    upsert: upsertSpy,
    listByVehicle: listByVehicleSpy,
    listForWeek: listForWeekSpy,
    vehicleIdsWithDroveInWeek: vehicleIdsWithDroveInWeekSpy,
    sumDroveKm: sumDroveKmSpy,
  } as unknown as VehicleDailyKmRepository;

  return {
    service: new VehicleDailyKmService(vehicles, dailyKm, carriers),
    findByIdSpy,
    updateSpy,
    listActiveForBoardSpy,
    upsertSpy,
    listByVehicleSpy,
    listForWeekSpy,
    vehicleIdsWithDroveInWeekSpy,
    findIdByUserIdSpy,
    listIdsForOpiekunSpy,
  };
}

describe('VehicleDailyKmService.setDailyKm', () => {
  it('drove: upserts source=manual, notedById=caller, km echoed, state=drove', async () => {
    const { service, upsertSpy } = makeService();
    const dto: SetVehicleDailyKmDto = {
      date: '2026-06-08',
      state: 'drove',
      km: 540,
      notes: undefined,
    };
    const out = await service.setDailyKm(auth('weryfikator', WER_SUB), VEHICLE_ID, dto);
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const [data] = upsertSpy.mock.calls[0]!;
    expect(data.vehicleId).toBe(VEHICLE_ID);
    expect(data.state).toBe(VehicleDayState.drove);
    expect(data.km).toBe(540);
    expect(data.source).toBe(VehicleStatusSource.manual);
    expect(data.notedById).toBe(WER_SUB);
    expect((data.date as Date).toISOString()).toBe('2026-06-08T00:00:00.000Z');
    expect(out.state).toBe('drove');
    expect(out.km).toBe(540);
    expect(out.date).toBe('2026-06-08');
  });

  it('idle: stores km=null', async () => {
    const { service, upsertSpy } = makeService();
    const out = await service.setDailyKm(auth('admin', 'adm'), VEHICLE_ID, {
      date: '2026-06-08',
      state: 'idle',
      notes: 'serwis',
    });
    expect(upsertSpy.mock.calls[0]![0].state).toBe(VehicleDayState.idle);
    expect(upsertSpy.mock.calls[0]![0].km).toBeNull();
    expect(upsertSpy.mock.calls[0]![0].notes).toBe('serwis');
    expect(out.km).toBeNull();
  });

  it('drove with no/zero km → 422 (state↔km invariant)', async () => {
    const { service, upsertSpy } = makeService();
    await expect(
      service.setDailyKm(auth('weryfikator', WER_SUB), VEHICLE_ID, {
        date: '2026-06-08',
        state: 'drove',
        km: 0,
        notes: undefined,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      service.setDailyKm(auth('weryfikator', WER_SUB), VEHICLE_ID, {
        date: '2026-06-08',
        state: 'drove',
        notes: undefined,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('idle with km → 422 (state↔km invariant)', async () => {
    const { service, upsertSpy } = makeService();
    await expect(
      service.setDailyKm(auth('weryfikator', WER_SUB), VEHICLE_ID, {
        date: '2026-06-08',
        state: 'idle',
        km: 5,
        notes: undefined,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('drove bumps lastDroveAt when date is newer than current', async () => {
    const { service, updateSpy } = makeService({
      vehicle: { lastDroveAt: new Date('2026-06-01T00:00:00.000Z') },
    });
    await service.setDailyKm(auth('weryfikator', WER_SUB), VEHICLE_ID, {
      date: '2026-06-08',
      state: 'drove',
      km: 100,
      notes: undefined,
    });
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect((updateSpy.mock.calls[0]![1].lastDroveAt as Date).toISOString()).toBe(
      '2026-06-08T00:00:00.000Z',
    );
  });

  it('drove does NOT move lastDroveAt backwards (max semantics)', async () => {
    const { service, updateSpy } = makeService({
      vehicle: { lastDroveAt: new Date('2026-06-20T00:00:00.000Z') },
    });
    await service.setDailyKm(auth('weryfikator', WER_SUB), VEHICLE_ID, {
      date: '2026-06-08',
      state: 'drove',
      km: 100,
      notes: undefined,
    });
    // back-fill of an older day must not regress lastDroveAt
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('drove sets lastDroveAt when it was null', async () => {
    const { service, updateSpy } = makeService({ vehicle: { lastDroveAt: null } });
    await service.setDailyKm(auth('weryfikator', WER_SUB), VEHICLE_ID, {
      date: '2026-06-08',
      state: 'drove',
      km: 100,
      notes: undefined,
    });
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it('idle never touches lastDroveAt', async () => {
    const { service, updateSpy } = makeService({
      vehicle: { lastDroveAt: new Date('2026-06-01T00:00:00.000Z') },
    });
    await service.setDailyKm(auth('weryfikator', WER_SUB), VEHICLE_ID, {
      date: '2026-06-08',
      state: 'idle',
      notes: undefined,
    });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('404 when the vehicle does not exist (no upsert)', async () => {
    const { service, upsertSpy } = makeService({ vehicle: null });
    await expect(
      service.setDailyKm(auth('weryfikator', WER_SUB), 'missing', {
        date: '2026-06-08',
        state: 'drove',
        km: 1,
        notes: undefined,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(upsertSpy).not.toHaveBeenCalled();
  });
});

describe('VehicleDailyKmService — past-only date guard (server-authoritative)', () => {
  // Dates are computed RELATIVE to the shared Europe/Warsaw "today" helper, so
  // these stay green at any wall-clock run time (and across the Warsaw night
  // when a UTC-midnight "today" would lag). `startOfBusinessTodayUtc()` returns
  // UTC midnight of the Warsaw calendar date; we shift it by whole days and
  // re-encode as YYYY-MM-DD.
  const isoOffsetDays = (days: number): string => {
    const base = startOfBusinessTodayUtc();
    const d = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  };
  const TODAY = businessTodayIso();
  const YESTERDAY = isoOffsetDays(-1);
  const TOMORROW = isoOffsetDays(1);

  it('setDailyKm: today → 422 (locked), no upsert', async () => {
    const { service, upsertSpy } = makeService();
    await expect(
      service.setDailyKm(auth('weryfikator', WER_SUB), VEHICLE_ID, {
        date: TODAY,
        state: 'drove',
        km: 100,
        notes: undefined,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('setDailyKm: future → 422 (locked), no upsert', async () => {
    const { service, upsertSpy } = makeService();
    await expect(
      service.setDailyKm(auth('admin', 'adm'), VEHICLE_ID, {
        date: TOMORROW,
        state: 'drove',
        km: 100,
        notes: undefined,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('setDailyKm: strictly-past day → succeeds (upsert called)', async () => {
    const { service, upsertSpy } = makeService();
    const out = await service.setDailyKm(
      auth('weryfikator', WER_SUB),
      VEHICLE_ID,
      { date: YESTERDAY, state: 'drove', km: 100, notes: undefined },
    );
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    expect(upsertSpy.mock.calls[0]![0].date.toISOString().slice(0, 10)).toBe(
      YESTERDAY,
    );
    expect(out.state).toBe('drove');
  });

  it('clearDailyKm: today → 422 (locked), no delete', async () => {
    const { service } = makeService();
    const dailyKm = (
      service as unknown as { dailyKm: Record<string, jest.Mock> }
    ).dailyKm;
    const findSpy = jest.fn(async () => null);
    const delSpy = jest.fn(async () => ({ count: 0 }));
    dailyKm.findByVehicleDate = findSpy;
    dailyKm.deleteByVehicleDate = delSpy;
    await expect(
      service.clearDailyKm(auth('weryfikator', WER_SUB), VEHICLE_ID, TODAY),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(delSpy).not.toHaveBeenCalled();
    expect(findSpy).not.toHaveBeenCalled();
  });

  it('clearDailyKm: future → 422 (locked), no delete', async () => {
    const { service } = makeService();
    const dailyKm = (
      service as unknown as { dailyKm: Record<string, jest.Mock> }
    ).dailyKm;
    const delSpy = jest.fn(async () => ({ count: 0 }));
    dailyKm.findByVehicleDate = jest.fn(async () => null);
    dailyKm.deleteByVehicleDate = delSpy;
    await expect(
      service.clearDailyKm(auth('admin', 'adm'), VEHICLE_ID, TOMORROW),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(delSpy).not.toHaveBeenCalled();
  });

  it('clearDailyKm: strictly-past day → succeeds (delete called)', async () => {
    const { service } = makeService();
    const dailyKm = (
      service as unknown as { dailyKm: Record<string, jest.Mock> }
    ).dailyKm;
    const delSpy = jest.fn(async () => ({ count: 1 }));
    dailyKm.findByVehicleDate = jest.fn(async () => null);
    dailyKm.deleteByVehicleDate = delSpy;
    await service.clearDailyKm(auth('weryfikator', WER_SUB), VEHICLE_ID, YESTERDAY);
    expect(delSpy).toHaveBeenCalledTimes(1);
  });
});

describe('VehicleDailyKmService.getHistory', () => {
  it('returns mapped history and passes the [from, to+1d) window', async () => {
    const rows = [kmRow({ id: 'dk-2' }), kmRow({ id: 'dk-1' })];
    const { service, listByVehicleSpy } = makeService({ history: rows });
    const out = await service.getHistory(VEHICLE_ID, {
      from: '2026-06-01',
      to: '2026-06-08',
    });
    expect(out.map((r) => r.id)).toEqual(['dk-2', 'dk-1']);
    const [, from, toExclusive] = listByVehicleSpy.mock.calls[0]!;
    expect((from as Date).toISOString()).toBe('2026-06-01T00:00:00.000Z');
    // inclusive `to` → half-open upper bound is to+1 day
    expect((toExclusive as Date).toISOString()).toBe('2026-06-09T00:00:00.000Z');
  });

  it('open window when from/to omitted', async () => {
    const { service, listByVehicleSpy } = makeService();
    await service.getHistory(VEHICLE_ID, {});
    const [, from, toExclusive] = listByVehicleSpy.mock.calls[0]!;
    expect(from).toBeNull();
    expect(toExclusive).toBeNull();
  });

  it('404 when the vehicle does not exist', async () => {
    const { service } = makeService({ vehicle: null });
    await expect(service.getHistory('missing', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('VehicleDailyKmService.getBoard', () => {
  it('builds 7 cells, kmSum over drove, and derived motion status', async () => {
    const weekRows = [
      kmRow({
        id: 'd-mon',
        date: new Date('2026-06-08T00:00:00.000Z'),
        state: VehicleDayState.drove,
        km: 300,
      }),
      kmRow({
        id: 'd-tue',
        date: new Date('2026-06-09T00:00:00.000Z'),
        state: VehicleDayState.idle,
        km: null,
      }),
      kmRow({
        id: 'd-wed',
        date: new Date('2026-06-10T00:00:00.000Z'),
        state: VehicleDayState.drove,
        km: 200,
      }),
    ];
    const { service } = makeService({
      boardVehicles: [boardVehicle()],
      weekRows,
    });
    const out = await service.getBoard({ from: '2026-06-08' });
    expect(out.weekStart).toBe('2026-06-08');
    expect(out.weekEnd).toBe('2026-06-14');
    expect(out.items).toHaveLength(1);
    const item = out.items[0]!;
    expect(item.cells).toHaveLength(7);
    expect(item.cells[0]).toEqual({
      date: '2026-06-08',
      state: 'drove',
      km: 300,
      notes: null,
    });
    expect(item.cells[1]!.state).toBe('idle');
    expect(item.cells[1]!.km).toBeNull();
    expect(item.cells[3]!.state).toBeNull(); // Thu — not checked
    expect(item.kmSum).toBe(500);
    // latest-by-date row is Wed (drove) → w_ruchu
    expect(item.motionStatus).toBe('w_ruchu');
    expect(item.carrier).toEqual({ id: 'car-1', name: 'Carrier C' });
    expect(item.opiekun).toEqual({ id: 'op-1', name: 'Opiekun O' });
    expect(item.planner).toBe('Planner P');
  });

  it('motion status nieznany when no rows in the week', async () => {
    const { service } = makeService({ boardVehicles: [boardVehicle()], weekRows: [] });
    const out = await service.getBoard({ from: '2026-06-08' });
    expect(out.items[0]!.motionStatus).toBe('nieznany');
    expect(out.items[0]!.kmSum).toBe(0);
    expect(out.items[0]!.cells.every((c) => c.state === null)).toBe(true);
  });

  it('motion status nie_jezdzi when latest row is idle', async () => {
    const weekRows = [
      kmRow({ date: new Date('2026-06-08T00:00:00.000Z'), state: VehicleDayState.drove, km: 100 }),
      kmRow({ date: new Date('2026-06-12T00:00:00.000Z'), state: VehicleDayState.idle, km: null }),
    ];
    const { service } = makeService({ boardVehicles: [boardVehicle()], weekRows });
    const out = await service.getBoard({ from: '2026-06-08' });
    expect(out.items[0]!.motionStatus).toBe('nie_jezdzi');
    expect(out.items[0]!.kmSum).toBe(100);
  });
});

describe('VehicleDailyKmService.getReport', () => {
  const drove = (id: string, km: number) =>
    kmRow({
      id: `${id}-1`,
      vehicleId: id,
      date: new Date('2026-06-08T00:00:00.000Z'),
      state: VehicleDayState.drove,
      km,
    });

  // ── planista / dyspozytor: scoped + drove-only (UNCHANGED) ─────────────

  it('planista: scoped by plannerId, only vehicles that drove', async () => {
    const { service, listActiveForBoardSpy } = makeService({
      boardVehicles: [
        boardVehicle({ id: 'veh-A', plateNumber: 'AAA' }),
        boardVehicle({ id: 'veh-B', plateNumber: 'BBB' }),
      ],
      droveIds: new Set(['veh-A']),
      weekRows: [drove('veh-A', 150)],
    });
    const out = await service.getReport(
      { from: '2026-06-08' },
      auth('planista', 'planner-1'),
    );
    expect(out.items.map((i) => i.id)).toEqual(['veh-A']);
    expect(out.items[0]!.kmSum).toBe(150);
    expect(listActiveForBoardSpy).toHaveBeenCalledWith({
      plannerId: 'planner-1',
      includeIdle: false,
    });
  });

  it('dyspozytor: scoped by dispatchTeamId (Phase 11), only vehicles that drove', async () => {
    const { service, listActiveForBoardSpy } = makeService({
      boardVehicles: [boardVehicle({ id: 'veh-A' })],
      droveIds: new Set(['veh-A']),
      weekRows: [drove('veh-A', 90)],
    });
    const out = await service.getReport(
      { from: '2026-06-08' },
      auth('dyspozytor', 'disp-1', 'team-1'),
    );
    expect(out.items.map((i) => i.id)).toEqual(['veh-A']);
    expect(listActiveForBoardSpy).toHaveBeenCalledWith({
      dispatchTeamId: 'team-1',
      includeIdle: false,
    });
  });

  it('dyspozytor with NO team: empty board (sentinel scope, never "all")', async () => {
    const { service, listActiveForBoardSpy } = makeService({
      boardVehicles: [],
      droveIds: new Set(),
    });
    const out = await service.getReport(
      { from: '2026-06-08' },
      auth('dyspozytor', 'disp-noteam', null),
    );
    expect(out.items).toEqual([]);
    expect(listActiveForBoardSpy).toHaveBeenCalledWith({
      dispatchTeamId: '__no_dispatch_team__',
      includeIdle: false,
    });
  });

  it('drove-only role: empty report when nothing drove', async () => {
    const { service } = makeService({
      boardVehicles: [boardVehicle()],
      droveIds: new Set(),
    });
    const out = await service.getReport(
      { from: '2026-06-08' },
      auth('eksport', 'eks-1'),
    );
    expect(out.items).toEqual([]);
  });

  // ── przewoznik: own carrier only, includeIdle ──────────────────────────

  it('przewoznik: scoped to OWN carrier id resolved from the JWT', async () => {
    const { service, listActiveForBoardSpy, findIdByUserIdSpy } = makeService({
      myCarrierId: 'car-mine',
      boardVehicles: [boardVehicle({ id: 'veh-A', carrier: { id: 'car-mine', name: 'Mine' } })],
      weekRows: [drove('veh-A', 200)],
    });
    const out = await service.getReport(
      { from: '2026-06-08' },
      auth('przewoznik', 'pwz-user'),
    );
    expect(findIdByUserIdSpy).toHaveBeenCalledWith('pwz-user');
    expect(listActiveForBoardSpy).toHaveBeenCalledWith({
      carrierId: 'car-mine',
      includeIdle: true,
    });
    expect(out.items.map((i) => i.id)).toEqual(['veh-A']);
  });

  it('przewoznik: a vehicle that did NOT drive still appears (includeIdle)', async () => {
    const { service, vehicleIdsWithDroveInWeekSpy } = makeService({
      myCarrierId: 'car-mine',
      boardVehicles: [
        boardVehicle({ id: 'veh-A', carrier: { id: 'car-mine', name: 'Mine' } }),
        boardVehicle({ id: 'veh-idle', plateNumber: 'IDLE', carrier: { id: 'car-mine', name: 'Mine' } }),
      ],
      // only veh-A drove; veh-idle has no marks at all
      droveIds: new Set(['veh-A']),
      weekRows: [drove('veh-A', 200)],
    });
    const out = await service.getReport(
      { from: '2026-06-08' },
      auth('przewoznik', 'pwz-user'),
    );
    // BOTH vehicles present — non-driving one is NOT dropped.
    expect(out.items.map((i) => i.id).sort()).toEqual(['veh-A', 'veh-idle']);
    const idle = out.items.find((i) => i.id === 'veh-idle')!;
    expect(idle.kmSum).toBe(0);
    expect(idle.cells.every((c) => c.state === null)).toBe(true);
    // includeIdle ⇒ the drove-only narrowing query is never consulted.
    expect(vehicleIdsWithDroveInWeekSpy).not.toHaveBeenCalled();
  });

  it('przewoznik: no carrier profile → 403', async () => {
    const { service } = makeService({ myCarrierId: null });
    await expect(
      service.getReport({ from: '2026-06-08' }, auth('przewoznik', 'orphan')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // ── opiekun: supervised carrier set only, includeIdle ──────────────────

  it('opiekun: scoped to the supervised carrier-id set (no cross-carrier leak)', async () => {
    const { service, listActiveForBoardSpy, listIdsForOpiekunSpy } = makeService({
      opiekunCarrierIds: ['car-1', 'car-2'],
      boardVehicles: [
        boardVehicle({ id: 'veh-1', carrier: { id: 'car-1', name: 'C1' } }),
        boardVehicle({ id: 'veh-2', carrier: { id: 'car-2', name: 'C2' } }),
      ],
      weekRows: [drove('veh-1', 100)],
      droveIds: new Set(['veh-1']),
    });
    const out = await service.getReport(
      { from: '2026-06-08' },
      auth('opiekun', 'op-user'),
    );
    expect(listIdsForOpiekunSpy).toHaveBeenCalledWith('op-user');
    expect(listActiveForBoardSpy).toHaveBeenCalledWith({
      carrierIds: ['car-1', 'car-2'],
      includeIdle: true,
    });
    // both supervised vehicles present (incl. the idle veh-2)
    expect(out.items.map((i) => i.id).sort()).toEqual(['veh-1', 'veh-2']);
  });

  it('opiekun with NO supervised carriers → empty board (not all vehicles)', async () => {
    const { service, listActiveForBoardSpy } = makeService({
      opiekunCarrierIds: [],
      // even if the repo were (wrongly) called without a filter, force a
      // non-empty fixture so the assertion proves the empty-set scope, not an
      // accidentally-empty fleet, drives the empty board.
      boardVehicles: [boardVehicle({ id: 'veh-X' })],
    });
    const out = await service.getReport(
      { from: '2026-06-08' },
      auth('opiekun', 'op-empty'),
    );
    // The repo is asked for the empty set; in production it short-circuits to
    // 0 rows. The mock returns its fixture, so we assert the SCOPE handed down
    // is the empty set (the real repo guarantees the empty board).
    expect(listActiveForBoardSpy).toHaveBeenCalledWith({
      carrierIds: [],
      includeIdle: true,
    });
    void out;
  });
});

describe('resolveWeekWindow', () => {
  it('snaps a `from` mid-week back to Monday', () => {
    // 2026-06-10 is a Wednesday → Monday is 2026-06-08
    const { start, endExclusive } = resolveWeekWindow({ from: '2026-06-10' });
    expect(start.toISOString()).toBe('2026-06-08T00:00:00.000Z');
    expect(endExclusive.toISOString()).toBe('2026-06-15T00:00:00.000Z');
  });

  it('keeps a Monday `from` as-is', () => {
    const { start } = resolveWeekWindow({ from: '2026-06-08' });
    expect(start.toISOString()).toBe('2026-06-08T00:00:00.000Z');
  });

  it('resolves an ISO week label to its Monday', () => {
    // ISO week 2026-W24 starts Monday 2026-06-08
    const { start, endExclusive } = resolveWeekWindow({ week: '2026-W24' });
    expect(start.toISOString()).toBe('2026-06-08T00:00:00.000Z');
    expect(endExclusive.toISOString()).toBe('2026-06-15T00:00:00.000Z');
  });

  it('ISO week 1 of a year starting mid-week (2026-W01 → 2025-12-29)', () => {
    // 2026-01-01 is a Thursday; ISO week 1 Monday is 2025-12-29
    const { start } = resolveWeekWindow({ week: '2026-W01' });
    expect(start.toISOString()).toBe('2025-12-29T00:00:00.000Z');
  });
});
