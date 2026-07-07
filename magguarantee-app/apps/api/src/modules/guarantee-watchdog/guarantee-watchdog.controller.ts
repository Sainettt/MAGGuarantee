import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import {
  GuaranteeEpisodeFiltersSchema,
  type GuaranteeComplianceResponse,
  type GuaranteeEpisodeFilters,
  type GuaranteeEpisodeListDto,
} from '@magguarantee/shared';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { GuaranteeWatchdogService } from './guarantee-watchdog.service';

/**
 * Guarantee Watchdog read surface (plan §5). Three GET endpoints — no writes in
 * v1 (no manual episode mutation). The global `JwtAuthGuard` covers auth;
 * `RolesGuard` + `@Roles` gate each route. Opiekun scoping is enforced
 * service-side (`carrier.opiekunId = user.sub`), NOT via `OpiekunOwnershipGuard`
 * (which is decorator-driven for single-resource lookups). No `@Audit` — reads.
 */
@Controller()
@UseGuards(RolesGuard)
export class GuaranteeWatchdogController {
  constructor(private readonly watchdog: GuaranteeWatchdogService) {}

  /**
   * `GET /guarantee-compliance` — admin (all) + opiekun (own carriers). Live
   * board: one row per guaranteed vehicle keyed by vehicleId + summary counts.
   */
  @Get('guarantee-compliance')
  @Roles('admin', 'opiekun')
  async compliance(
    @CurrentUser() user: AuthUser,
  ): Promise<GuaranteeComplianceResponse> {
    return this.watchdog.getComplianceBoard(user);
  }

  /**
   * `GET /guarantee-compliance/me` — przewoznik. The caller's own guaranteed
   * fleet (for the dashboard banner + fleet badges). Same item shape minus the
   * carrier block; keyed by vehicleId.
   */
  @Get('guarantee-compliance/me')
  @Roles('przewoznik')
  async myCompliance(
    @CurrentUser() user: AuthUser,
  ): Promise<GuaranteeComplianceResponse> {
    return this.watchdog.getMyCompliance(user);
  }

  /**
   * `GET /guarantee-episodes` — admin (all) + opiekun (own carriers). Violation
   * archive, newest first, cursor-paginated. Filters: carrierId / vehicleId /
   * state.
   */
  @Get('guarantee-episodes')
  @Roles('admin', 'opiekun')
  async episodes(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(GuaranteeEpisodeFiltersSchema))
    query: GuaranteeEpisodeFilters,
  ): Promise<GuaranteeEpisodeListDto> {
    return this.watchdog.listEpisodes(user, query);
  }
}
