import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// Standalone Gmail API package (~1 MB of types) instead of the `googleapis`
// meta-package (~200 MB) — the latter forces tsc to materialise the entire
// GoogleApis type graph and OOMs the build. Same surface for our use.
import { gmail as createGmail, gmail_v1, auth as googleAuth } from '@googleapis/gmail';

import type { Env } from '../../../config/env.schema';
import type {
  MailProvider,
  SendMailArgs,
  SendMailResult,
} from './mail-provider.interface';

/**
 * Gmail API provider — the production `MailProvider`.
 *
 * Authenticates as ONE Workspace mailbox via OAuth 2.0 — a long-lived refresh
 * token obtained once by that mailbox's owner (see `npm run gmail:token`) — and
 * sends through the Gmail REST API. Unlike SMTP this gives direct control over
 * `In-Reply-To` / `References`, which is how every email about one `nrZgl` is
 * glued into a single Gmail thread — preserving the legacy `_sendThreadedEmail`
 * behaviour (Code.gs:5788).
 *
 * From = `GMAIL_FROM` — in production a no-reply **Google Group** registered as
 * a verified send-as of the OAuth mailbox (it may equally be the mailbox itself
 * or a plain alias). No Domain-Wide Delegation — the refresh token IS the
 * sending identity; scope `gmail.send` is granted at consent, so it is not
 * passed here.
 *
 * The channel is deliberately ONE-WAY: the group accepts no inbound post, so a
 * reply to `From` bounces straight back at the sender. `Auto-Submitted` and the
 * lone `Reply-To` exception below both exist to make that honest.
 *
 * Only instantiated when `MAIL_PROVIDER=gmail`; the env superRefine validates
 * the OAuth secrets + `GMAIL_FROM` are present before constructing it.
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

    // OAuth 2.0: authenticate as ONE Workspace mailbox with a long-lived
    // refresh token (obtained once, out of band, by that mailbox's owner — see
    // `npm run gmail:token`). google-auth-library mints short-lived access
    // tokens from it on demand and refreshes them transparently, so nothing
    // here expires between sends. No impersonation / Domain-Wide Delegation.
    const oauth2 = new googleAuth.OAuth2(
      config.get('GMAIL_OAUTH_CLIENT_ID', { infer: true }) as string,
      config.get('GMAIL_OAUTH_CLIENT_SECRET', { infer: true }) as string,
    );
    oauth2.setCredentials({
      refresh_token: config.get('GMAIL_OAUTH_REFRESH_TOKEN', {
        infer: true,
      }) as string,
    });
    this.gmail = createGmail({ version: 'v1', auth: oauth2 });
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
      // Only ever set for the Maksim confirmation request — everything else
      // replies to `From`, i.e. the unattended no-reply group. See SendMailArgs.
      p.replyTo ? `Reply-To: ${this.sanitizeHeader(p.replyTo)}` : '',
      `Subject: ${this.encodeHeaderValue(this.sanitizeHeader(p.subject))}`,
      `Message-ID: ${p.messageId}`,
      // Marks the whole channel as machine-generated so the recipient's
      // vacation responder / out-of-office does NOT fire back at the no-reply
      // group (RFC 3834). Every email we send is a notification, never a
      // human-authored message — including the Maksim one, which merely
      // *invites* a reply rather than being part of a conversation.
      'Auto-Submitted: auto-generated',
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
        'Content-Transfer-Encoding: base64',
        '',
        this.encodeBody(p.text),
        `--${boundary}`,
        'Content-Type: text/html; charset=utf-8',
        'Content-Transfer-Encoding: base64',
        '',
        this.encodeBody(p.html as string),
        `--${boundary}--`,
      ];
    } else {
      lines = [
        ...headers,
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: base64',
        '',
        this.encodeBody(p.text),
      ];
    }

    return Buffer.from(lines.join('\r\n'), 'utf-8').toString('base64url');
  }

  /** Strip CR/LF (header-injection guard) and cap length, like the legacy app. */
  private sanitizeHeader(s: string): string {
    return s.replace(/[\r\n]+/g, ' ').slice(0, 200);
  }

  /**
   * RFC 2047-encode a header value when it contains non-ASCII — headers are
   * ASCII-only per RFC 5322, and Gmail mangles raw UTF-8 bytes into mojibake
   * (`—` → `Ã¢Â€Â”`). Split into ≤75-char encoded-words folded across lines:
   * 11 code points ≤ 44 UTF-8 bytes → ≤60 base64 chars + 12 chars of markup.
   */
  private encodeHeaderValue(s: string): string {
    if (!/[^\x20-\x7e]/.test(s)) return s;
    const codePoints = Array.from(s);
    const words: string[] = [];
    for (let i = 0; i < codePoints.length; i += 11) {
      const chunk = codePoints.slice(i, i + 11).join('');
      words.push(`=?UTF-8?B?${Buffer.from(chunk, 'utf-8').toString('base64')}?=`);
    }
    return words.join('\r\n ');
  }

  /** Base64-encode a body part, wrapped at the RFC 2045 76-char line limit. */
  private encodeBody(content: string): string {
    const b64 = Buffer.from(content, 'utf-8').toString('base64');
    return b64.match(/.{1,76}/g)?.join('\r\n') ?? '';
  }
}
