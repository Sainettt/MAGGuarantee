import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { QUEUE_CHAT_NOTIFY_WYJAZD } from '../../jobs/queue-names';
import { ChatConfig } from './chat.config';
import { ChatContextBuilder } from './chat-context.builder';
import { ChatNotifierService } from './chat-notifier.service';
import { ChatProcessor } from './chat.processor';
import { ChatRepository } from './chat.repository';

/**
 * Google Chat wyjazd-notification module.
 *
 * Registers the `chat-notify-wyjazd` queue (producer side: `ChatNotifierService`;
 * consumer side: in-process `ChatProcessor`). `BullModule.forRoot` lives in the
 * global `JobsModule`; here we only `registerQueue` to obtain the named queue +
 * bind the worker.
 *
 * Exports `ChatNotifierService` so `DelegationsModule` can fire-and-forget the
 * notification from `DelegationsService.add`. `PrismaService` / `ConfigService`
 * are globally provided. See docs/16-jobs-and-integrations.md
 * #google-chat-notifications.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_CHAT_NOTIFY_WYJAZD }),
  ],
  providers: [
    ChatConfig,
    ChatRepository,
    ChatContextBuilder,
    ChatNotifierService,
    ChatProcessor,
  ],
  exports: [ChatNotifierService],
})
export class ChatModule {}
