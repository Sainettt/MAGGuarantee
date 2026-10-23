import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import {
  WhiteListCheckBodySchema,
  WhiteListSearchBodySchema,
  type WhiteListCheckBody,
  type WhiteListResponse,
  type WhiteListSearchBody,
  type WhiteListSearchResponse,
} from '@magguarantee/shared';

import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { WhiteListService } from './white-list.service';

// Per docs/13-api-design.md#rate-limiting: 10 / min / IP for `/integrations/whitelist`.
const RL = { limit: process.env.NODE_ENV === 'test' ? 1_000 : 10, ttl: 60_000 };

/**
 * Biała Lista MF endpoints — see docs/13-api-design.md#external-integrations:
 *   - `POST /api/v1/integrations/whitelist/check`   body `{ nip, account }`
 *       Confirm a bank account is bound to a NIP in the MF white-list.
 *   - `POST /api/v1/integrations/whitelist/search`  body `{ nip }`
 *       Auto-fill carrier company data (name, address, accounts) by NIP.
 *
 * Both are read-only lookups. They are POST only so the NIP and the bank
 * account travel in the body instead of the query string, which is written to
 * access/proxy logs and browser history (2026-09-14 logging audit, item 2).
 * Hence `200`, not the POST-default `201`, and deliberately no `@Audit` —
 * nothing is mutated.
 *
 * Same auth policy as VIES — admin/opiekun only (carrier-onboarding tools),
 * enforced by the global PermissionsGuard via this class-level
 * `@RequirePermission('integrations.external')` (docs/25 §3 B2).
 */
@Controller('integrations/whitelist')
@RequirePermission('integrations.external')
export class WhiteListController {
  constructor(private readonly whiteList: WhiteListService) {}

  @Post('check')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: RL })
  async check(
    @Body(new ZodValidationPipe(WhiteListCheckBodySchema))
    body: WhiteListCheckBody,
  ): Promise<WhiteListResponse> {
    return this.whiteList.checkAccount(body.nip, body.account);
  }

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: RL })
  async search(
    @Body(new ZodValidationPipe(WhiteListSearchBodySchema))
    body: WhiteListSearchBody,
  ): Promise<WhiteListSearchResponse> {
    return this.whiteList.searchByNip(body.nip);
  }
}
