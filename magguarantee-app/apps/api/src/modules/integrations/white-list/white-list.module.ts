import { Module } from '@nestjs/common';

import { WhiteListController } from './white-list.controller';
import { WhiteListService } from './white-list.service';

/**
 * Biała Lista MF white-list module.
 * Wired into AppModule per docs/13-api-design.md#external-integrations.
 */
@Module({
  controllers: [WhiteListController],
  providers: [WhiteListService],
  exports: [WhiteListService],
})
export class WhiteListModule {}
