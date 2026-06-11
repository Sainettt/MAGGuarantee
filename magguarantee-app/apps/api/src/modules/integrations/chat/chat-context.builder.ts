import { Injectable, Logger } from '@nestjs/common';

import { ChatRepository } from './chat.repository';
import type { WyjazdMessageContext } from './chat-message';

/**
 * Result of building a wyjazd context: either the assembled message context,
 * or `null` when the delegation no longer exists (the processor treats a
 * `null` as a benign skip — the row may have been cancelled/removed between
 * enqueue and processing).
 */
export type BuildResult = WyjazdMessageContext | null;

/**
 * Assembles the `WyjazdMessageContext` consumed by `formatWyjazdMessage`.
 *
 * Data sources (locked brief / docs/16-jobs-and-integrations.md):
 *   - planista     = `Vehicle.planner.name`   (may be null → omitted)
 *   - dyspozytor   = `Vehicle.dispatcher.name`(may be null → omitted)
 *   - weryfikator  = the SINGLE active `User` with role `weryfikator`
 *                    (NOT per-vehicle). 0 → omit. >1 → use the first + warn.
 *   - opiekun      = `Carrier.opiekun.name`   (null → `—`, handled by the
 *                    formatter)
 */
@Injectable()
export class ChatContextBuilder {
  private readonly logger = new Logger(ChatContextBuilder.name);

  constructor(private readonly repo: ChatRepository) {}

  async build(delegationId: string): Promise<BuildResult> {
    const row = await this.repo.findWyjazdRow(delegationId);
    if (!row) {
      this.logger.warn({
        msg: 'chat wyjazd: delegation not found, skipping',
        delegationId,
      });
      return null;
    }

    const weryfikator = await this._resolveWeryfikator();

    return {
      departureAt: row.departureAt,
      departureCountry: row.departureCountry,
      departurePostalCode: row.departurePostalCode,
      plannedReturnAt: row.plannedReturnAt,
      returnCountry: row.returnCountry,
      returnPostalCode: row.returnPostalCode,
      planista: row.planistaName,
      dyspozytor: row.dyspozytorName,
      weryfikator,
      opiekun: row.opiekunName,
    };
  }

  /**
   * Resolve the single active weryfikator name. 0 active → `null` (omitted
   * from the ZESPÓŁ line). >1 active → take the first AND `logger.warn` so the
   * data-integrity anomaly is visible (the role is meant to be a singleton).
   */
  private async _resolveWeryfikator(): Promise<string | null> {
    const found = await this.repo.findActiveWeryfikator();
    if (!found) return null;
    if (found.total > 1) {
      this.logger.warn({
        msg: 'multiple active weryfikator users found; using the oldest',
        total: found.total,
      });
    }
    return found.name;
  }
}
