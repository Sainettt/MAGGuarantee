import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.schema';
import { PrismaService } from '../prisma/prisma.service';
import type { SendMailResult } from './providers/mail-provider.interface';

/** What a caller needs to thread the next email onto an existing conversation. */
export interface ThreadRef {
  gmailThreadId?: string | null;
  inReplyToMessageId?: string | null;
}

/**
 * RFC email-threading state, backed by the `email_threads` table.
 *
 * A `threadKey` (e.g. `wniosek-GWA/001/05/26`) maps to the Gmail thread id and
 * the last RFC Message-ID, so every email about one `nrZgl` lands in a single
 * Gmail thread — preserving the legacy `_sendThreadedEmail` behaviour.
 *
 * Threading only makes sense for the Gmail provider. Under SMTP/Mailhog
 * (dev/staging) the service is a hard no-op: `resolve()` returns `{}` and
 * `record()` does nothing — it never touches the database, so dev/test/staging
 * behaviour and query counts are unchanged.
 */
@Injectable()
export class MailThreadingService {
  private readonly logger = new Logger(MailThreadingService.name);
  /** True only when the Gmail provider is active. Gates all DB access. */
  private readonly enabled: boolean;

  constructor(
    config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {
    this.enabled = config.get('MAIL_PROVIDER', { infer: true }) === 'gmail';
  }

  /**
   * Look up the existing thread for `threadKey`. Returns `{}` when threading is
   * disabled (SMTP) or no key is supplied — the provider then sends a fresh,
   * un-threaded message.
   */
  async resolve(threadKey?: string): Promise<ThreadRef> {
    if (!this.enabled || !threadKey) return {};
    const row = await this.prisma.client.emailThread.findUnique({
      where: { threadKey },
    });
    if (!row) return {};
    return {
      gmailThreadId: row.gmailThreadId,
      inReplyToMessageId: row.lastMessageId,
    };
  }

  /**
   * Persist the ids returned by the provider so the next email on this
   * `threadKey` threads correctly. No-op when disabled / no key / nothing to
   * record. Failures are swallowed (warn-only): a threading bookkeeping miss
   * must never fail an email that already went out.
   */
  async record(
    threadKey: string | undefined,
    result: SendMailResult,
  ): Promise<void> {
    if (!this.enabled || !threadKey) return;
    if (!result.messageId && !result.gmailThreadId) return;
    try {
      await this.prisma.client.emailThread.upsert({
        where: { threadKey },
        create: {
          threadKey,
          gmailThreadId: result.gmailThreadId ?? null,
          lastMessageId: result.messageId ?? null,
        },
        update: {
          // Keep the first known gmailThreadId; only overwrite if we have one.
          ...(result.gmailThreadId
            ? { gmailThreadId: result.gmailThreadId }
            : {}),
          ...(result.messageId ? { lastMessageId: result.messageId } : {}),
        },
      });
    } catch (err) {
      this.logger.warn({
        msg: 'email thread bookkeeping failed (email already sent)',
        threadKey,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
