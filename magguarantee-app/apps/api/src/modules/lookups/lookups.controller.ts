import { Controller, Get, Query } from '@nestjs/common';

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
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { LookupsService } from './lookups.service';

/**
 * Read-only dropdown helpers per docs/13-api-design.md#lookups.
 *
 * Every route carries a per-method `@RequirePermission` (docs/25 §3 B2; global
 * `PermissionsGuard`; mirrored per route in the generated fixture
 * `common/authz/__fixtures__/endpoint-permissions.snapshot.json`):
 *  - staff pickers `dyspozytor`, `planisci`, `opiekuni`, `teams` —
 *    `lookups.staff` (admin, opiekun);
 *  - `planisci/transfer-targets` — `vehicles.planner_transfer.request` or
 *    `.decide` (admin, opiekun, planista);
 *  - `planisci/liders`, `users` — `users.manage` (admin);
 *  - the Phase 4.4 carriers picker — `lookups.carriers` (admin / pracownik /
 *    opiekun), since it surfaces carrier-PII (login + name).
 *
 * Note: `GET /lookups/cert-types` was removed in the
 * 20260515130307_vehicle_certificate_l_to_boolean wave — `Vehicle.certificateL`
 * is now a Boolean (TAK/NIE) so no enum lookup is needed.
 */
@Controller('lookups')
export class LookupsController {
  constructor(private readonly lookups: LookupsService) {}

  // People-pickers back the admin/opiekun vehicle & carrier forms only. They
  // surface internal-staff PII (id / login / name), so they require
  // `lookups.staff` (admin/opiekun) — previously any authenticated user (incl.
  // a carrier subcontractor) could enumerate the entire MAGTRANS staff roster.
  @Get('dyspozytor')
  @RequirePermission('lookups.staff')
  dyspozytor(): Promise<LookupUserListDto> {
    return this.lookups.dyspozytor();
  }

  @Get('planisci')
  @RequirePermission('lookups.staff')
  planisci(): Promise<LookupUserListDto> {
    return this.lookups.planisci();
  }

  /**
   * «Nowy planista» picker of a transfer request (docs/29 U2, docs/14 §17.12
   * A7): every ACTIVE planista, minus the current planista of `?vehicleId=`.
   * Open to everyone who may FILE or DECIDE a request —
   * `vehicles.planner_transfer.request` or `.decide`: admin, opiekun, planista
   * (a planista files for his own vehicles). Staff names only.
   */
  @Get('planisci/transfer-targets')
  @RequirePermission('vehicles.planner_transfer.request', 'vehicles.planner_transfer.decide')
  plannerTransferTargets(
    @Query(new ZodValidationPipe(PlannerTransferTargetsQuerySchema))
    query: PlannerTransferTargetsQuery,
  ): Promise<LookupUserListDto> {
    return this.lookups.plannerTransferTargets(query.vehicleId);
  }

  /**
   * «Przełożony (lider)» picker of the admin user form (docs/29 U9, docs/14
   * §17.7): active planisci carrying `lider = true`. Part of user management,
   * so `users.manage` (admin only) — only an admin sets `liderId`.
   */
  @Get('planisci/liders')
  @RequirePermission('users.manage')
  planistaLiders(): Promise<LookupUserListDto> {
    return this.lookups.planistaLiders();
  }

  @Get('opiekuni')
  @RequirePermission('lookups.staff')
  opiekuni(): Promise<LookupUserListDto> {
    return this.lookups.opiekuni();
  }

  /**
   * Dispatch-teams picker (Phase 11) per docs/13-api-design.md#lookups. Returns
   * every team with its dispatcher roster (incl. each member's `active` flag)
   * so the web vehicle-form renders a member preview without an N+1. Read-only;
   * a staff picker like the three above, so `lookups.staff` (admin, opiekun).
   */
  @Get('teams')
  @RequirePermission('lookups.staff')
  teams(): Promise<LookupTeamListDto> {
    return this.lookups.teamsList();
  }

  /**
   * Carriers autocomplete per Phase 4.4. Capped at 100 rows. Requires
   * `lookups.carriers` (admin, pracownik, opiekun — any other role → 403);
   * the rows are role-scoped in the service:
   *   - admin / pracownik → all live carriers;
   *   - opiekun           → only carriers where `Carrier.opiekunId === user.sub`.
   *
   * `q` is a free substring match across login + name; soft-deleted carriers
   * are excluded (the soft-delete extension on the carriers repo handles
   * that).
   */
  @Get('carriers')
  @RequirePermission('lookups.carriers')
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
   * Requires `users.manage` (admin only).
   */
  @Get('users')
  @RequirePermission('users.manage')
  users(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(LookupUserAdminFiltersSchema))
    query: LookupUserAdminFilters,
  ): Promise<LookupUserAdminListDto> {
    return this.lookups.usersListAdmin(user, query);
  }
}
