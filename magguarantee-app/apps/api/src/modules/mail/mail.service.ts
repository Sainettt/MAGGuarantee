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
  AuthorizationRequestEmail,
  type AuthorizationRequestProps,
} from './templates/authorization-request';
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
 * Phase 4.2 adds `sendAuthorizationRequest` — Maksim kwota-Maksima handshake.
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
  sendAuthorizationRequest(
    email: string,
    props: AuthorizationRequestProps,
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
   * Phase 4.2 — kwota-Maksima authorization-request email.
   *
   * Wraps the React-Email template into HTML + plain-text fallback and ships
   * both through the SMTP provider (Mailhog in dev, Gmail API in Phase 9).
   * Subject mirrors the legacy GAS `sendAuthorizationRequest` (Code.gs:5500-ish)
   * — "Wniosek o autoryzację: <nrZgl>" — so Maksim's inbox filters survive
   * the migration.
   */
  async sendAuthorizationRequest(
    email: string,
    props: AuthorizationRequestProps,
  ): Promise<void> {
    const subject = `Wniosek o autoryzację: ${props.nrZgl}`;
    const html = await render(AuthorizationRequestEmail(props));
    const text = this.buildAuthorizationRequestText(props);
    // Thread every email about one nrZgl into a single Gmail conversation
    // (no-op under SMTP/Mailhog). Mirrors legacy `_sendThreadedEmail`.
    const threadKey = `wniosek-${props.nrZgl}`;
    const payload: MailJobPayload = {
      to: email,
      subject,
      template: 'authorization-request',
      // Persisting `nrZgl` lets the resend endpoint look the row back up
      // when a future variant of this template depends on dynamic data.
      // The diagnostics-list response redacts everything outside the
      // `{to, subject, template}` triple — see `DiagnosticsService.getMails`.
      data: { nrZgl: props.nrZgl },
    };

    try {
      const thread = (await this.threading?.resolve(threadKey)) ?? {};
      const result = await this.provider.send({
        to: email,
        subject,
        text,
        html,
        gmailThreadId: thread.gmailThreadId,
        inReplyToMessageId: thread.inReplyToMessageId,
      });
      await this.threading?.record(threadKey, result);
      this.logger.log({
        msg: 'authorization request sent',
        nrZgl: props.nrZgl,
        toMasked: this.maskEmail(email),
      });
      await this.mailJobs?.record({ payload, state: 'completed' });
    } catch (err) {
      this.logger.error({
        msg: 'authorization request send failed',
        nrZgl: props.nrZgl,
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
        text: opts.text,
        html: opts.html,
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
        `Pojazd: ${props.vehiclePlate}`,
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
        ...(props.amountRequested
          ? [`Kwota wnioskowana: ${props.amountRequested} EUR`]
          : []),
        ...(props.paymentEur
          ? [`Wyliczona rekompensata: ${props.paymentEur} EUR`]
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

  // authorization-request (enqueue variant of the existing sync method) ──
  enqueueAuthorizationRequest(
    email: string,
    props: AuthorizationRequestProps,
  ): Promise<void> {
    return this._enqueueOr(
      { template: 'authorization-request', email, props },
      () => this.sendAuthorizationRequest(email, props),
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
        props.forCarrier
          ? 'Twój wyjazd został zarejestrowany w systemie MAGGuarantee.'
          : `Przewoźnik ${props.carrierName} zgłosił nowy wyjazd.`,
        '',
        `Pojazd: ${props.plateNumber}`,
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
      subject: `Pojazd gotowy: ${props.plateNumber}`,
      html: await render(DelegationReadyEmail(props)),
      text: [
        `Witaj ${props.carrierName},`,
        '',
        `Pojazd ${props.plateNumber} został oznaczony jako gotowy do wyjazdu.`,
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
      `Pojazd: ${p.vehiclePlate}`,
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
   * Plain-text fallback for the authorization-request email. Mirrors the
   * structure of the HTML template so non-HTML clients see the same data.
   */
  private buildAuthorizationRequestText(
    props: AuthorizationRequestProps,
  ): string {
    const lines = [
      `MAGGuarantee — wniosek o autoryzację`,
      ``,
      `Nr zgłoszenia: ${props.nrZgl}`,
      `Przewoźnik:    ${props.carrierName}`,
      `Pojazd:        ${props.vehiclePlate}`,
      `Okres:         ${props.periodFrom} → ${props.periodTo}`,
    ];
    if (props.dniWTrasie) {
      lines.push(`Dni w trasie:  ${props.dniWTrasie}`);
    }
    lines.push(
      `Dopłata:       ${props.doplata} EUR`,
      `Próg autoryz.: ${props.prog} EUR`,
    );
    if (props.comment) {
      lines.push('', `Komentarz weryfikatora:`, props.comment);
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
