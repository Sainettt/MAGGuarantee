import { Injectable, Logger, Optional } from '@nestjs/common';
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
import { SmtpProvider } from './providers/smtp.provider';

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
    private readonly smtp: SmtpProvider,
    @Optional() private readonly mailJobs?: MailJobsRegistry,
    @Optional()
    @InjectQueue(QUEUE_EMAIL_SEND)
    private readonly emailQueue?: Queue<EmailSendJobData>,
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
    const html = this.buildHtml(code);
    const payload: MailJobPayload = {
      to: email,
      subject,
      template: '2fa-code',
    };

    try {
      await this.smtp.send({ to: email, subject, text, html });
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
      await this.smtp.send({ to: email, subject, text, html });
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
      await this.smtp.send({ to: email, subject, text, html });
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
      await this.smtp.send({ to: email, subject, text, html });
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
      await this.smtp.send({
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
      `Dopłata:       ${props.doplata} EUR`,
      ``,
      `Kwota Maksima do autoryzacji: ${props.kwotaMaksima} EUR`,
    ];
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

  private buildHtml(code: string): string {
    // Minimal HTML — full React-Email templates ship in Phase 3+.
    return [
      '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">',
      '  <div style="background:#1e293b;padding:20px 24px;border-radius:12px 12px 0 0">',
      '    <h2 style="color:#fff;margin:0;font-size:18px">MAGGuarantee</h2>',
      '  </div>',
      '  <div style="background:#f8fafc;padding:28px 24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0">',
      '    <p style="color:#64748b;font-size:14px;margin:0 0 24px">Twój jednorazowy kod logowania:</p>',
      `    <div style="background:#1e40af;color:#fff;font-size:36px;font-weight:700;letter-spacing:12px;text-align:center;padding:20px;border-radius:10px;margin-bottom:20px">${code}</div>`,
      '    <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0">Kod ważny przez <b>10 minut</b>. Nie udostępniaj go nikomu.</p>',
      '  </div>',
      '</div>',
    ].join('');
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
