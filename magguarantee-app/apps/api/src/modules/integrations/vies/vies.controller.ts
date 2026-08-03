import { Controller, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import {
  ViesCountrySchema,
  ViesVatSchema,
  type ViesLookupResponse,
} from '@magguarantee/shared';

import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ViesService } from './vies.service';

// Per docs/13-api-design.md#rate-limiting: 10 / min / IP for `/integrations/vies/*`.
const RL = { limit: process.env.NODE_ENV === 'test' ? 1_000 : 10, ttl: 60_000 };

/**
 * `GET /api/v1/integrations/vies/:country/:vat`
 *
 * Auth: admin/opiekun only — this is a carrier-onboarding tool (VAT lookup).
 * Previously any authenticated user could drive the upstream call; now gated
 * by the global RolesGuard via this class-level `@Roles`. pracownik is excluded
 * (narrow claims-only role per docs/03-roles.md#pracownik).
 */
@Controller('integrations/vies')
@Roles('admin', 'opiekun')
export class ViesController {
  constructor(private readonly vies: ViesService) {}

  @Get(':country/:vat')
  @Throttle({ default: RL })
  async lookup(
    @Param('country', new ZodValidationPipe(ViesCountrySchema))
    country: string,
    @Param('vat', new ZodValidationPipe(ViesVatSchema)) vat: string,
  ): Promise<ViesLookupResponse> {
    return this.vies.lookup(country, vat);
  }
}
