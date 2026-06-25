import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

import type { Env } from '../../../config/env.schema';
import type {
  MailProvider,
  SendMailArgs,
  SendMailResult,
} from './mail-provider.interface';

/**
 * SMTP provider — the default `MailProvider` for dev and staging.
 *
 * Dev/staging: Mailhog on `MAIL_SMTP_HOST:MAIL_SMTP_PORT` (1025) — no auth,
 * no TLS. Mailhog has no concept of threads, so the `gmailThreadId` /
 * `inReplyToMessageId` fields on `SendMailArgs` are intentionally ignored
 * here; threading is a Gmail-API-only feature (see `GmailApiProvider`).
 *
 * Production swaps this for `GmailApiProvider` via the `MAIL_PROVIDER` env
 * selector (wired in `MailModule`) — this class is never instantiated when
 * `MAIL_PROVIDER=gmail`.
 */
@Injectable()
export class SmtpProvider implements MailProvider, OnModuleDestroy {
  private readonly logger = new Logger(SmtpProvider.name);
  private readonly transporter: Transporter;
  private readonly fromAddress: string;

  constructor(config: ConfigService<Env, true>) {
    this.fromAddress = config.get('MAIL_FROM', { infer: true });
    this.transporter = nodemailer.createTransport({
      host: config.get('MAIL_SMTP_HOST', { infer: true }),
      port: config.get('MAIL_SMTP_PORT', { infer: true }),
      secure: false,
      // Mailhog accepts unauthenticated; in prod we use Gmail API instead
      // of SMTP, so no auth fields here on purpose.
      ignoreTLS: true,
    });
  }

  async send(args: SendMailArgs): Promise<SendMailResult> {
    const info = await this.transporter.sendMail({
      from: this.fromAddress,
      to: args.to,
      cc: args.cc,
      subject: args.subject,
      text: args.text,
      html: args.html,
    });
    // Surface the Message-ID nodemailer generated, but no thread id — SMTP
    // does not thread. Callers persist this only on the Gmail path.
    return { messageId: info?.messageId ?? null, gmailThreadId: null };
  }

  async onModuleDestroy(): Promise<void> {
    this.transporter.close();
  }
}
