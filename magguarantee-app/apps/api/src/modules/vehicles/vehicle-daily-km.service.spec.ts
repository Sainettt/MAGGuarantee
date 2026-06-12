import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';

import { VehicleDayState, VehicleStatusSource } from '@magguarantee/database';
import type { SetVehicleDailyKmDto } from '@magguarantee/shared';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
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
} from './vehicles.repository';

const VEHICLE_ID = 'veh-1';
const WER_SUB = 'wer-1';

function auth(role: AuthUser['role'], sub: string): AuthUser {
  return { sub, login: 'actor', email: 'actor@magtrans.eu', name: 'Actor', role };
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
    async (_scope?: { plannerId?: string; dispatcherId?: string }) =>
      opts.boardVehicles ?? [],
  );
  const vehicles = {
    findById: findByIdSpy,
    update: updateSpy,
    listActiveForBoard: listActiveForBoardSpy,
  } as unknown as VehiclesRepository;

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
    service: new VehicleDailyKmService(vehicles, dailyKm),
    findByIdSpy,
    updateSpy,
    listActiveForBoardSpy,
    upsertSpy,
    listByVehicleSpy,
    listForWeekSpy,
    vehicleIdsWithDroveInWeekSpy,
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
  it('only includes vehicles that drove, and forwards the scope', async () => {
    const vehicles = [
      boardVehicle({ id: 'veh-A', plateNumber: 'AAA' }),
      boardVehicle({ id: 'veh-B', plateNumber: 'BBB' }),
    ];
    const weekRows = [
      kmRow({
        id: 'a1',
        vehicleId: 'veh-A',
        date: new Date('2026-06-08T00:00:00.000Z'),
        state: VehicleDayState.drove,
        km: 150,
      }),
    ];
    const { service, listActiveForBoardSpy } = makeService({
      boardVehicles: vehicles,
      droveIds: new Set(['veh-A']),
      weekRows,
    });
    const out = await service.getReport(
      { from: '2026-06-08' },
      { plannerId: 'planner-1' },
    );
    expect(out.items.map((i) => i.id)).toEqual(['veh-A']);
    expect(out.items[0]!.kmSum).toBe(150);
    // scope forwarded to the active-vehicle query
    expect(listActiveForBoardSpy).toHaveBeenCalledWith({ plannerId: 'planner-1' });
  });

  it('empty report when nothing drove', async () => {
    const { service } = makeService({
      boardVehicles: [boardVehicle()],
      droveIds: new Set(),
    });
    const out = await service.getReport({ from: '2026-06-08' }, {});
    expect(out.items).toEqual([]);
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
