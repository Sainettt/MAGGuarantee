import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

import { bucketForAnchor } from '@magguarantee/shared';

import type { Env } from '../../config/env.schema';
import { MailService } from '../mail/mail.service';
import type { VerificationDigestRow } from '../mail/templates/verification-digest';
import {
  VerificationSlaRepository,
  type SlaDigestCandidateRow,
} from './verification-sla.repository';

/** Cron expression: every day at 07:00 Europe/Warsaw (docs/21 §5). */
const DIGEST_CRON = '0 7 * * *';
const DIGEST_TIMEZONE = 'Europe/Warsaw';

/**
 * Daily verification-SLA digest — the system's first scheduled job
 * (docs/21-pracownik-verification-sla.md §5).
 *
 * Once a day it scans every `NA_WERYFIKACJI` claim, buckets each via the
 * shared `bucketForAnchor` Polish-working-day helper, and — if any are
 * overdue or due-soon — sends ONE digest email to every ACTIVE pracownik.
 *
 * STATELESS by design: no "already notified" flag, no DB write. An empty
 * at-risk set sends nothing (no "all clear" mail).
 *
 * TODO(scale): this assumes a SINGLE API instance. On horizontal scale,
 * `@Cron` fires once PER instance, so N replicas would send N digests. Before
 * scaling out, gate the body behind a Redis lock (`RedisService` already
 * exists — SET NX with a short TTL keyed on the Warsaw date). Not implemented
 * now per the spec.
 */
@Injectable()
export class VerificationSlaService {
  private readonly logger = new Logger(VerificationSlaService.name);

  constructor(
    private readonly repo: VerificationSlaRepository,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Cron(DIGEST_CRON, {
    name: 'verification-sla-digest',
    timeZone: DIGEST_TIMEZONE,
  })
  async runDailyDigest(now: Date = new Date()): Promise<void> {
    const candidates = await this.repo.findNaWeryfikacjiForSla();
    const { overdue, dueSoon } = this._bucket(candidates, now);

    if (overdue.length === 0 && dueSoon.length === 0) {
      // Empty → send nothing (no "all clear" mail). Stateless, no DB write.
      this.logger.log({ msg: 'verification digest: nothing at risk, skipping' });
      return;
    }

    const recipients = await this.repo.findActivePracownikRecipients();
    if (recipients.length === 0) {
      this.logger.warn({
        msg: 'verification digest: at-risk claims but no active pracownik',
        overdueCount: overdue.length,
        dueSoonCount: dueSoon.length,
      });
      return;
    }

    await this._dispatch(recipients, overdue, dueSoon);
  }

  /**
   * Buckets candidates into overdue / dueSoon digest rows via the shared
   * Polish-working-day helper; `onTrack` is dropped. Each bucket is sorted by
   * `workingDaysLeft` ascending (most urgent / most overdue first) so the
   * email lists the most pressing claims at the top.
   */
  private _bucket(
    candidates: SlaDigestCandidateRow[],
    now: Date,
  ): { overdue: VerificationDigestRow[]; dueSoon: VerificationDigestRow[] } {
    const overdue: VerificationDigestRow[] = [];
    const dueSoon: VerificationDigestRow[] = [];

    for (const c of candidates) {
      const { bucket, workingDaysLeft } = bucketForAnchor(c.anchorDate, now);
      if (bucket === 'onTrack') continue;
      const row: VerificationDigestRow = {
        nrZgl: c.nrZgl,
        carrierName: c.carrierName ?? '—',
        vehiclePlate: c.vehiclePlate ?? '—',
        workingDaysLeft,
      };
      (bucket === 'overdue' ? overdue : dueSoon).push(row);
    }

    const byUrgency = (
      a: VerificationDigestRow,
      b: VerificationDigestRow,
    ): number => a.workingDaysLeft - b.workingDaysLeft;
    overdue.sort(byUrgency);
    dueSoon.sort(byUrgency);
    return { overdue, dueSoon };
  }

  /**
   * Sends one digest per recipient. `Promise.allSettled` so a single failing
   * address (bounced mailbox, SMTP hiccup) never blocks the rest — each send
   * already `record()`s its own row in the mail registry inside
   * `MailService.sendVerificationDigest`. Failures are logged, not rethrown:
   * the cron tick should not crash on a partial delivery.
   */
  private async _dispatch(
    recipients: { email: string }[],
    overdue: VerificationDigestRow[],
    dueSoon: VerificationDigestRow[],
  ): Promise<void> {
    const deeplink = this._buildDeeplink();
    const results = await Promise.allSettled(
      recipients.map((r) =>
        this.mail.enqueueVerificationDigest(r.email, {
          overdue,
          dueSoon,
          deeplink,
        }),
      ),
    );

    const failed = results.filter((r) => r.status === 'rejected').length;
    this.logger.log({
      msg: 'verification digest dispatched',
      recipients: recipients.length,
      sent: recipients.length - failed,
      failed,
      overdueCount: overdue.length,
      dueSoonCount: dueSoon.length,
    });
  }

  /** Deep-links to the pracownik dashboard against `APP_URL`. */
  private _buildDeeplink(): string {
    const appUrl = this.config.get('APP_URL', { infer: true });
    return `${appUrl.replace(/\/$/u, '')}/employee/dashboard`;
  }
}
