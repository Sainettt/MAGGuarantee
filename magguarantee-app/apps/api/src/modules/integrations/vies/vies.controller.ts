import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import {
  ViesCheckBodySchema,
  type ViesCheckBody,
  type ViesLookupResponse,
} from '@magguarantee/shared';

import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ViesService } from './vies.service';

// Per docs/13-api-design.md#rate-limiting: 10 / min / IP for `/integrations/vies/*`.
const RL = { limit: process.env.NODE_ENV === 'test' ? 1_000 : 10, ttl: 60_000 };

/**
 * `POST /api/v1/integrations/vies/check`  body `{ country, vat }`
 *
 * A read-only lookup. It was `GET /vies/:country/:vat`; the VAT number now
 * travels in the body so it no longer lands in access/proxy logs (2026-09-14
 * logging audit, item 2). Hence `200` and no `@Audit` — nothing is mutated.
 *
 * Auth: admin/opiekun only — this is a carrier-onboarding tool (VAT lookup),
 * gated by the global RolesGuard via this class-level `@Roles`. pracownik is
 * excluded (narrow claims-only role per docs/03-roles.md#pracownik).
 */
@Controller('integrations/vies')
@Roles('admin', 'opiekun')
export class ViesController {
  constructor(private readonly vies: ViesService) {}

  @Post('check')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: RL })
  async lookup(
    @Body(new ZodValidationPipe(ViesCheckBodySchema)) body: ViesCheckBody,
  ): Promise<ViesLookupResponse> {
    return this.vies.lookup(body.country, body.vat);
  }
}
