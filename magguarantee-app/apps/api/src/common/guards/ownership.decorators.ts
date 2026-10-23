import { SetMetadata } from '@nestjs/common';

import {
  CARRIER_OWNERSHIP_KEY,
  OPIEKUN_OWNERSHIP_KEY,
  type OwnershipMeta,
  type OwnershipSource,
} from './ownership.constants';

/**
 * Marks an endpoint as requiring opiekun-level ownership of the targeted
 * carrier (or carrier-bound resource). The guard is a no-op for admin
 * (global access) and for non-opiekun roles. `pracownik` is kept off
 * carrier-CRUD endpoints by their `@RequirePermission` — no carrier or fleet
 * right (`carriers.*`, `vehicles.read`, `fleet.write`, …) is in its set
 * (docs/03-roles.md#pracownik, narrow claims-only role).
 *
 * Usage — the permission gate is `@RequirePermission` (global
 * `PermissionsGuard`), `@UseGuards` carries only the ownership guard (the
 * real controllers declare it once on the class):
 *   ```ts
 *   @Patch('carriers/:id')
 *   @RequirePermission('carriers.write')
 *   @UseGuards(OpiekunOwnershipGuard)
 *   @OpiekunOwns('id', 'param', 'carrierId')
 *   update(...)
 *   ```
 */
export const OpiekunOwns = (
  name: string,
  source: OwnershipSource = 'param',
  as: OwnershipMeta['as'] = 'carrierId',
): MethodDecorator & ClassDecorator =>
  SetMetadata(OPIEKUN_OWNERSHIP_KEY, { source, name, as } satisfies OwnershipMeta);

/**
 * Marks an endpoint as requiring that the targeted resource belongs to the
 * authenticated carrier user. No-op for non-przewoznik roles.
 *
 * Usage — the permission gate is `@RequirePermission` (global
 * `PermissionsGuard`), `@UseGuards` carries only the ownership guard (the
 * real controllers declare it once on the class):
 *   ```ts
 *   @Get('vehicles/:id')
 *   @RequirePermission('vehicles.read')
 *   @UseGuards(CarrierOwnershipGuard)
 *   @CarrierOwns('id', 'param', 'vehicleId')
 *   getById(...)
 *   ```
 */
export const CarrierOwns = (
  name: string,
  source: OwnershipSource = 'param',
  as: OwnershipMeta['as'] = 'vehicleId',
): MethodDecorator & ClassDecorator =>
  SetMetadata(CARRIER_OWNERSHIP_KEY, { source, name, as } satisfies OwnershipMeta);
