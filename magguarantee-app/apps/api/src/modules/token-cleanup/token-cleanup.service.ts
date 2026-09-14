import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

import { runGuardedCron } from '../../common/ops-alert/guarded-cron';
import { OpsAlertService } from '../../common/ops-alert/ops-alert.service';
import { describeError } from '../../common/ops-alert/redact';
import type { Env } from '../../config/env.schema';
import { AuditWriter } from '../audit/audit.service';
import { RefreshTokenRepository } from '../auth/refresh-token.repository';
import { EmailLogRepository } from '../mail/email-log.repository';

/** Cron: 03:30 Europe/Warsaw — quiet hours, well clear of the 07:xx jobs. */
const TOKEN_CLEANUP_CRON = '30 3 * * *';
const TOKEN_CLEANUP_TIMEZONE = 'Europe/Warsaw';
export const TOKEN_CLEANUP_JOB_NAME = 'token-cleanup';

/** Days a dead (expired / revoked) refresh token is kept before deletion. */
export const REFRESH_TOKEN_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export const AUDIT_ACTION_CLEANUP_TOKENS = 'system.cleanupExpiredTokens';
export const AUDIT_ACTION_PRUNE_EMAIL_LOGS = 'system.pruneEmailLogs';

export interface TokenCleanupOutcome {
  refreshTokensDeleted: number | null;
  emailLogsDeleted: number | null;
}

/**
 * Nightly housekeeping (2026-08-14 logging audit, items 11 + 14).
 *
 *  1. `refresh_tokens` — hard-deletes tokens expired, or revoked-and-expired,
 *     more than {@link REFRESH_TOKEN_RETENTION_DAYS} days ago. Nothing reads
 *     them after that (see `RefreshTokenRepository.deleteStale` for why a
 *     revoked-but-live token is kept), and every row is an IP + user agent of a
 *     past session — personal data with no remaining purpose.
 *  2. `email_logs` — prunes delivery rows older than `EMAIL_LOG_RETENTION_DAYS`
 *     (default 180).
 *
 * Each step is isolated (one failing does not skip the other) and writes its
 * own `system.*` audit row with the counts — also on a zero count, so the
 * audit log proves the job ran. Kill-switch: `TOKEN_CLEANUP_ENABLED`.
 *
 * TODO(scale): in-process like the other crons; N replicas would each run it.
 * Harmless (deletes are idempotent) but would duplicate the audit rows.
 */
@Injectable()
export class TokenCleanupService {
  private readonly logger = new Logger(TokenCleanupService.name);

  constructor(
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly emailLogs: EmailLogRepository,
    private readonly audit: AuditWriter,
    private readonly config: ConfigService<Env, true>,
    private readonly alerts: OpsAlertService,
  ) {}

  @Cron(TOKEN_CLEANUP_CRON, {
    name: TOKEN_CLEANUP_JOB_NAME,
    timeZone: TOKEN_CLEANUP_TIMEZONE,
  })
  async runNightly(now: Date = new Date()): Promise<void> {
    await runGuardedCron(
      { job: TOKEN_CLEANUP_JOB_NAME, logger: this.logger, alerts: this.alerts },
      async () => {
        await this.run(now);
      },
    );
  }

  /** One cleanup pass. `null` in the outcome = that step failed (logged). */
  async run(now: Date): Promise<TokenCleanupOutcome> {
    if (!this.config.get('TOKEN_CLEANUP_ENABLED', { infer: true })) {
      this.logger.log({ msg: 'token cleanup disabled, skipping' });
      return { refreshTokensDeleted: null, emailLogsDeleted: null };
    }
    const refreshTokensDeleted = await this._step('refresh-tokens', () =>
      this._cleanupRefreshTokens(now),
    );
    const emailLogsDeleted = await this._step('email-logs', () =>
      this._pruneEmailLogs(now),
    );
    this.logger.log({
      msg: 'token cleanup run complete',
      refreshTokensDeleted,
      emailLogsDeleted,
    });
    return { refreshTokensDeleted, emailLogsDeleted };
  }

  private async _cleanupRefreshTokens(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - REFRESH_TOKEN_RETENTION_DAYS * DAY_MS);
    const deleted = await this.refreshTokens.deleteStale(cutoff, now);
    await this.audit.log({
      action: AUDIT_ACTION_CLEANUP_TOKENS,
      targetType: 'RefreshToken',
      metadata: {
        deleted,
        cutoff: cutoff.toISOString(),
        retentionDays: REFRESH_TOKEN_RETENTION_DAYS,
      },
      actor: 'system',
    });
    return deleted;
  }

  private async _pruneEmailLogs(now: Date): Promise<number> {
    const retentionDays = this.config.get('EMAIL_LOG_RETENTION_DAYS', { infer: true });
    const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
    const deleted = await this.emailLogs.deleteCreatedBefore(cutoff);
    await this.audit.log({
      action: AUDIT_ACTION_PRUNE_EMAIL_LOGS,
      targetType: 'EmailLog',
      metadata: { deleted, cutoff: cutoff.toISOString(), retentionDays },
      actor: 'system',
    });
    return deleted;
  }

  /** Runs one step; a failure is logged + alerted and yields `null`. */
  private async _step(
    step: string,
    body: () => Promise<number>,
  ): Promise<number | null> {
    try {
      return await body();
    } catch (err) {
      const { errorName, errorMessage } = describeError(err);
      this.logger.error({
        msg: 'token cleanup step failed',
        job: TOKEN_CLEANUP_JOB_NAME,
        step,
        errorName,
        errorMessage,
      });
      await this.alerts.send({
        key: `cron-failed:${TOKEN_CLEANUP_JOB_NAME}:${step}`,
        severity: 'error',
        title: `Token cleanup step failed: ${step}`,
        fields: { job: TOKEN_CLEANUP_JOB_NAME, step, errorName, errorMessage },
      });
      return null;
    }
  }
}
