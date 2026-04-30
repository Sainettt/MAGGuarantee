import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

import type { Env } from '../../../config/env.schema';

export interface SendArgs {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

/**
 * SMTP provider used by MailService in Phase 1.
 *
 * Dev: Mailhog on `MAIL_SMTP_HOST:MAIL_SMTP_PORT` (1025) — no auth, no TLS.
 * Prod (Phase 9): replaced by GmailApiProvider per
 * docs/16-jobs-and-integrations.md#email-через-gmail-api.
 */
@Injectable()
export class SmtpProvider implements OnModuleDestroy {
  private readonly logger = new Logger(SmtpProvider.name);
  private readonly transporter: Transporter;
  private readonly fromAddress: string;

  constructor(config: ConfigService<Env, true>) {
    this.fromAddress = config.get('MAIL_FROM', { infer: true });
    this.transporter = nodemailer.createTransport({
      host: config.get('MAIL_SMTP_HOST', { infer: true }),
      port: config.get('MAIL_SMTP_PORT', { infer: true }),
      secure: false,
      // Mailhog accepts unauthenticated; in prod we'd use Gmail API instead
      // of SMTP, so no auth fields here on purpose.
      ignoreTLS: true,
    });
  }

  async send(args: SendArgs): Promise<void> {
    await this.transporter.sendMail({
      from: this.fromAddress,
      to: args.to,
      subject: args.subject,
      text: args.text,
      html: args.html,
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.transporter.close();
  }
}
