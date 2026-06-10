import { Injectable, NotFoundException } from '@nestjs/common';

import {
  VehicleStatusSource,
  type VehicleRouteStatus as PrismaVehicleRouteStatus,
} from '@magguarantee/database';
import type {
  SetVehicleRouteStatusDto,
  VehicleBoardStatus,
  VehicleRouteBoardItemDto,
  VehicleRouteStatusLogDto,
} from '@magguarantee/shared';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import {
  VehicleRouteStatusRepository,
  type VehicleRouteStatusRow,
} from './vehicle-route-status.repository';
import { VehiclesRepository } from './vehicles.repository';

/**
 * Phase 7 (2026-06-10 #2) — per-vehicle operational route status.
 *
 * The `weryfikator` role (admin too) stamps a daily route status on each
 * vehicle («w trasie» / «zjechał») as an append-only history
 * (`VehicleRouteStatusLog`). The derived `nieznany` («not checked today»)
 * board value is computed at read time and is NOT a settable status.
 *
 * Replaces the former delegation in-transit/returned flow (removed in this
 * rework). `Vehicle.lastDroveAt` — the fleet "this truck is back" signal,
 * previously set by the delegation `returned` transition — is now mirrored
 * here when a vehicle is stamped `zjechal`.
 *
 * Atomicity: `POST /vehicles/:id/route-status` carries `@Audit`, so the
 * `AuditInterceptor` opens an interactive transaction. The route-status append
 * AND the `lastDroveAt` mirror both go through `prisma.tx` (the repositories'
 * ambient-tx accessor), so they commit atomically with the audit row — exactly
 * the pattern the delegation cancel/returned paths used.
 */
@Injectable()
export class VehicleRouteStatusService {
  constructor(
    private readonly vehicles: VehiclesRepository,
    private readonly routeStatuses: VehicleRouteStatusRepository,
  ) {}

  /**
   * Appends a manual route-status row for a vehicle. Re-stamping is allowed —
   * even when the vehicle already has a today-row, a new row is appended (no
   * 409). When `status === 'zjechal'` the vehicle's `lastDroveAt` is re-touched
   * to `notedAt` (date) in the SAME transaction.
   */
  async setStatus(
    user: AuthUser,
    vehicleId: string,
    dto: SetVehicleRouteStatusDto,
  ): Promise<VehicleRouteStatusLogDto> {
    await this._requireVehicle(vehicleId);

    const notedAt = new Date();
    const row = await this.routeStatuses.append({
      vehicleId,
      status: dto.status as PrismaVehicleRouteStatus,
      source: VehicleStatusSource.manual,
      notedById: user.sub,
      notedAt,
      notes: dto.notes ?? null,
    });

    // `zjechal` ⇒ the truck is back; mirror the return DAY into the fleet
    // signal. Same ambient `prisma.tx` as the append + audit row → all commit
    // or roll back together. `notedAt` is stamped at "now"; `lastDroveAt` is a
    // DateTime, so we store the full instant (the date portion is what the
    // fleet readiness logic consumes).
    if (dto.status === 'zjechal') {
      await this.vehicles.update(vehicleId, { lastDroveAt: notedAt });
    }

    return this._toLogDto(row);
  }

  /** Full route-status history of one vehicle, newest-first. */
  async getHistory(vehicleId: string): Promise<VehicleRouteStatusLogDto[]> {
    await this._requireVehicle(vehicleId);
    const rows = await this.routeStatuses.listByVehicle(vehicleId);
    return rows.map((r) => this._toLogDto(r));
  }

  /**
   * Route board — every ACTIVE vehicle with today's derived current status.
   * Two queries total (active vehicles + latest-today-per-vehicle), no N+1:
   * the board fans out the per-vehicle status from a single map keyed by
   * `vehicleId` (see `VehicleRouteStatusRepository.latestTodayByVehicles`).
   *
   * `now` is injectable so the "today" window stays clock-pure for tests; it
   * defaults to the wall clock in production.
   */
  async getBoard(now: Date = new Date()): Promise<VehicleRouteBoardItemDto[]> {
    const vehicles = await this.vehicles.listActiveForBoard();
    const ids = vehicles.map((v) => v.id);
    const { start, end } = dayWindowUtc(now);
    const latest = await this.routeStatuses.latestTodayByVehicles(
      ids,
      start,
      end,
    );

    return vehicles.map((v) => {
      const today = latest.get(v.id);
      const currentStatus: VehicleBoardStatus = today
        ? (today.status as VehicleBoardStatus)
        : 'nieznany';
      return {
        id: v.id,
        plateNumber: v.plateNumber,
        sideNumber: v.sideNumber,
        opiekun: v.opiekun,
        planner: v.plannerName,
        currentStatus,
        notedBy: today?.notedBy ?? null,
        notedAt: today ? today.notedAt.toISOString() : null,
      };
    });
  }

  // ── internals ────────────────────────────────────────────

  private async _requireVehicle(vehicleId: string): Promise<void> {
    const v = await this.vehicles.findById(vehicleId);
    if (!v) throw new NotFoundException('Pojazd nie znaleziony');
  }

  private _toLogDto(row: VehicleRouteStatusRow): VehicleRouteStatusLogDto {
    return {
      id: row.id,
      vehicleId: row.vehicleId,
      status: row.status,
      source: row.source,
      notedBy: row.notedBy,
      notedAt: row.notedAt.toISOString(),
      notes: row.notes,
    };
  }
}

/**
 * UTC day window `[start, end)` for the calendar day containing `now`. Used to
 * derive "today's" route status on the board. UTC keeps the boundary pure and
 * matches the codebase's date-only convention (date columns round-trip as UTC
 * midnight). Exported for unit tests.
 */
export function dayWindowUtc(now: Date): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}
