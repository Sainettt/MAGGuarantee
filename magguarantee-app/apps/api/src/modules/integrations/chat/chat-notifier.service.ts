import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { QUEUE_CHAT_NOTIFY_WYJAZD } from '../../jobs/queue-names';

/** Job payload for the `chat-notify-wyjazd` queue. */
export interface ChatWyjazdJobData {
  delegationId: string;
}

/** BullMQ job name within the `chat-notify-wyjazd` queue. */
export const CHAT_WYJAZD_JOB = 'wyjazd' as const;

/**
 * Delay (ms) before the worker is allowed to pick up a wyjazd job.
 *
 * `DelegationsService.add` runs inside the `@Audit()` transaction opened by
 * `AuditInterceptor` — the delegation row is NOT committed until that handler
 * resolves. The in-process worker would otherwise dequeue within a few ms and
 * read through a separate connection that can't see the uncommitted row,
 * producing a spurious "delegation not found, skipping" (which completes the
 * job with no retry — silently dropping the notification). A short delay lets
 * the audit transaction commit first; it commits in sub-second time, so 5 s is
 * comfortably safe and imperceptible for a chat notification.
 */
export const CHAT_WYJAZD_ENQUEUE_DELAY_MS = 5_000;

/**
 * Producer for the Google Chat wyjazd notification.
 *
 * `notifyWyjazd(delegationId)` enqueues a `chat-notify-wyjazd` job. Dedup via a
 * stable `jobId` (`chat-wyjazd-<delegationId>`) — if `add()` runs twice for the
 * same delegation (retry, double-submit), BullMQ keeps a single job.
 *
 * The caller (`DelegationsService.add`) wraps the call in try/catch so a Redis
 * hiccup never breaks delegation creation; this service additionally swallows
 * its own enqueue errors as a defence-in-depth `warn` (the chat post must NEVER
 * delay or fail `add()`). See docs/16-jobs-and-integrations.md
 * #google-chat-notifications.
 */
@Injectable()
export class ChatNotifierService {
  private readonly logger = new Logger(ChatNotifierService.name);

  constructor(
    @InjectQueue(QUEUE_CHAT_NOTIFY_WYJAZD)
    private readonly queue: Queue<ChatWyjazdJobData>,
  ) {}

  async notifyWyjazd(delegationId: string): Promise<void> {
    try {
      await this.queue.add(
        CHAT_WYJAZD_JOB,
        { delegationId },
        {
          jobId: `chat-wyjazd-${delegationId}`,
          // Wait for the `@Audit()` transaction in DelegationsService.add to
          // commit before the worker reads the row — see the const's doc.
          delay: CHAT_WYJAZD_ENQUEUE_DELAY_MS,
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );
      this.logger.log({ msg: 'chat wyjazd enqueued', delegationId });
    } catch (err) {
      // Defence-in-depth: never let an enqueue failure surface to the caller.
      this.logger.warn({
        msg: 'chat wyjazd enqueue failed',
        delegationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
