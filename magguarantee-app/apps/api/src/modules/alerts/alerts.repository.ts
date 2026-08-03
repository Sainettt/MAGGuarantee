import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/**
 * A normalized "expiring document" row, produced by every provider query so
 * the service can classify + map them uniformly regardless of source table.
 */
export interface AlertSourceRow {
  /** Entity that owns the document (carrier / vehicle / driver id). */
  entityId: string;
  /** Human label of that entity (firm name / plate / driver full name). */
  entityLabel: string;
  /** The document's expiry date (date-only, stored `@db.Date` = UTC midnight). */
  expiry: Date;
  /** Owning carrier — for scope context + a link back to the carrier. */
  carrierId: string;
  carrierName: string | null;
}

/** Optional opiekun scope. Absent → all (admin). */
export interface AlertScope {
  opiekunId?: string;
}

/**
 * Data source for the document-expiry alerts. Four focused queries — one per
 * date-bearing document in the schema — each returning the same
 * {@link AlertSourceRow} shape. Every query:
 *   - bounds by `dateField <= cutoff` (documents due within the outer window OR
 *     already expired — no lower bound, an expired doc on a live entity is a
 *     real problem to act on);
 *   - excludes inactive / soft-deleted entities (and soft-deleted carriers);
 *   - applies the opiekun scope (`Carrier.opiekunId`) when present.
 *
 * The carrier's display name + active flag live on the shadow `User` row
 * (`carrier.user`), so every query joins it.
 */
@Injectable()
export class AlertsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Carrier OCP insurance — `Carrier.insuranceExpiry`. */
  carrierInsurance(cutoff: Date, scope: AlertScope): Promise<AlertSourceRow[]> {
    return this._carrierDoc('insuranceExpiry', cutoff, scope);
  }

  /** Carrier transport licence — `Carrier.licenseExpiry`. */
  carrierLicense(cutoff: Date, scope: AlertScope): Promise<AlertSourceRow[]> {
    return this._carrierDoc('licenseExpiry', cutoff, scope);
  }

  /** Vehicle fuel card — `Vehicle.fuelCardExpiry`, only when the card exists. */
  async vehicleFuelCard(
    cutoff: Date,
    scope: AlertScope,
  ): Promise<AlertSourceRow[]> {
    const rows = await this.prisma.client.vehicle.findMany({
      where: {
        fuelCard: true,
        fuelCardExpiry: { not: null, lte: cutoff },
        active: true,
        deletedAt: null,
        carrier: this._carrierRelWhere(scope),
      },
      select: {
        id: true,
        plateNumber: true,
        fuelCardExpiry: true,
        carrierId: true,
        carrier: { select: this._carrierLabelSelect() },
      },
    });
    return rows.map((r) => ({
      entityId: r.id,
      entityLabel: r.plateNumber,
      // Narrowed by the `not: null` filter above; `!` is safe.
      expiry: r.fuelCardExpiry as Date,
      carrierId: r.carrierId,
      carrierName: this._carrierName(r.carrier),
    }));
  }

  /** Driver driving licence — `Driver.licenseExpiry`. */
  async driverLicense(
    cutoff: Date,
    scope: AlertScope,
  ): Promise<AlertSourceRow[]> {
    const rows = await this.prisma.client.driver.findMany({
      where: {
        licenseExpiry: { not: null, lte: cutoff },
        active: true,
        deletedAt: null,
        carrier: this._carrierRelWhere(scope),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        licenseExpiry: true,
        carrierId: true,
        carrier: { select: this._carrierLabelSelect() },
      },
    });
    return rows.map((r) => ({
      entityId: r.id,
      entityLabel: `${r.firstName} ${r.lastName}`.trim(),
      expiry: r.licenseExpiry as Date,
      carrierId: r.carrierId,
      carrierName: this._carrierName(r.carrier),
    }));
  }

  // ── internals ────────────────────────────────────────────

  private async _carrierDoc(
    dateField: 'insuranceExpiry' | 'licenseExpiry',
    cutoff: Date,
    scope: AlertScope,
  ): Promise<AlertSourceRow[]> {
    // A computed `[dateField]` in the `select` defeats Prisma's return-type
    // inference, so we select BOTH date columns explicitly and pick the right
    // one below; the `where` is branched (not a computed key) for the same
    // reason.
    const dateWhere = { not: null, lte: cutoff } as const;
    const rows = await this.prisma.client.carrier.findMany({
      where: {
        deletedAt: null,
        // Carrier "active" lives on the shadow user; a blocked login = inactive.
        user: { active: true },
        ...(scope.opiekunId ? { opiekunId: scope.opiekunId } : {}),
        ...(dateField === 'insuranceExpiry'
          ? { insuranceExpiry: dateWhere }
          : { licenseExpiry: dateWhere }),
      },
      select: {
        id: true,
        company: true,
        insuranceExpiry: true,
        licenseExpiry: true,
        user: { select: { name: true, login: true } },
      },
    });
    return rows.map((r) => {
      const label = this._carrierName({ company: r.company, user: r.user });
      return {
        entityId: r.id,
        entityLabel: label ?? r.id.slice(0, 8),
        expiry: r[dateField] as Date,
        carrierId: r.id,
        carrierName: label,
      };
    });
  }

  /** Carrier relation filter reused by vehicle/driver queries. */
  private _carrierRelWhere(scope: AlertScope): {
    deletedAt: null;
    opiekunId?: string;
  } {
    return {
      deletedAt: null,
      ...(scope.opiekunId ? { opiekunId: scope.opiekunId } : {}),
    };
  }

  private _carrierLabelSelect() {
    return {
      company: true,
      user: { select: { name: true, login: true } },
    } as const;
  }

  private _carrierName(carrier: {
    company: string | null;
    user: { name: string | null; login: string } | null;
  }): string | null {
    return (
      carrier.user?.name ?? carrier.company ?? carrier.user?.login ?? null
    );
  }
}
