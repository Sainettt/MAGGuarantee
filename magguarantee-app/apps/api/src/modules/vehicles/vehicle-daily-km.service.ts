import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { VehicleDayState, VehicleStatusSource } from '@magguarantee/database';
import {
  deriveVehicleMotionStatus,
  type KmBoardQuery,
  type SetVehicleDailyKmDto,
  type VehicleDailyKmDto,
  type VehicleDailyKmHistoryQuery,
  type VehicleKmBoardDto,
  type VehicleKmBoardItemDto,
  type VehicleKmCellDto,
  type VehicleDayState as VehicleDayStateValue,
} from '@magguarantee/shared';

import { AuditContext } from '../../common/audit';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import {
  VehicleDailyKmRepository,
  type VehicleDailyKmRow,
} from './vehicle-daily-km.repository';
import {
  VehiclesRepository,
  type VehicleBoardRow,
} from './vehicles.repository';

/**
 * Phase 7 REWORK (2026-06-12 #3, docs/20 §0′) — per-vehicle DAILY km list.
 *
 * The `weryfikator` role (admin too) records, per (vehicle, day), either
 * `drove` (+km) or `idle` («stood»). No row = «not checked». This replaces the
 * former route-status board AND is the source of truth for claim mileage
 * (`Σ VehicleDailyKm.km` over the period, consumed by ClaimsService).
 *
 * Atomicity: `PUT /vehicles/:id/daily-km` carries `@Audit`, so the
 * `AuditInterceptor` opens an interactive transaction. The upsert AND the
 * `Vehicle.lastDroveAt` bump both go through `prisma.tx` (the repositories'
 * ambient-tx accessor), so they commit atomically with the audit row.
 */
@Injectable()
export class VehicleDailyKmService {
  constructor(
    private readonly vehicles: VehiclesRepository,
    private readonly dailyKm: VehicleDailyKmRepository,
  ) {}

  /**
   * UPSERTs one (vehicle, day) mark. Re-validates the state↔km invariants
   * server-side (defence-in-depth past the Zod pipe). When `state='drove'`
   * the vehicle's `lastDroveAt` is bumped to `max(lastDroveAt, date)` in the
   * SAME transaction (never moved backwards by an out-of-order back-fill).
   */
  async setDailyKm(
    user: AuthUser,
    vehicleId: string,
    dto: SetVehicleDailyKmDto,
  ): Promise<VehicleDailyKmDto> {
    const vehicle = await this._requireVehicle(vehicleId);
    const date = isoDateToMidnightUtc(dto.date);
    const { state, km } = this._normalizeStateKm(dto);

    const row = await this.dailyKm.upsert({
      vehicleId,
      date,
      km,
      state,
      source: VehicleStatusSource.manual,
      notedById: user.sub,
      notes: dto.notes ?? null,
    });

    // `drove` ⇒ the truck moved on `date`; advance the fleet readiness signal
    // to max(existing, date) so an out-of-order back-fill never moves it
    // backwards. Same ambient `prisma.tx` as the upsert + audit row.
    if (state === VehicleDayState.drove) {
      const current = vehicle.lastDroveAt;
      if (!current || date.getTime() > current.getTime()) {
        await this.vehicles.update(vehicleId, { lastDroveAt: date });
      }
    }

    return this._toDto(row);
  }

  /**
   * Clears ONE (vehicle, day) mark so the cell returns to «not checked» (row
   * absence). Validates the vehicle exists exactly like `setDailyKm` (404 on a
   * missing vehicle). IDEMPOTENT: clearing an already-absent cell still
   * resolves (the repo's `deleteMany` returns count 0 without throwing), so a
   * double-clear / clearing a «not checked» cell does NOT error — the caller
   * gets 204 either way.
   *
   * Deliberately does NOT touch `Vehicle.lastDroveAt`: it is only ever advanced
   * forward (never moved backwards by an out-of-order edit — same invariant as
   * the `drove` bump in `setDailyKm`), so removing one day's mark leaves the
   * fleet readiness signal untouched. The delete runs through the ambient
   * `prisma.tx` so it commits atomically with the `@Audit` row.
   *
   * AUDIT `before`: when a row exists for (vehicle, date) its pre-delete value
   * (full DTO — `state` / `km` / `notes` / `date` included) is captured into
   * the audit `before` snapshot via `AuditContext.setBefore`, so the audit log
   * records WHAT was cleared even after the row is gone. The snapshot read goes
   * through the SAME ambient `prisma.tx` as the delete. When no row existed the
   * `before` stays absent (null) — but the audit row is STILL written on every
   * successful clear: the idempotent no-op case (count 0, clearing an already
   * «not checked» cell) is audited exactly like a real clear, and still 204s.
   */
  async clearDailyKm(
    user: AuthUser,
    vehicleId: string,
    date: string,
  ): Promise<void> {
    void user;
    await this._requireVehicle(vehicleId);
    const day = isoDateToMidnightUtc(date);

    // Snapshot the pre-delete value (if any) into the audit `before`. Mirrors
    // the `setBefore(this.toDto(existing))` convention used by the hard/soft
    // delete flows (vehicles/carriers/drivers/...). No row ⇒ `before` left null.
    const existing = await this.dailyKm.findByVehicleDate(vehicleId, day);
    if (existing) AuditContext.setBefore(this._toDto(existing));

    // Idempotent: `deleteMany` returns count 0 when nothing existed; we ignore
    // the count and never branch on it — the audit row is written regardless.
    await this.dailyKm.deleteByVehicleDate(vehicleId, day);
  }

  /**
   * Per-vehicle history (newest-first), bounded by an optional `[from, to]`
   * date window (inclusive `to`, converted to a half-open upper bound).
   */
  async getHistory(
    vehicleId: string,
    query: VehicleDailyKmHistoryQuery,
  ): Promise<VehicleDailyKmDto[]> {
    await this._requireVehicle(vehicleId);
    const from = query.from ? isoDateToMidnightUtc(query.from) : null;
    const toExclusive = query.to
      ? addDaysUtc(isoDateToMidnightUtc(query.to), 1)
      : null;
    const rows = await this.dailyKm.listByVehicle(vehicleId, from, toExclusive);
    return rows.map((r) => this._toDto(r));
  }

  /**
   * Weekly km-board — every ACTIVE vehicle with its 7 day-cells, period km
   * sum, and derived motion status. Two queries (active vehicles + the week's
   * daily-km rows), no N+1.
   */
  async getBoard(query: KmBoardQuery): Promise<VehicleKmBoardDto> {
    const { start, endExclusive } = resolveWeekWindow(query);
    const vehicles = await this.vehicles.listActiveForBoard();
    const ids = vehicles.map((v) => v.id);
    const rows = await this.dailyKm.listForWeek(ids, start, endExclusive);
    const byVehicle = groupByVehicle(rows);

    const items = vehicles.map((v) =>
      this._buildBoardItem(v, byVehicle.get(v.id) ?? [], start),
    );
    return {
      weekStart: toIsoDate(start),
      weekEnd: toIsoDate(addDaysUtc(start, 6)),
      items,
    };
  }

  /**
   * Read-only km-report — same weekly grid, but ONLY vehicles that drove in
   * the period, scoped to the caller's role:
   *   planista → `plannerId`; dyspozytor → `dispatcherId`;
   *   eksport / admin / weryfikator → all.
   * The role scope is applied by the caller (`buildReportScope`), which passes
   * an optional id filter through to the active-vehicle query.
   */
  async getReport(
    query: KmBoardQuery,
    scope: { plannerId?: string; dispatcherId?: string },
  ): Promise<VehicleKmBoardDto> {
    const { start, endExclusive } = resolveWeekWindow(query);
    const vehicles = await this.vehicles.listActiveForBoard(scope);
    const ids = vehicles.map((v) => v.id);
    const droveIds = await this.dailyKm.vehicleIdsWithDroveInWeek(
      ids,
      start,
      endExclusive,
    );
    const visible = vehicles.filter((v) => droveIds.has(v.id));
    const rows = await this.dailyKm.listForWeek(
      visible.map((v) => v.id),
      start,
      endExclusive,
    );
    const byVehicle = groupByVehicle(rows);
    const items = visible.map((v) =>
      this._buildBoardItem(v, byVehicle.get(v.id) ?? [], start),
    );
    return {
      weekStart: toIsoDate(start),
      weekEnd: toIsoDate(addDaysUtc(start, 6)),
      items,
    };
  }

  // ── internals ────────────────────────────────────────────

  private async _requireVehicle(
    vehicleId: string,
  ): Promise<{ lastDroveAt: Date | null }> {
    const v = await this.vehicles.findById(vehicleId);
    if (!v) throw new NotFoundException('Pojazd nie znaleziony');
    return v;
  }

  /**
   * Re-asserts the state↔km invariants and normalises the stored shape:
   *   - `drove` ⇒ `km` required and `> 0`; stored as-is.
   *   - `idle`  ⇒ `km` must be absent; stored as null.
   * Throws 422 on violation so a bypassed Zod pipe still fails cleanly.
   */
  private _normalizeStateKm(dto: SetVehicleDailyKmDto): {
    state: VehicleDayState;
    km: number | null;
  } {
    if (dto.state === 'drove') {
      if (dto.km === undefined || dto.km <= 0) {
        throw new UnprocessableEntityException(
          'Przy stanie „jechał” przebieg musi być większy od zera.',
        );
      }
      return { state: VehicleDayState.drove, km: dto.km };
    }
    if (dto.km !== undefined) {
      throw new UnprocessableEntityException(
        'Przy stanie „nie jeździ” nie podaje się przebiegu.',
      );
    }
    return { state: VehicleDayState.idle, km: null };
  }

  /**
   * Builds one board/report row: the 7 chronological day-cells, the period km
   * sum (Σ over drove cells), and the derived motion status (latest-by-date
   * cell). `weekStart` anchors the cell dates.
   */
  private _buildBoardItem(
    v: VehicleBoardRow,
    rows: VehicleDailyKmRow[],
    weekStart: Date,
  ): VehicleKmBoardItemDto {
    const byDate = new Map<string, VehicleDailyKmRow>();
    for (const r of rows) byDate.set(toIsoDate(r.date), r);

    const cells: VehicleKmCellDto[] = [];
    let kmSum = 0;
    for (let i = 0; i < 7; i += 1) {
      const date = toIsoDate(addDaysUtc(weekStart, i));
      const row = byDate.get(date);
      if (row) {
        if (row.state === VehicleDayState.drove && row.km !== null) {
          kmSum += row.km;
        }
        cells.push({
          date,
          state: row.state,
          km: row.km,
          notes: row.notes,
        });
      } else {
        cells.push({ date, state: null, km: null, notes: null });
      }
    }

    // Latest-by-date row in the window drives the motion status. `rows` come
    // ordered ascending by date from the repo, so the last entry is latest.
    const latest = rows.length > 0 ? rows[rows.length - 1]! : null;
    const motionStatus = deriveVehicleMotionStatus(
      latest ? (latest.state as VehicleDayStateValue) : null,
    );

    return {
      id: v.id,
      plateNumber: v.plateNumber,
      sideNumber: v.sideNumber,
      carrier: v.carrier,
      opiekun: v.opiekun,
      planner: v.plannerName,
      cells,
      kmSum,
      motionStatus,
    };
  }

  private _toDto(row: VehicleDailyKmRow): VehicleDailyKmDto {
    return {
      id: row.id,
      vehicleId: row.vehicleId,
      date: toIsoDate(row.date),
      state: row.state,
      km: row.km,
      source: row.source,
      notedBy: row.notedBy,
      notes: row.notes,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

/** Groups daily-km rows by `vehicleId`, preserving the repo's ascending date order. */
function groupByVehicle(
  rows: VehicleDailyKmRow[],
): Map<string, VehicleDailyKmRow[]> {
  const out = new Map<string, VehicleDailyKmRow[]>();
  for (const r of rows) {
    const list = out.get(r.vehicleId);
    if (list) list.push(r);
    else out.set(r.vehicleId, [r]);
  }
  return out;
}

// ── date / week helpers (UTC, date-only convention) ────────

/** Parse `YYYY-MM-DD` to UTC midnight. The schema already validated the shape. */
function isoDateToMidnightUtc(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

/** UTC date → `YYYY-MM-DD`. */
function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Adds `n` whole days to a UTC-midnight date. */
function addDaysUtc(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
}

/**
 * Resolves the board/report query to a Monday-anchored 7-day window
 * `[start, endExclusive)` (UTC, date-only):
 *   - `week=YYYY-Www` → the Monday of that ISO week.
 *   - `from=YYYY-MM-DD` → snapped back to the Monday of that date's week.
 *   - neither → the Monday of the current ISO week.
 * Exported for unit tests.
 */
export function resolveWeekWindow(query: KmBoardQuery): {
  start: Date;
  endExclusive: Date;
} {
  let start: Date;
  if (query.week) {
    start = mondayOfIsoWeek(query.week);
  } else if (query.from) {
    start = mondayOf(isoDateToMidnightUtc(query.from));
  } else {
    start = mondayOf(todayUtc());
  }
  return { start, endExclusive: addDaysUtc(start, 7) };
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/** Monday (00:00 UTC) of the week containing `d` (ISO week — Monday start). */
function mondayOf(d: Date): Date {
  // getUTCDay: Sun=0..Sat=6 → ISO weekday Mon=1..Sun=7.
  const isoDow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  return addDaysUtc(d, 1 - isoDow);
}

/**
 * Monday (00:00 UTC) of an ISO week label `YYYY-Www`. Uses the ISO-8601
 * definition: week 1 is the week containing the first Thursday of the year
 * (equivalently, containing Jan 4). The schema guarantees the `01..53` range.
 */
function mondayOfIsoWeek(label: string): Date {
  const m = /^(\d{4})-W(\d{2})$/.exec(label)!;
  const year = Number(m[1]);
  const week = Number(m[2]);
  // Jan 4 is always in ISO week 1; the Monday of week 1 is its week's Monday.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week1Monday = mondayOf(jan4);
  return addDaysUtc(week1Monday, (week - 1) * 7);
}
