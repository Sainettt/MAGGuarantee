import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

import {
  VEHICLE_NIEAKTYWNA_MAX_DAYS,
  calendarDaysBetween,
  computeVehicleLifecycleStatus,
  startOfBusinessTodayUtc,
} from '@magguarantee/shared';

import type { Env } from '../../config/env.schema';
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
export class VehicleRemovalAlertService {
  private readonly logger = new Logger(VehicleRemovalAlertService.name);

  constructor(
    private readonly repo: VehicleRemovalAlertRepository,
    private readonly delegationStatus: VehicleDelegationStatusRepository,
    private readonly users: UsersRepository,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Cron(REMOVAL_ALERT_CRON, {
    name: 'vehicle-removal-alert',
    timeZone: REMOVAL_ALERT_TIMEZONE,
  })
  async runDaily(now: Date = new Date()): Promise<void> {
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
   * all due vehicles. Per-admin try/catch so one bad address never aborts the
   * run. Only AFTER at least one admin enqueue succeeds do we stamp each due
   * vehicle (`adminRemovalNotifiedAt = now`, `adminRemovalNotifyCount += 1`) —
   * mirrors the watchdog's stamp-after-enqueue so a total mail failure retries
   * next run instead of silently marking the vehicles as notified.
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

    let adminsMailed = 0;
    for (const admin of admins) {
      try {
        await this.mail.enqueueVehicleRemovalAdmin(admin.email, {
          adminName: admin.name ?? admin.login,
          dateLabel,
          thresholdDays: REMOVAL_THRESHOLD_DAYS,
          rows,
        });
        adminsMailed += 1;
      } catch (err) {
        this.logger.warn({
          msg: 'vehicle removal alert admin enqueue failed',
          adminId: admin.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Stamp only after ≥1 admin was mailed (stamp-after-enqueue). Once per run.
    if (adminsMailed > 0) {
      for (const d of due) await this.repo.stampNotified(d.vehicle.id, now);
    }

    return adminsMailed;
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
