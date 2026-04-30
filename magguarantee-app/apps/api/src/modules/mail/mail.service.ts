import { Injectable, Logger } from '@nestjs/common';

import { SmtpProvider } from './providers/smtp.provider';

/**
 * Phase 1 outgoing-mail surface. Only `send2faCode` is implemented now;
 * `sendAccountCreated`, `sendPasswordReset`, etc. are added as follow-up
 * phases need them (per docs/16-jobs-and-integrations.md#email-шаблоны).
 *
 * Phase 9 swap: replace `SmtpProvider` with `GmailApiProvider` and inject the
 * latter from MailModule. The MailService itself does not change.
 */
export interface IMailService {
  send2faCode(email: string, code: string): Promise<void>;
}

@Injectable()
export class MailService implements IMailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly smtp: SmtpProvider) {}

  async send2faCode(email: string, code: string): Promise<void> {
    const subject = 'Kod weryfikacyjny — MAGGuarantee';
    const text = this.buildText(code);
    const html = this.buildHtml(code);

    try {
      await this.smtp.send({ to: email, subject, text, html });
      // We deliberately do NOT log the code (per
      // docs/15-auth-strategy.md#чек-лист-безопасности — secrets must not be
      // logged). We log only the destination + a stable correlation cue.
      this.logger.log({
        msg: '2fa code sent',
        toMasked: this.maskEmail(email),
      });
    } catch (err) {
      this.logger.error({
        msg: '2fa code send failed',
        toMasked: this.maskEmail(email),
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
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
