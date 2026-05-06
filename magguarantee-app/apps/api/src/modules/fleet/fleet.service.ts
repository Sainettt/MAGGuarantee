import { ForbiddenException, Injectable } from '@nestjs/common';

import type {
  DriverListItem,
  MyFleetResponse,
  TrailerListItem,
  VehicleListItem,
} from '@magguarantee/shared';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CarriersRepository } from '../carriers/carriers.repository';
import { DriversRepository } from '../drivers/drivers.repository';
import { TrailersRepository } from '../trailers/trailers.repository';
import { VehiclesRepository } from '../vehicles/vehicles.repository';

/**
 * Phase 3 — Fleet aggregates service.
 *
 * Collapses the legacy `getMyFleet` (`Code.gs:4247-4291`) + the three
 * separate `getMyVehicles` / `getMyDrivers` / `getMyTrailers` calls into a
 * single round-trip. Used by the new-claim and new-delegation forms to
 * populate dropdowns.
 */
@Injectable()
export class FleetService {
  constructor(
    private readonly carriers: CarriersRepository,
    private readonly vehicles: VehiclesRepository,
    private readonly drivers: DriversRepository,
    private readonly trailers: TrailersRepository,
  ) {}

  async getMyFleet(user: AuthUser): Promise<MyFleetResponse> {
    if (user.role !== 'przewoznik') {
      throw new ForbiddenException('Wymaga konta przewoźnika');
    }
    const carriers = await this.carriers.list({ limit: 200 });
    const mine = carriers.find((c) => c.userId === user.sub);
    if (!mine) {
      throw new ForbiddenException('Brak profilu przewoźnika');
    }

    const [vehicleRows, driverRows, trailerRows] = await Promise.all([
      this.vehicles.list({ carrierId: mine.id, active: true, limit: 200 }),
      this.drivers.list({ carrierId: mine.id, active: true, limit: 200 }),
      this.trailers.list({ carrierId: mine.id, active: true, limit: 200 }),
    ]);

    const vehicles: VehicleListItem[] = vehicleRows.map((v) => ({
      id: v.id,
      plateNumber: v.plateNumber,
      active: v.active,
      brand: v.brand,
      model: v.model,
      type: v.type,
      sideNumber: v.sideNumber,
    }));

    const drivers: DriverListItem[] = driverRows.map((d) => ({
      id: d.id,
      firstName: d.firstName,
      lastName: d.lastName,
      phone: d.phone,
      active: d.active,
      licenseExpiry: d.licenseExpiry
        ? toDateString(d.licenseExpiry)
        : null,
    }));

    const trailers: TrailerListItem[] = trailerRows.map((t) => ({
      id: t.id,
      plateNumber: t.plateNumber,
      active: t.active,
      trailerTypeId: t.trailerTypeId,
      trailerTypeName: t.trailerType.name,
      brand: t.brand,
      model: t.model,
    }));

    return { vehicles, drivers, trailers };
  }
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}
