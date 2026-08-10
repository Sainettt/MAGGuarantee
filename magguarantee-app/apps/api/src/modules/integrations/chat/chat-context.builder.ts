import { Injectable, Logger } from '@nestjs/common';

import { ChatRepository, type ChatWyjazdRow } from './chat.repository';
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
 * Data sources (docs/16-jobs-and-integrations.md):
 *   - ZESTAW        = `Vehicle.plateNumber` / `Delegation.trailer.plateNumber` /
 *                     `Vehicle.sideNumber` (nullable → omitted) /
 *                     `Vehicle.gpsMobilePhone`
 *   - KIEROWCA      = driver name + phone, resolved here from the snapshot
 *                     (`Delegation.driverNameSnapshot` / `driverPhoneSnapshot`)
 *                     with a fallback to the driver relation
 *                     (`firstName + ' ' + lastName`, `phone`). The driver is
 *                     always present (`driverId` NOT NULL) → no em-dash fallback.
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
      plateNumber: row.plateNumber,
      trailerPlate: row.trailerPlate,
      sideNumber: row.sideNumber,
      gpsMobilePhone: row.gpsMobilePhone,
      driverName: this._resolveDriverName(row),
      driverPhone: this._resolveDriverPhone(row),
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

  /**
   * Driver display name: prefer the submit-time snapshot, fall back to the live
   * driver relation (`firstName + ' ' + lastName`). The driver is always
   * present, so the result is never blank for a valid delegation.
   */
  private _resolveDriverName(row: ChatWyjazdRow): string {
    const snapshot = (row.driverNameSnapshot ?? '').trim();
    if (snapshot.length > 0) return snapshot;
    return `${row.driverFirstName} ${row.driverLastName}`.trim();
  }

  /** Driver phone: prefer the submit-time snapshot, fall back to `driver.phone`. */
  private _resolveDriverPhone(row: ChatWyjazdRow): string {
    const snapshot = (row.driverPhoneSnapshot ?? '').trim();
    if (snapshot.length > 0) return snapshot;
    return row.driverPhone;
  }
}
