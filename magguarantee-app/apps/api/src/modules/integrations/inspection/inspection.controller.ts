import { Controller, Get, Query } from '@nestjs/common';

import {
  InspectionQuerySchema,
  type InspectionQuery,
  type InspectionResponse,
} from '@magguarantee/shared';

import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { Roles } from '../../auth/decorators/roles.decorator';
import { InspectionService } from './inspection.service';

/**
 * `GET /api/v1/integrations/inspection?vin=...`
 *
 * URL-builder, no upstream call, no rate-limit beyond the 100/min/IP global
 * default. admin/opiekun only (vehicle-onboarding tool) — enforced by the
 * global RolesGuard via this class-level `@Roles`.
 */
@Controller('integrations/inspection')
@Roles('admin', 'opiekun')
export class InspectionController {
  constructor(private readonly inspection: InspectionService) {}

  @Get()
  buildLink(
    @Query(new ZodValidationPipe(InspectionQuerySchema)) query: InspectionQuery,
  ): InspectionResponse {
    return this.inspection.buildLink(query.vin);
  }
}
