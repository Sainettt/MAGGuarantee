import { Injectable } from '@nestjs/common';

import { EmailLogStatus } from '@magguarantee/database';

import { isPrismaForeignKeyViolation } from '../../common/errors/prisma-error';
import { PrismaService } from '../prisma/prisma.service';

/**
 * One `email_logs` row: the durable delivery record of ONE queued email, written
 * once, on its final outcome (2026-08-14 logging audit, item 11).
 *
 * Deliberately metadata only — never the body, the rendered HTML, a code or a
 * password. `errorMessage` must already be scrubbed + truncated by the caller
 * (`describeError`).
 */
export interface EmailLogEntry {
  template: string;
  jobId: string | null;
  recipients: string[];
  subject: string | null;
  status: 'sent' | 'failed';
  attempts: number;
  errorName: string | null;
  errorMessage: string | null;
  providerMessageId: string | null;
  targetType: string | null;
  targetKey: string | null;
  triggeredById: string | null;
  /** Required when `status === 'sent'` (DB CHECK). */
  sentAt: Date | null;
}

function deletedCount(res: unknown): number {
  if (res && typeof res === 'object' && 'count' in res) {
    const count = (res as { count: unknown }).count;
    if (typeof count === 'number') return count;
  }
  return 0;
}

/**
 * Owns every `email_logs` access. Root client, not the ambient audit tx: rows
 * are written from BullMQ worker events and the cleanup cron, never inside an
 * audited request.
 */
@Injectable()
export class EmailLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(entry: EmailLogEntry): Promise<void> {
    try {
      await this._insert(entry);
    } catch (err) {
      // The initiating user can be hard-deleted between enqueue and the final
      // attempt (FK → users). Keep the delivery record, drop the attribution.
      if (entry.triggeredById !== null && isPrismaForeignKeyViolation(err)) {
        await this._insert({ ...entry, triggeredById: null });
        return;
      }
      throw err;
    }
  }

  /** Hard-deletes rows created before `cutoff`. Returns the count removed. */
  async deleteCreatedBefore(cutoff: Date): Promise<number> {
    // `EmailLog` is not a soft-delete model, so the extension forwards this to
    // a real DELETE; its override is typed `unknown`, hence the narrowing.
    const res: unknown = await this.prisma.client.emailLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return deletedCount(res);
  }

  private async _insert(entry: EmailLogEntry): Promise<void> {
    await this.prisma.client.emailLog.create({
      data: {
        template: entry.template,
        jobId: entry.jobId,
        recipients: entry.recipients,
        subject: entry.subject,
        status:
          entry.status === 'sent' ? EmailLogStatus.sent : EmailLogStatus.failed,
        attempts: Math.max(0, entry.attempts),
        errorName: entry.errorName,
        errorMessage: entry.errorMessage,
        providerMessageId: entry.providerMessageId,
        targetType: entry.targetType,
        targetKey: entry.targetKey,
        triggeredById: entry.triggeredById,
        sentAt: entry.sentAt,
      },
    });
  }
}
