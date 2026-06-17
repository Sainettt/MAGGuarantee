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
 * Data sources (Phase 11 rework / docs/16-jobs-and-integrations.md):
 *   - planista     = `Vehicle.planner.name`                  (may be null → omitted)
 *   - dyspozytorzy = `Vehicle.dispatchTeam.dispatchers[].name`(all names of the
 *                    dispatch TEAM; may be empty → omitted; blanks dropped)
 *   - opiekun      = `Carrier.opiekun.name`                  (null → `—`, handled
 *                    by the formatter)
 *
 * The legacy `weryfikator` slot was REMOVED — the role is no longer per-wyjazd,
 * so there is no weryfikator lookup here anymore.
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

    return {
      departureAt: row.departureAt,
      departureCountry: row.departureCountry,
      departurePostalCode: row.departurePostalCode,
      plannedReturnAt: row.plannedReturnAt,
      returnCountry: row.returnCountry,
      returnPostalCode: row.returnPostalCode,
      planista: row.planistaName,
      dyspozytorzy: row.dyspozytorNames,
      opiekun: row.opiekunName,
    };
  }
}
