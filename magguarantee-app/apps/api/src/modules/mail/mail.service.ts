import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { render } from '@react-email/render';
import type { Queue } from 'bullmq';

import { QUEUE_EMAIL_SEND } from '../jobs/queue-names';
import {
  EMAIL_SEND_JOB,
  type EmailSendJobData,
} from './email-send.job';
import { MailJobsRegistry, type MailJobPayload } from './mail-jobs.registry';
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
 * Phase 1 outgoing-mail surface. Only `send2faCode` is implemented now;
 * `sendAccountCreated`, `sendPasswordReset`, etc. are added as follow-up
 * phases need them (per docs/16-jobs-and-integrations.md#email-шаблоны).
 *
 * The Maksim over-threshold confirmation-request email is the ONLY
 * authorization notification (`sendMaksimConfirmationRequest`).
 *
 * Phase 9 swap: replace `SmtpProvider` with `GmailApiProvider` and inject the
 * latter from MailModule. The MailService itself does not change.
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

  // `mailJobs` and `emailQueue` are optional so the existing 1-arg constructor
  // in unit tests (and any future seed scripts) keeps compiling — production
  // wiring passes them through DI. When `mailJobs` is null, send paths skip the
  // registry write; when `emailQueue` is null, `enqueue2faCode` falls back to a
  // synchronous send so the code is never dropped.
  constructor(
    @Inject(MAIL_PROVIDER_TOKEN) private readonly provider: MailProvider,
    @Optional() private readonly mailJobs?: MailJobsRegistry,
    @Optional()
    @InjectQueue(QUEUE_EMAIL_SEND)
    private readonly emailQueue?: Queue<EmailSendJobData>,
    // Threading is a Gmail-only concern; absent in unit tests and a no-op
    // under SMTP/Mailhog (see MailThreadingService).
    @Optional() private readonly threading?: MailThreadingService,
  ) {}

  /**
   * Phase 9 (early) — enqueue the 2FA login-code email. The in-process
   * `EmailSendProcessor` dequeues and calls `send2faCode` (the SMTP path +
   * `MailJobsRegistry` record, unchanged). If the queue is not wired (unit
   * tests / scripts), fall back to a direct synchronous send.
   */
  async enqueue2faCode(email: string, code: string): Promise<void> {
    if (!this.emailQueue) {
      await this.send2faCode(email, code);
      return;
    }
    await this.emailQueue.add(
      EMAIL_SEND_JOB,
      { template: '2fa-code', email, code },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 3600 * 24 * 7 },
        removeOnFail: false,
      },
    );
  }

  async send2faCode(email: string, code: string): Promise<void> {
    const subject = 'Kod weryfikacyjny — MAGGuarantee';
    const text = this.buildText(code);
    const html = await render(LoginCodeEmail({ code }));
    const payload: MailJobPayload = {
      to: email,
      subject,
      template: '2fa-code',
    };

    try {
      await this.provider.send({ to: email, subject, text, html });
      // We deliberately do NOT log the code (per
      // docs/15-auth-strategy.md#чек-лист-безопасности — secrets must not be
      // logged). We log only the destination + a stable correlation cue.
      this.logger.log({
        msg: '2fa code sent',
        toMasked: this.maskEmail(email),
      });
      await this.mailJobs?.record({ payload, state: 'completed' });
    } catch (err) {
      this.logger.error({
        msg: '2fa code send failed',
        toMasked: this.maskEmail(email),
        error: err instanceof Error ? err.message : String(err),
      });
      await this.mailJobs?.record({
        payload,
        state: 'failed',
        failedReason: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /**
   * Enqueue the forgot-password reset-code email. The in-process
   * `EmailSendProcessor` dequeues and calls `sendPasswordReset`. Falls back to
   * a direct synchronous send when the queue is not wired (unit tests).
   */
  async enqueuePasswordReset(
    email: string,
    code: string,
    ttlMinutes: number = PASSWORD_RESET_TTL_MINUTES,
  ): Promise<void> {
    if (!this.emailQueue) {
      await this.sendPasswordReset(email, code, ttlMinutes);
      return;
    }
    await this.emailQueue.add(
      EMAIL_SEND_JOB,
      { template: 'password-reset', email, code, ttlMinutes },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 3600 * 24 * 7 },
        removeOnFail: false,
      },
    );
  }

  async sendPasswordReset(
    email: string,
    code: string,
    ttlMinutes: number = PASSWORD_RESET_TTL_MINUTES,
  ): Promise<void> {
    const subject = 'Reset hasła — MAGGuarantee';
    const html = await render(PasswordResetEmail({ code, ttlMinutes }));
    const text = this.buildPasswordResetText(code, ttlMinutes);
    const payload: MailJobPayload = {
      to: email,
      subject,
      template: 'password-reset',
    };

    try {
      await this.provider.send({ to: email, subject, text, html });
      // Never log the code (docs/15-auth-strategy.md#чек-лист-безопасности).
      this.logger.log({
        msg: 'password reset code sent',
        toMasked: this.maskEmail(email),
      });
      await this.mailJobs?.record({ payload, state: 'completed' });
    } catch (err) {
      this.logger.error({
        msg: 'password reset code send failed',
        toMasked: this.maskEmail(email),
        error: err instanceof Error ? err.message : String(err),
      });
      await this.mailJobs?.record({
        payload,
        state: 'failed',
        failedReason: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
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
  ): Promise<void> {
    return this._enqueueOr(
      {
        template: 'maksim-confirmation-request',
        email,
        props,
        ...(replyTo ? { replyTo } : {}),
      },
      () => this.sendMaksimConfirmationRequest(email, props, replyTo),
    );
  }

  /**
   * Verification-SLA daily digest (docs/21 §5).
   *
   * Renders the React-Email digest to HTML + a plain-text fallback and ships
   * both via the SMTP provider. The caller (cron service) invokes this once
   * per ACTIVE pracownik recipient inside a `Promise.allSettled`, so a single
   * bad address never blocks the rest — each send `record()`s its own
   * `completed` / `failed` row in the mail registry. The subject carries the
   * total at-risk count for inbox-scannability.
   */
  async sendVerificationDigest(
    email: string,
    props: VerificationDigestProps,
  ): Promise<void> {
    const total = props.overdue.length + props.dueSoon.length;
    const subject = `Weryfikacja zgłoszeń — ${total} wymaga uwagi`;
    const html = await render(VerificationDigestEmail(props));
    const text = this.buildVerificationDigestText(props);
    const payload: MailJobPayload = {
      to: email,
      subject,
      template: 'verification-digest',
      data: {
        overdueCount: props.overdue.length,
        dueSoonCount: props.dueSoon.length,
      },
    };

    try {
      await this.provider.send({ to: email, subject, text, html });
      this.logger.log({
        msg: 'verification digest sent',
        toMasked: this.maskEmail(email),
        overdueCount: props.overdue.length,
        dueSoonCount: props.dueSoon.length,
      });
      await this.mailJobs?.record({ payload, state: 'completed' });
    } catch (err) {
      this.logger.error({
        msg: 'verification digest send failed',
        toMasked: this.maskEmail(email),
        error: err instanceof Error ? err.message : String(err),
      });
      await this.mailJobs?.record({
        payload,
        state: 'failed',
        failedReason: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
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
   * Shared send path: renders nothing (callers pass html/text), threads when a
   * `threadKey` is given (no-op under SMTP), records to the diagnostics
   * registry, and re-throws on failure so the queue (or caller) can retry.
   */
  private async _send(opts: {
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
  }): Promise<void> {
    const payload: MailJobPayload = {
      to: opts.to,
      subject: opts.subject,
      template: opts.template,
      ...(opts.data ? { data: opts.data } : {}),
    };
    try {
      const thread = opts.threadKey
        ? ((await this.threading?.resolve(opts.threadKey)) ?? {})
        : {};
      const result = await this.provider.send({
        to: opts.to,
        subject: opts.subject,
        // Plain-text mirror of the HTML footer's reply policy, appended from
        // this single choke point rather than in all ~20 text builders. Keyed
        // on `replyTo` for the same reason the layout keys its footer on
        // `replyExpected`: a Reply-To IS the statement that replies are wanted.
        text: `${opts.text}\n\n—\n${
          opts.replyTo
            ? 'Odpowiedz na tę wiadomość — odpowiedź trafi bezpośrednio do pracownika prowadzącego ten wniosek.'
            : 'Nie odpowiadaj na tę wiadomość — skrzynka nie jest obsługiwana. Wszystko załatwisz w systemie MAGGuarantee.'
        }`,
        html: opts.html,
        ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
        gmailThreadId: thread.gmailThreadId,
        inReplyToMessageId: thread.inReplyToMessageId,
      });
      if (opts.threadKey) await this.threading?.record(opts.threadKey, result);
      this.logger.log({
        msg: opts.logMsg,
        toMasked: this.maskEmail(opts.to),
        ...(opts.logExtra ?? {}),
      });
      await this.mailJobs?.record({ payload, state: 'completed' });
    } catch (err) {
      this.logger.error({
        msg: `${opts.logMsg} failed`,
        toMasked: this.maskEmail(opts.to),
        error: err instanceof Error ? err.message : String(err),
      });
      await this.mailJobs?.record({
        payload,
        state: 'failed',
        failedReason: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /**
   * Enqueue helper mirroring `enqueue2faCode`: pushes onto the `email-send`
   * queue, falling back to a synchronous send when the queue is unavailable
   * (unit tests / scripts) so the email is never dropped.
   */
  private async _enqueueOr(
    job: EmailSendJobData,
    fallback: () => Promise<void>,
  ): Promise<void> {
    if (!this.emailQueue) {
      await fallback();
      return;
    }
    await this.emailQueue.add(EMAIL_SEND_JOB, job, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 3600 * 24 * 7 },
      removeOnFail: false,
    });
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

  enqueueAccountCreated(
    email: string,
    props: AccountCreatedProps,
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'account-created', email, props },
      () => this.sendAccountCreated(email, props),
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
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'account-deactivated', email, props },
      () => this.sendAccountDeactivated(email, props),
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
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'account-reactivated', email, props },
      () => this.sendAccountReactivated(email, props),
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

  enqueueAccountPasswordReset(
    email: string,
    props: AccountPasswordResetProps,
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'account-password-reset', email, props },
      () => this.sendAccountPasswordReset(email, props),
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
  ): Promise<void> {
    return this._enqueueOr({ template: 'weekly-report', email, props }, () =>
      this.sendWeeklyReport(email, props),
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
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'carrier-decision', email, props },
      () => this.sendCarrierDecision(email, props),
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
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'internal-decision', email, props },
      () => this.sendInternalDecision(email, props),
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
        ...(props.drivenDays
          ? [`Dni przepracowane: ${props.drivenDays}`]
          : []),
        ...(props.kmGuaranteed
          ? [`Kilometry gwarantowane: ${props.kmGuaranteed} km`]
          : []),
        ...(props.kmDriven
          ? [`Kilometry przejechane: ${props.kmDriven} km`]
          : []),
        ...(props.kmShortfall
          ? [`Niedobór kilometrów: ${props.kmShortfall} km`]
          : []),
        ...(props.paymentEur
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
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'carrier-submitted', email, props },
      () => this.sendClaimSubmitted(email, props),
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
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'reklamacja-internal-submitted', email, props },
      () => this.sendReklamacjaInternalSubmitted(email, props),
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
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'reklamacja-carrier-submitted', email, props },
      () => this.sendReklamacjaCarrierSubmitted(email, props),
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
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'reklamacja-carrier-decision', email, props },
      () => this.sendReklamacjaCarrierDecision(email, props),
    );
  }

  // verification-digest (enqueue variant of the existing sync method) ─────
  enqueueVerificationDigest(
    email: string,
    props: VerificationDigestProps,
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'verification-digest', email, props },
      () => this.sendVerificationDigest(email, props),
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
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'delegation-announced', email, props },
      () => this.sendDelegationAnnounced(email, props),
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
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'delegation-ready', email, props },
      () => this.sendDelegationReady(email, props),
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
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'guarantee-reminder-carrier', email, props },
      () => this.sendGuaranteeReminderCarrier(email, props),
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
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'guarantee-opiekun-digest', email, props },
      () => this.sendGuaranteeOpiekunDigest(email, props),
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
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'vehicle-removal-admin', email, props },
      () => this.sendVehicleRemovalAdmin(email, props),
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
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'sso-access-requested', email, props },
      () => this.sendSsoAccessRequested(email, props),
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
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'directory-reconcile-report', email, props },
      () => this.sendDirectoryReconcileReport(email, props),
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
      ...(p.amount ? [`Kwota: ${p.amount} EUR`] : []),
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
        failedReason: err instanceof Error ? err.message : String(err),
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

  private maskEmail(email: string): string {
    const at = email.indexOf('@');
    if (at <= 0) return '***';
    const local = email.slice(0, at);
    const domain = email.slice(at);
    if (local.length <= 2) return `${local[0] ?? ''}***${domain}`;
    return `${local.slice(0, 2)}***${domain}`;
  }
}
