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
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
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
 * Guards: global `JwtAuthGuard`; `RolesGuard` + `@Roles` per route;
 * `OpiekunOwnershipGuard` scopes an opiekun to vehicles of his carriers on the
 * two vehicle routes (no-op for other roles). Everything else — "current
 * planista of this vehicle", "lider of fromPlanner", "author" — is a
 * resource-level check in the service (docs/29 §3.1: no `LiderGuard`).
 *
 * The four mutations carry `@Audit` WITHOUT `manualTransaction`: the approval
 * locks the vehicle row (`SELECT … FOR UPDATE`) inside the interceptor's
 * transaction, and every write + the audit row commit together.
 */
@Controller()
@UseGuards(RolesGuard, OpiekunOwnershipGuard)
export class PlannerTransfersController {
  constructor(private readonly transfers: PlannerTransfersService) {}

  /**
   * File a request — the opiekun of the vehicle's carrier or its current
   * planista (R2). Admin excluded by `@Roles` (U1).
   */
  @Post('vehicles/:id/planner-transfers')
  @HttpCode(HttpStatus.CREATED)
  @Roles('opiekun', 'planista')
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
  @Roles('admin', 'opiekun', 'planista')
  @OpiekunOwns('id', 'param', 'vehicleId')
  async history(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(UuidSchema)) vehicleId: string,
  ): Promise<VehiclePlannerHistoryDto> {
    return this.transfers.history(user, vehicleId);
  }

  /** Inbox (`scope=decide`) or own requests (`scope=mine`). */
  @Get('planner-transfers')
  @Roles('admin', 'opiekun', 'planista')
  async list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(PlannerTransferListQuerySchema))
    query: PlannerTransferListQuery,
  ): Promise<PlannerTransferListDto> {
    return this.transfers.list(user, query);
  }

  /** Admin or the current lider of `fromPlanner`; never author / target (R3/R4). */
  @Post('planner-transfers/:id/approve')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'planista')
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
  @Roles('admin', 'planista')
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

  /** The author withdraws his own pending request (U4). No body. */
  @Post('planner-transfers/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles('opiekun', 'planista')
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
