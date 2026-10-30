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
} from '@nestjs/common';

import {
  BulkUpdateWeeklyLimitsSchema,
  IsoWeekParamSchema,
  ListWeeklyLimitsFiltersSchema,
  UpdateWeeklyLimitSchema,
  formatIsoWeekKey,
  type BulkUpdateWeeklyLimitsDto,
  type ListWeeklyLimitsFilters,
  type UpdateWeeklyLimitDto,
  type WeeklyLimitDto,
  type WeeklyLimitListDto,
} from '@magguarantee/shared';

import { Audit } from '../../common/audit';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { LIMITS_AUDIT } from './limits.constants';
import { LimitsService } from './limits.service';

/**
 * Audit `targetKey` for `POST /limits/bulk`: `2026-W10..W22` — the ISO year
 * plus the first and last week TOUCHED (a single week gives `2026-W10..W10`;
 * the full week list lives in `before`/`after` and `metadata.payload`, so the
 * key only has to be human-scannable in the audit list). Re-parses the raw
 * body with the SAME schema the handler uses; an unparseable body means the
 * request 400'd and no row is written anyway.
 */
function bulkTargetKey(body: unknown): string | undefined {
  const parsed = BulkUpdateWeeklyLimitsSchema.safeParse(body);
  if (!parsed.success) return undefined;
  const { isoYear, weeks } = parsed.data;
  const first = Math.min(...weeks);
  const last = Math.max(...weeks);
  const firstKey = formatIsoWeekKey(isoYear, first);
  const lastKey = formatIsoWeekKey(isoYear, last);
  if (firstKey === null || lastKey === null) return undefined;
  // `2026-W22` → `W22`: the year is already in the first half of the range.
  return `${firstKey}..${lastKey.slice(lastKey.indexOf('-') + 1)}`;
}

/**
 * Km limits per ISO week — admin endpoints (docs/13-api-design.md «Limits —
 * `/api/v1/limits`», 2026-10-29; the per-month `:yearMonth` routes are gone).
 *
 *  - `GET  /api/v1/limits?year=YYYY` — the raw `weekly_limits` rows of that
 *    ISO year, ascending by week. Read-only, no audit. The web fills the
 *    weeks without a row in itself.
 *  - `PUT  /api/v1/limits/:isoWeek` — partial upsert of one `(isoYear,
 *    isoWeek)` row; `:isoWeek` = `YYYY-Www`. A malformed key or a week the
 *    year does not have (`2027-W53`) is a 400 from `IsoWeekParamSchema`.
 *    Audited as `limits.update`, `targetKey` = the key.
 *  - `POST /api/v1/limits/bulk` — the same partial write applied to N weeks of
 *    one ISO year (`limits.bulkUpdate`).
 *
 * Both writes run inside the ambient transaction the global `AuditInterceptor`
 * opens, so the row(s) and the audit row commit atomically.
 *
 * All three endpoints are admin-only per `docs/03-roles.md#admin`: the class
 * requires `limits.manage` (`@RequirePermission`, docs/25 §3 B2; global
 * `PermissionsGuard`), which only `admin` holds.
 */
@Controller('limits')
@RequirePermission('limits.manage')
export class LimitsController {
  constructor(private readonly limits: LimitsService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(ListWeeklyLimitsFiltersSchema))
    query: ListWeeklyLimitsFilters,
  ): Promise<WeeklyLimitListDto> {
    return this.limits.listForIsoYear(query.year);
  }

  /**
   * `POST /limits/bulk` — one partial payload on several weeks of a single ISO
   * year, atomically: all weeks + the audit row commit in the ONE transaction
   * the `AuditInterceptor` opens, so the web dialog only ever renders
   * success/error — never a partial write. 200, not 201: nothing is "created"
   * from the caller's point of view, rows are upserted.
   *
   * Declared before `PUT /:isoWeek` for readability only — the verbs differ,
   * so there is no route-matching ambiguity.
   */
  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  @Audit({
    action: LIMITS_AUDIT.bulkUpdate,
    targetType: LIMITS_AUDIT.targetType,
    targetKey: (req) => bulkTargetKey(req.body),
  })
  async bulkUpsert(
    @Body(new ZodValidationPipe(BulkUpdateWeeklyLimitsSchema))
    dto: BulkUpdateWeeklyLimitsDto,
  ): Promise<WeeklyLimitListDto> {
    return this.limits.bulkUpsert(dto);
  }

  @Put(':isoWeek')
  @Audit({
    action: LIMITS_AUDIT.update,
    targetType: LIMITS_AUDIT.targetType,
    targetKey: (req) => req.params?.isoWeek,
  })
  async upsert(
    @Param('isoWeek', new ZodValidationPipe(IsoWeekParamSchema))
    isoWeek: string,
    @Body(new ZodValidationPipe(UpdateWeeklyLimitSchema))
    dto: UpdateWeeklyLimitDto,
  ): Promise<WeeklyLimitDto> {
    return this.limits.upsert(isoWeek, dto);
  }
}
