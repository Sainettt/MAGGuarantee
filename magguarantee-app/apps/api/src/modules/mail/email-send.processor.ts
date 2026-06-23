import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import { QUEUE_EMAIL_SEND } from '../jobs/queue-names';
import { type EmailSendJobData } from './email-send.job';
import { MailService } from './mail.service';

/**
 * In-process worker for the `email-send` queue.
 *
 * Phase 9 stood up early — ONLY the 2FA login-code email is routed here. The
 * processor dispatches on `job.data.template` and calls the EXISTING
 * synchronous `MailService.send2faCode`, which already performs the SMTP send
 * AND records to `MailJobsRegistry` (so `GET /diagnostics/mails` is unaffected
 * by the sync→queue switch — the registry row is still written, just from the
 * worker instead of the request thread).
 *
 * Failures re-throw so BullMQ retries per the producer's attempt/backoff
 * policy (5 attempts, exponential from 5 s). The worker runs IN-PROCESS (this
 * Nest process hosts it), so in dev the code is still delivered to Mailhog.
 */
@Processor(QUEUE_EMAIL_SEND)
export class EmailSendProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailSendProcessor.name);

  constructor(private readonly mail: MailService) {
    super();
  }

  async process(job: Job<EmailSendJobData>): Promise<void> {
    const data = job.data;
    switch (data.template) {
      case '2fa-code':
        await this.mail.send2faCode(data.email, data.code);
        return;
      case 'password-reset':
        await this.mail.sendPasswordReset(data.email, data.code, data.ttlMinutes);
        return;
      case 'account-created':
        await this.mail.sendAccountCreated(data.email, data.props);
        return;
      case 'account-deactivated':
        await this.mail.sendAccountDeactivated(data.email, data.props);
        return;
      case 'account-reactivated':
        await this.mail.sendAccountReactivated(data.email, data.props);
        return;
      case 'carrier-decision':
        await this.mail.sendCarrierDecision(data.email, data.props);
        return;
      case 'internal-decision':
        await this.mail.sendInternalDecision(data.email, data.props);
        return;
      case 'carrier-submitted':
        await this.mail.sendClaimSubmitted(data.email, data.props);
        return;
      case 'authorization-request':
        await this.mail.sendAuthorizationRequest(data.email, data.props);
        return;
      case 'verification-digest':
        await this.mail.sendVerificationDigest(data.email, data.props);
        return;
      default: {
        // Exhaustiveness guard — a new template variant must add a case above
        // (TS flags this assignment if `EmailSendJobData` gains a member).
        const exhaustive: never = data;
        this.logger.warn({
          msg: 'email-send: unknown template, dropping job',
          template: (exhaustive as { template?: string }).template,
        });
        return;
      }
    }
  }
}
