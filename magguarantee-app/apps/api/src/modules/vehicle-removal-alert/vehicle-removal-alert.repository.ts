import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/**
 * One LIVE vehicle plus everything the removal-alert cron needs to classify it
 * and dedup its admin digests. `active=true`, `deletedAt=null`, carrier alive —
 * the same LIVE scope the fleet aggregates use, minus the delegation state
 * (batched separately via {@link VehicleDelegationStatusRepository}).
 */
export interface RemovalAlertVehicleRow {
  id: string;
  plateNumber: string;
  sideNumber: string | null;
  /** `Vehicle.createdAt` — the idle-clock fallback anchor (never returned). */
  createdAt: Date;
  /** Last successful admin-digest instant (dedup anchor), or `null`. */
  adminRemovalNotifiedAt: Date | null;
  /** How many admin digests this vehicle has triggered (monotonic). */
  adminRemovalNotifyCount: number;
  carrier: {
    id: string;
    /** Display name (`carrier.user.name`) with a login fallback. */
    name: string;
  };
}

function updatedCount(res: unknown): number {
  if (res && typeof res === 'object' && 'count' in res) {
    const count = (res as { count: unknown }).count;
    if (typeof count === 'number') return count;
  }
  return 0;
}

/**
 * Read/write repository for the vehicle-removal alert cron. Owns every Prisma
 * call for the module (service never touches Prisma directly). Runs off the
 * ROOT client (`this.prisma.client`) — the cron is not an audited request, so
 * there is no ambient transaction to enrol into (mirrors the guarantee-watchdog
 * repository).
 */
@Injectable()
export class VehicleRemovalAlertRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every LIVE vehicle in scope: `active = true`, `deletedAt IS NULL`, and the
   * carrier not soft-deleted (`carrier.deletedAt IS NULL` — the soft-delete
   * extension injects the vehicle's own `deletedAt: null`, but the carrier
   * relation needs it explicit). Carries the removal-notify dedup columns and
   * the carrier display name.
   */
  async findLiveVehicles(): Promise<RemovalAlertVehicleRow[]> {
    const rows = await this.prisma.client.vehicle.findMany({
      where: {
        active: true,
        deletedAt: null,
        carrier: { deletedAt: null },
      },
      select: {
        id: true,
        plateNumber: true,
        sideNumber: true,
        createdAt: true,
        adminRemovalNotifiedAt: true,
        adminRemovalNotifyCount: true,
        carrier: {
          select: {
            id: true,
            user: { select: { name: true, login: true } },
          },
        },
      },
      orderBy: { plateNumber: 'asc' },
    });

    return rows.map((r) => ({
      id: r.id,
      plateNumber: r.plateNumber,
      sideNumber: r.sideNumber ?? null,
      createdAt: r.createdAt,
      adminRemovalNotifiedAt: r.adminRemovalNotifiedAt ?? null,
      adminRemovalNotifyCount: r.adminRemovalNotifyCount ?? 0,
      carrier: {
        id: r.carrier?.id ?? '',
        name: r.carrier?.user?.name ?? r.carrier?.user?.login ?? '—',
      },
    }));
  }

  /**
   * Stamps a successful admin digest: `adminRemovalNotifiedAt = now` and
   * `adminRemovalNotifyCount += 1` (once per run, only after ≥1 admin enqueue
   * succeeded — mirror the watchdog's stamp-after-enqueue).
   */
  async stampNotified(vehicleId: string, now: Date): Promise<void> {
    await this.prisma.client.vehicle.update({
      where: { id: vehicleId },
      data: {
        adminRemovalNotifiedAt: now,
        adminRemovalNotifyCount: { increment: 1 },
      },
    });
  }

  /**
   * Undoes one `stampNotified(vehicleId, stampedAt)` whose digest never reached
   * any admin: restores the previous anchor and takes the count back by one.
   * Compare-and-swap on `adminRemovalNotifiedAt = stampedAt`, so a stamp a
   * later run wrote is never reverted, and reverting the same stamp twice is a
   * no-op the second time. Returns whether the row was reverted.
   */
  async revertNotifiedIfUnchanged(
    vehicleId: string,
    stampedAt: Date,
    previousNotifiedAt: Date | null,
  ): Promise<boolean> {
    const res: unknown = await this.prisma.client.vehicle.updateMany({
      where: {
        id: vehicleId,
        adminRemovalNotifiedAt: stampedAt,
        adminRemovalNotifyCount: { gt: 0 },
      },
      data: {
        adminRemovalNotifiedAt: previousNotifiedAt,
        adminRemovalNotifyCount: { decrement: 1 },
      },
    });
    return updatedCount(res) > 0;
  }

  /**
   * Clears the notify anchor when a vehicle RELAPSED out of `do_usuniecia`
   * (a new wyjazd / return moved it back). `adminRemovalNotifyCount` is
   * deliberately LEFT UNTOUCHED — it is a monotonic lifetime counter.
   */
  async clearNotified(vehicleId: string): Promise<void> {
    await this.prisma.client.vehicle.update({
      where: { id: vehicleId },
      data: { adminRemovalNotifiedAt: null },
    });
  }
}
