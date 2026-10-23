import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  ApprovePlannerTransferSchema,
  CreatePlannerTransferSchema,
  PlannerTransferListQuerySchema,
  RejectPlannerTransferSchema,
  UuidSchema,
  type ApprovePlannerTransferDto,
  type CreatePlannerTransferDto,
  type PlannerTransferDto,
  type PlannerTransferListDto,
  type PlannerTransferListQuery,
  type RejectPlannerTransferDto,
  type VehiclePlannerHistoryDto,
} from '@magguarantee/shared';

import { Audit } from '../../common/audit';
import { OpiekunOwnershipGuard, OpiekunOwns } from '../../common/guards';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import {
  PLANNER_TRANSFER_AUDIT_ACTIONS,
  PLANNER_TRANSFER_AUDIT_TARGET,
} from './planner-transfer.rules';
import { PlannerTransfersService } from './planner-transfers.service';

/**
 * Vehicle planner transfer — docs/13-api-design.md#vehicle-planner-transfers,
 * docs/29 §3.1. Two path families on one controller (the
 * `GuaranteeWatchdogController` precedent): the vehicle-scoped
 * `vehicles/:id/planner-*` pair and the request-scoped `planner-transfers/*`.
 *
 * Guards: global `JwtAuthGuard`; global `PermissionsGuard` + per-route
 * `@RequirePermission` (docs/25 §3 B2; mirrored per route in the generated
 * fixture `common/authz/__fixtures__/endpoint-permissions.snapshot.json`) —
 * `vehicles.planner_transfer.request` to file and cancel,
 * `vehicles.planner_transfer.decide` to approve / reject (admin; a planista
 * holds it only with the leader flag, `LIDER_PERMISSIONS`), either of the two
 * for the list, `vehicles.planner_history.read` for the vehicle journal.
 * `OpiekunOwnershipGuard` scopes an opiekun to vehicles of his carriers on the
 * two vehicle routes (no-op for other roles). Everything else — "current
 * planista of this vehicle", "lider of THIS fromPlanner", "author" — is a
 * resource-level check in the service (docs/29 §3.1: no `LiderGuard`).
 *
 * The four mutations carry `@Audit` WITHOUT `manualTransaction`: the approval
 * locks the vehicle row (`SELECT … FOR UPDATE`) inside the interceptor's
 * transaction, and every write + the audit row commit together.
 */
@Controller()
@UseGuards(OpiekunOwnershipGuard)
export class PlannerTransfersController {
  constructor(private readonly transfers: PlannerTransfersService) {}

  /**
   * File a request — an admin (any vehicle), the opiekun of the vehicle's
   * carrier or its current planista (R2, U1 as of 2026-10-23). The ownership
   * guard scopes only the opiekun; R4 keeps an admin from deciding his own.
   */
  @Post('vehicles/:id/planner-transfers')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('vehicles.planner_transfer.request')
  @OpiekunOwns('id', 'param', 'vehicleId')
  @Audit({
    action: PLANNER_TRANSFER_AUDIT_ACTIONS.request,
    targetType: PLANNER_TRANSFER_AUDIT_TARGET,
    targetKey: (_req, result) => (result as { id?: string }).id,
  })
  async request(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(UuidSchema)) vehicleId: string,
    @Body(new ZodValidationPipe(CreatePlannerTransferSchema))
    dto: CreatePlannerTransferDto,
  ): Promise<PlannerTransferDto> {
    return this.transfers.request(user, vehicleId, dto);
  }

  /** The vehicle's planista journal + all its requests (visibility U11). */
  @Get('vehicles/:id/planner-history')
  @RequirePermission('vehicles.planner_history.read')
  @OpiekunOwns('id', 'param', 'vehicleId')
  async history(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(UuidSchema)) vehicleId: string,
  ): Promise<VehiclePlannerHistoryDto> {
    return this.transfers.history(user, vehicleId);
  }

  /**
   * Inbox (`scope=decide`) or own requests (`scope=mine`) — one route, two
   * inboxes, so either permission opens it; the service 403s `scope=decide`
   * for a non-decider.
   */
  @Get('planner-transfers')
  @RequirePermission('vehicles.planner_transfer.request', 'vehicles.planner_transfer.decide')
  async list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(PlannerTransferListQuerySchema))
    query: PlannerTransferListQuery,
  ): Promise<PlannerTransferListDto> {
    return this.transfers.list(user, query);
  }

  /**
   * Admin or the current lider of `fromPlanner`; never author / target (R3/R4).
   * `vehicles.planner_transfer.decide` lets admin and a planista-lider reach
   * the handler; "lider of THIS fromPlanner" stays the service's call.
   */
  @Post('planner-transfers/:id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('vehicles.planner_transfer.decide')
  @Audit({
    action: PLANNER_TRANSFER_AUDIT_ACTIONS.approve,
    targetType: PLANNER_TRANSFER_AUDIT_TARGET,
    targetKey: (req) => req.params?.id,
  })
  async approve(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(ApprovePlannerTransferSchema))
    dto: ApprovePlannerTransferDto,
  ): Promise<PlannerTransferDto> {
    return this.transfers.approve(user, id, dto);
  }

  /** Same deciders as approve; `reason` required (U3). */
  @Post('planner-transfers/:id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('vehicles.planner_transfer.decide')
  @Audit({
    action: PLANNER_TRANSFER_AUDIT_ACTIONS.reject,
    targetType: PLANNER_TRANSFER_AUDIT_TARGET,
    targetKey: (req) => req.params?.id,
  })
  async reject(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(RejectPlannerTransferSchema))
    dto: RejectPlannerTransferDto,
  ): Promise<PlannerTransferDto> {
    return this.transfers.reject(user, id, dto);
  }

  /** The author withdraws his own pending request (U4) — every role that files. No body. */
  @Post('planner-transfers/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('vehicles.planner_transfer.request')
  @Audit({
    action: PLANNER_TRANSFER_AUDIT_ACTIONS.cancel,
    targetType: PLANNER_TRANSFER_AUDIT_TARGET,
    targetKey: (req) => req.params?.id,
  })
  async cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<PlannerTransferDto> {
    return this.transfers.cancel(user, id);
  }
}
