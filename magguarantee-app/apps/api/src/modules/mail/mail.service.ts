import { Injectable, Logger } from '@nestjs/common';
import { render } from '@react-email/render';

import { MailJobsRegistry, type MailJobPayload } from './mail-jobs.registry';
import {
  AuthorizationRequestEmail,
  type AuthorizationRequestProps,
} from './templates/authorization-request';
import { SmtpProvider } from './providers/smtp.provider';

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
  sendAuthorizationRequest(
    email: string,
    props: AuthorizationRequestProps,
  ): Promise<void>;
  /** Phase 4.5 — generic resend backing `POST /diagnostics/mails/:jobId/resend`. */
  resendBarePayload(payload: MailJobPayload): Promise<void>;
}

@Injectable()
export class MailService implements IMailService {
  private readonly logger = new Logger(MailService.name);

  // `mailJobs` is optional so the existing 1-arg constructor in unit tests
  // (and any future seed scripts) keeps compiling — production wiring
  // passes it through DI. When null, send paths skip the registry write.
  constructor(
    private readonly smtp: SmtpProvider,
    private readonly mailJobs?: MailJobsRegistry,
  ) {}

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
