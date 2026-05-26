import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import {
  AuditFiltersSchema,
  type AuditFilters,
  type AuditLogListDto,
} from '@magguarantee/shared';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuditQueryService } from './audit-query.service';

/**
 * Phase 4.5 — `GET /api/v1/audit` per docs/13-api-design.md#audit-апи-v1audit-admin.
 *
 * Admin-only. Read-only — no `@Audit()` decorator (we don't audit reads of
 * the audit log itself). Cursor pagination via opaque `cursor` token; the
 * client just forwards `nextCursor` from the previous response.
 *
 * The write-side lives in `apps/api/src/modules/audit/audit.service.ts`
 * (`AuditWriter`); this read-side is intentionally separate so the
 * interceptor's hot path doesn't carry an unused controller surface.
 */
@Controller('audit')
@UseGuards(RolesGuard)
@Roles('admin')
export class AuditQueryController {
  constructor(private readonly audit: AuditQueryService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(AuditFiltersSchema))
    query: AuditFilters,
  ): Promise<AuditLogListDto> {
    return this.audit.list(query);
  }
}
