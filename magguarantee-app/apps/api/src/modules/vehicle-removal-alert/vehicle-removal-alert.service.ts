import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { z } from 'zod';

import {
  VEHICLE_NIEAKTYWNA_MAX_DAYS,
  calendarDaysBetween,
  computeVehicleLifecycleStatus,
  startOfBusinessTodayUtc,
} from '@magguarantee/shared';

import { runGuardedCron } from '../../common/ops-alert/guarded-cron';
import { OpsAlertService } from '../../common/ops-alert/ops-alert.service';
import { describeError } from '../../common/ops-alert/redact';
import type { Env } from '../../config/env.schema';
import { MailCompensationRegistry } from '../mail/mail-compensation.registry';
import { MailService } from '../mail/mail.service';
import type { VehicleRemovalAdminRow } from '../mail/templates/vehicle-removal-admin';
import { UsersRepository } from '../users/users.repository';
import { VehicleDelegationStatusRepository } from '../vehicles/vehicle-delegation-status.repository';
import {
  VehicleRemovalAlertRepository,
  type RemovalAlertVehicleRow,
} from './vehicle-removal-alert.repository';

/** Cron: 07:20 Europe/Warsaw — staggered after the guarantee watchdog (07:10). */
const REMOVAL_ALERT_CRON = '20 7 * * *';
const REMOVAL_ALERT_TIMEZONE = 'Europe/Warsaw';
const REMOVAL_ALERT_JOB_NAME = 'vehicle-removal-alert';

/** `MailCompensation.kind` reverting notify stamps of an undelivered digest. */
export const NOTIFY_REVERT_KIND = 'vehicle-removal-alert.revert-notify-stamps';

/** One vehicle's claimed stamp + the anchor to restore on revert (ISO). */
interface NotifyClaim {
  id: string;
  previousNotifiedAt: string | null;
}

const NotifyRevertPayloadSchema = z.object({
  stampedAt: z.string().datetime(),
  vehicles: z.array(
    z.object({
      id: z.string().min(1),
      previousNotifiedAt: z.string().datetime().nullable(),
    }),
  ),
});

/**
 * The idle-day threshold (inclusive) that puts a vehicle into `do_usuniecia`.
 * Derived from the SHARED bucketing constant — a vehicle idle for MORE than
 * `VEHICLE_NIEAKTYWNA_MAX_DAYS` (28) days, i.e. ≥29, is overdue for removal.
 * NOT env — the threshold is a domain constant.
 */
const REMOVAL_THRESHOLD_DAYS = VEHICLE_NIEAKTYWNA_MAX_DAYS + 1;

/** One vehicle that is due for an admin removal digest this run. */
interface DueVehicle {
  vehicle: RemovalAlertVehicleRow;
  daysSinceReturn: number;
  anchorAt: Date;
}

/**
 * Vehicle-removal alert cron (vehicle-status rework, Step B — Part 3).
 *
 * Once a day it classifies every LIVE vehicle via the SHARED
 * `computeVehicleLifecycleStatus`. Vehicles in the `do_usuniecia` bucket (idle
 * ≥{@link REMOVAL_THRESHOLD_DAYS} calendar days) get ONE digest emailed to
 * EVERY active admin, re-sent every `VEHICLE_REMOVAL_ALERT_REPEAT_DAYS` days
 * until the vehicle leaves the bucket. A vehicle that RELAPSED out of
 * `do_usuniecia` (new wyjazd / return) while still carrying a notify stamp has
 * the stamp cleared so a future relapse re-alerts from scratch.
 *
 * STATEFUL (like the guarantee watchdog): dedups via `Vehicle`'s
 * `adminRemovalNotifiedAt` / `adminRemovalNotifyCount` columns. Idempotent — a
 * second run inside the repeat window sends nothing. Runs on the ROOT prisma
 * client (not audited), same as the watchdog.
 *
 * TODO(scale): the cron runs in-process (like the watchdog); N replicas would
 * each fire it. The per-vehicle notify stamp mostly dedups, but before scaling
 * out gate the body behind a Redis lock keyed on the Warsaw date.
 */
@Injectable()
export class VehicleRemovalAlertService implements OnModuleInit {
  private readonly logger = new Logger(VehicleRemovalAlertService.name);

  constructor(
    private readonly repo: VehicleRemovalAlertRepository,
    private readonly delegationStatus: VehicleDelegationStatusRepository,
    private readonly users: UsersRepository,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
    private readonly compensations: MailCompensationRegistry,
    private readonly alerts: OpsAlertService,
  ) {}

  /** Registers the notify-stamp revert with the email processor. */
  onModuleInit(): void {
    this.compensations.register(NOTIFY_REVERT_KIND, (payload) =>
      this._revertFromPayload(payload),
    );
  }

  /** Cron entry point — body guarded by `runGuardedCron` (never rejects). */
  @Cron(REMOVAL_ALERT_CRON, {
    name: REMOVAL_ALERT_JOB_NAME,
    timeZone: REMOVAL_ALERT_TIMEZONE,
  })
  async runDaily(now: Date = new Date()): Promise<void> {
    await runGuardedCron(
      { job: REMOVAL_ALERT_JOB_NAME, logger: this.logger, alerts: this.alerts },
      () => this._runDaily(now),
    );
  }

  private async _runDaily(now: Date): Promise<void> {
    if (!this.config.get('VEHICLE_REMOVAL_ALERT_ENABLED', { infer: true })) {
      this.logger.log({ msg: 'vehicle removal alert disabled, skipping' });
      return;
    }

    const today = startOfBusinessTodayUtc(now);
    const repeatDays = this.config.get('VEHICLE_REMOVAL_ALERT_REPEAT_DAYS', {
      infer: true,
    });

    const vehicles = await this.repo.findLiveVehicles();
    const delegation = await this.delegationStatus.getByVehicleIds(
      vehicles.map((v) => v.id),
    );

    const { due, relapsedCleared } = await this._partition(
      vehicles,
      delegation,
      today,
      repeatDays,
    );

    const adminsMailed = await this._fanOutToAdmins(due, today, now);

    this.logger.log({
      msg: 'vehicle removal alert run complete',
      checked: vehicles.length,
      due: due.length,
      relapsedCleared,
      adminsMailed,
    });
  }

  /**
   * Splits the LIVE fleet into DUE (status `do_usuniecia`, and either never
   * notified or last notified ≥`repeatDays` calendar days ago) and RELAPSED
   * (status ≠ `do_usuniecia` but still carrying a notify stamp → clear it).
   * Relapse clears are applied here (one update each); the count is returned for
   * the run summary.
   */
  private async _partition(
    vehicles: RemovalAlertVehicleRow[],
    delegation: Map<
      string,
      { hasActiveDelegation: boolean; lastReturnAt: Date | null }
    >,
    today: Date,
    repeatDays: number,
  ): Promise<{ due: DueVehicle[]; relapsedCleared: number }> {
    const due: DueVehicle[] = [];
    let relapsedCleared = 0;

    for (const v of vehicles) {
      const ds = delegation.get(v.id) ?? {
        hasActiveDelegation: false,
        lastReturnAt: null,
      };
      const lifecycle = computeVehicleLifecycleStatus({
        today,
        active: true, // LIVE scope — the query already filters active=true.
        hasActiveDelegation: ds.hasActiveDelegation,
        lastReturnAt: ds.lastReturnAt,
        createdAt: v.createdAt,
      });

      if (lifecycle.status === 'do_usuniecia') {
        if (this._isDue(v, today, repeatDays)) {
          due.push({
            vehicle: v,
            daysSinceReturn: lifecycle.daysSinceReturn ?? REMOVAL_THRESHOLD_DAYS,
            // Already the reduced day (UTC midnight) for both sources → UTC label is right.
            anchorAt: lifecycle.anchorAt ?? v.createdAt,
          });
        }
        continue;
      }

      // RELAPSED — no longer `do_usuniecia` but a stamp lingers → clear it so a
      // future relapse alerts from scratch. `adminRemovalNotifyCount` untouched.
      if (v.adminRemovalNotifiedAt !== null) {
        await this.repo.clearNotified(v.id);
        relapsedCleared += 1;
      }
    }

    return { due, relapsedCleared };
  }

  /** DUE when never notified, or last notified ≥`repeatDays` calendar days ago. */
  private _isDue(
    v: RemovalAlertVehicleRow,
    today: Date,
    repeatDays: number,
  ): boolean {
    if (v.adminRemovalNotifiedAt === null) return true;
    return calendarDaysBetween(v.adminRemovalNotifiedAt, today) >= repeatDays;
  }

  /**
   * Fans the DUE list out to EVERY active admin — ONE digest per admin listing
   * all due vehicles, enqueued as ONE atomic batch.
   *
   * Stamp semantics (2026-08-14 logging audit, item 6) — the stamp means "at
   * least one admin got (or is about to get) this digest":
   *
   *  1. claim: stamp every due vehicle (`adminRemovalNotifiedAt = now`,
   *     `adminRemovalNotifyCount += 1`) BEFORE enqueueing;
   *  2. enqueue all admin copies together (`enqueueVehicleRemovalAdminBatch`,
   *     `Queue.addBulk` — all or nothing), each carrying a compensation with
   *     every vehicle's previous anchor;
   *  3. revert: if the claim or the enqueue throws, every stamp is reverted
   *     here; if the copies later fail PERMANENTLY in the queue, the email
   *     processor reverts once ALL copies of the batch have failed (one
   *     delivered copy keeps the stamp). Reverts are compare-and-swap on the
   *     claimed instant, so the next run simply sees the vehicle as due again.
   */
  private async _fanOutToAdmins(
    due: DueVehicle[],
    today: Date,
    now: Date,
  ): Promise<number> {
    if (due.length === 0) return 0;

    const admins = await this.users.listByRole('admin');
    if (admins.length === 0) {
      this.logger.warn({
        msg: 'vehicle removal alert: due vehicles but no active admin',
        due: due.length,
      });
      return 0;
    }

    const dateLabel = this._fmtDate(today);
    const rows: VehicleRemovalAdminRow[] = due.map((d) => ({
      plateNumber: d.vehicle.plateNumber,
      sideNumber: d.vehicle.sideNumber,
      carrierName: d.vehicle.carrier.name,
      daysSinceReturn: d.daysSinceReturn,
      anchorLabel: this._fmtDate(d.anchorAt),
    }));
    const claims: NotifyClaim[] = due.map((d) => ({
      id: d.vehicle.id,
      previousNotifiedAt: d.vehicle.adminRemovalNotifiedAt?.toISOString() ?? null,
    }));

    try {
      await this._applyClaims(claims, now);
      return await this.mail.enqueueVehicleRemovalAdminBatch(
        admins.map((admin) => ({
          email: admin.email,
          props: {
            adminName: admin.name ?? admin.login,
            dateLabel,
            thresholdDays: REMOVAL_THRESHOLD_DAYS,
            rows,
          },
        })),
        {
          compensation: {
            kind: NOTIFY_REVERT_KIND,
            payload: { stampedAt: now.toISOString(), vehicles: claims },
          },
        },
      );
    } catch (err) {
      this.logger.warn({
        msg: 'vehicle removal alert: digests could not be dispatched — stamps reverted',
        admins: admins.length,
        due: due.length,
        ...describeError(err),
      });
      await this._revertClaims(claims, now);
      return 0;
    }
  }

  private async _applyClaims(claims: NotifyClaim[], now: Date): Promise<void> {
    for (const c of claims) await this.repo.stampNotified(c.id, now);
  }

  /** Best-effort compare-and-swap revert of every claimed stamp. Never throws. */
  private async _revertClaims(
    claims: NotifyClaim[],
    stampedAt: Date,
  ): Promise<number> {
    let reverted = 0;
    for (const c of claims) {
      try {
        const previous = c.previousNotifiedAt ? new Date(c.previousNotifiedAt) : null;
        if (await this.repo.revertNotifiedIfUnchanged(c.id, stampedAt, previous)) {
          reverted += 1;
        }
      } catch (err) {
        this.logger.error({
          msg: 'vehicle removal alert: could not revert a notify stamp',
          vehicleId: c.id,
          ...describeError(err),
        });
      }
    }
    return reverted;
  }

  /** Compensation handler: every admin copy of a digest failed permanently. */
  private async _revertFromPayload(payload: unknown): Promise<void> {
    const parsed = NotifyRevertPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      this.logger.error({
        msg: 'vehicle removal alert: malformed notify-revert payload, nothing reverted',
      });
      return;
    }
    const reverted = await this._revertClaims(
      parsed.data.vehicles,
      new Date(parsed.data.stampedAt),
    );
    this.logger.warn({
      msg: 'vehicle removal alert: digest failed for every admin — stamps reverted for the next run',
      vehicleIds: parsed.data.vehicles.map((v) => v.id),
      reverted,
    });
  }

  /** dd.MM.yyyy in UTC (anchor/today are UTC-midnight date-only values). */
  private _fmtDate(d: Date): string {
    return new Intl.DateTimeFormat('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(d);
  }
}
