import { NotFoundException } from '@nestjs/common';

import { VehicleStatusSource } from '@magguarantee/database';
import type { SetVehicleRouteStatusDto } from '@magguarantee/shared';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import {
  VehicleRouteStatusRepository,
  type LatestTodayStatusRow,
  type VehicleRouteStatusRow,
} from './vehicle-route-status.repository';
import {
  dayWindowUtc,
  VehicleRouteStatusService,
} from './vehicle-route-status.service';
import {
  VehiclesRepository,
  type VehicleBoardRow,
} from './vehicles.repository';

const VEHICLE_ID = 'veh-1';
const WER_SUB = 'wer-1';

function auth(role: AuthUser['role'], sub: string): AuthUser {
  return { sub, login: 'actor', email: 'actor@magtrans.eu', name: 'Actor', role };
}

function logRow(overrides: Partial<VehicleRouteStatusRow> = {}): VehicleRouteStatusRow {
  return {
    id: 'rs-1',
    vehicleId: VEHICLE_ID,
    status: 'w_trasie',
    source: 'manual',
    notedById: WER_SUB,
    notedBy: { id: WER_SUB, name: 'Weryfikator' },
    notedAt: new Date('2026-06-10T09:00:00.000Z'),
    notes: null,
    createdAt: new Date('2026-06-10T09:00:00.000Z'),
    ...overrides,
  };
}

/**
 * Builds the service with mocked vehicle + route-status repos. The
 * `append` spy echoes its input into a full row so the DTO mapper has a shape;
 * the spies are returned so tests can inspect exactly what was written.
 */
function makeService(opts: {
  vehicleExists?: boolean;
  boardVehicles?: VehicleBoardRow[];
  latestToday?: Map<string, LatestTodayStatusRow>;
  history?: VehicleRouteStatusRow[];
} = {}) {
  const vehicleExists = opts.vehicleExists ?? true;

  const vehicleFindByIdSpy = jest.fn(async (_id: string) =>
    vehicleExists ? ({ id: VEHICLE_ID } as unknown) : null,
  );
  const vehicleUpdateSpy = jest.fn(
    async (_id: string, _data: Record<string, unknown>) => ({}),
  );
  const listActiveForBoardSpy = jest.fn(
    async (): Promise<VehicleBoardRow[]> => opts.boardVehicles ?? [],
  );
  const vehicles = {
    findById: vehicleFindByIdSpy,
    update: vehicleUpdateSpy,
    listActiveForBoard: listActiveForBoardSpy,
  } as unknown as VehiclesRepository;

  const appendSpy = jest.fn(
    async (data: {
      vehicleId: string;
      status: 'w_trasie' | 'zjechal';
      source: VehicleStatusSource;
      notedById: string | null;
      notedAt: Date;
      notes: string | null;
    }): Promise<VehicleRouteStatusRow> =>
      logRow({
        vehicleId: data.vehicleId,
        status: data.status,
        source: data.source,
        notedById: data.notedById,
        notedAt: data.notedAt,
        notes: data.notes,
        notedBy: data.notedById
          ? { id: data.notedById, name: 'Weryfikator' }
          : null,
      }),
  );
  const listByVehicleSpy = jest.fn(
    async (_id: string): Promise<VehicleRouteStatusRow[]> => opts.history ?? [],
  );
  const latestTodaySpy = jest.fn(
    async (
      _ids: string[],
      _start: Date,
      _end: Date,
    ): Promise<Map<string, LatestTodayStatusRow>> =>
      opts.latestToday ?? new Map(),
  );
  const routeStatuses = {
    append: appendSpy,
    listByVehicle: listByVehicleSpy,
    latestTodayByVehicles: latestTodaySpy,
  } as unknown as VehicleRouteStatusRepository;

  const service = new VehicleRouteStatusService(vehicles, routeStatuses);
  return {
    service,
    appendSpy,
    vehicleUpdateSpy,
    vehicleFindByIdSpy,
    listActiveForBoardSpy,
    latestTodaySpy,
    listByVehicleSpy,
  };
}

describe('VehicleRouteStatusService.setStatus', () => {
  it('appends a row: source=manual, notedById=caller, notedAt set, status echoed', async () => {
    const { service, appendSpy, vehicleUpdateSpy } = makeService();
    const dto: SetVehicleRouteStatusDto = { status: 'w_trasie', notes: undefined };
    const before = Date.now();
    const out = await service.setStatus(auth('weryfikator', WER_SUB), VEHICLE_ID, dto);

    expect(appendSpy).toHaveBeenCalledTimes(1);
    const [data] = appendSpy.mock.calls[0]!;
    expect(data.vehicleId).toBe(VEHICLE_ID);
    expect(data.status).toBe('w_trasie');
    expect(data.source).toBe(VehicleStatusSource.manual);
    expect(data.notedById).toBe(WER_SUB);
    expect(data.notedAt).toBeInstanceOf(Date);
    expect((data.notedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect(data.notes).toBeNull();
    // w_trasie does NOT touch lastDroveAt.
    expect(vehicleUpdateSpy).not.toHaveBeenCalled();
    expect(out.status).toBe('w_trasie');
    expect(out.source).toBe('manual');
  });

  it('passes notes through when provided', async () => {
    const { service, appendSpy } = makeService();
    await service.setStatus(auth('admin', 'adm-1'), VEHICLE_ID, {
      status: 'w_trasie',
      notes: 'late departure',
    });
    expect(appendSpy.mock.calls[0]![0].notes).toBe('late departure');
    expect(appendSpy.mock.calls[0]![0].notedById).toBe('adm-1');
  });

  it("zjechal: updates Vehicle.lastDroveAt atomically to notedAt", async () => {
    const { service, appendSpy, vehicleUpdateSpy } = makeService();
    await service.setStatus(auth('weryfikator', WER_SUB), VEHICLE_ID, {
      status: 'zjechal',
      notes: undefined,
    });
    expect(vehicleUpdateSpy).toHaveBeenCalledTimes(1);
    const [vehicleId, vehData] = vehicleUpdateSpy.mock.calls[0]!;
    expect(vehicleId).toBe(VEHICLE_ID);
    // lastDroveAt mirrors the exact notedAt instant the append recorded.
    const notedAt = appendSpy.mock.calls[0]![0].notedAt as Date;
    expect((vehData.lastDroveAt as Date).getTime()).toBe(notedAt.getTime());
  });

  it('re-stamping the same status appends a SECOND row (no 409, no conflict)', async () => {
    const { service, appendSpy } = makeService();
    const dto: SetVehicleRouteStatusDto = { status: 'w_trasie', notes: undefined };
    await service.setStatus(auth('weryfikator', WER_SUB), VEHICLE_ID, dto);
    await service.setStatus(auth('weryfikator', WER_SUB), VEHICLE_ID, dto);
    expect(appendSpy).toHaveBeenCalledTimes(2);
  });

  it('404 when the vehicle does not exist (no append, no lastDroveAt write)', async () => {
    const { service, appendSpy, vehicleUpdateSpy } = makeService({
      vehicleExists: false,
    });
    await expect(
      service.setStatus(auth('weryfikator', WER_SUB), 'missing', {
        status: 'zjechal',
        notes: undefined,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(appendSpy).not.toHaveBeenCalled();
    expect(vehicleUpdateSpy).not.toHaveBeenCalled();
  });
});

describe('VehicleRouteStatusService.getHistory', () => {
  it('returns the mapped history newest-first (as provided by repo)', async () => {
    const rows = [
      logRow({ id: 'rs-2', notedAt: new Date('2026-06-10T12:00:00.000Z') }),
      logRow({ id: 'rs-1', notedAt: new Date('2026-06-10T09:00:00.000Z') }),
    ];
    const { service, listByVehicleSpy } = makeService({ history: rows });
    const out = await service.getHistory(VEHICLE_ID);
    expect(listByVehicleSpy).toHaveBeenCalledWith(VEHICLE_ID);
    expect(out.map((r) => r.id)).toEqual(['rs-2', 'rs-1']);
    expect(out[0]!.notedAt).toBe('2026-06-10T12:00:00.000Z');
  });

  it('404 when the vehicle does not exist', async () => {
    const { service } = makeService({ vehicleExists: false });
    await expect(service.getHistory('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('VehicleRouteStatusService.getBoard', () => {
  const NOW = new Date('2026-06-10T14:00:00.000Z');

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

  it('derives nieznany when there is no today-row', async () => {
    const { service } = makeService({
      boardVehicles: [boardVehicle()],
      latestToday: new Map(),
    });
    const out = await service.getBoard(NOW);
    expect(out).toHaveLength(1);
    expect(out[0]!.currentStatus).toBe('nieznany');
    expect(out[0]!.notedBy).toBeNull();
    expect(out[0]!.notedAt).toBeNull();
    // Identity columns carry through — the board shows BOTH the carrier and
    // its opiekun (owner correction 2026-06-10 #3: carrier re-added alongside
    // opiekun, not either/or).
    expect(out[0]!.plateNumber).toBe('PL123');
    expect(out[0]!.sideNumber).toBe('B-12');
    expect(out[0]!.carrier).toEqual({ id: 'car-1', name: 'Carrier C' });
    expect(out[0]!.opiekun).toEqual({ id: 'op-1', name: 'Opiekun O' });
    expect(out[0]!.planner).toBe('Planner P');
  });

  it('derives the stored status + who/when when a today-row exists', async () => {
    const today = new Map<string, LatestTodayStatusRow>([
      [
        VEHICLE_ID,
        {
          vehicleId: VEHICLE_ID,
          status: 'zjechal',
          notedById: WER_SUB,
          notedBy: { id: WER_SUB, name: 'Weryfikator' },
          notedAt: new Date('2026-06-10T11:30:00.000Z'),
        },
      ],
    ]);
    const { service } = makeService({
      boardVehicles: [boardVehicle()],
      latestToday: today,
    });
    const out = await service.getBoard(NOW);
    expect(out[0]!.currentStatus).toBe('zjechal');
    expect(out[0]!.notedBy).toEqual({ id: WER_SUB, name: 'Weryfikator' });
    expect(out[0]!.notedAt).toBe('2026-06-10T11:30:00.000Z');
  });

  it('passes the today UTC window [start, end) to the repo', async () => {
    const { service, latestTodaySpy } = makeService({
      boardVehicles: [boardVehicle()],
    });
    await service.getBoard(NOW);
    const [ids, start, end] = latestTodaySpy.mock.calls[0]!;
    expect(ids).toEqual([VEHICLE_ID]);
    expect((start as Date).toISOString()).toBe('2026-06-10T00:00:00.000Z');
    expect((end as Date).toISOString()).toBe('2026-06-11T00:00:00.000Z');
  });

  it('returns an empty board (and skips the status query path gracefully) when no active vehicles', async () => {
    const { service, latestTodaySpy } = makeService({ boardVehicles: [] });
    const out = await service.getBoard(NOW);
    expect(out).toEqual([]);
    // The repo is still called with an empty id set; it short-circuits to ∅.
    expect(latestTodaySpy).toHaveBeenCalledWith([], expect.any(Date), expect.any(Date));
  });

  it('maps multiple vehicles, mixing known + nieznany, with no per-vehicle status query (single map lookup)', async () => {
    const today = new Map<string, LatestTodayStatusRow>([
      [
        'veh-A',
        {
          vehicleId: 'veh-A',
          status: 'w_trasie',
          notedById: WER_SUB,
          notedBy: { id: WER_SUB, name: 'Weryfikator' },
          notedAt: new Date('2026-06-10T08:00:00.000Z'),
        },
      ],
    ]);
    const { service, latestTodaySpy } = makeService({
      boardVehicles: [
        boardVehicle({ id: 'veh-A', plateNumber: 'AAA' }),
        boardVehicle({ id: 'veh-B', plateNumber: 'BBB' }),
      ],
      latestToday: today,
    });
    const out = await service.getBoard(NOW);
    expect(out.map((v) => [v.id, v.currentStatus])).toEqual([
      ['veh-A', 'w_trasie'],
      ['veh-B', 'nieznany'],
    ]);
    // Exactly ONE status query for the whole board — no N+1.
    expect(latestTodaySpy).toHaveBeenCalledTimes(1);
  });
});

describe('dayWindowUtc', () => {
  it('returns midnight-to-midnight UTC for the day containing now', () => {
    const { start, end } = dayWindowUtc(new Date('2026-06-10T23:59:59.999Z'));
    expect(start.toISOString()).toBe('2026-06-10T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-06-11T00:00:00.000Z');
  });

  it('handles month/year roll at the window end', () => {
    const { start, end } = dayWindowUtc(new Date('2026-12-31T05:00:00.000Z'));
    expect(start.toISOString()).toBe('2026-12-31T00:00:00.000Z');
    expect(end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});
