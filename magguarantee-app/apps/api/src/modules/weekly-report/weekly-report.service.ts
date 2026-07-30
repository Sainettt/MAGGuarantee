import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

import { BUSINESS_TZ, businessDateIso } from '@magguarantee/shared';

import type { Env } from '../../config/env.schema';
import { MailService } from '../mail/mail.service';
import type { WeeklyReportRow } from '../mail/templates/weekly-report';
import { WeeklyReportRepository } from './weekly-report.repository';

/** Cron: Monday 09:00 Europe/Warsaw (docs/16 — GAS trigger ran Mondays too). */
const WEEKLY_REPORT_CRON = '0 9 * * 1';
const WEEKLY_REPORT_TIMEZONE = BUSINESS_TZ;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Monday summary report for admins — the modern `sendWeeklyReport`
 * (`Code.gs:7056`).
 *
 * Runs as an in-process `@Cron`, matching the three jobs that came before it
 * (verification-sla 07:00, guarantee-watchdog 07:10, vehicle-removal-alert
 * 07:20) rather than the BullMQ repeatable job sketched in docs/16 — the
 * scheduling need is identical and the `@Cron` path is already proven here.
 * The email itself still goes through the `email-send` queue.
 *
 * Window: the PREVIOUS full Warsaw week, Monday 00:00 → Monday 00:00
 * (half-open). Firing at 09:00 on Monday means the week just closed.
 *
 * Unlike the SLA digest, this one sends even when every number is zero: a
 * report that skips itself is indistinguishable from a broken cron, and
 * "nothing happened last week" is itself the answer the admin came for.
 *
 * TODO(scale): the cron runs in-process (like verification-sla); N replicas
 * would send N reports. Before scaling out, gate the body behind a Redis lock
 * keyed on the Warsaw date.
 */
@Injectable()
export class WeeklyReportService {
  private readonly logger = new Logger(WeeklyReportService.name);

  constructor(
    private readonly repo: WeeklyReportRepository,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Cron(WEEKLY_REPORT_CRON, {
    name: 'weekly-report',
    timeZone: WEEKLY_REPORT_TIMEZONE,
  })
  async runWeeklyReport(now: Date = new Date()): Promise<void> {
    const { start, end } = weekWindow(now);

    const recipients = await this.repo.findActiveAdminRecipients();
    if (recipients.length === 0) {
      this.logger.warn({
        msg: 'weekly report: no active admin recipients, skipping',
        windowStart: start.toISOString(),
        windowEnd: end.toISOString(),
      });
      return;
    }

    const [window, backlog] = await Promise.all([
      this.repo.windowStats(start, end),
      this.repo.backlogStats(),
    ]);

    const rows: WeeklyReportRow[] = [
      { label: 'Złożone wnioski', value: String(window.submitted) },
      { label: 'Zaakceptowane', value: String(window.accepted) },
      { label: 'Odrzucone', value: String(window.rejected) },
    ];
    const backlogRows: WeeklyReportRow[] = [
      { label: 'Na weryfikacji', value: String(backlog.naWeryfikacji) },
      {
        label: 'Czeka na autoryzację',
        value: String(backlog.oczekujeNaAutoryzacje),
      },
      { label: 'Reklamacje', value: String(backlog.reklamacja) },
    ];

    const props = {
      weekLabel: weekLabel(start, end),
      rows,
      backlogRows,
      // Bare amount + currency, same convention as the decision emails.
      payoutTotal: `${window.payoutEur.toFixed(2)} EUR`,
      deeplink: this._buildDeeplink(),
    };

    const results = await Promise.allSettled(
      recipients.map((r) => this.mail.enqueueWeeklyReport(r.email, props)),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;

    this.logger.log({
      msg: 'weekly report dispatched',
      weekLabel: props.weekLabel,
      recipients: recipients.length,
      failed,
      submitted: window.submitted,
      accepted: window.accepted,
      rejected: window.rejected,
      payoutEur: window.payoutEur,
    });
  }

  private _buildDeeplink(): string {
    const appUrl = this.config.get('APP_URL', { infer: true });
    return `${appUrl.replace(/\/$/u, '')}/employee/dashboard`;
  }
}

// ── Warsaw week-window helpers (module-private, exported for tests) ─────────

/**
 * The previous full Warsaw week as a half-open `[start, end)` instant range:
 * `start` = Monday 00:00 Warsaw a week ago, `end` = Monday 00:00 Warsaw of the
 * day the cron fires.
 *
 * The `+ 12h` cushion when stepping back a week is deliberate: subtracting a
 * flat 7×24 h across a DST switch lands at 23:00 or 01:00, and normalising
 * THAT to a day boundary could slip to the wrong calendar day. Landing at
 * midday first makes the normalisation unambiguous.
 */
export function weekWindow(now: Date): { start: Date; end: Date } {
  const end = warsawStartOfDayUtc(now);
  const start = warsawStartOfDayUtc(new Date(end.getTime() - 7 * DAY_MS + DAY_MS / 2));
  return { start, end };
}

/** `20.07–26.07.2026` — first and last day of the window (end is exclusive). */
export function weekLabel(start: Date, end: Date): string {
  const lastDay = new Date(end.getTime() - DAY_MS / 2);
  const dm = (d: Date): string => fmtWarsaw(d, { day: '2-digit', month: '2-digit' });
  const year = fmtWarsaw(lastDay, { year: 'numeric' });
  return `${dm(start)}–${dm(lastDay)}.${year}`;
}

/**
 * The UTC instant at which the Warsaw calendar day containing `at` begins.
 *
 * NOTE this is NOT `startOfBusinessDayUtc` from `@magguarantee/shared`: that
 * one returns UTC-midnight of the Warsaw *date* (a date-only anchor for
 * comparing against date-only columns). Here we filter real timestamps
 * (`createdAt` / `statusChangedAt`), so we need the true instant — Warsaw
 * midnight is 22:00Z the previous day in summer, 23:00Z in winter.
 *
 * Two passes: apply the offset in effect at the naive guess, then re-apply at
 * the corrected instant. That converges for every real zone, including the
 * DST-transition nights where the two offsets differ.
 */
function warsawStartOfDayUtc(at: Date): Date {
  const [y, m, d] = businessDateIso(at).split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const naive = Date.UTC(y, m - 1, d);
  const firstPass = naive - warsawOffsetMs(new Date(naive));
  return new Date(naive - warsawOffsetMs(new Date(firstPass)));
}

/** Milliseconds Warsaw wall-clock is ahead of UTC at `instant`. */
function warsawOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wallClockAsUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  // Drop sub-second noise: `instant` may carry ms, the parts never do.
  return wallClockAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

function fmtWarsaw(d: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('pl-PL', { timeZone: BUSINESS_TZ, ...opts })
    .format(d)
    .replace(/\.$/u, '');
}
