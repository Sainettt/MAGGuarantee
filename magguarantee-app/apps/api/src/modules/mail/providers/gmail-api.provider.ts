import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, gmail_v1 } from 'googleapis';

import type { Env } from '../../../config/env.schema';
import type {
  MailProvider,
  SendMailArgs,
  SendMailResult,
} from './mail-provider.interface';

/** Scope required to send (only) — no read/modify access requested. */
const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

/**
 * Gmail API provider — the production `MailProvider`.
 *
 * Authenticates as a Workspace service-account with Domain-Wide Delegation,
 * impersonating `GMAIL_FROM` (e.g. wnioski@magtrans.eu), and sends through the
 * Gmail REST API. Unlike SMTP this gives direct control over `In-Reply-To` /
 * `References`, which is how every email about one `nrZgl` is glued into a
 * single Gmail thread — preserving the legacy `_sendThreadedEmail` behaviour
 * (Code.gs:5788).
 *
 * Only instantiated when `MAIL_PROVIDER=gmail`; `MailModule` validates the
 * three `GMAIL_*` secrets are present before constructing it.
 * See docs/16-jobs-and-integrations.md §"Email через Gmail API".
 */
@Injectable()
export class GmailApiProvider implements MailProvider {
  private readonly logger = new Logger(GmailApiProvider.name);
  private readonly gmail: gmail_v1.Gmail;
  private readonly from: string;
  /** Domain used to mint our own RFC Message-IDs (host part after the @). */
  private readonly messageIdDomain: string;

  constructor(config: ConfigService<Env, true>) {
    this.from = config.get('GMAIL_FROM', { infer: true }) as string;
    this.messageIdDomain = this.from.includes('@')
      ? this.from.slice(this.from.indexOf('@') + 1)
      : 'magtrans.eu';

    const auth = new google.auth.JWT({
      email: config.get('GMAIL_CLIENT_EMAIL', { infer: true }) as string,
      // Private keys are stored with literal "\n" in single-line env vars;
      // restore real newlines so the PEM parses.
      key: (
        config.get('GMAIL_PRIVATE_KEY', { infer: true }) as string
      ).replace(/\\n/g, '\n'),
      scopes: [GMAIL_SEND_SCOPE],
      subject: this.from, // Domain-Wide Delegation: impersonate the sender.
    });
    this.gmail = google.gmail({ version: 'v1', auth });
  }

  async send(args: SendMailArgs): Promise<SendMailResult> {
    // Mint our own Message-ID so we can thread the next email against it —
    // the Gmail send response does not echo the RFC Message-ID back.
    const messageId = `<${randomUUID()}@${this.messageIdDomain}>`;
    const raw = this.buildMime({ ...args, messageId });

    const requestBody: gmail_v1.Schema$Message = { raw };
    if (args.gmailThreadId) requestBody.threadId = args.gmailThreadId;

    const res = await this.gmail.users.messages.send({
      userId: 'me',
      requestBody,
    });

    return {
      messageId,
      gmailThreadId: res.data.threadId ?? args.gmailThreadId ?? null,
    };
  }

  /** Assemble a base64url-encoded RFC 5322 message for the Gmail `raw` field. */
  private buildMime(p: SendMailArgs & { messageId: string }): string {
    const to = Array.isArray(p.to) ? p.to : [p.to];
    const hasHtml = typeof p.html === 'string' && p.html.length > 0;

    const headers = [
      `From: ${this.from}`,
      `To: ${to.join(', ')}`,
      p.cc?.length ? `Cc: ${p.cc.join(', ')}` : '',
      `Subject: ${this.sanitizeHeader(p.subject)}`,
      `Message-ID: ${p.messageId}`,
      'MIME-Version: 1.0',
    ].filter((l) => l !== '');
    if (p.inReplyToMessageId) {
      headers.push(`In-Reply-To: ${p.inReplyToMessageId}`);
      headers.push(`References: ${p.inReplyToMessageId}`);
    }

    // Body: multipart/alternative (text + html) when HTML is present, else a
    // single text/plain part. The Content-Type header for the chosen layout
    // closes the header block; a blank line separates headers from body.
    let lines: string[];
    if (hasHtml) {
      const boundary = `mag_${randomUUID()}`;
      lines = [
        ...headers,
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        p.text,
        `--${boundary}`,
        'Content-Type: text/html; charset=utf-8',
        '',
        p.html as string,
        `--${boundary}--`,
      ];
    } else {
      lines = [
        ...headers,
        'Content-Type: text/plain; charset=utf-8',
        '',
        p.text,
      ];
    }

    return Buffer.from(lines.join('\r\n'), 'utf-8').toString('base64url');
  }

  /** Strip CR/LF (header-injection guard) and cap length, like the legacy app. */
  private sanitizeHeader(s: string): string {
    return s.replace(/[\r\n]+/g, ' ').slice(0, 200);
  }
}
