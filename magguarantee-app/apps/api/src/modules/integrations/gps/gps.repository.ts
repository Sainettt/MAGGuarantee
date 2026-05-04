import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import type { GpsVehicleRef } from './gps.types';

/**
 * Repository slice owned by the GPS module.
 *
 * Per the api-agent rules ("Repositories own DB access — controllers and
 * services never call `prisma.*` directly") this is the only place that
 * touches the Vehicle table for GPS purposes. We don't reuse VehiclesRepository
 * because the filters here are different (gps=true is mandatory, the role
 * scope crosses Carrier joins, and we only ever need {id, plateNumber}).
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
   * Returns `null` if the vehicle doesn't exist OR `gps=false` OR is soft-
   * deleted. The controller maps `null` → 404 per docs/13-api-design.md.
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
    dispatcherId: string | null;
    active: boolean;
  } | null> {
    const row = await this.prisma.client.vehicle.findFirst({
      where: { id: vehicleId, gps: true, active: true },
      select: {
        id: true,
        plateNumber: true,
        carrierId: true,
        plannerId: true,
        dispatcherId: true,
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
      dispatcherId: row.dispatcherId,
      active: row.active,
    };
  }

  /**
   * Active GPS-tracked vehicles, scoped by role.
   *
   * `scope` shape mirrors the AuthUser identity:
   *  - admin / pracownik → all `gps=true, active=true, deletedAt=null`
   *    (we encode that as `kind: 'all'`).
   *  - opiekun           → vehicles whose Carrier.opiekunId = userId.
   *  - planista          → vehicles whose Vehicle.plannerId = userId.
   *  - dyspozytor        → vehicles whose Vehicle.dispatcherId = userId.
   *  - przewoznik        → vehicles whose Carrier.userId = userId.
   *
   * Eksport / weryfikator have NO GPS visibility per the wave brief — those
   * roles never reach this method (the controller blocks via @Roles).
   */
  async findManyForGps(scope: GpsScope): Promise<GpsVehicleRef[]> {
    const where: Record<string, unknown> = { gps: true, active: true };

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
        where.dispatcherId = scope.userId;
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

export type GpsScope =
  | { kind: 'all' }
  | { kind: 'opiekun'; userId: string }
  | { kind: 'planista'; userId: string }
  | { kind: 'dyspozytor'; userId: string }
  | { kind: 'przewoznik'; userId: string };
