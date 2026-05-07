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
 * (global access) and for non-opiekun roles. `pracownik` is excluded from
 * carrier-CRUD endpoints at the @Roles level per docs/03-roles.md#pracownik
 * (narrow claims-only role).
 *
 * Usage:
 *   ```ts
 *   @Patch('carriers/:id')
 *   @Roles('admin', 'opiekun')
 *   @UseGuards(RolesGuard, OpiekunOwnershipGuard)
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
 * Usage:
 *   ```ts
 *   @Patch('vehicles/:id')
 *   @Roles('przewoznik', 'admin', 'opiekun')
 *   @UseGuards(RolesGuard, CarrierOwnershipGuard)
 *   @CarrierOwns('id', 'param', 'vehicleId')
 *   update(...)
 *   ```
 */
export const CarrierOwns = (
  name: string,
  source: OwnershipSource = 'param',
  as: OwnershipMeta['as'] = 'vehicleId',
): MethodDecorator & ClassDecorator =>
  SetMetadata(CARRIER_OWNERSHIP_KEY, { source, name, as } satisfies OwnershipMeta);
