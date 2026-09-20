import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { render } from '@react-email/render';
import type { JobsOptions, Queue } from 'bullmq';

import { describeError, maskEmail } from '../../common/ops-alert/redact';
import { JOB_REMOVE_ON_COMPLETE, JOB_REMOVE_ON_FAIL } from '../jobs/job-retention';
import { QUEUE_EMAIL_SEND } from '../jobs/queue-names';
import {
  EMAIL_SEND_JOB,
  type EmailSendJobData,
  type MailCompensation,
  type MailJobMeta,
  type SecretEmailJob,
} from './email-send.job';
import { mailAttemptStorage } from './mail-attempt-context';
import { MailJobsRegistry, type MailJobPayload } from './mail-jobs.registry';
import { MailSecretCipher } from './mail-secret-cipher';
import {
  MaksimConfirmationRequestEmail,
  type MaksimConfirmationRequestProps,
} from './templates/maksim-confirmation-request';
import {
  VerificationDigestEmail,
  workingDaysLabel,
  type VerificationDigestProps,
} from './templates/verification-digest';
import { PasswordResetEmail } from './templates/password-reset';
import { LoginCodeEmail } from './templates/login-code';
import {
  AccountCreatedEmail,
  type AccountCreatedProps,
} from './templates/account-created';
import {
  AccountDeactivatedEmail,
  type AccountDeactivatedProps,
} from './templates/account-deactivated';
import {
  AccountReactivatedEmail,
  type AccountReactivatedProps,
} from './templates/account-reactivated';
import {
  AccountPasswordResetEmail,
  type AccountPasswordResetProps,
} from './templates/account-password-reset';
import {
  WeeklyReportEmail,
  type WeeklyReportProps,
} from './templates/weekly-report';
import {
  CarrierDecisionEmail,
  type CarrierDecisionProps,
} from './templates/carrier-decision';
import {
  InternalDecisionEmail,
  type InternalDecisionProps,
} from './templates/internal-decision';
import {
  CarrierSubmittedEmail,
  type CarrierSubmittedProps,
} from './templates/carrier-submitted';
import {
  DelegationAnnouncedEmail,
  type DelegationAnnouncedProps,
} from './templates/delegation-announced';
import {
  DelegationReadyEmail,
  type DelegationReadyProps,
} from './templates/delegation-ready';
import {
  GuaranteeReminderCarrierEmail,
  type GuaranteeReminderCarrierProps,
} from './templates/guarantee-reminder-carrier';
import {
  GuaranteeOpiekunDigestEmail,
  type GuaranteeOpiekunDigestProps,
} from './templates/guarantee-opiekun-digest';
import {
  VehicleRemovalAdminEmail,
  type VehicleRemovalAdminProps,
} from './templates/vehicle-removal-admin';
import {
  SsoAccessRequestedEmail,
  type SsoAccessRequestedProps,
} from './templates/sso-access-requested';
import {
  DirectoryReconcileReportEmail,
  type DirectoryReconcileReportProps,
} from './templates/directory-reconcile-report';
import {
  ReklamacjaInternalSubmittedEmail,
  type ReklamacjaInternalSubmittedProps,
} from './templates/reklamacja-internal-submitted';
import {
  ReklamacjaCarrierSubmittedEmail,
  type ReklamacjaCarrierSubmittedProps,
} from './templates/reklamacja-carrier-submitted';
import {
  ReklamacjaCarrierDecisionEmail,
  type ReklamacjaCarrierDecisionProps,
} from './templates/reklamacja-carrier-decision';
import {
  MAIL_PROVIDER_TOKEN,
  type MailProvider,
} from './providers/mail-provider.interface';
import { MailThreadingService } from './mail-threading.service';

/** Default code validity surfaced in the reset email copy (mirrors Redis TTL). */
const PASSWORD_RESET_TTL_MINUTES = 10;

/**
 * Producer-side options of every `email-send` job. Retention per
 * `jobs/job-retention.ts` — failed jobs are no longer kept forever.
 */
export const EMAIL_SEND_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: JOB_REMOVE_ON_COMPLETE,
  removeOnFail: JOB_REMOVE_ON_FAIL,
};

/**
 * Optional delivery-log / compensation context for any `enqueueX` call. All
 * fields optional, so existing call sites are unaffected.
 */
export interface MailEnqueueOptions {
  /** Initiating user → `email_logs.triggeredById`. */
  triggeredById?: string | null;
  /** Overrides the target derived from the template props. */
  target?: { type: string; key: string };
  /** Undo action run if the mail fails permanently (see `MailCompensation`). */
  compensation?: MailCompensation;
}

/**
 * Outgoing-mail surface. Every transactional email has a synchronous `sendX`
 * (renders + ships via the env-selected provider) and an `enqueueX` that puts
 * it on the `email-send` queue (docs/16-jobs-and-integrations.md#email-очередь).
 *
 * The Maksim over-threshold confirmation-request email is the ONLY
 * authorization notification (`sendMaksimConfirmationRequest`).
 */
export interface IMailService {
  send2faCode(email: string, code: string): Promise<void>;
  /**
   * Phase 9 (early) — enqueue the 2FA login-code email onto the `email-send`
   * queue instead of sending it synchronously. The in-process
   * `EmailSendProcessor` calls `send2faCode` off the request path. Falls back
   * to a synchronous send when the queue is unavailable (e.g. unit tests that
   * construct MailService without the queue) so the code is never dropped.
   */
  enqueue2faCode(email: string, code: string): Promise<void>;
  /**
   * Forgot-password reset code. Sends synchronously to Mailhog/SMTP; the
   * `enqueuePasswordReset` variant routes through the `email-send` queue.
   */
  sendPasswordReset(
    email: string,
    code: string,
    ttlMinutes: number,
  ): Promise<void>;
  /**
   * Enqueue the forgot-password reset-code email onto the `email-send` queue.
   * Falls back to a synchronous send when the queue is unavailable (unit
   * tests / scripts) so the code is never dropped — same pattern as
   * `enqueue2faCode`.
   */
  enqueuePasswordReset(
    email: string,
    code: string,
    ttlMinutes: number,
  ): Promise<void>;
  /**
   * Maksim over-threshold confirmation-request email — the ONLY authorization
   * notification. Auto-fired once per verification cycle (amount-deduped) from
   * `ClaimsService.verifyClaim` when the dopłata exceeds the threshold.
   */
  sendMaksimConfirmationRequest(
    email: string,
    props: MaksimConfirmationRequestProps,
  ): Promise<void>;
  /**
   * Verification-SLA daily digest (docs/21 §5). One email per recipient
   * listing overdue + due-soon claims awaiting verification.
   */
  sendVerificationDigest(
    email: string,
    props: VerificationDigestProps,
  ): Promise<void>;
  /** Phase 4.5 — generic resend backing `POST /diagnostics/mails/:jobId/resend`. */
  resendBarePayload(payload: MailJobPayload): Promise<void>;
}

@Injectable()
export class MailService implements IMailService {
  private readonly logger = new Logger(MailService.name);

  // Everything after `provider` is optional so a bare construction (unit tests,
  // scripts) keeps working — production wiring passes them through DI. When
  // `mailJobs` is absent, send paths skip the registry write; when `emailQueue`
  // is absent, every `enqueueX` falls back to a synchronous send so the mail is
  // never dropped. Secret-bearing templates additionally require `cipher`: with
  // no cipher they ALSO send synchronously — a secret is never queued in clear.
  constructor(
    @Inject(MAIL_PROVIDER_TOKEN) private readonly provider: MailProvider,
    @Optional() private readonly mailJobs?: MailJobsRegistry,
    @Optional()
    @InjectQueue(QUEUE_EMAIL_SEND)
    private readonly emailQueue?: Queue<EmailSendJobData>,
    // Threading is a Gmail-only concern; absent in unit tests and a no-op
    // under SMTP/Mailhog (see MailThreadingService).
    @Optional() private readonly threading?: MailThreadingService,
    @Optional() private readonly cipher?: MailSecretCipher,
  ) {}

  /**
   * Enqueue the 2FA login-code email. The code travels sealed (AES-256-GCM,
   * `MailSecretCipher`); the in-process `EmailSendProcessor` opens it and calls
   * `send2faCode`. Without a queue/cipher: direct synchronous send.
   */
  async enqueue2faCode(
    email: string,
    code: string,
    opts?: MailEnqueueOptions,
  ): Promise<void> {
    await this._enqueueSecretOr(
      '2fa-code',
      { code },
      (secret) => ({ template: '2fa-code', email, secret }),
      () => this.send2faCode(email, code),
      opts,
    );
  }

  async send2faCode(email: string, code: string): Promise<void> {
    // The code is NEVER logged (docs/15-auth-strategy.md#чек-лист-безопасности)
    // — `_dispatch` logs only the masked destination.
    await this._dispatch({
      to: email,
      subject: 'Kod weryfikacyjny — MAGGuarantee',
      text: this.buildText(code),
      html: await render(LoginCodeEmail({ code })),
      template: '2fa-code',
      logMsg: '2fa code sent',
    });
  }

  /**
   * Enqueue the forgot-password reset-code email (code sealed, see
   * `enqueue2faCode`). The processor calls `sendPasswordReset`.
   */
  async enqueuePasswordReset(
    email: string,
    code: string,
    ttlMinutes: number = PASSWORD_RESET_TTL_MINUTES,
    opts?: MailEnqueueOptions,
  ): Promise<void> {
    await this._enqueueSecretOr(
      'password-reset',
      { code },
      (secret) => ({ template: 'password-reset', email, secret, ttlMinutes }),
      () => this.sendPasswordReset(email, code, ttlMinutes),
      opts,
    );
  }

  async sendPasswordReset(
    email: string,
    code: string,
    ttlMinutes: number = PASSWORD_RESET_TTL_MINUTES,
  ): Promise<void> {
    // Never log the code (docs/15-auth-strategy.md#чек-лист-безопасности).
    await this._dispatch({
      to: email,
      subject: 'Reset hasła — MAGGuarantee',
      text: this.buildPasswordResetText(code, ttlMinutes),
      html: await render(PasswordResetEmail({ code, ttlMinutes })),
      template: 'password-reset',
      logMsg: 'password reset code sent',
    });
  }

  /**
   * Maksim over-threshold confirmation-request email. Renders
   * the dedicated `MaksimConfirmationRequestEmail` template to HTML + a
   * plain-text fallback and ships both via the provider. Threads into the same
   * `wniosek-<nrZgl>` Gmail conversation as the other claim emails (no-op under
   * Mailhog).
   *
   * The ONLY template that carries a `Reply-To`. Every other email leaves it
   * unset and therefore replies to the unattended no-reply group, which bounces
   * them. Here Maksim's reply is load-bearing — a pracownik screenshots it and
   * uploads it as `AUTORYZACJA_MAKSIMA` to clear the gate — so `replyTo` points
   * at that pracownik's own mailbox (resolved by the caller from
   * `Claim.verifiedById`). When it cannot be resolved the header is omitted and
   * the reply bounces: a bounce Maksim can see beats a reply nobody reads.
   */
  async sendMaksimConfirmationRequest(
    email: string,
    props: MaksimConfirmationRequestProps,
    replyTo?: string | null,
  ): Promise<void> {
    const subject = `Potwierdzenie autoryzacji: ${props.nrZgl}`;
    const html = await render(MaksimConfirmationRequestEmail(props));
    const text = this.buildMaksimConfirmationRequestText(props);
    await this._send({
      to: email,
      subject,
      html,
      text,
      template: 'maksim-confirmation-request',
      data: { nrZgl: props.nrZgl },
      ...(replyTo ? { replyTo } : {}),
      threadKey: `wniosek-${props.nrZgl}`,
      logMsg: 'maksim confirmation request sent',
      logExtra: { nrZgl: props.nrZgl },
    });
  }

  enqueueMaksimConfirmationRequest(
    email: string,
    props: MaksimConfirmationRequestProps,
    replyTo?: string | null,
    opts?: MailEnqueueOptions,
  ): Promise<void> {
    return this._enqueueOr(
      {
        template: 'maksim-confirmation-request',
        email,
        props,
        ...(replyTo ? { replyTo } : {}),
      },
      () => this.sendMaksimConfirmationRequest(email, props, replyTo),
      opts,
    );
  }

  /**
   * Verification-SLA daily digest (docs/21 §5).
   *
   * Renders the React-Email digest to HTML + a plain-text fallback and ships
   * both via the provider. The caller (cron service) enqueues one per ACTIVE
   * pracownik recipient inside a `Promise.allSettled`, so a single bad address
   * never blocks the rest. The subject carries the total at-risk count for
   * inbox-scannability.
   */
  async sendVerificationDigest(
    email: string,
    props: VerificationDigestProps,
  ): Promise<void> {
    const counts = {
      overdueCount: props.overdue.length,
      dueSoonCount: props.dueSoon.length,
    };
    const total = counts.overdueCount + counts.dueSoonCount;
    await this._dispatch({
      to: email,
      subject: `Weryfikacja zgłoszeń — ${total} wymaga uwagi`,
      text: this.buildVerificationDigestText(props),
      html: await render(VerificationDigestEmail(props)),
      template: 'verification-digest',
      data: counts,
      logMsg: 'verification digest sent',
      logExtra: counts,
    });
  }

  /**
   * Plain-text fallback for the verification-SLA digest. Mirrors the HTML
   * structure: overdue group first, then due-soon, each row carrying the same
   * «po terminie» / «{n} dni robocze» label as the template.
   */
  private buildVerificationDigestText(props: VerificationDigestProps): string {
    const lines: string[] = [
      'MAGGuarantee — zgłoszenia do weryfikacji',
      '',
    ];
    if (props.overdue.length > 0) {
      lines.push(`Po terminie (${props.overdue.length}):`);
      for (const r of props.overdue) {
        lines.push(
          `  - ${r.nrZgl} — ${r.carrierName} · ${r.vehiclePlate} · ${workingDaysLabel(r.workingDaysLeft)}`,
        );
      }
      lines.push('');
    }
    if (props.dueSoon.length > 0) {
      lines.push(`Zbliża się termin (${props.dueSoon.length}):`);
      for (const r of props.dueSoon) {
        lines.push(
          `  - ${r.nrZgl} — ${r.carrierName} · ${r.vehiclePlate} · ${workingDaysLabel(r.workingDaysLeft)}`,
        );
      }
      lines.push('');
    }
    lines.push(`Otwórz panel weryfikacji: ${props.deeplink}`);
    return lines.join('\n');
  }

  // ── Phase 9 templated emails (account lifecycle + claim notifications) ──

  /**
   * Shared send path for the templated emails: `_dispatch` plus the plain-text
   * reply-policy footer. Appended from this single choke point rather than in
   * all ~20 text builders. Keyed on `replyTo` for the same reason the layout
   * keys its footer on `replyExpected`: a Reply-To IS the statement that
   * replies are wanted. (The 2FA / reset-code / SLA-digest mails predate the
   * footer and go through `_dispatch` directly, unchanged.)
   */
  private async _send(opts: DispatchArgs): Promise<void> {
    await this._dispatch({
      ...opts,
      text: `${opts.text}\n\n—\n${
        opts.replyTo
          ? 'Odpowiedz na tę wiadomość — odpowiedź trafi bezpośrednio do pracownika prowadzącego ten wniosek.'
          : 'Nie odpowiadaj na tę wiadomość — skrzynka nie jest obsługiwana. Wszystko załatwisz w systemie MAGGuarantee.'
      }`,
    });
  }

  /**
   * THE provider call. Threads when a `threadKey` is given (no-op under SMTP),
   * records to the diagnostics registry and re-throws on failure so the queue
   * (or the caller) can retry.
   *
   * Inside an `email-send` job (`mailAttemptStorage` has a store) — 2026-08-14
   * logging audit, item 23:
   *  - the registry keeps ONE row per job (`job-<jobId>`), updated per attempt
   *    with the real `attemptsMade`, instead of a new random row per attempt;
   *  - a failed attempt is NOT logged here: the processor's `failed` listener
   *    writes the single per-attempt line (with job id, attempt, final/retry),
   *    which also covers failures before this point (render, secret);
   *  - subject + provider message id are reported back for `email_logs`.
   * Outside a job (sync fallback) it logs the failure itself, as before.
   */
  private async _dispatch(opts: DispatchArgs): Promise<void> {
    const attempt = mailAttemptStorage.getStore();
    if (attempt) attempt.subject = opts.subject;
    const payload: MailJobPayload = {
      to: opts.to,
      subject: opts.subject,
      template: opts.template,
      ...(opts.data ? { data: opts.data } : {}),
    };
    const registryRef = attempt
      ? { id: `job-${attempt.jobId}`, attemptsMade: attempt.attempt }
      : {};
    try {
      const thread = opts.threadKey
        ? ((await this.threading?.resolve(opts.threadKey)) ?? {})
        : {};
      const result = await this.provider.send({
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
        ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
        ...(opts.threadKey
          ? {
              gmailThreadId: thread.gmailThreadId,
              inReplyToMessageId: thread.inReplyToMessageId,
            }
          : {}),
      });
      if (attempt) attempt.providerMessageId = result.messageId ?? null;
      if (opts.threadKey) await this.threading?.record(opts.threadKey, result);
      this.logger.log({
        msg: opts.logMsg,
        toMasked: maskEmail(opts.to),
        ...(attempt ? { jobId: attempt.jobId, attempt: attempt.attempt } : {}),
        ...(opts.logExtra ?? {}),
      });
      await this.mailJobs?.record({ ...registryRef, payload, state: 'completed' });
    } catch (err) {
      const { errorName, errorMessage } = describeError(err);
      if (!attempt) {
        this.logger.error({
          msg: `${opts.logMsg} failed`,
          template: opts.template,
          toMasked: maskEmail(opts.to),
          errorName,
          errorMessage,
        });
      }
      await this.mailJobs?.record({
        ...registryRef,
        payload,
        state: 'failed',
        failedReason: errorMessage,
      });
      throw err;
    }
  }

  /**
   * Pushes a job onto the `email-send` queue, falling back to a synchronous
   * send when the queue is unavailable (unit tests / scripts) so the email is
   * never dropped.
   */
  private async _enqueueOr(
    job: EmailSendJobData,
    fallback: () => Promise<void>,
    opts?: MailEnqueueOptions,
  ): Promise<void> {
    if (!this.emailQueue) {
      await fallback();
      return;
    }
    await this.emailQueue.add(
      EMAIL_SEND_JOB,
      withMeta(job, opts),
      EMAIL_SEND_JOB_OPTIONS,
    );
  }

  /**
   * `_enqueueOr` for templates that carry a secret. The secret is sealed into
   * the job; if either the queue or the cipher is missing the mail is sent
   * synchronously instead — the plaintext never reaches Redis.
   */
  private async _enqueueSecretOr<T extends SecretEmailJob>(
    template: T['template'],
    secret: Record<string, string>,
    build: (sealed: T['secret']) => T,
    fallback: () => Promise<void>,
    opts?: MailEnqueueOptions,
  ): Promise<void> {
    if (!this.emailQueue || !this.cipher) {
      await fallback();
      return;
    }
    const job = build(this.cipher.seal(template, secret));
    await this.emailQueue.add(
      EMAIL_SEND_JOB,
      withMeta(job, opts),
      EMAIL_SEND_JOB_OPTIONS,
    );
  }

  /**
   * Enqueues several jobs that share ONE producer stamp as an atomic batch
   * (`Queue.addBulk` is a single MULTI — all jobs land or none do). When
   * `opts.compensation` is given every job carries it with
   * `batch = { id, size }`, so the undo runs only if ALL of them fail
   * permanently. Returns the number of jobs enqueued (or mails sent, in the
   * sync fallback); throws when nothing could be dispatched.
   */
  private async _enqueueBatchOr(
    items: { job: EmailSendJobData; fallback: () => Promise<void> }[],
    opts?: MailEnqueueOptions,
  ): Promise<number> {
    if (items.length === 0) return 0;
    if (!this.emailQueue) return this._sendBatchSync(items);
    const batchOpts: MailEnqueueOptions | undefined = opts?.compensation
      ? {
          ...opts,
          compensation: {
            ...opts.compensation,
            batch: { id: randomUUID(), size: items.length },
          },
        }
      : opts;
    await this.emailQueue.addBulk(
      items.map(({ job }) => ({
        name: EMAIL_SEND_JOB,
        data: withMeta(job, batchOpts),
        opts: EMAIL_SEND_JOB_OPTIONS,
      })),
    );
    return items.length;
  }

  /** Sync fallback of `_enqueueBatchOr`: ≥1 delivered = success. */
  private async _sendBatchSync(
    items: { fallback: () => Promise<void> }[],
  ): Promise<number> {
    const results = await Promise.allSettled(items.map((i) => i.fallback()));
    const sent = results.filter((r) => r.status === 'fulfilled').length;
    if (sent === 0) {
      const first = results.find(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      throw first?.reason instanceof Error
        ? first.reason
        : new Error('mail batch: no message could be sent');
    }
    return sent;
  }

  // account-created ────────────────────────────────────────
  async sendAccountCreated(
    email: string,
    props: AccountCreatedProps,
  ): Promise<void> {
    await this._send({
      to: email,
      subject: 'Konto utworzone — MAGGuarantee',
      html: await render(AccountCreatedEmail(props)),
      text: [
        `Witaj ${props.name},`,
        '',
        'Administrator utworzył dla Ciebie konto w systemie MAGGuarantee.',
        `Login: ${props.loginName}`,
        `Hasło tymczasowe: ${props.temporaryPassword}`,
        '',
        'Przy pierwszym logowaniu system poprosi o ustawienie nowego hasła.',
        'Nie udostępniaj tego hasła nikomu.',
        '',
        `Zaloguj się: ${props.loginUrl}`,
      ].join('\n'),
      template: 'account-created',
      logMsg: 'account created email sent',
    });
  }

  /** The temporary password travels sealed (see `enqueue2faCode`). */
  enqueueAccountCreated(
    email: string,
    props: AccountCreatedProps,
    opts?: MailEnqueueOptions,
  ): Promise<void> {
    const { temporaryPassword, ...publicProps } = props;
    return this._enqueueSecretOr(
      'account-created',
      { temporaryPassword },
      (secret) => ({
        template: 'account-created',
        email,
        props: publicProps,
        secret,
      }),
      () => this.sendAccountCreated(email, props),
      opts,
    );
  }

  // account-deactivated ────────────────────────────────────
  async sendAccountDeactivated(
    email: string,
    props: AccountDeactivatedProps,
  ): Promise<void> {
    await this._send({
      to: email,
      subject: 'Konto dezaktywowane — MAGGuarantee',
      html: await render(AccountDeactivatedEmail(props)),
      text: [
        `Szanowny Użytkowniku ${props.name},`,
        '',
        'Informujemy, że Twoje konto w systemie MAGGuarantee zostało',
        'dezaktywowane. Dostęp do systemu został zablokowany.',
        `Login: ${props.loginName}`,
        '',
        'W sprawach formalnych prosimy o kontakt z administratorem.',
      ].join('\n'),
      template: 'account-deactivated',
      logMsg: 'account deactivated email sent',
    });
  }

  enqueueAccountDeactivated(
    email: string,
    props: AccountDeactivatedProps,
    opts?: MailEnqueueOptions,
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'account-deactivated', email, props },
      () => this.sendAccountDeactivated(email, props),
      opts,
    );
  }

  // account-reactivated ────────────────────────────────────
  async sendAccountReactivated(
    email: string,
    props: AccountReactivatedProps,
  ): Promise<void> {
    await this._send({
      to: email,
      subject: 'Konto reaktywowane — MAGGuarantee',
      html: await render(AccountReactivatedEmail(props)),
      text: [
        `Witaj ${props.name},`,
        '',
        'Twoje konto w systemie MAGGuarantee zostało ponownie aktywowane.',
        `Login: ${props.loginName}`,
        '',
        `Zaloguj się: ${props.loginUrl}`,
      ].join('\n'),
      template: 'account-reactivated',
      logMsg: 'account reactivated email sent',
    });
  }

  enqueueAccountReactivated(
    email: string,
    props: AccountReactivatedProps,
    opts?: MailEnqueueOptions,
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'account-reactivated', email, props },
      () => this.sendAccountReactivated(email, props),
      opts,
    );
  }

  // account-password-reset ─────────────────────────────────
  /**
   * Admin-issued password reset — ONE template for both audiences (internal
   * users and carriers), per the 2026-07-30 decision. Distinct from
   * `sendPasswordReset`, which carries the self-service 6-digit code.
   */
  async sendAccountPasswordReset(
    email: string,
    props: AccountPasswordResetProps,
  ): Promise<void> {
    await this._send({
      to: email,
      subject: 'Hasło zresetowane — MAGGuarantee',
      html: await render(AccountPasswordResetEmail(props)),
      text: [
        `Witaj ${props.name},`,
        '',
        'Administrator zresetował hasło do Twojego konta w systemie',
        'MAGGuarantee. Dotychczasowe hasło przestało działać.',
        `Login: ${props.loginName}`,
        `Hasło tymczasowe: ${props.temporaryPassword}`,
        '',
        'Przy pierwszym logowaniu system poprosi o ustawienie nowego hasła.',
        'Nie udostępniaj tego hasła nikomu.',
        '',
        `Zaloguj się: ${props.loginUrl}`,
      ].join('\n'),
      template: 'account-password-reset',
      logMsg: 'account password reset email sent',
    });
  }

  /** The temporary password travels sealed (see `enqueue2faCode`). */
  enqueueAccountPasswordReset(
    email: string,
    props: AccountPasswordResetProps,
    opts?: MailEnqueueOptions,
  ): Promise<void> {
    const { temporaryPassword, ...publicProps } = props;
    return this._enqueueSecretOr(
      'account-password-reset',
      { temporaryPassword },
      (secret) => ({
        template: 'account-password-reset',
        email,
        props: publicProps,
        secret,
      }),
      () => this.sendAccountPasswordReset(email, props),
      opts,
    );
  }

  // weekly-report ──────────────────────────────────────────
  /**
   * Monday summary for admins (GAS analog `sendWeeklyReport`). Fed by the
   * cron in `modules/weekly-report/`, which invokes this once per recipient
   * inside a `Promise.allSettled` — same dispatch shape as the verification
   * digest, so one bad mailbox never blocks the rest.
   */
  async sendWeeklyReport(
    email: string,
    props: WeeklyReportProps,
  ): Promise<void> {
    await this._send({
      to: email,
      subject: `Raport tygodniowy ${props.weekLabel} — ${props.payoutTotal}`,
      html: await render(WeeklyReportEmail(props)),
      text: [
        `Raport tygodniowy — ${props.weekLabel}`,
        '',
        `Suma dopłat (zaakceptowane w tym tygodniu): ${props.payoutTotal}`,
        '',
        'W tym tygodniu:',
        ...props.rows.map((r) => `  ${r.label}: ${r.value}`),
        '',
        'Stan bieżący:',
        ...props.backlogRows.map((r) => `  ${r.label}: ${r.value}`),
        '',
        `Panel: ${props.deeplink}`,
        '',
        'Wiadomość wewnętrzna — nie przesyłaj przewoźnikom.',
      ].join('\n'),
      template: 'weekly-report',
      logMsg: 'weekly report email sent',
      logExtra: { weekLabel: props.weekLabel },
    });
  }

  enqueueWeeklyReport(
    email: string,
    props: WeeklyReportProps,
    opts?: MailEnqueueOptions,
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'weekly-report', email, props },
      () => this.sendWeeklyReport(email, props),
      opts,
    );
  }

  // carrier-decision ───────────────────────────────────────
  async sendCarrierDecision(
    email: string,
    props: CarrierDecisionProps,
  ): Promise<void> {
    await this._send({
      to: email,
      subject: `Wniosek ${props.nrZgl}: ${props.decisionLabel}`,
      html: await render(CarrierDecisionEmail(props)),
      text: this.buildDecisionText({
        nrZgl: props.nrZgl,
        decisionLabel: props.decisionLabel,
        vehiclePlate: props.vehiclePlate,
        periodFrom: props.periodFrom,
        periodTo: props.periodTo,
        amount: props.amount,
        comment: props.comment,
        deeplink: props.deeplink,
      }),
      template: 'carrier-decision',
      threadKey: `wniosek-${props.nrZgl}`,
      logMsg: 'carrier decision email sent',
      logExtra: { nrZgl: props.nrZgl },
    });
  }

  enqueueCarrierDecision(
    email: string,
    props: CarrierDecisionProps,
    opts?: MailEnqueueOptions,
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'carrier-decision', email, props },
      () => this.sendCarrierDecision(email, props),
      opts,
    );
  }

  // internal-decision ──────────────────────────────────────
  async sendInternalDecision(
    email: string,
    props: InternalDecisionProps,
  ): Promise<void> {
    await this._send({
      to: email,
      subject: `Wniosek ${props.nrZgl}: ${props.decisionLabel}`,
      html: await render(InternalDecisionEmail(props)),
      text: this.buildDecisionText({
        nrZgl: props.nrZgl,
        decisionLabel: props.decisionLabel,
        carrierName: props.carrierName,
        vehiclePlate: props.vehiclePlate,
        periodFrom: props.periodFrom,
        periodTo: props.periodTo,
        amount: props.amount,
        comment: props.comment,
        deeplink: props.deeplink,
      }),
      template: 'internal-decision',
      threadKey: `wniosek-${props.nrZgl}`,
      logMsg: 'internal decision email sent',
      logExtra: { nrZgl: props.nrZgl },
    });
  }

  enqueueInternalDecision(
    email: string,
    props: InternalDecisionProps,
    opts?: MailEnqueueOptions,
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'internal-decision', email, props },
      () => this.sendInternalDecision(email, props),
      opts,
    );
  }

  // carrier-submitted ──────────────────────────────────────
  async sendClaimSubmitted(
    email: string,
    props: CarrierSubmittedProps,
  ): Promise<void> {
    await this._send({
      to: email,
      subject: `Nowy wniosek: ${props.nrZgl}`,
      html: await render(CarrierSubmittedEmail(props)),
      text: [
        `Nowy wniosek ${props.nrZgl} od ${props.carrierName}.`,
        '',
        `Ciągnik: ${props.vehiclePlate}`,
        `Okres: ${props.periodFrom} → ${props.periodTo}`,
        // `!= null`, NOT truthiness: a legitimately ZERO figure ("0 km
        // gwarantowanych" on a month whose guarantee is switched off, "0,00
        // EUR" dopłata) must still be printed — a silently missing line reads
        // as "the system didn't compute it" (feature «wyłączane limity», 2026-09-20).
        ...(props.drivenDays != null
          ? [`Dni przepracowane: ${props.drivenDays}`]
          : []),
        ...(props.kmGuaranteed != null
          ? [`Kilometry gwarantowane: ${props.kmGuaranteed} km`]
          : []),
        ...(props.kmDriven != null
          ? [`Kilometry przejechane: ${props.kmDriven} km`]
          : []),
        ...(props.kmShortfall != null
          ? [`Niedobór kilometrów: ${props.kmShortfall} km`]
          : []),
        ...(props.paymentEur != null
          ? [`Kwota wnioskowana: ${props.paymentEur} EUR`]
          : []),
        '',
        'Wniosek oczekuje na weryfikację.',
        ...(props.deeplink ? [`Otwórz: ${props.deeplink}`] : []),
      ].join('\n'),
      template: 'carrier-submitted',
      threadKey: `wniosek-${props.nrZgl}`,
      logMsg: 'claim submitted email sent',
      logExtra: { nrZgl: props.nrZgl },
    });
  }

  enqueueClaimSubmitted(
    email: string,
    props: CarrierSubmittedProps,
    opts?: MailEnqueueOptions,
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'carrier-submitted', email, props },
      () => this.sendClaimSubmitted(email, props),
      opts,
    );
  }

  // reklamacja-internal-submitted (staff heads-up) ─────────
  /**
   * A carrier filed a reklamacja → every active `admin` + `pracownik`.
   * Threads into the claim's `wniosek-<nrZgl>` Gmail conversation so the whole
   * history of one wniosek stays in a single thread (no-op under SMTP).
   */
  async sendReklamacjaInternalSubmitted(
    email: string,
    props: ReklamacjaInternalSubmittedProps,
  ): Promise<void> {
    await this._send({
      to: email,
      subject: `Reklamacja: ${props.nrZgl} — ${props.kwota} EUR`,
      html: await render(ReklamacjaInternalSubmittedEmail(props)),
      text: [
        `Reklamacja do wniosku ${props.nrZgl}.`,
        '',
        `Przewoźnik: ${props.carrierName}`,
        `Ciągnik: ${props.vehiclePlate}`,
        `Kwota wnioskowana: ${props.wnioskowana} EUR`,
        `Kwota wypłacona: ${props.wyplacona} EUR`,
        `Maksimum reklamacji: ${props.maksimum} EUR`,
        `Kwota reklamacji: ${props.kwota} EUR`,
        ...(props.tresc ? ['', 'Treść reklamacji:', props.tresc] : []),
        '',
        `Otwórz: ${props.deeplink}`,
      ].join('\n'),
      template: 'reklamacja-internal-submitted',
      data: { nrZgl: props.nrZgl },
      threadKey: `wniosek-${props.nrZgl}`,
      logMsg: 'reklamacja internal email sent',
      logExtra: { nrZgl: props.nrZgl },
    });
  }

  enqueueReklamacjaInternalSubmitted(
    email: string,
    props: ReklamacjaInternalSubmittedProps,
    opts?: MailEnqueueOptions,
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'reklamacja-internal-submitted', email, props },
      () => this.sendReklamacjaInternalSubmitted(email, props),
      opts,
    );
  }

  // reklamacja-carrier-submitted (carrier receipt) ──────────
  async sendReklamacjaCarrierSubmitted(
    email: string,
    props: ReklamacjaCarrierSubmittedProps,
  ): Promise<void> {
    await this._send({
      to: email,
      subject: `Reklamacja złożona: ${props.nrZgl}`,
      html: await render(ReklamacjaCarrierSubmittedEmail(props)),
      text: [
        `Potwierdzamy przyjęcie reklamacji do wniosku ${props.nrZgl}.`,
        '',
        `Kwota reklamacji: ${props.kwota} EUR`,
        ...(props.tresc ? ['', 'Treść reklamacji:', props.tresc] : []),
        '',
        'Otrzymasz od nas wiadomość z decyzją, gdy reklamacja zostanie rozpatrzona.',
        '',
        `Otwórz wniosek: ${props.deeplink}`,
      ].join('\n'),
      template: 'reklamacja-carrier-submitted',
      data: { nrZgl: props.nrZgl },
      threadKey: `wniosek-${props.nrZgl}`,
      logMsg: 'reklamacja carrier receipt email sent',
      logExtra: { nrZgl: props.nrZgl },
    });
  }

  enqueueReklamacjaCarrierSubmitted(
    email: string,
    props: ReklamacjaCarrierSubmittedProps,
    opts?: MailEnqueueOptions,
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'reklamacja-carrier-submitted', email, props },
      () => this.sendReklamacjaCarrierSubmitted(email, props),
      opts,
    );
  }

  // reklamacja-carrier-decision (UZNANA / ODRZUCONA) ────────
  /**
   * The reklamacja outcome. Subject + body branch on `props.resolution` — NEVER
   * on the claim status, which rolls back to the original wniosek verdict when a
   * reklamacja is decided (REWORK 2026-07-31).
   */
  async sendReklamacjaCarrierDecision(
    email: string,
    props: ReklamacjaCarrierDecisionProps,
  ): Promise<void> {
    const accepted = props.resolution === 'UZNANA';
    const label = accepted ? 'reklamacja uznana' : 'reklamacja odrzucona';
    await this._send({
      to: email,
      subject: `Wniosek ${props.nrZgl}: ${label}`,
      html: await render(ReklamacjaCarrierDecisionEmail(props)),
      text: [
        `Wniosek ${props.nrZgl}: ${label}.`,
        '',
        `Ciągnik: ${props.vehiclePlate}`,
        ...(accepted ? [`Kwota do wypłaty: ${props.kwota} EUR`] : []),
        ...(accepted && props.orderNumber
          ? [`Nr zlecenia: ${props.orderNumber}`]
          : []),
        ...(props.response
          ? ['', accepted ? 'Komentarz:' : 'Uzasadnienie:', props.response]
          : []),
        '',
        `Otwórz wniosek: ${props.deeplink}`,
      ].join('\n'),
      template: 'reklamacja-carrier-decision',
      data: { nrZgl: props.nrZgl, resolution: props.resolution },
      threadKey: `wniosek-${props.nrZgl}`,
      logMsg: 'reklamacja decision email sent',
      logExtra: { nrZgl: props.nrZgl, resolution: props.resolution },
    });
  }

  enqueueReklamacjaCarrierDecision(
    email: string,
    props: ReklamacjaCarrierDecisionProps,
    opts?: MailEnqueueOptions,
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'reklamacja-carrier-decision', email, props },
      () => this.sendReklamacjaCarrierDecision(email, props),
      opts,
    );
  }

  // verification-digest (enqueue variant of the existing sync method) ─────
  enqueueVerificationDigest(
    email: string,
    props: VerificationDigestProps,
    opts?: MailEnqueueOptions,
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'verification-digest', email, props },
      () => this.sendVerificationDigest(email, props),
      opts,
    );
  }

  // delegation-announced (new wyjazd) ─────────────────────
  async sendDelegationAnnounced(
    email: string,
    props: DelegationAnnouncedProps,
  ): Promise<void> {
    await this._send({
      to: email,
      subject: `Nowy wyjazd: ${props.plateNumber}`,
      html: await render(DelegationAnnouncedEmail(props)),
      text: [
        'Twój wyjazd został zarejestrowany w systemie MAGGuarantee.',
        '',
        `Ciągnik: ${props.plateNumber}`,
        `Kierowca: ${props.driverName}`,
        `Wyjazd: ${props.departure}`,
        `Planowany powrót: ${props.plannedReturn}`,
      ].join('\n'),
      template: 'delegation-announced',
      logMsg: 'delegation announced email sent',
    });
  }

  enqueueDelegationAnnounced(
    email: string,
    props: DelegationAnnouncedProps,
    opts?: MailEnqueueOptions,
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'delegation-announced', email, props },
      () => this.sendDelegationAnnounced(email, props),
      opts,
    );
  }

  // delegation-ready (eksport → gotowy) ────────────────────
  async sendDelegationReady(
    email: string,
    props: DelegationReadyProps,
  ): Promise<void> {
    await this._send({
      to: email,
      // The order number leads the subject: it is what the carrier searches
      // their inbox by when they call about a load.
      subject: `Zlecenie ${props.spedOrderNumber} — ciągnik ${props.plateNumber}`,
      html: await render(DelegationReadyEmail(props)),
      text: [
        `Witaj ${props.carrierName},`,
        '',
        `Znaleźliśmy ładunek dla ciągnika ${props.plateNumber} i wystawiliśmy`,
        'zlecenie w SpedTrans.',
        '',
        `Nr zlecenia ze spedu: ${props.spedOrderNumber}`,
        '',
        'W systemie wyjazd ma teraz status „Załadowany".',
        `Wyjazd: ${props.departure}`,
      ].join('\n'),
      template: 'delegation-ready',
      logMsg: 'delegation ready email sent',
    });
  }

  enqueueDelegationReady(
    email: string,
    props: DelegationReadyProps,
    opts?: MailEnqueueOptions,
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'delegation-ready', email, props },
      () => this.sendDelegationReady(email, props),
      opts,
    );
  }

  // guarantee-reminder-carrier (#17 — watchdog D-3/D-1) ────
  async sendGuaranteeReminderCarrier(
    email: string,
    props: GuaranteeReminderCarrierProps,
  ): Promise<void> {
    await this._send({
      to: email,
      subject: `Przypomnienie: zgłoś wyjazd — ${props.rows.length} ciągnik(ów)`,
      html: await render(GuaranteeReminderCarrierEmail(props)),
      text: [
        `Witaj ${props.carrierName},`,
        '',
        'Przypominamy o obowiązku zgłoszenia wyjazdu w ciągu ' +
          `${props.deadlineWorkingDays} dni roboczych od ostatniego zjazdu.`,
        'Ciągniki zbliżające się do terminu:',
        '',
        ...props.rows.map(
          (r) =>
            `  - ${r.plateNumber} — ${r.anchorLabel}` +
            `${r.anchorSource === 'agreement' ? ' (objęcie gwarancją)' : ' (zjazd)'}` +
            ` → termin ${r.deadlineLabel} · pozostało ${r.daysLeft} dni roboczych`,
        ),
        '',
        `Zgłoś wyjazd: ${props.deeplink}`,
      ].join('\n'),
      template: 'guarantee-reminder-carrier',
      logMsg: 'guarantee reminder (carrier) email sent',
      logExtra: { vehicles: props.rows.length },
    });
  }

  enqueueGuaranteeReminderCarrier(
    email: string,
    props: GuaranteeReminderCarrierProps,
    opts?: MailEnqueueOptions,
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'guarantee-reminder-carrier', email, props },
      () => this.sendGuaranteeReminderCarrier(email, props),
      opts,
    );
  }

  // guarantee-opiekun-digest (#18 — watchdog opiekun digest) ─
  async sendGuaranteeOpiekunDigest(
    email: string,
    props: GuaranteeOpiekunDigestProps,
  ): Promise<void> {
    const fmtGroup = (
      g: { carrierName: string; rows: GuaranteeOpiekunDigestProps['dueSoon'][number]['rows'] },
    ): string[] => [
      `  ${g.carrierName}:`,
      ...g.rows.map(
        (r) =>
          `    - ${r.plateNumber} — ${r.anchorLabel} → termin ${r.deadlineLabel}` +
          ` (${r.daysLeft < 0 ? 'po terminie' : `${r.daysLeft} dni roboczych`})`,
      ),
    ];
    await this._send({
      to: email,
      subject: `Gwarancje: przypomnienia i naruszenia — ${props.dateLabel}`,
      html: await render(GuaranteeOpiekunDigestEmail(props)),
      text: [
        `Witaj ${props.opiekunName},`,
        '',
        `Podsumowanie na dzień ${props.dateLabel}.`,
        '',
        'Zbliżające się terminy:',
        ...(props.dueSoon.length > 0
          ? props.dueSoon.flatMap(fmtGroup)
          : ['  Brak.']),
        '',
        'Naruszenia (zarejestrowane dziś):',
        ...(props.violations.length > 0
          ? props.violations.flatMap(fmtGroup)
          : ['  Brak.']),
      ].join('\n'),
      template: 'guarantee-opiekun-digest',
      logMsg: 'guarantee opiekun digest email sent',
      logExtra: {
        dueSoonCarriers: props.dueSoon.length,
        violationCarriers: props.violations.length,
      },
    });
  }

  enqueueGuaranteeOpiekunDigest(
    email: string,
    props: GuaranteeOpiekunDigestProps,
    opts?: MailEnqueueOptions,
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'guarantee-opiekun-digest', email, props },
      () => this.sendGuaranteeOpiekunDigest(email, props),
      opts,
    );
  }

  // vehicle-removal-admin (29-day «do usunięcia» digest) ────
  async sendVehicleRemovalAdmin(
    email: string,
    props: VehicleRemovalAdminProps,
  ): Promise<void> {
    await this._send({
      to: email,
      subject: `Pojazdy do usunięcia — ${props.rows.length}`,
      html: await render(VehicleRemovalAdminEmail(props)),
      text: [
        `Witaj ${props.adminName},`,
        '',
        `Pojazdy nieaktywne co najmniej ${props.thresholdDays} dni ` +
          `(status „do usunięcia”) na dzień ${props.dateLabel}:`,
        '',
        ...props.rows.map(
          (r) =>
            `  - ${r.plateNumber}${r.sideNumber ? ` (${r.sideNumber})` : ''}` +
            ` — ${r.carrierName} · od ${r.anchorLabel}` +
            ` · ${r.daysSinceReturn} dni bez wyjazdu`,
        ),
      ].join('\n'),
      template: 'vehicle-removal-admin',
      logMsg: 'vehicle removal admin digest email sent',
      logExtra: { vehicles: props.rows.length },
    });
  }

  enqueueVehicleRemovalAdmin(
    email: string,
    props: VehicleRemovalAdminProps,
    opts?: MailEnqueueOptions,
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'vehicle-removal-admin', email, props },
      () => this.sendVehicleRemovalAdmin(email, props),
      opts,
    );
  }

  /**
   * The whole admin fan-out of one vehicle-removal run as ONE atomic batch
   * (`_enqueueBatchOr`). The cron's per-vehicle stamp means "at least one admin
   * got the digest", so `opts.compensation` is released only when every admin
   * copy has failed permanently. Returns how many digests were dispatched.
   */
  enqueueVehicleRemovalAdminBatch(
    recipients: { email: string; props: VehicleRemovalAdminProps }[],
    opts?: MailEnqueueOptions,
  ): Promise<number> {
    return this._enqueueBatchOr(
      recipients.map(({ email, props }) => ({
        job: { template: 'vehicle-removal-admin', email, props },
        fallback: () => this.sendVehicleRemovalAdmin(email, props),
      })),
      opts,
    );
  }

  // sso-access-requested (employee signed in, has no role yet) ────
  async sendSsoAccessRequested(
    email: string,
    props: SsoAccessRequestedProps,
  ): Promise<void> {
    const stanowisko = props.stanowiskoName
      ? `${props.stanowiskoName}${props.stanowiskoCode ? ` (${props.stanowiskoCode})` : ''}`
      : 'brak stanowiska w MAGSpace';
    await this._send({
      to: email,
      subject: `Pracownik czeka na rolę — ${props.employeeName}`,
      html: await render(SsoAccessRequestedEmail(props)),
      text: [
        `Witaj ${props.adminName},`,
        '',
        `${props.employeeName} (${props.employeeEmail}) próbował(a) zalogować się`,
        `przez Google ${props.attemptedAtLabel}. Stanowisko: ${stanowisko}.`,
        '',
        'To stanowisko nie ma przypisanej roli w MAGGuarantee, więc logowanie',
        'zostało odrzucone. Nadaj dostęp na ekranie „Logowanie Google”',
        '(przycisk „Nadaj dostęp” przy tej osobie):',
        props.ssoUrl,
      ].join('\n'),
      template: 'sso-access-requested',
      logMsg: 'sso access requested email sent',
      // The address is a person's identifier — the stanowisko is enough context.
      logExtra: { stanowiskoCode: props.stanowiskoCode },
    });
  }

  enqueueSsoAccessRequested(
    email: string,
    props: SsoAccessRequestedProps,
    opts?: MailEnqueueOptions,
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'sso-access-requested', email, props },
      () => this.sendSsoAccessRequested(email, props),
      opts,
    );
  }

  // directory-reconcile-report (MAGSpace sync outcome) ────
  async sendDirectoryReconcileReport(
    email: string,
    props: DirectoryReconcileReportProps,
  ): Promise<void> {
    const subject = props.aborted
      ? 'Synchronizacja z MAGSpace przerwana'
      : props.mode === 'report'
        ? 'Synchronizacja z MAGSpace — podgląd zmian'
        : 'Synchronizacja z MAGSpace — raport';
    await this._send({
      to: email,
      subject,
      html: await render(DirectoryReconcileReportEmail(props)),
      text: [
        `Witaj ${props.adminName},`,
        '',
        props.aborted
          ? `Przebieg z ${props.runAtLabel} PRZERWANY — chciał wyłączyć ` +
            `${props.abortDetail?.wouldDisable ?? 0} z ` +
            `${props.abortDetail?.managedTotal ?? 0} kont. Żadnych zmian nie wprowadzono.`
          : `Przebieg z ${props.runAtLabel} (${props.mode}).`,
        '',
        ...(props.deprovisioned.length > 0
          ? [
              `Wyłączone konta (${props.deprovisioned.length}):`,
              ...props.deprovisioned.map(
                (r) => `  - ${r.name ?? r.login} (${r.login}) — ${r.reasonLabel}`,
              ),
              '',
            ]
          : []),
        ...(props.roleChanges.length > 0
          ? [
              `Zmiany ról (${props.roleChanges.length}):`,
              ...props.roleChanges.map(
                (r) => `  - ${r.name ?? r.login} (${r.login}): ${r.fromRole} -> ${r.toRole}`,
              ),
              '',
            ]
          : []),
        ...(props.localNotices.length > 0
          ? [
              `Konta lokalne wymagające uwagi (${props.localNotices.length}):`,
              ...props.localNotices.map(
                (r) => `  - ${r.name ?? r.login} (${r.login}) — rola ${r.role}`,
              ),
            ]
          : []),
      ].join('\n'),
      template: 'directory-reconcile-report',
      logMsg: 'directory reconcile report email sent',
      logExtra: {
        mode: props.mode,
        aborted: props.aborted,
        deprovisioned: props.deprovisioned.length,
        roleChanges: props.roleChanges.length,
      },
    });
  }

  enqueueDirectoryReconcileReport(
    email: string,
    props: DirectoryReconcileReportProps,
    opts?: MailEnqueueOptions,
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'directory-reconcile-report', email, props },
      () => this.sendDirectoryReconcileReport(email, props),
      opts,
    );
  }

  /** Plain-text fallback shared by carrier-decision and internal-decision. */
  private buildDecisionText(p: {
    nrZgl: string;
    decisionLabel: string;
    carrierName?: string;
    vehiclePlate: string;
    periodFrom: string;
    periodTo: string;
    amount?: string;
    comment?: string;
    deeplink: string;
  }): string {
    const lines = [
      `Wniosek ${p.nrZgl}: ${p.decisionLabel}`,
      '',
      ...(p.carrierName ? [`Przewoźnik: ${p.carrierName}`] : []),
      `Ciągnik: ${p.vehiclePlate}`,
      `Okres: ${p.periodFrom} → ${p.periodTo}`,
      // `!= null`: a pre-formatted `'0.00'` is a real amount, not "absent".
      ...(p.amount != null ? [`Kwota: ${p.amount} EUR`] : []),
    ];
    if (p.comment) lines.push('', `Komentarz: ${p.comment}`);
    lines.push('', `Otwórz: ${p.deeplink}`);
    return lines.join('\n');
  }

  /**
   * Phase 4.5 — generic resend used by `POST /diagnostics/mails/:jobId/resend`.
   *
   * Dispatches a bare `{to, subject, text}` envelope through the SMTP
   * provider. The text body is intentionally minimal because the original
   * template-data was redacted at persist time — the admin re-sending a
   * failed job is concerned with delivery, not content fidelity. Once a
   * future Phase persists template data securely (encrypted), this method
   * can resolve the original template+data and re-render the rich body.
   *
   * Records a fresh `{state: 'completed' | 'failed'}` row in the registry
   * so the resend itself is visible in the diagnostics list. Errors bubble
   * up so the controller can surface a 500.
   */
  async resendBarePayload(payload: MailJobPayload): Promise<void> {
    const text = [
      `Ponowne wysłanie wiadomości z systemu MAGGuarantee.`,
      ``,
      `Temat oryginalny: ${payload.subject}`,
      ``,
      `Ta wiadomość została wysłana ponownie przez administratora po`,
      `nieudanej próbie. Jeśli oryginalna wiadomość już dotarła, prosimy`,
      `o zignorowanie tej kopii.`,
    ].join('\n');
    try {
      await this.provider.send({
        to: payload.to,
        subject: payload.subject,
        text,
      });
      await this.mailJobs?.record({ payload, state: 'completed' });
    } catch (err) {
      await this.mailJobs?.record({
        payload,
        state: 'failed',
        failedReason: describeError(err).errorMessage,
      });
      throw err;
    }
  }

  /**
   * Plain-text fallback for the Maksim confirmation-request email. Mirrors the
   * HTML template rows so non-HTML clients see the same data.
   */
  private buildMaksimConfirmationRequestText(
    props: MaksimConfirmationRequestProps,
  ): string {
    const planFakt = (
      plan: string | null,
      fakt: string | null,
    ): string => {
      if (plan && fakt) return `${plan} → ${fakt}`;
      if (plan) return plan;
      if (fakt) return fakt;
      return '—';
    };
    const lines = [
      `MAGGuarantee — potwierdzenie autoryzacji dopłaty`,
      ``,
      `Nr zgłoszenia: ${props.nrZgl}`,
      `Przewoźnik:    ${props.carrierName}`,
      `Ciągnik:       ${props.vehiclePlate}`,
      `Dopłata:       ${props.doplata} EUR`,
      `Próg autoryz.: ${props.prog} EUR`,
      `Dni w trasie:  ${props.dniWTrasie}`,
      `Okno godzin:   ${props.godzinyFrom} – ${props.godzinyTo}`,
      `Odjazd:        ${planFakt(props.odjazdPlan, props.odjazdFakt)}`,
      `Zjazd:         ${planFakt(props.zjazdPlan, props.zjazdFakt)}`,
    ];
    if (props.korekty && props.korekty.length > 0) {
      lines.push(
        '',
        'Korekty weryfikatora:',
        'Weryfikator poprawił dane wprowadzone przez przewoźnika:',
      );
      for (const k of props.korekty) {
        lines.push(`  ${k.label}: ${k.from} → ${k.to}`);
      }
    }
    lines.push('', `Otwórz w MAGGuarantee: ${props.deeplink}`);
    return lines.join('\n');
  }

  private buildPasswordResetText(code: string, ttlMinutes: number): string {
    return [
      'MAGGuarantee — reset hasła',
      '',
      `Twój kod resetu hasła: ${code}`,
      '',
      `Kod ważny przez ${ttlMinutes} minut.`,
      'Jeśli to nie Ty prosiłeś o reset hasła, zignoruj tę wiadomość.',
    ].join('\n');
  }

  private buildText(code: string): string {
    return [
      'MAGGuarantee — kod weryfikacyjny',
      '',
      `Twój jednorazowy kod logowania: ${code}`,
      '',
      'Kod ważny przez 10 minut.',
      'Jeśli to nie Ty próbujesz się zalogować, zignoruj tę wiadomość.',
    ].join('\n');
  }
}

/** Arguments of the single provider-call path (`_dispatch` / `_send`). */
interface DispatchArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
  template: string;
  data?: Record<string, unknown>;
  /** See `SendMailArgs.replyTo` — set by `maksim-confirmation-request` only. */
  replyTo?: string | null;
  threadKey?: string;
  logMsg: string;
  logExtra?: Record<string, unknown>;
}

/** Attaches the delivery-log / compensation meta to a job payload. */
function withMeta<T extends EmailSendJobData>(
  job: T,
  opts: MailEnqueueOptions | undefined,
): T {
  if (!opts) return job;
  const meta: MailJobMeta = {
    ...(opts.triggeredById ? { triggeredById: opts.triggeredById } : {}),
    ...(opts.target
      ? { targetType: opts.target.type, targetKey: opts.target.key }
      : {}),
    ...(opts.compensation ? { compensation: opts.compensation } : {}),
  };
  return Object.keys(meta).length > 0 ? { ...job, meta } : job;
}
