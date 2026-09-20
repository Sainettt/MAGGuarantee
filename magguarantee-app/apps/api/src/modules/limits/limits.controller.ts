import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  BulkUpdateMonthlyLimitsSchema,
  ListMonthlyLimitsFiltersSchema,
  UpdateMonthlyLimitSchema,
  YearMonthParamSchema,
  type BulkUpdateMonthlyLimitsDto,
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
 * Audit `targetKey` for `POST /limits/bulk`: `2026-01..12` — the year plus the
 * first and last month TOUCHED (the full month list lives in `before`/`after`
 * and in `metadata.payload`, so the key only has to be human-scannable in the
 * audit list). Re-parses the raw body with the SAME schema the handler uses;
 * an unparseable body means the request 400'd and no row is written anyway.
 */
function bulkTargetKey(body: unknown): string | undefined {
  const parsed = BulkUpdateMonthlyLimitsSchema.safeParse(body);
  if (!parsed.success) return undefined;
  const months = [...parsed.data.months].sort((a, b) => a - b);
  const first = months[0];
  const last = months[months.length - 1];
  if (first === undefined || last === undefined) return undefined;
  const pad = (m: number): string => String(m).padStart(2, '0');
  return `${parsed.data.year}-${pad(first)}..${pad(last)}`;
}

/**
 * Phase 4.5 — MonthlyLimit admin endpoints per
 * docs/13-api-design.md#limits.
 *
 *  - `GET  /api/v1/limits?year=YYYY` — list raw rows for that year. Read-only,
 *    no audit, no transactions. Frontend handles gap-filling.
 *  - `PUT  /api/v1/limits/:yearMonth` — upsert one row by composite
 *    `(year, month)`. Body validated against `UpdateMonthlyLimitSchema`
 *    (at least one of `kmPerDay` / `ratePerKm` / `kmPerSaturday` required,
 *    all NON-NEGATIVE — `0` = "guarantee switched off for this month",
 *    omitted = "leave the column as it is"). Audit-tracked via
 *    `@Audit({action: 'limits.update'})` — the global `AuditInterceptor`
 *    wraps it in an ambient transaction so the row write + audit row commit
 *    atomically (pre-Phase-4.4 atomic-audit invariant).
 *  - `POST /api/v1/limits/bulk` — the same partial write applied to N months
 *    of one year inside that single transaction (`limits.bulkUpdate`).
 *
 * All three endpoints are admin-only per `docs/03-roles.md#admin`.
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

  /**
   * `POST /limits/bulk` — apply one partial payload to several months of a
   * single year, atomically.
   *
   * With `0` meaning "guarantee switched off", turning a season off used to
   * require twelve separate PUTs, and a single forgotten month silently kept
   * paying the 540 km/day fallback. All months + the audit row commit in the
   * ONE transaction the `AuditInterceptor` opens, so the web dialog only ever
   * has to render success/error — never a partial write.
   *
   * Declared BEFORE `PUT /:yearMonth` for readability only — the verbs differ,
   * so there is no route-matching ambiguity.
   */
  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  @Audit({
    action: 'limits.bulkUpdate',
    targetType: 'MonthlyLimit',
    targetKey: (req) => bulkTargetKey(req.body),
  })
  async bulkUpsert(
    @Body(new ZodValidationPipe(BulkUpdateMonthlyLimitsSchema))
    dto: BulkUpdateMonthlyLimitsDto,
  ): Promise<MonthlyLimitListDto> {
    return this.limits.bulkUpsert(dto);
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
