import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import {
  LookupCarrierFiltersSchema,
  LookupUserAdminFiltersSchema,
  PlannerTransferTargetsQuerySchema,
  type PlannerTransferTargetsQuery,
  type LookupCarrierFilters,
  type LookupCarrierListDto,
  type LookupTeamListDto,
  type LookupUserAdminFilters,
  type LookupUserAdminListDto,
  type LookupUserListDto,
} from '@magguarantee/shared';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { LookupsService } from './lookups.service';

/**
 * Read-only dropdown helpers per docs/13-api-design.md#lookups.
 *
 * The three people-pickers (`dyspozytor`, `planisci`, `opiekuni`) are
 * accessible by all authenticated users — the global `JwtAuthGuard` already
 * handles auth. The Phase 4.4 carriers picker is role-gated (admin /
 * pracownik / opiekun) since it surfaces carrier-PII (login + name).
 *
 * Note: `GET /lookups/cert-types` was removed in the
 * 20260515130307_vehicle_certificate_l_to_boolean wave — `Vehicle.certificateL`
 * is now a Boolean (TAK/NIE) so no enum lookup is needed.
 */
@Controller('lookups')
export class LookupsController {
  constructor(private readonly lookups: LookupsService) {}

  // People-pickers back the admin/opiekun vehicle & carrier forms only. They
  // surface internal-staff PII (id / login / name), so they are gated to
  // admin/opiekun — previously any authenticated user (incl. a carrier
  // subcontractor) could enumerate the entire MAGTRANS staff roster.
  @Get('dyspozytor')
  @Roles('admin', 'opiekun')
  dyspozytor(): Promise<LookupUserListDto> {
    return this.lookups.dyspozytor();
  }

  @Get('planisci')
  @Roles('admin', 'opiekun')
  planisci(): Promise<LookupUserListDto> {
    return this.lookups.planisci();
  }

  /**
   * «Nowy planista» picker of a transfer request (docs/29 U2, docs/14 §17.12
   * A7): every ACTIVE planista, minus the current planista of `?vehicleId=`.
   * Open to everyone who may FILE or DECIDE a request — admin, opiekun,
   * planista (a planista files for his own vehicles). Staff names only.
   */
  @Get('planisci/transfer-targets')
  @Roles('admin', 'opiekun', 'planista')
  plannerTransferTargets(
    @Query(new ZodValidationPipe(PlannerTransferTargetsQuerySchema))
    query: PlannerTransferTargetsQuery,
  ): Promise<LookupUserListDto> {
    return this.lookups.plannerTransferTargets(query.vehicleId);
  }

  /**
   * «Przełożony (lider)» picker of the admin user form (docs/29 U9, docs/14
   * §17.7): active planisci carrying `lider = true`. Admin-only — only an
   * admin sets `liderId`.
   */
  @Get('planisci/liders')
  @Roles('admin')
  planistaLiders(): Promise<LookupUserListDto> {
    return this.lookups.planistaLiders();
  }

  @Get('opiekuni')
  @Roles('admin', 'opiekun')
  opiekuni(): Promise<LookupUserListDto> {
    return this.lookups.opiekuni();
  }

  /**
   * Dispatch-teams picker (Phase 11) per docs/13-api-design.md#lookups. Returns
   * every team with its dispatcher roster (incl. each member's `active` flag)
   * so the web vehicle-form renders a member preview without an N+1. Read-only,
   * any authenticated user (team composition is non-sensitive — no rates).
   */
  @Get('teams')
  @Roles('admin', 'opiekun')
  teams(): Promise<LookupTeamListDto> {
    return this.lookups.teamsList();
  }

  /**
   * Carriers autocomplete per Phase 4.4. Capped at 100 rows, role-scoped:
   *   - admin / pracownik → all live carriers;
   *   - opiekun           → only carriers where `Carrier.opiekunId === user.sub`;
   *   - any other role    → 403.
   *
   * `q` is a free substring match across login + name; soft-deleted carriers
   * are excluded (the soft-delete extension on the carriers repo handles
   * that).
   */
  @Get('carriers')
  @UseGuards(RolesGuard)
  @Roles('admin', 'pracownik', 'opiekun')
  carriers(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(LookupCarrierFiltersSchema))
    query: LookupCarrierFilters,
  ): Promise<LookupCarrierListDto> {
    return this.lookups.carriersList(user, query);
  }

  /**
   * Admin users-autocomplete per Phase 4.5. Backs the audit-log filter
   * picker on the `/employee/audit` admin page. Capped at 100 rows; q-filter
   * is a free substring match across `login` and `name`. Inactive users are
   * included (audit rows survive deactivation) but soft-deleted are not.
   */
  @Get('users')
  @UseGuards(RolesGuard)
  @Roles('admin')
  users(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(LookupUserAdminFiltersSchema))
    query: LookupUserAdminFilters,
  ): Promise<LookupUserAdminListDto> {
    return this.lookups.usersListAdmin(user, query);
  }
}
