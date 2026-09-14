import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { OpsAlertService } from '../../common/ops-alert/ops-alert.service';
import { describeError, maskEmail } from '../../common/ops-alert/redact';
import { summarizeJobFailure } from '../jobs/job-failure';
import { QUEUE_EMAIL_SEND } from '../jobs/queue-names';
import { EmailLogRepository, type EmailLogEntry } from './email-log.repository';
import type { EmailSendJobData, EmailSendJobResult } from './email-send.job';
import { resolveEmailTarget } from './email-target';
import { MailCompensationRegistry } from './mail-compensation.registry';

/**
 * Side effects of an `email-send` job reaching an outcome (2026-08-14 logging
 * audit, items 6 / 11 / 23). Called from the processor's worker events, which
 * BullMQ emits only after it has durably moved the job — so "final" here is
 * authoritative.
 *
 *  - every failed attempt → ONE structured log line (WARN while BullMQ will
 *    retry, ERROR when it will not). The send path does not log a second line
 *    for queued attempts;
 *  - final outcome → ONE `email_logs` row (`sent` / `failed`);
 *  - final failure → producer compensation (release "notified" stamps) and an
 *    ops alert (deduped per template).
 *
 * Nothing here may throw: a rejected worker-event listener is an unhandled
 * rejection, and a crashed bookkeeping step must not hide the others.
 */
@Injectable()
export class MailJobOutcomeRecorder {
  private readonly logger = new Logger(MailJobOutcomeRecorder.name);

  constructor(
    private readonly emailLogs: EmailLogRepository,
    private readonly compensations: MailCompensationRegistry,
    private readonly alerts: OpsAlertService,
  ) {}

  async recordSuccess(
    job: Job<EmailSendJobData>,
    result: EmailSendJobResult,
  ): Promise<void> {
    await this._writeLog(job.data, {
      jobId: job.id ?? null,
      subject: result.subject,
      status: 'sent',
      // `completed` fires after BullMQ incremented attemptsMade.
      attempts: job.attemptsMade,
      errorName: null,
      errorMessage: null,
      providerMessageId: result.providerMessageId,
      sentAt: new Date(job.finishedOn ?? Date.now()),
    });
  }

  async recordFailure(
    job: Job<EmailSendJobData> | undefined,
    err: unknown,
    subject: string | null,
  ): Promise<void> {
    const summary = summarizeJobFailure(QUEUE_EMAIL_SEND, job, err);
    const template = job?.data.template ?? null;
    const logLine = {
      jobId: summary.jobId,
      queue: summary.queue,
      template,
      toMasked: job ? maskEmail(job.data.email) : undefined,
      attemptsMade: summary.attemptsMade,
      maxAttempts: summary.maxAttempts,
      errorName: summary.errorName,
      errorMessage: summary.errorMessage,
    };
    if (!summary.final) {
      this.logger.warn({ msg: 'email-send attempt failed, will retry', ...logLine });
      return;
    }
    this.logger.error({ msg: 'email-send job failed permanently', ...logLine });
    if (!job) return;

    await this._writeLog(job.data, {
      jobId: summary.jobId,
      subject,
      status: 'failed',
      attempts: summary.attemptsMade,
      errorName: summary.errorName,
      errorMessage: summary.errorMessage,
      providerMessageId: null,
      sentAt: null,
    });
    await this._compensate(job);
    await this.alerts.send({
      key: `email-send:failed:${job.data.template}`,
      severity: 'error',
      title: `Email delivery failed permanently: ${job.data.template}`,
      fields: {
        queue: summary.queue,
        template: job.data.template,
        jobId: summary.jobId,
        attempts: `${summary.attemptsMade}/${summary.maxAttempts}`,
        errorName: summary.errorName,
        errorMessage: summary.errorMessage,
      },
    });
  }

  private async _compensate(job: Job<EmailSendJobData>): Promise<void> {
    const compensation = job.data.meta?.compensation;
    if (!compensation) return;
    try {
      await this.compensations.onFinalFailure(compensation, job.id ?? null);
    } catch (err) {
      this.logger.error({
        msg: 'email-send compensation could not run',
        jobId: job.id,
        kind: compensation.kind,
        ...describeError(err),
      });
    }
  }

  private async _writeLog(
    data: EmailSendJobData,
    outcome: Pick<
      EmailLogEntry,
      | 'jobId'
      | 'subject'
      | 'status'
      | 'attempts'
      | 'errorName'
      | 'errorMessage'
      | 'providerMessageId'
      | 'sentAt'
    >,
  ): Promise<void> {
    try {
      await this.emailLogs.create({
        template: data.template,
        recipients: [data.email],
        ...resolveEmailTarget(data),
        triggeredById: data.meta?.triggeredById ?? null,
        ...outcome,
      });
    } catch (err) {
      // Losing a delivery-log row is bad; failing the (already sent) job over
      // it — and re-sending the mail — would be worse. Log and move on.
      this.logger.error({
        msg: 'email_logs write failed',
        jobId: outcome.jobId,
        template: data.template,
        status: outcome.status,
        ...describeError(err),
      });
    }
  }
}
