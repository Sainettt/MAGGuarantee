import { Injectable } from '@nestjs/common';

import {
  VehicleRouteStatus,
  VehicleStatusSource,
} from '@magguarantee/database';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Flat row shape for a single `VehicleRouteStatusLog` entry, with the
 * (optional) `notedBy` user mini-reference resolved. GPS-sourced rows have a
 * null `notedBy`.
 */
export interface VehicleRouteStatusRow {
  id: string;
  vehicleId: string;
  status: VehicleRouteStatus;
  source: VehicleStatusSource;
  notedById: string | null;
  notedBy: { id: string; name: string | null } | null;
  notedAt: Date;
  notes: string | null;
  createdAt: Date;
}

/**
 * Minimal projection used to derive the "today's current status" cell on the
 * route board — a vehicle id + the latest today-row's status/who/when. The
 * board service maps these onto the active-vehicle list.
 */
export interface LatestTodayStatusRow {
  vehicleId: string;
  status: VehicleRouteStatus;
  notedById: string | null;
  notedBy: { id: string; name: string | null } | null;
  notedAt: Date;
}

/**
 * Repository for the append-only `VehicleRouteStatusLog` history
 * (`vehicle_route_statuses`). Phase 7 (2026-06-10 #2): the weryfikator stamps
 * a per-vehicle operational route status; the model is NOT soft-deleted, so no
 * `deletedAt` filtering applies here.
 *
 * All reads/writes go through `prisma.tx` so an append that happens inside an
 * `@Audit`-opened interactive transaction (route-status POST) enrols in that
 * same transaction and commits atomically with the audit row (and the mirrored
 * `Vehicle.lastDroveAt` for `zjechal`).
 */
@Injectable()
export class VehicleRouteStatusRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Appends a single route-status row (always `source='manual'` here). */
  async append(data: {
    vehicleId: string;
    status: VehicleRouteStatus;
    source: VehicleStatusSource;
    notedById: string | null;
    notedAt: Date;
    notes: string | null;
  }): Promise<VehicleRouteStatusRow> {
    const row = await this.prisma.tx.vehicleRouteStatusLog.create({
      data: {
        vehicleId: data.vehicleId,
        status: data.status,
        source: data.source,
        notedById: data.notedById,
        notedAt: data.notedAt,
        notes: data.notes,
      },
      include: this.includeShape(),
    });
    return this.flatten(row);
  }

  /** Full history for one vehicle, newest-first. */
  async listByVehicle(vehicleId: string): Promise<VehicleRouteStatusRow[]> {
    const rows = await this.prisma.tx.vehicleRouteStatusLog.findMany({
      where: { vehicleId },
      include: this.includeShape(),
      orderBy: { notedAt: 'desc' },
    });
    return rows.map((r) => this.flatten(r));
  }

  /**
   * Latest-per-vehicle route-status row dated TODAY, for a set of vehicles —
   * computed in ONE query (no N+1). Strategy:
   *   - fetch every today-row for the given vehicles ordered `notedAt desc`
   *     (the `@@index([notedAt])` and `@@index([vehicleId, notedAt])` indexes
   *     keep this range scan cheap), then
   *   - reduce to the FIRST row seen per `vehicleId` (i.e. the latest, since
   *     the list is already newest-first).
   * Vehicles with no today-row are simply absent from the returned map —
   * callers treat "missing key" as the derived `nieznany` board status.
   *
   * `dayStart` / `dayEnd` bound the local "today" window (`[dayStart, dayEnd)`)
   * the caller computes once, keeping this method clock-pure/testable.
   */
  async latestTodayByVehicles(
    vehicleIds: string[],
    dayStart: Date,
    dayEnd: Date,
  ): Promise<Map<string, LatestTodayStatusRow>> {
    const out = new Map<string, LatestTodayStatusRow>();
    if (vehicleIds.length === 0) return out;
    const rows = await this.prisma.tx.vehicleRouteStatusLog.findMany({
      where: {
        vehicleId: { in: vehicleIds },
        notedAt: { gte: dayStart, lt: dayEnd },
      },
      include: { notedBy: { select: { id: true, name: true } } },
      orderBy: { notedAt: 'desc' },
    });
    for (const r of rows) {
      // Newest-first ordering → the first row seen for a vehicle is its latest.
      if (out.has(r.vehicleId)) continue;
      out.set(r.vehicleId, {
        vehicleId: r.vehicleId,
        status: r.status,
        notedById: r.notedById,
        notedBy: r.notedBy
          ? { id: r.notedBy.id, name: r.notedBy.name }
          : null,
        notedAt: r.notedAt,
      });
    }
    return out;
  }

  // ── helpers ──────────────────────────────────────────────

  private includeShape() {
    return {
      notedBy: { select: { id: true, name: true } },
    } as const;
  }

  private flatten(row: RouteStatusPrismaShape): VehicleRouteStatusRow {
    return {
      id: row.id,
      vehicleId: row.vehicleId,
      status: row.status,
      source: row.source,
      notedById: row.notedById,
      notedBy: row.notedBy
        ? { id: row.notedBy.id, name: row.notedBy.name }
        : null,
      notedAt: row.notedAt,
      notes: row.notes,
      createdAt: row.createdAt,
    };
  }
}

interface RouteStatusPrismaShape {
  id: string;
  vehicleId: string;
  status: VehicleRouteStatus;
  source: VehicleStatusSource;
  notedById: string | null;
  notedBy?: { id: string; name: string | null } | null;
  notedAt: Date;
  notes: string | null;
  createdAt: Date;
}
