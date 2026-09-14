import { Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue, UnrecoverableError } from 'bullmq';

import { ConnectionErrorReporter } from '../../common/ops-alert/connection-error-reporter';
import { OpsAlertService } from '../../common/ops-alert/ops-alert.service';
import { QUEUE_EMAIL_SEND } from '../jobs/queue-names';
import type { EmailSendJobData, EmailSendJobResult } from './email-send.job';
import {
  mailAttemptStorage,
  type MailAttemptContext,
} from './mail-attempt-context';
import { MailJobOutcomeRecorder } from './mail-job-outcome.recorder';
import { MailSecretCipher, MailSecretError } from './mail-secret-cipher';
import { MailService } from './mail.service';

/**
 * In-process worker for the `email-send` queue — EVERY transactional email
 * goes through here (22 templates, `email-send.job.ts`).
 *
 * `process` dispatches on `job.data.template` to the matching synchronous
 * `MailService.sendX`, inside a `mailAttemptStorage` context so the send path
 * can tag its registry row / log line with the job id and attempt, and report
 * back subject + provider message id. Secret-bearing templates have their
 * AES-256-GCM envelope opened right here, immediately before the call; the
 * plaintext never leaves this stack frame except into the renderer.
 *
 * Failures re-throw so BullMQ retries per the producer's policy (5 attempts,
 * exponential from 5 s). A secret that cannot be opened is an
 * `UnrecoverableError` — retrying cannot fix a wrong key or a tampered envelope.
 *
 * Outcome bookkeeping (2026-08-14 logging audit, items 6 / 11): the worker
 * events delegate to `MailJobOutcomeRecorder` — one log line per failed
 * attempt, one `email_logs` row per final outcome, compensation + ops alert on
 * permanent failure. Worker and queue `error` events go to a rate-limited
 * connection-error reporter.
 */
@Processor(QUEUE_EMAIL_SEND)
export class EmailSendProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(EmailSendProcessor.name);
  /**
   * Subject of the attempt that threw, keyed by the thrown error object —
   * BullMQ hands that same instance to the `failed` listener. A WeakMap, so an
   * entry dies with its error and nothing can accumulate.
   */
  private readonly failureSubjects = new WeakMap<object, string>();
  private readonly workerErrors: ConnectionErrorReporter;
  private readonly queueErrors: ConnectionErrorReporter;

  constructor(
    private readonly mail: MailService,
    private readonly cipher: MailSecretCipher,
    private readonly outcomes: MailJobOutcomeRecorder,
    alerts: OpsAlertService,
    @InjectQueue(QUEUE_EMAIL_SEND)
    private readonly queue: Queue<EmailSendJobData>,
  ) {
    super();
    this.workerErrors = new ConnectionErrorReporter(this.logger, `worker:${QUEUE_EMAIL_SEND}`, alerts);
    this.queueErrors = new ConnectionErrorReporter(this.logger, `queue:${QUEUE_EMAIL_SEND}`, alerts);
  }

  onModuleInit(): void {
    this.queue.on('error', (err: unknown) => this.queueErrors.report(err));
  }

  async process(job: Job<EmailSendJobData>): Promise<EmailSendJobResult> {
    const ctx: MailAttemptContext = {
      jobId: job.id ?? 'unknown',
      attempt: job.attemptsMade + 1,
      maxAttempts: job.opts.attempts ?? 1,
      subject: null,
      providerMessageId: null,
    };
    try {
      await mailAttemptStorage.run(ctx, () => this._dispatch(job.data));
    } catch (err) {
      if (ctx.subject !== null && typeof err === 'object' && err !== null) {
        this.failureSubjects.set(err, ctx.subject);
      }
      throw err;
    }
    return { subject: ctx.subject, providerMessageId: ctx.providerMessageId };
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job<EmailSendJobData>, result: unknown): Promise<void> {
    await this.outcomes.recordSuccess(job, toJobResult(result));
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<EmailSendJobData> | undefined, err: Error): Promise<void> {
    await this.outcomes.recordFailure(job, err, this.failureSubjects.get(err) ?? null);
  }

  @OnWorkerEvent('error')
  onWorkerError(err: Error): void {
    this.workerErrors.report(err);
  }

  private async _dispatch(data: EmailSendJobData): Promise<void> {
    switch (data.template) {
      case '2fa-code':
        return this.mail.send2faCode(data.email, this._openSecret(data.template, data.secret, 'code'));
      case 'password-reset':
        return this.mail.sendPasswordReset(
          data.email,
          this._openSecret(data.template, data.secret, 'code'),
          data.ttlMinutes,
        );
      case 'account-created':
        return this.mail.sendAccountCreated(data.email, {
          ...data.props,
          temporaryPassword: this._openSecret(data.template, data.secret, 'temporaryPassword'),
        });
      case 'account-password-reset':
        return this.mail.sendAccountPasswordReset(data.email, {
          ...data.props,
          temporaryPassword: this._openSecret(data.template, data.secret, 'temporaryPassword'),
        });
      case 'account-deactivated':
        return this.mail.sendAccountDeactivated(data.email, data.props);
      case 'account-reactivated':
        return this.mail.sendAccountReactivated(data.email, data.props);
      case 'weekly-report':
        return this.mail.sendWeeklyReport(data.email, data.props);
      case 'carrier-decision':
        return this.mail.sendCarrierDecision(data.email, data.props);
      case 'internal-decision':
        return this.mail.sendInternalDecision(data.email, data.props);
      case 'carrier-submitted':
        return this.mail.sendClaimSubmitted(data.email, data.props);
      case 'maksim-confirmation-request':
        return this.mail.sendMaksimConfirmationRequest(data.email, data.props, data.replyTo);
      case 'reklamacja-internal-submitted':
        return this.mail.sendReklamacjaInternalSubmitted(data.email, data.props);
      case 'reklamacja-carrier-submitted':
        return this.mail.sendReklamacjaCarrierSubmitted(data.email, data.props);
      case 'reklamacja-carrier-decision':
        return this.mail.sendReklamacjaCarrierDecision(data.email, data.props);
      case 'verification-digest':
        return this.mail.sendVerificationDigest(data.email, data.props);
      case 'delegation-announced':
        return this.mail.sendDelegationAnnounced(data.email, data.props);
      case 'delegation-ready':
        return this.mail.sendDelegationReady(data.email, data.props);
      case 'guarantee-reminder-carrier':
        return this.mail.sendGuaranteeReminderCarrier(data.email, data.props);
      case 'guarantee-opiekun-digest':
        return this.mail.sendGuaranteeOpiekunDigest(data.email, data.props);
      case 'vehicle-removal-admin':
        return this.mail.sendVehicleRemovalAdmin(data.email, data.props);
      case 'sso-access-requested':
        return this.mail.sendSsoAccessRequested(data.email, data.props);
      case 'directory-reconcile-report':
        return this.mail.sendDirectoryReconcileReport(data.email, data.props);
      default: {
        // Exhaustiveness guard — a new template variant must add a case above
        // (TS flags this assignment if `EmailSendJobData` gains a member). A
        // job we cannot render will never render: fail it without retries.
        const exhaustive: never = data;
        const template = (exhaustive as { template?: unknown }).template;
        throw new UnrecoverableError(`email-send: unknown template "${String(template)}"`);
      }
    }
  }

  /** Opens a sealed secret; a bad envelope fails the job without retries. */
  private _openSecret(template: string, sealed: unknown, field: string): string {
    try {
      return this.cipher.openField(template, sealed, field);
    } catch (err) {
      if (err instanceof MailSecretError) {
        throw new UnrecoverableError(err.message);
      }
      throw err;
    }
  }
}

function toJobResult(result: unknown): EmailSendJobResult {
  if (result && typeof result === 'object') {
    const r = result as Partial<Record<keyof EmailSendJobResult, unknown>>;
    return {
      subject: typeof r.subject === 'string' ? r.subject : null,
      providerMessageId:
        typeof r.providerMessageId === 'string' ? r.providerMessageId : null,
    };
  }
  return { subject: null, providerMessageId: null };
}
