import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import { QUEUE_CHAT_NOTIFY_WYJAZD } from '../../jobs/queue-names';
import { ChatConfig } from './chat.config';
import { ChatContextBuilder } from './chat-context.builder';
import { formatWyjazdMessage } from './chat-message';
import { postToChatWebhook } from './chat.http';
import type { ChatWyjazdJobData } from './chat-notifier.service';

/**
 * In-process worker for the `chat-notify-wyjazd` queue.
 *
 * Flow: build context (delegation + team) → format the 4-line message →
 * POST to the Google Chat incoming webhook.
 *
 * No-op rules:
 *   - URL unset (`ChatConfig.enabled === false`) → complete the job, log a
 *     skip. Dev / test / Mailhog environments never post.
 *   - delegation gone (context builder returns null) → complete + skip.
 *
 * On a real POST failure the processor RE-THROWS so BullMQ applies the
 * producer's attempt/backoff policy (5 attempts, exponential from 2 s).
 *
 * `@Processor` registers this as an in-process worker (the API Nest process
 * hosts the worker — no separate container), per the locked decision.
 */
@Processor(QUEUE_CHAT_NOTIFY_WYJAZD)
export class ChatProcessor extends WorkerHost {
  private readonly logger = new Logger(ChatProcessor.name);

  constructor(
    private readonly config: ChatConfig,
    private readonly builder: ChatContextBuilder,
  ) {
    super();
  }

  async process(job: Job<ChatWyjazdJobData>): Promise<void> {
    const { delegationId } = job.data;

    if (!this.config.enabled) {
      this.logger.log({
        msg: 'chat wyjazd: webhook URL unset, skipping (no-op)',
        delegationId,
      });
      return;
    }

    const ctx = await this.builder.build(delegationId);
    if (!ctx) {
      // Builder already warned (delegation not found). Complete the job.
      return;
    }

    const text = formatWyjazdMessage(ctx);
    // `webhookUrl` is guaranteed defined here because `enabled` is true.
    const url = this.config.webhookUrl as string;

    // Failure THROWS → BullMQ retries per the job's attempts/backoff.
    await postToChatWebhook(url, text);

    this.logger.log({ msg: 'chat wyjazd posted', delegationId });
  }
}
