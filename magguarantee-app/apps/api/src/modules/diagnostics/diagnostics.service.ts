import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import type {
  DashboardAuditRowSummary,
  DashboardDto,
  DashboardMonthlyPoint,
  DashboardSlaClaim,
  DashboardTopCarrier,
  DiagnosticsClaimsHealthDto,
  DiagnosticsDbHealthDto,
  DiagnosticsMailJob,
  DiagnosticsMailJobListDto,
  DiagnosticsResendMailResponse,
} from '@magguarantee/shared';
import { bucketForAnchor } from '@magguarantee/shared';

import type { DashboardSlaCandidateRow } from './diagnostics.repository';

import { MailJobsRegistry, type MailJobRecord } from '../mail/mail-jobs.registry';
import { MailService } from '../mail/mail.service';
import { RedisService } from '../redis/redis.service';
import { DiagnosticsRepository } from './diagnostics.repository';

const DASHBOARD_RECENT_LIMIT = 10;
const DASHBOARD_TOP_CARRIERS_LIMIT = 5;
const DASHBOARD_MONTHLY_WINDOW_MONTHS = 12;

const CLAIMS_HEALTH_SAMPLE_SIZE = 5;
const CLAIMS_HEALTH_NA_WERYFIKACJI_DAYS = 7;

const MAILS_LIST_LIMIT = 50;

/**
 * Phase 4.5 — Diagnostics admin service.
 *
 * Five orthogonal entry points; each in its own method per the api-agent
 * "no fat method" guideline:
 *
 *   - `getDashboard()`       — KPI counts + urgent + recent + leaderboard.
 *   - `getMails()`           — last 50 mail-job records from Redis registry.
 *   - `resendMail(jobId)`    — admin retries a failed/successful send.
 *   - `getClaimsHealth()`    — orphan / suspicious claim buckets.
 *   - `getDbHealth()`        — Postgres + Redis health + table sizes.
 *
 * The dashboard is the only entry point that pracownik may call — guard
 * placement is in the controller.
 */
@Injectable()
export class DiagnosticsService {
  private readonly logger = new Logger(DiagnosticsService.name);

  constructor(
    private readonly repo: DiagnosticsRepository,
    private readonly mailJobs: MailJobsRegistry,
    private readonly mail: MailService,
    private readonly redis: RedisService,
  ) {}

  // ── Dashboard ───────────────────────────────────────────

  async getDashboard(now: Date = new Date()): Promise<DashboardDto> {
    const monthlyFrom = subtractMonths(
      startOfMonthUtc(now),
      DASHBOARD_MONTHLY_WINDOW_MONTHS - 1,
    );
    const monthlyTo = addMonths(startOfMonthUtc(now), 1);

    // Run all aggregations in parallel — they're independent reads.
    const [
      statusCounts,
      slaCandidates,
      recent,
      topCarriers,
      monthlySeries,
      reklamacjeCount,
    ] = await Promise.all([
      this.repo.countClaimsByStatus(),
      this.repo.findNaWeryfikacjiForSla(),
      this.repo.findRecentClaimAudit(DASHBOARD_RECENT_LIMIT),
      this.repo.findTopCarriersByPayment({
        limit: DASHBOARD_TOP_CARRIERS_LIMIT,
      }),
      this.repo.findMonthlySeries({ from: monthlyFrom, to: monthlyTo }),
      this.repo.countReklamacje(),
    ]);

    const { overdue, dueSoon } = this._bucketSla(slaCandidates, now);

    const total =
      statusCounts.NA_WERYFIKACJI +
      statusCounts.ZAAKCEPTOWANO +
      statusCounts.ODRZUCONO +
      statusCounts.REKLAMACJA +
      statusCounts.OCZEKUJE_NA_AUTORYZACJE +
      statusCounts.AUTORYZACJA_KWOTA_MAKSIMA;

    return {
      kpi: {
        total,
        naWeryfikacji: statusCounts.NA_WERYFIKACJI,
        zaakceptowano: statusCounts.ZAAKCEPTOWANO,
        odrzucono: statusCounts.ODRZUCONO,
        // Sum both authorisation buckets so the dashboard surfaces a single
        // "waiting on Maksim" tile per the design system spec.
        oczekujeNaAutoryzacje:
          statusCounts.OCZEKUJE_NA_AUTORYZACJE +
          statusCounts.AUTORYZACJA_KWOTA_MAKSIMA,
      },
      overdue,
      dueSoon,
      recent: recent.map(
        (r): DashboardAuditRowSummary => ({
          id: r.id,
          action: r.action,
          targetType: r.targetType,
          targetKey: r.targetKey,
          userLogin: r.userLogin,
          createdAt: r.createdAt.toISOString(),
        }),
      ),
      topCarriers: topCarriers.map(
        (c): DashboardTopCarrier => ({
          carrierId: c.carrierId,
          login: c.login,
          name: c.name,
          totalEur: c.totalEur,
        }),
      ),
      monthlySeries: monthlySeries.map(
        (m): DashboardMonthlyPoint => ({
          yearMonth: m.yearMonth,
          count: m.count,
          sumEur: m.sumEur,
        }),
      ),
      reklamacje: { count: reklamacjeCount },
    };
  }

  /**
   * Buckets every `NA_WERYFIKACJI` candidate via the shared Polish-working-day
   * SLA helper (docs/21 §2): `overdue` (workingDaysLeft < 0) and `dueSoon`
   * (0..3). `onTrack` rows are dropped. Each bucket is sorted by
   * `workingDaysLeft` ascending (most urgent / most overdue first), and the
   * signed `workingDaysLeft` is attached per row for the web widget label.
   */
  private _bucketSla(
    candidates: DashboardSlaCandidateRow[],
    now: Date,
  ): { overdue: DashboardSlaClaim[]; dueSoon: DashboardSlaClaim[] } {
    const overdue: DashboardSlaClaim[] = [];
    const dueSoon: DashboardSlaClaim[] = [];

    for (const c of candidates) {
      const { bucket, workingDaysLeft } = bucketForAnchor(c.anchorDate, now);
      if (bucket === 'onTrack') continue;
      const row: DashboardSlaClaim = {
        id: c.id,
        nrZgl: c.nrZgl,
        status: c.status,
        carrierName: c.carrierName,
        vehiclePlate: c.vehiclePlate,
        workingDaysLeft,
      };
      (bucket === 'overdue' ? overdue : dueSoon).push(row);
    }

    const byUrgency = (a: DashboardSlaClaim, b: DashboardSlaClaim): number =>
      a.workingDaysLeft - b.workingDaysLeft;
    overdue.sort(byUrgency);
    dueSoon.sort(byUrgency);
    return { overdue, dueSoon };
  }

  // ── Mails ───────────────────────────────────────────────

  async getMails(): Promise<DiagnosticsMailJobListDto> {
    const records = await this.mailJobs.listRecent(MAILS_LIST_LIMIT);
    return records.map((r) => this._toMailDto(r));
  }

  async resendMail(jobId: string): Promise<DiagnosticsResendMailResponse> {
    const record = await this.mailJobs.findById(jobId);
    if (!record) {
      throw new NotFoundException(`Mail job ${jobId} not found`);
    }
    // The resend uses a bare-payload SMTP send. The original template-data
    // isn't persisted (we only stored display fields), so re-rendering the
    // rich body isn't possible here. The admin still gets confirmation
    // delivery; rich resend lands in a future Phase that persists data
    // encrypted at rest.
    await this.mail.resendBarePayload({
      to: record.data.to,
      subject: record.data.subject,
      template: record.data.template,
    });
    // `resendBarePayload` writes a fresh registry row; fetch the most
    // recent to surface its id. The contract is "returns the new job id"
    // so callers can link to it.
    const recent = await this.mailJobs.listRecent(1);
    return { id: recent[0]?.id ?? jobId };
  }

  // ── Claims health ───────────────────────────────────────

  async getClaimsHealth(
    now: Date = new Date(),
  ): Promise<DiagnosticsClaimsHealthDto> {
    return this.repo.findClaimsHealth({
      sampleSize: CLAIMS_HEALTH_SAMPLE_SIZE,
      naWeryfikacjiOlderThan: subtractDays(
        now,
        CLAIMS_HEALTH_NA_WERYFIKACJI_DAYS,
      ),
    });
  }

  // ── DB health ───────────────────────────────────────────

  async getDbHealth(): Promise<DiagnosticsDbHealthDto> {
    const [pg, redis] = await Promise.all([
      this._probePostgres(),
      this._probeRedis(),
    ]);
    return { postgres: pg, redis };
  }

  // ── Internals ───────────────────────────────────────────

  private _toMailDto(record: MailJobRecord): DiagnosticsMailJob {
    // Hard redaction: only the display triple makes it onto the wire. The
    // `data.data` blob is stripped here so any future expansion of the
    // registry record cannot accidentally leak template variables.
    return {
      id: record.id,
      state: record.state,
      attemptsMade: record.attemptsMade,
      failedReason: record.failedReason,
      data: {
        to: record.data.to,
        subject: record.data.subject,
        template: record.data.template,
      },
      createdAt: record.createdAt,
    };
  }

  private async _probePostgres(): Promise<DiagnosticsDbHealthDto['postgres']> {
    const start = Date.now();
    try {
      await this.repo.pingPostgres();
      const latencyMs = Date.now() - start;
      // Table sizes are nice-to-have; if they fail we still consider the
      // ping a pass — `ok=true` reflects "DB reachable", not "everything
      // worked".
      let tables: DiagnosticsDbHealthDto['postgres']['tables'] = [];
      try {
        tables = await this.repo.getTableSizes();
      } catch (err) {
        this.logger.warn({
          msg: 'pg_total_relation_size query failed',
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return { ok: true, latencyMs, tables };
    } catch (err) {
      this.logger.error({
        msg: 'postgres ping failed',
        error: err instanceof Error ? err.message : String(err),
      });
      return { ok: false, latencyMs: Date.now() - start, tables: [] };
    }
  }

  private async _probeRedis(): Promise<DiagnosticsDbHealthDto['redis']> {
    const start = Date.now();
    try {
      const reply = await this.redis.ping();
      const latencyMs = Date.now() - start;
      return { ok: reply === 'PONG', latencyMs };
    } catch (err) {
      this.logger.error({
        msg: 'redis ping failed',
        error: err instanceof Error ? err.message : String(err),
      });
      return { ok: false, latencyMs: Date.now() - start };
    }
  }
}

// ── date helpers (UTC, local to this module) ─────────────

function subtractDays(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function subtractMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function startOfMonthUtc(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0),
  );
}
