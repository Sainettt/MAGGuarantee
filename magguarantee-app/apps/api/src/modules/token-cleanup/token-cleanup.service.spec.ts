// Nightly token-cleanup cron (2026-08-14 logging audit, items 11 + 14).
//  - deletes dead refresh tokens with a 30-day cutoff and audits the count;
//  - prunes email_logs by EMAIL_LOG_RETENTION_DAYS and audits the count;
//  - audit rows use actor 'system' with a `system.` action (AuditWriter rule);
//  - one failing step does not skip the other; failures alert;
//  - kill-switch short-circuits.

import { Logger } from '@nestjs/common';

import type { OpsAlertService } from '../../common/ops-alert/ops-alert.service';
import type { AuditWriter } from '../audit/audit.service';
import type { AuditEntryInput } from '../audit/audit.types';
import type { RefreshTokenRepository } from '../auth/refresh-token.repository';
import type { EmailLogRepository } from '../mail/email-log.repository';
import { TokenCleanupService } from './token-cleanup.service';

const NOW = new Date('2026-09-14T01:30:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function makeHarness(opts: { enabled?: boolean; retentionDays?: number } = {}) {
  const deleteStale = jest.fn(async (_cutoff: Date, _now: Date) => 7);
  const deleteCreatedBefore = jest.fn(async (_cutoff: Date) => 42);
  const auditLog = jest.fn(async (_entry: AuditEntryInput) => undefined);
  const alertSend = jest.fn(async () => 'log-only');
  const config = {
    get: jest.fn((key: string) => {
      switch (key) {
        case 'TOKEN_CLEANUP_ENABLED':
          return opts.enabled ?? true;
        case 'EMAIL_LOG_RETENTION_DAYS':
          return opts.retentionDays ?? 180;
        default:
          return undefined;
      }
    }),
  } as never;
  const service = new TokenCleanupService(
    { deleteStale } as unknown as RefreshTokenRepository,
    { deleteCreatedBefore } as unknown as EmailLogRepository,
    { log: auditLog } as unknown as AuditWriter,
    config,
    { send: alertSend } as unknown as OpsAlertService,
  );
  return { service, deleteStale, deleteCreatedBefore, auditLog, alertSend };
}

describe('TokenCleanupService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('deletes refresh tokens dead for 30+ days and audits the count as a system action', async () => {
    const h = makeHarness();

    const outcome = await h.service.run(NOW);

    expect(outcome.refreshTokensDeleted).toBe(7);
    const [cutoff, now] = h.deleteStale.mock.calls[0]!;
    expect(cutoff.getTime()).toBe(NOW.getTime() - 30 * DAY_MS);
    expect(now).toBe(NOW);
    expect(h.auditLog).toHaveBeenCalledWith({
      action: 'system.cleanupExpiredTokens',
      targetType: 'RefreshToken',
      metadata: { deleted: 7, cutoff: cutoff.toISOString(), retentionDays: 30 },
      actor: 'system',
    });
  });

  it('prunes email_logs older than EMAIL_LOG_RETENTION_DAYS and audits the count', async () => {
    const h = makeHarness({ retentionDays: 90 });

    const outcome = await h.service.run(NOW);

    expect(outcome.emailLogsDeleted).toBe(42);
    const [cutoff] = h.deleteCreatedBefore.mock.calls[0]!;
    expect(cutoff.getTime()).toBe(NOW.getTime() - 90 * DAY_MS);
    expect(h.auditLog).toHaveBeenCalledWith({
      action: 'system.pruneEmailLogs',
      targetType: 'EmailLog',
      metadata: { deleted: 42, cutoff: cutoff.toISOString(), retentionDays: 90 },
      actor: 'system',
    });
  });

  it('audits even a zero-count run (proof the job ran)', async () => {
    const h = makeHarness();
    h.deleteStale.mockResolvedValueOnce(0);
    h.deleteCreatedBefore.mockResolvedValueOnce(0);

    await h.service.run(NOW);

    expect(h.auditLog).toHaveBeenCalledTimes(2);
    for (const [entry] of h.auditLog.mock.calls) {
      expect(entry.action.startsWith('system.')).toBe(true);
      expect(entry.metadata).toMatchObject({ deleted: 0 });
    }
  });

  it('a failing token step does not skip the email-log prune; the failure is logged + alerted', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const h = makeHarness();
    h.deleteStale.mockRejectedValueOnce(new Error('deadlock detected'));

    const outcome = await h.service.run(NOW);

    expect(outcome).toEqual({ refreshTokensDeleted: null, emailLogsDeleted: 42 });
    expect(error.mock.calls[0]?.[0]).toMatchObject({
      msg: 'token cleanup step failed',
      step: 'refresh-tokens',
      errorMessage: 'deadlock detected',
    });
    expect(h.alertSend).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'cron-failed:token-cleanup:refresh-tokens' }),
    );
    // Only the successful step wrote its audit row.
    expect(h.auditLog).toHaveBeenCalledTimes(1);
    expect(h.auditLog.mock.calls[0]?.[0].action).toBe('system.pruneEmailLogs');
  });

  it('kill-switch: nothing deleted, nothing audited', async () => {
    const h = makeHarness({ enabled: false });

    await h.service.runNightly(NOW);

    expect(h.deleteStale).not.toHaveBeenCalled();
    expect(h.deleteCreatedBefore).not.toHaveBeenCalled();
    expect(h.auditLog).not.toHaveBeenCalled();
  });

  it('runNightly never rejects', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const h = makeHarness();
    h.deleteStale.mockRejectedValueOnce(new Error('x'));
    h.deleteCreatedBefore.mockRejectedValueOnce(new Error('y'));

    await expect(h.service.runNightly(NOW)).resolves.toBeUndefined();
  });
});
