import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  ListMonthlyLimitsFiltersSchema,
  UpdateMonthlyLimitSchema,
  YearMonthParamSchema,
  type ListMonthlyLimitsFilters,
  type MonthlyLimitDto,
  type MonthlyLimitListDto,
  type UpdateMonthlyLimitDto,
} from '@magguarantee/shared';

import { Audit } from '../../common/audit';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { LimitsService } from './limits.service';

/**
 * Phase 4.5 — MonthlyLimit admin endpoints per
 * docs/13-api-design.md#limits.
 *
 *  - `GET  /api/v1/limits?year=YYYY` — list raw rows for that year. Read-only,
 *    no audit, no transactions. Frontend handles gap-filling.
 *  - `PUT  /api/v1/limits/:yearMonth` — upsert one row by composite
 *    `(year, month)`. Body validated against `UpdateMonthlyLimitSchema`
 *    (at least one of `kmPerDay` / `ratePerKm` required). Audit-tracked via
 *    `@Audit({action: 'limits.update'})` — the global `AuditInterceptor`
 *    wraps it in an ambient transaction so the row write + audit row commit
 *    atomically (pre-Phase-4.4 atomic-audit invariant).
 *
 * Both endpoints are admin-only per `docs/03-roles.md#admin`.
 */
@Controller('limits')
@UseGuards(RolesGuard)
@Roles('admin')
export class LimitsController {
  constructor(private readonly limits: LimitsService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(ListMonthlyLimitsFiltersSchema))
    query: ListMonthlyLimitsFilters,
  ): Promise<MonthlyLimitListDto> {
    return this.limits.listForYear(query.year);
  }

  @Put(':yearMonth')
  @Audit({
    action: 'limits.update',
    targetType: 'MonthlyLimit',
    targetKey: (req) => req.params?.yearMonth,
  })
  async upsert(
    @Param('yearMonth', new ZodValidationPipe(YearMonthParamSchema))
    yearMonth: string,
    @Body(new ZodValidationPipe(UpdateMonthlyLimitSchema))
    dto: UpdateMonthlyLimitDto,
  ): Promise<MonthlyLimitDto> {
    return this.limits.upsert(yearMonth, dto);
  }
}
