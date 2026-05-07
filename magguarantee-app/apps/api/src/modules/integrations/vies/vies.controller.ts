import { Controller, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import {
  ViesCountrySchema,
  ViesVatSchema,
  type ViesLookupResponse,
} from '@magguarantee/shared';

import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { ViesService } from './vies.service';

// Per docs/13-api-design.md#rate-limiting: 10 / min / IP for `/integrations/vies/*`.
const RL = { limit: process.env.NODE_ENV === 'test' ? 1_000 : 10, ttl: 60_000 };

/**
 * `GET /api/v1/integrations/vies/:country/:vat`
 *
 * Auth: any authenticated user (the global JwtAuthGuard runs by default).
 * No `@Roles()` decorator — admin/opiekun use this in carrier onboarding
 * flows. pracownik never opens carrier UI per docs/03-roles.md#pracownik
 * (narrow claims-only role) so it de-facto never reaches this endpoint.
 */
@Controller('integrations/vies')
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
