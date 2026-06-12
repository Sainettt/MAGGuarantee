import { Injectable } from '@nestjs/common';

import { VehicleDayState, VehicleStatusSource } from '@magguarantee/database';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Flat row shape for a single `VehicleDailyKm` entry, with the (optional)
 * `notedBy` user mini-reference resolved. GPS-sourced rows have a null
 * `notedBy`. `km` is null for `idle` rows.
 */
export interface VehicleDailyKmRow {
  id: string;
  vehicleId: string;
  date: Date;
  km: number | null;
  state: VehicleDayState;
  source: VehicleStatusSource;
  notedById: string | null;
  notedBy: { id: string; name: string | null } | null;
  notes: string | null;
  updatedAt: Date;
}

/**
 * Repository for the per-(vehicle, day) `VehicleDailyKm` upsert table
 * (`vehicle_daily_km`, `@@unique([vehicleId, date])`).
 *
 * Phase 7 REWORK (2026-06-12 #3): the weryfikator records each vehicle's daily
 * km. The table is NOT append-only — one row per (vehicle, day), written via
 * UPSERT (re-stamping a day overwrites the previous mark). It is not
 * soft-deleted, so no `deletedAt` filtering applies here.
 *
 * All reads/writes go through `prisma.tx` so an upsert that happens inside an
 * `@Audit`-opened interactive transaction (the daily-km PUT) enrols in that
 * same transaction and commits atomically with the audit row (and the mirrored
 * `Vehicle.lastDroveAt` bump for `drove`).
 */
@Injectable()
export class VehicleDailyKmRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * UPSERTs a single (vehicleId, date) mark. `source='manual'` always here;
   * GPS ingestion (future) lands elsewhere. On conflict the existing row's
   * `km` / `state` / `source` / `notedById` / `notes` are overwritten so a
   * re-stamp reflects the latest decision.
   */
  async upsert(data: {
    vehicleId: string;
    date: Date;
    km: number | null;
    state: VehicleDayState;
    source: VehicleStatusSource;
    notedById: string | null;
    notes: string | null;
  }): Promise<VehicleDailyKmRow> {
    const row = await this.prisma.tx.vehicleDailyKm.upsert({
      where: {
        vehicleId_date: { vehicleId: data.vehicleId, date: data.date },
      },
      create: {
        vehicleId: data.vehicleId,
        date: data.date,
        km: data.km,
        state: data.state,
        source: data.source,
        notedById: data.notedById,
        notes: data.notes,
      },
      update: {
        km: data.km,
        state: data.state,
        source: data.source,
        notedById: data.notedById,
        notes: data.notes,
      },
      include: this.includeShape(),
    });
    return this.flatten(row);
  }

  /**
   * Reads the single (vehicleId, date) mark, or `null` when the cell is «not
   * checked» (no row). Goes through `prisma.tx` so a read taken inside an
   * `@Audit`-opened interactive transaction (e.g. the pre-delete snapshot in
   * `clearDailyKm`) sees the same uncommitted state the subsequent mutation
   * acts on. Returns the flat `VehicleDailyKmRow` shape used everywhere else.
   */
  async findByVehicleDate(
    vehicleId: string,
    date: Date,
  ): Promise<VehicleDailyKmRow | null> {
    const row = await this.prisma.tx.vehicleDailyKm.findUnique({
      where: { vehicleId_date: { vehicleId, date } },
      include: this.includeShape(),
    });
    return row ? this.flatten(row) : null;
  }

  /**
   * Clears ONE (vehicleId, date) mark so the cell returns to «not checked»
   * (row absence). Uses `deleteMany` (not `delete`) so clearing an already-
   * absent cell is IDEMPOTENT — it returns `count: 0` without throwing
   * `P2025`, never a 404. Goes through `prisma.tx` so the delete enrols in the
   * `@Audit`-opened interactive transaction and commits atomically with the
   * audit row. Returns the number of rows removed (0 or 1).
   */
  async deleteByVehicleDate(vehicleId: string, date: Date): Promise<number> {
    const { count } = await this.prisma.tx.vehicleDailyKm.deleteMany({
      where: { vehicleId, date },
    });
    return count;
  }

  /**
   * Per-vehicle history (newest-first) bounded by an optional `[from, to)`
   * date window. Both bounds are half-open at the upper end so a `to` of the
   * same day is inclusive when the caller passes `to + 1 day` (the service
   * does); when `to` is omitted the upper bound is open.
   */
  async listByVehicle(
    vehicleId: string,
    from: Date | null,
    toExclusive: Date | null,
  ): Promise<VehicleDailyKmRow[]> {
    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.gte = from;
    if (toExclusive) dateFilter.lt = toExclusive;
    const rows = await this.prisma.tx.vehicleDailyKm.findMany({
      where: {
        vehicleId,
        ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
      },
      include: this.includeShape(),
      orderBy: { date: 'desc' },
    });
    return rows.map((r) => this.flatten(r));
  }

  /**
   * Every daily-km row for a SET of vehicles within `[weekStart, weekEnd)`
   * (half-open). ONE query for the whole board — no N+1. Ordered by
   * `(vehicleId, date)` so the board builder can group cheaply. `notes` and
   * `state`/`km` are projected for cell rendering.
   */
  async listForWeek(
    vehicleIds: string[],
    weekStart: Date,
    weekEndExclusive: Date,
  ): Promise<VehicleDailyKmRow[]> {
    if (vehicleIds.length === 0) return [];
    const rows = await this.prisma.tx.vehicleDailyKm.findMany({
      where: {
        vehicleId: { in: vehicleIds },
        date: { gte: weekStart, lt: weekEndExclusive },
      },
      include: this.includeShape(),
      orderBy: [{ vehicleId: 'asc' }, { date: 'asc' }],
    });
    return rows.map((r) => this.flatten(r));
  }

  /**
   * Vehicle ids that have at least one `drove` row within `[weekStart, weekEnd)`
   * — the «only vehicles that actually drove» filter for the km-report. ONE
   * `groupBy` round-trip. Short-circuits on an empty candidate set.
   */
  async vehicleIdsWithDroveInWeek(
    vehicleIds: string[],
    weekStart: Date,
    weekEndExclusive: Date,
  ): Promise<Set<string>> {
    if (vehicleIds.length === 0) return new Set();
    const groups = await this.prisma.tx.vehicleDailyKm.groupBy({
      by: ['vehicleId'],
      where: {
        vehicleId: { in: vehicleIds },
        state: VehicleDayState.drove,
        date: { gte: weekStart, lt: weekEndExclusive },
      },
    });
    return new Set(groups.map((g) => g.vehicleId));
  }

  /**
   * `Σ km` over `drove` rows for ONE vehicle within `[from, toExclusive)`.
   * Returns 0 when no drove rows exist. Used to pre-fill claim mileage as
   * `Σ VehicleDailyKm.km (state=drove)` over the claim period.
   */
  async sumDroveKm(
    vehicleId: string,
    from: Date,
    toExclusive: Date,
  ): Promise<number> {
    const agg = await this.prisma.tx.vehicleDailyKm.aggregate({
      where: {
        vehicleId,
        state: VehicleDayState.drove,
        date: { gte: from, lt: toExclusive },
      },
      _sum: { km: true },
    });
    return agg._sum.km ?? 0;
  }

  // ── helpers ──────────────────────────────────────────────

  private includeShape() {
    return {
      notedBy: { select: { id: true, name: true } },
    } as const;
  }

  private flatten(row: DailyKmPrismaShape): VehicleDailyKmRow {
    return {
      id: row.id,
      vehicleId: row.vehicleId,
      date: row.date,
      km: row.km,
      state: row.state,
      source: row.source,
      notedById: row.notedById,
      notedBy: row.notedBy
        ? { id: row.notedBy.id, name: row.notedBy.name }
        : null,
      notes: row.notes,
      updatedAt: row.updatedAt,
    };
  }
}

interface DailyKmPrismaShape {
  id: string;
  vehicleId: string;
  date: Date;
  km: number | null;
  state: VehicleDayState;
  source: VehicleStatusSource;
  notedById: string | null;
  notedBy?: { id: string; name: string | null } | null;
  notes: string | null;
  updatedAt: Date;
}
