import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';

import {
  BugbotHandoffQuerySchema,
  type BugbotHandoffQuery,
  type BugbotHandoffResponse,
} from '@magguarantee/shared';

import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  CurrentUser,
  type AuthUser,
} from '../../auth/decorators/current-user.decorator';
import { BugbotHandoffThrottlerGuard } from './bugbot-handoff-throttler.guard';
import { BugbotHandoffService } from './bugbot-handoff.service';

/**
 * `GET /api/v1/integrations/bugbot/handoff?kind=bug|idea&locale=pl|en`
 * per docs/13-api-design.md#external-integrations.
 *
 * Auth: the global JwtAuthGuard; every role may report a bug, so there is no
 * `@RequirePermission` (the route is in `AUTHENTICATED_ONLY`). `kind=idea`
 * needs `bugbot.submit_idea` (admin only) — a 403 from the service via `can()`,
 * because the rule depends on a query parameter, not on the route.
 *
 * Rate limit: the global 100/min/IP stays as is; BugbotHandoffThrottlerGuard
 * adds 10/min per user (see the guard for why not `@Throttle`).
 *
 * No `@Audit`: a GET that changes nothing here. The response carries a
 * one-time sign-in credential, hence `Cache-Control: no-store`; it is never
 * logged (pino-http logs neither query strings nor response bodies).
 */
@Controller('integrations/bugbot')
@UseGuards(BugbotHandoffThrottlerGuard)
export class BugbotHandoffController {
  constructor(private readonly handoff: BugbotHandoffService) {}

  @Get('handoff')
  @Header('Cache-Control', 'no-store')
  createHandoff(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(BugbotHandoffQuerySchema)) query: BugbotHandoffQuery,
  ): Promise<BugbotHandoffResponse> {
    return this.handoff.createHandoff(user, query);
  }
}
