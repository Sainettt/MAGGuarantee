import { Controller, Get, Query } from '@nestjs/common';

import {
  GuaranteeEpisodeFiltersSchema,
  MyGuaranteeEpisodeFiltersSchema,
  type GuaranteeComplianceResponse,
  type GuaranteeEpisodeFilters,
  type GuaranteeEpisodeListDto,
  type MyGuaranteeEpisodeFilters,
} from '@magguarantee/shared';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { GuaranteeWatchdogService } from './guarantee-watchdog.service';

/**
 * Guarantee Watchdog read surface (plan §5). Three GET endpoints — no writes in
 * v1 (no manual episode mutation). The global `JwtAuthGuard` covers auth; the
 * global `PermissionsGuard` + `@RequirePermission` gate each route (docs/25
 * §3 B2; mirrored per route in the generated fixture
 * `common/authz/__fixtures__/endpoint-permissions.snapshot.json`):
 * `panel.opiekun` (admin, opiekun) on the board / archive, `panel.carrier`
 * (przewoznik) on the `/me` variants. Opiekun scoping is enforced service-side
 * (`carrier.opiekunId = user.sub`), NOT via `OpiekunOwnershipGuard` (which is
 * decorator-driven for single-resource lookups). No `@Audit` — reads.
 */
@Controller()
export class GuaranteeWatchdogController {
  constructor(private readonly watchdog: GuaranteeWatchdogService) {}

  /**
   * `GET /guarantee-compliance` — `panel.opiekun`: admin (all) + opiekun (own
   * carriers). Live board: one row per guaranteed vehicle keyed by vehicleId +
   * summary counts.
   */
  @Get('guarantee-compliance')
  @RequirePermission('panel.opiekun')
  async compliance(
    @CurrentUser() user: AuthUser,
  ): Promise<GuaranteeComplianceResponse> {
    return this.watchdog.getComplianceBoard(user);
  }

  /**
   * `GET /guarantee-compliance/me` — `panel.carrier` (przewoznik). The caller's
   * own guaranteed fleet (for the dashboard banner + fleet badges). Same item
   * shape minus the carrier block; keyed by vehicleId.
   */
  @Get('guarantee-compliance/me')
  @RequirePermission('panel.carrier')
  async myCompliance(
    @CurrentUser() user: AuthUser,
  ): Promise<GuaranteeComplianceResponse> {
    return this.watchdog.getMyCompliance(user);
  }

  /**
   * `GET /guarantee-episodes/me` — `panel.carrier` (przewoznik). The caller's
   * OWN violation archive (own fleet only). Same shape + cursor pagination as
   * the admin/opiekun list; the carrier scope is derived from the JWT — no
   * client-supplied carrierId (it is not in the schema). Declared ABOVE the
   * literal `guarantee-episodes` route: paths differ, but `/me` stays first so
   * no future param route can shadow it.
   */
  @Get('guarantee-episodes/me')
  @RequirePermission('panel.carrier')
  async myEpisodes(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(MyGuaranteeEpisodeFiltersSchema))
    query: MyGuaranteeEpisodeFilters,
  ): Promise<GuaranteeEpisodeListDto> {
    return this.watchdog.listMyEpisodes(user, query);
  }

  /**
   * `GET /guarantee-episodes` — `panel.opiekun`: admin (all) + opiekun (own
   * carriers). Violation archive, newest first, cursor-paginated. Filters:
   * carrierId / vehicleId / state.
   */
  @Get('guarantee-episodes')
  @RequirePermission('panel.opiekun')
  async episodes(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(GuaranteeEpisodeFiltersSchema))
    query: GuaranteeEpisodeFilters,
  ): Promise<GuaranteeEpisodeListDto> {
    return this.watchdog.listEpisodes(user, query);
  }
}
