import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import {
  MyFleetQuerySchema,
  OpiekunFleetQuerySchema,
  type MyFleetQuery,
  type MyFleetResponse,
  type OpiekunFleetQuery,
  type OpiekunFleetResponse,
} from '@magguarantee/shared';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { FleetService } from './fleet.service';

/**
 * Fleet aggregates REST surface per docs/13-api-design.md#fleet.
 *
 * Phase 3 shipped `/fleet/my` (carrier role); Phase 5 adds `/fleet/opiekun`
 * (admin + opiekun). The remaining variants (`/fleet/planista`,
 * `/fleet/dyspozytor`, `/fleet/eksport`, `/fleet/weryfikator`) belong to
 * later phases.
 */
@Controller('fleet')
@UseGuards(RolesGuard)
export class FleetController {
  constructor(private readonly fleet: FleetService) {}

  @Get('my')
  @Roles('przewoznik')
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
  @Roles('admin', 'opiekun')
  async opiekun(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(OpiekunFleetQuerySchema))
    _query: OpiekunFleetQuery,
  ): Promise<OpiekunFleetResponse> {
    return this.fleet.getOpiekunFleet(user);
  }
}
