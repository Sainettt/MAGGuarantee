import { Controller, Get, Query } from '@nestjs/common';

import {
  MyFleetQuerySchema,
  OpiekunFleetQuerySchema,
  type DyspozytorFleetResponse,
  type MyFleetQuery,
  type MyFleetResponse,
  type OpiekunFleetQuery,
  type OpiekunFleetResponse,
  type PlanistaFleetResponse,
} from '@magguarantee/shared';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { FleetService } from './fleet.service';

/**
 * Fleet aggregates REST surface per docs/13-api-design.md#fleet.
 *
 * Phase 3 shipped `/fleet/my` (carrier role); Phase 5 adds `/fleet/opiekun`
 * (admin + opiekun); Phase 6 adds `/fleet/planista` (admin + planista) and
 * `/fleet/dyspozytor` (admin + dyspozytor). The remaining variants
 * (`/fleet/eksport`, `/fleet/weryfikator`) belong to later phases.
 *
 * Gates (docs/25 §3 B2): each route carries the panel permission planned in
 * `common/authz/endpoint-permissions.ts`, checked by the global
 * `PermissionsGuard` — `panel.carrier` (`/my`: przewoznik), `panel.opiekun`
 * (`/opiekun`: admin, opiekun), `panel.planista` (`/planista`: admin,
 * planista), `panel.dyspozytor` (`/dyspozytor`: admin, dyspozytor). Row scope
 * stays on the role, server-side in `FleetService`.
 */
@Controller('fleet')
export class FleetController {
  constructor(private readonly fleet: FleetService) {}

  @Get('my')
  @RequirePermission('panel.carrier')
  async my(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(MyFleetQuerySchema)) query: MyFleetQuery,
  ): Promise<MyFleetResponse> {
    return this.fleet.getMyFleet(user, query);
  }

  /**
   * Per-carrier fleet aggregate for the opiekun dashboard. Admin callers
   * see every carrier; opiekun callers see only carriers where
   * `Carrier.opiekunId === user.sub` (filtered server-side — see
   * `FleetService.getOpiekunFleet`). The query schema is intentionally
   * empty for now; it's wired in so future filters can land without
   * controller churn.
   */
  @Get('opiekun')
  @RequirePermission('panel.opiekun')
  async opiekun(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(OpiekunFleetQuerySchema))
    _query: OpiekunFleetQuery,
  ): Promise<OpiekunFleetResponse> {
    return this.fleet.getOpiekunFleet(user);
  }

  /**
   * Read-only fleet view for the planista panel. Planista callers see only
   * vehicles where `Vehicle.plannerId === user.sub` plus the drivers/trailers
   * of the carriers owning those vehicles; admin callers get the debug
   * all-vehicles fallback. Scope is server-side (JWT-driven) — there is no
   * client filter param. See `FleetService.getPlanistaFleet`.
   */
  @Get('planista')
  @RequirePermission('panel.planista')
  async planista(
    @CurrentUser() user: AuthUser,
  ): Promise<PlanistaFleetResponse> {
    return this.fleet.getPlanistaFleet(user);
  }

  /**
   * Read-only fleet view + KPI stats + idle-vehicle list for the dyspozytor
   * panel. Phase 11 — dyspozytor callers see only vehicles of THEIR dispatch
   * team (`Vehicle.dispatchTeamId === user.teamId`) plus the drivers/trailers
   * of the owning carriers; a dyspozytor with no team sees an empty fleet;
   * admin callers get the debug all-vehicles fallback. Scope is server-side
   * (JWT-driven). See `FleetService.getDyspozytorFleet`.
   */
  @Get('dyspozytor')
  @RequirePermission('panel.dyspozytor')
  async dyspozytor(
    @CurrentUser() user: AuthUser,
  ): Promise<DyspozytorFleetResponse> {
    return this.fleet.getDyspozytorFleet(user);
  }
}
