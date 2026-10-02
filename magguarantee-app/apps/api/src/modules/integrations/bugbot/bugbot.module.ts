import { Module } from '@nestjs/common';

import { BugbotHandoffController } from './bugbot-handoff.controller';
import { BugbotHandoffService } from './bugbot-handoff.service';

/**
 * BugBot handoff — one-time sign-in URL into the MAGTRANS bug/idea intake.
 * Wired into AppModule per docs/13-api-design.md#external-integrations; see
 * docs/16-jobs-and-integrations.md#bugbot-handoff.
 *
 * BugbotHandoffThrottlerGuard (on the controller) resolves its storage and
 * options from the global ThrottlerModule, so nothing is imported here.
 */
@Module({
  controllers: [BugbotHandoffController],
  providers: [BugbotHandoffService],
})
export class BugbotModule {}
