import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import type { GpsVehicleRef } from './gps.types';

/**
 * Repository slice owned by the GPS module.
 *
 * Per the api-agent rules ("Repositories own DB access — controllers and
 * services never call `prisma.*` directly") this is the only place that
 * touches the Vehicle table for GPS purposes. We don't reuse VehiclesRepository
 * because the filters here are different (only ACTIVE vehicles are tracked, the
 * role scope crosses Carrier joins, and we only ever need {id, plateNumber}).
 *
 * Tracking scope (2026-06-17): the per-vehicle `gps` boolean was dropped —
 * every vehicle in the program is GPS-tracked — so "tracked" now means simply
 * `active=true` (was `gps=true AND active=true`).
 *
 * `findOneForGps` and `findManyForGps` apply the same role-based ownership
 * scope as `/api/v1/vehicles` would — but the rules are spelled out in this
 * file so the GPS authorisation logic is auditable in one place.
 */
@Injectable()
export class GpsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Look up a single vehicle for ownership / capability checks.
   *
   * Returns `null` if the vehicle doesn't exist OR is inactive OR is soft-
   * deleted. The controller maps `null` → 404 per docs/13-api-design.md.
   * (Every active vehicle is GPS-tracked since the `gps` toggle was dropped.)
   *
   * Returns `{ ownership: ..., ref }` so the service can run the role check
   * without a second query.
   */
  async findOneForGps(vehicleId: string): Promise<{
    ref: GpsVehicleRef;
    carrierId: string;
    carrierUserId: string;
    opiekunId: string | null;
    plannerId: string | null;
    /** Phase 11 — dispatch Team FK (replaces `dispatcherId`). */
    dispatchTeamId: string | null;
    active: boolean;
  } | null> {
    const row = await this.prisma.client.vehicle.findFirst({
      where: { id: vehicleId, active: true },
      select: {
        id: true,
        plateNumber: true,
        carrierId: true,
        plannerId: true,
        dispatchTeamId: true,
        active: true,
        carrier: { select: { userId: true, opiekunId: true } },
      },
    });
    if (!row) return null;
    return {
      ref: { id: row.id, plateNumber: row.plateNumber },
      carrierId: row.carrierId,
      carrierUserId: row.carrier.userId,
      opiekunId: row.carrier.opiekunId,
      plannerId: row.plannerId,
      dispatchTeamId: row.dispatchTeamId,
      active: row.active,
    };
  }

  /**
   * Active GPS-tracked vehicles, scoped by role.
   *
   * `scope` shape mirrors the AuthUser identity:
   *  - admin             → all `active=true, deletedAt=null`
   *    (we encode that as `kind: 'all'`).
   *  - opiekun           → vehicles whose Carrier.opiekunId = userId.
   *  - planista          → vehicles whose Vehicle.plannerId = userId.
   *  - dyspozytor        → Phase 11: vehicles whose Vehicle.dispatchTeamId =
   *    the dyspozytor's `teamId`. A dyspozytor with NO team → 0 vehicles
   *    (the scope carries `teamId: null`, matched as "no rows").
   *
   * pracownik / eksport / weryfikator have NO GPS visibility — those roles
   * never reach this method (the controller blocks via @Roles). pracownik is
   * a narrow claims-only role per docs/03-roles.md#pracownik.
   */
  async findManyForGps(scope: GpsScope): Promise<GpsVehicleRef[]> {
    const where: Record<string, unknown> = { active: true };

    switch (scope.kind) {
      case 'all':
        // No additional filter.
        break;
      case 'opiekun':
        where.carrier = { opiekunId: scope.userId };
        break;
      case 'planista':
        where.plannerId = scope.userId;
        break;
      case 'dyspozytor':
        // Phase 11 — scope by the dyspozytor's TEAM. No team → 0 vehicles (an
        // impossible team filter, never "all").
        where.dispatchTeamId = scope.teamId ?? NO_GPS_TEAM_SENTINEL;
        break;
      case 'przewoznik':
        where.carrier = { userId: scope.userId };
        break;
      default: {
        const _exhaustive: never = scope;
        return _exhaustive;
      }
    }

    const rows = await this.prisma.client.vehicle.findMany({
      where,
      select: { id: true, plateNumber: true },
      orderBy: { plateNumber: 'asc' },
    });
    return rows.map((r) => ({ id: r.id, plateNumber: r.plateNumber }));
  }
}

/**
 * Impossible team id forcing 0 GPS rows for a dyspozytor with no team — mirrors
 * the fleet `NO_TEAM_SENTINEL` posture (an unassigned dyspozytor sees nothing).
 */
const NO_GPS_TEAM_SENTINEL = '__no_dispatch_team__';

export type GpsScope =
  | { kind: 'all' }
  | { kind: 'opiekun'; userId: string }
  | { kind: 'planista'; userId: string }
  // Phase 11 — dyspozytor scopes by TEAM, not by their own user id. `teamId`
  // null = dyspozytor without a team → 0 vehicles.
  | { kind: 'dyspozytor'; teamId: string | null }
  | { kind: 'przewoznik'; userId: string };
