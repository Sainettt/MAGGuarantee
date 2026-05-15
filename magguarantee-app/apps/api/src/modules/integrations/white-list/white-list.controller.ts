import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import {
  WhiteListQuerySchema,
  WhiteListSearchQuerySchema,
  type WhiteListQuery,
  type WhiteListResponse,
  type WhiteListSearchQuery,
  type WhiteListSearchResponse,
} from '@magguarantee/shared';

import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { WhiteListService } from './white-list.service';

// Per docs/13-api-design.md#rate-limiting: 10 / min / IP for `/integrations/whitelist`.
const RL = { limit: process.env.NODE_ENV === 'test' ? 1_000 : 10, ttl: 60_000 };

/**
 * Biała Lista MF endpoints — see docs/13-api-design.md#external-integrations:
 *   - `GET /api/v1/integrations/whitelist?nip=...&account=...`
 *       Confirm a bank account is bound to a NIP in the MF white-list.
 *   - `GET /api/v1/integrations/whitelist/search?nip=...`
 *       Auto-fill carrier company data (name, address, accounts) by NIP.
 *
 * Same auth/rate-limit policy as VIES — any authenticated user.
 */
@Controller('integrations/whitelist')
export class WhiteListController {
  constructor(private readonly whiteList: WhiteListService) {}

  @Get()
  @Throttle({ default: RL })
  async check(
    @Query(new ZodValidationPipe(WhiteListQuerySchema)) query: WhiteListQuery,
  ): Promise<WhiteListResponse> {
    return this.whiteList.checkAccount(query.nip, query.account);
  }

  @Get('search')
  @Throttle({ default: RL })
  async search(
    @Query(new ZodValidationPipe(WhiteListSearchQuerySchema))
    query: WhiteListSearchQuery,
  ): Promise<WhiteListSearchResponse> {
    return this.whiteList.searchByNip(query.nip);
  }
}
