import { Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue, UnrecoverableError } from 'bullmq';

import { ConnectionErrorReporter } from '../../../common/ops-alert/connection-error-reporter';
import { OpsAlertService } from '../../../common/ops-alert/ops-alert.service';
import { summarizeJobFailure } from '../../jobs/job-failure';
import { QUEUE_CHAT_NOTIFY_WYJAZD } from '../../jobs/queue-names';
import { ChatConfig } from './chat.config';
import { ChatContextBuilder } from './chat-context.builder';
import { formatWyjazdMessage } from './chat-message';
import { ChatWebhookError, postToChatWebhook } from './chat.http';
import type { ChatWyjazdJobData } from './chat-notifier.service';

/**
 * In-process worker for the `chat-notify-wyjazd` queue.
 *
 * Flow: build context (delegation + team) → format the message → ONE POST to
 * the Google Chat incoming webhook per BullMQ attempt.
 *
 * No-op rules:
 *   - URL unset (`ChatConfig.enabled === false`) → complete the job, log a
 *     skip. Dev / test / Mailhog environments never post.
 *   - delegation gone (context builder returns null) → complete + skip.
 *
 * On a POST failure the processor RE-THROWS so BullMQ applies the producer's
 * attempt/backoff policy (5 attempts, exponential from 2 s). A webhook verdict
 * that retrying cannot change (4xx other than 408/429 — revoked or malformed
 * webhook) is thrown as `UnrecoverableError`: no pointless retries.
 *
 * Failure visibility (2026-08-14 logging audit, item 6): `failed` → one line
 * per attempt (WARN while retrying, ERROR when final) + ops alert on the final
 * one; worker/queue `error` → rate-limited connection-error reporter.
 */
@Processor(QUEUE_CHAT_NOTIFY_WYJAZD)
export class ChatProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ChatProcessor.name);
  private readonly workerErrors: ConnectionErrorReporter;
  private readonly queueErrors: ConnectionErrorReporter;

  constructor(
    private readonly config: ChatConfig,
    private readonly builder: ChatContextBuilder,
    private readonly alerts: OpsAlertService,
    @InjectQueue(QUEUE_CHAT_NOTIFY_WYJAZD)
    private readonly queue: Queue<ChatWyjazdJobData>,
  ) {
    super();
    this.workerErrors = new ConnectionErrorReporter(this.logger, `worker:${QUEUE_CHAT_NOTIFY_WYJAZD}`, alerts);
    this.queueErrors = new ConnectionErrorReporter(this.logger, `queue:${QUEUE_CHAT_NOTIFY_WYJAZD}`, alerts);
  }

  onModuleInit(): void {
    this.queue.on('error', (err: unknown) => this.queueErrors.report(err));
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

    try {
      await postToChatWebhook(url, text);
    } catch (err) {
      if (err instanceof ChatWebhookError && !err.retryable) {
        throw new UnrecoverableError(err.message);
      }
      throw err;
    }

    this.logger.log({ msg: 'chat wyjazd posted', delegationId, jobId: job.id });
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<ChatWyjazdJobData> | undefined, err: Error): Promise<void> {
    const summary = summarizeJobFailure(QUEUE_CHAT_NOTIFY_WYJAZD, job, err);
    const line = {
      ...summary,
      delegationId: job?.data.delegationId,
      status: err instanceof ChatWebhookError ? err.status : undefined,
    };
    if (!summary.final) {
      this.logger.warn({ msg: 'chat wyjazd attempt failed, will retry', ...line });
      return;
    }
    this.logger.error({ msg: 'chat wyjazd notification failed permanently', ...line });
    await this.alerts.send({
      key: `${QUEUE_CHAT_NOTIFY_WYJAZD}:failed`,
      severity: 'error',
      title: 'Google Chat wyjazd notification failed permanently',
      fields: {
        queue: summary.queue,
        jobId: summary.jobId,
        delegationId: job?.data.delegationId,
        attempts: `${summary.attemptsMade}/${summary.maxAttempts}`,
        errorName: summary.errorName,
        errorMessage: summary.errorMessage,
      },
    });
  }

  @OnWorkerEvent('error')
  onWorkerError(err: Error): void {
    this.workerErrors.report(err);
  }
}
