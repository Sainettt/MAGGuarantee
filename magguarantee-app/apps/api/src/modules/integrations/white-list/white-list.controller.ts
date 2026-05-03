import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import {
  WhiteListQuerySchema,
  type WhiteListQuery,
  type WhiteListResponse,
} from '@magguarantee/shared';

import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { WhiteListService } from './white-list.service';

// Per docs/13-api-design.md#rate-limiting: 10 / min / IP for `/integrations/whitelist`.
const RL = { limit: process.env.NODE_ENV === 'test' ? 1_000 : 10, ttl: 60_000 };

/**
 * `GET /api/v1/integrations/whitelist?nip=...&account=...`
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
}
