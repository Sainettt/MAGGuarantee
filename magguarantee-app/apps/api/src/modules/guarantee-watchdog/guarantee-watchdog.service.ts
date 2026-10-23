import {
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { z } from 'zod';

import {
  GuaranteeAnchorSource as PrismaAnchorSource,
  GuaranteeEpisodeState as PrismaEpisodeState,
  GuaranteeResolveReason as PrismaResolveReason,
} from '@magguarantee/database';
import {
  computeGuaranteeWatchdog,
  reminderThreshold,
  startOfBusinessTodayUtc,
  type GuaranteeComplianceItem,
  type GuaranteeComplianceResponse,
  type GuaranteeEpisodeDto,
  type GuaranteeEpisodeFilters,
  type GuaranteeEpisodeListDto,
  type GuaranteeWatchdogResult,
  type MyGuaranteeEpisodeFilters,
} from '@magguarantee/shared';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type { Env } from '../../config/env.schema';
import { isPrismaUniqueViolation } from '../../common/errors/prisma-error';
import { runGuardedCron } from '../../common/ops-alert/guarded-cron';
import { OpsAlertService } from '../../common/ops-alert/ops-alert.service';
import { describeError } from '../../common/ops-alert/redact';
import type { MailCompensation } from '../mail/email-send.job';
import { MailCompensationRegistry } from '../mail/mail-compensation.registry';
import { MailService } from '../mail/mail.service';
import type {
  GuaranteeReminderCarrierProps,
  GuaranteeReminderCarrierRow,
} from '../mail/templates/guarantee-reminder-carrier';
import type {
  GuaranteeOpiekunCarrierGroup,
  GuaranteeOpiekunVehicleRow,
} from '../mail/templates/guarantee-opiekun-digest';
import {
  EPISODE_STAMP_FIELDS,
  GuaranteeWatchdogRepository,
  type EpisodeStampField,
  type GuaranteeEpisodeListRow,
  type GuaranteeEpisodeRow,
  type UpdateGuaranteeEpisodeData,
  type WatchdogVehicleScopeRow,
} from './guarantee-watchdog.repository';

/** Cron: 07:10 Europe/Warsaw — staggered after verification-sla (07:00). */
const WATCHDOG_CRON = '10 7 * * *';
const WATCHDOG_TIMEZONE = 'Europe/Warsaw';
const WATCHDOG_JOB_NAME = 'guarantee-watchdog';

/** `MailCompensation.kind` releasing episode stamps of an undelivered mail. */
export const STAMP_RELEASE_KIND = 'guarantee-watchdog.release-episode-stamps';

/** The stamps one mail claims on one episode. */
interface EpisodeStampClaim {
  id: string;
  fields: EpisodeStampField[];
}

/** Compensation payload, validated when it comes back from Redis. */
const StampReleasePayloadSchema = z.object({
  stampedAt: z.string().datetime(),
  episodes: z.array(
    z.object({
      id: z.string().min(1),
      fields: z.array(z.enum(EPISODE_STAMP_FIELDS)),
    }),
  ),
});

type CarrierGroup = Map<string, { name: string; rows: VehicleTrigger[] }>;

interface OpiekunBucket {
  dueSoon: CarrierGroup;
  violations: CarrierGroup;
}

function pushToCarrierGroup(group: CarrierGroup, t: VehicleTrigger): void {
  const g = group.get(t.scope.carrier.id) ?? {
    name: t.scope.carrier.name,
    rows: [],
  };
  g.rows.push(t);
  group.set(t.scope.carrier.id, g);
}

/**
 * The trigger a per-vehicle pass produced, if any. Drives which mail a carrier /
 * opiekun receives and which flags it claims.
 */
interface VehicleTrigger {
  scope: WatchdogVehicleScopeRow;
  result: GuaranteeWatchdogResult;
  /** The open episode after this pass (created / escalated), if any. */
  episode: GuaranteeEpisodeRow;
  /** A reminder is due today (D-3 or D-1) and not yet sent. */
  reminderKind: 'd3' | 'd1' | null;
  /** This vehicle is newly violated and the opiekun digest hasn't reported it. */
  newViolation: boolean;
}

/**
 * Guarantee Watchdog (plan §1/§2/§5). A guaranteed vehicle must have a wyjazd
 * reported within N Polish working days of its last return. This service:
 *
 *   - runs a DAILY cron that classifies each in-scope vehicle, journals "bad"
 *     cycles into `GuaranteeIdleEpisode`, dedups reminder emails via per-episode
 *     flags, escalates violations, auto-resolves stale open episodes, and fans
 *     out ONE carrier reminder + ONE opiekun digest per recipient per day;
 *   - serves the live compliance board (`/guarantee-compliance` + `/me`) and the
 *     episode archive (`/guarantee-episodes`).
 *
 * STATEFUL — unlike `verification-sla` (deliberately stateless), the watchdog
 * MUST dedup emails and durably fix violations (plan §2). Idempotent: a second
 * run the same day sends nothing (the sent-flags already stamped). Since the
 * 2026-08-14 logging audit a sent-flag means "delivered or still in the
 * queue": a mail that fails permanently releases its flags (see
 * `_claimAndEnqueue`), so the next run retries.
 *
 * TODO(scale): the cron runs in-process (like verification-sla); N replicas
 * would each fire it. The per-episode sent-flags mostly dedup, but before
 * scaling out gate the body behind a Redis lock keyed on the Warsaw date.
 */
@Injectable()
export class GuaranteeWatchdogService implements OnModuleInit {
  private readonly logger = new Logger(GuaranteeWatchdogService.name);

  constructor(
    private readonly repo: GuaranteeWatchdogRepository,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
    private readonly compensations: MailCompensationRegistry,
    private readonly alerts: OpsAlertService,
  ) {}

  /**
   * Registers the stamp-release handler with the email processor. See
   * `_claimAndEnqueue` for the stamp semantics it completes.
   */
  onModuleInit(): void {
    this.compensations.register(STAMP_RELEASE_KIND, (payload) =>
      this._releaseStampsFromPayload(payload),
    );
  }

  // ── Cron ─────────────────────────────────────────────────

  /**
   * Cron entry point. The body runs inside `runGuardedCron` (2026-08-14
   * logging audit, item 20): a crash of the scope query or the fan-out is one
   * structured ERROR line + ops alert, never an unhandled rejection.
   */
  @Cron(WATCHDOG_CRON, {
    name: WATCHDOG_JOB_NAME,
    timeZone: WATCHDOG_TIMEZONE,
  })
  async runDaily(now: Date = new Date()): Promise<void> {
    await runGuardedCron(
      { job: WATCHDOG_JOB_NAME, logger: this.logger, alerts: this.alerts },
      () => this._runDaily(now),
    );
  }

  private async _runDaily(now: Date): Promise<void> {
    if (!this.config.get('GUARANTEE_WATCHDOG_ENABLED', { infer: true })) {
      this.logger.log({ msg: 'guarantee watchdog disabled, skipping' });
      return;
    }

    const today = startOfBusinessTodayUtc(now);
    const scope = await this.repo.findGuaranteedVehiclesInScope();
    const openEpisodes = await this.repo.findOpenEpisodes();

    const triggers: VehicleTrigger[] = [];
    let resolvedCount = 0;
    let vehicleErrors = 0;

    for (const v of scope) {
      // Per-vehicle isolation: one vehicle's DB error (a lock timeout, a
      // constraint surprise) must not cost every other vehicle its reminder.
      try {
        const outcome = await this._processVehicle(v, openEpisodes, today, now);
        if (outcome === 'resolved') resolvedCount += 1;
        else if (outcome) triggers.push(outcome);
      } catch (err) {
        vehicleErrors += 1;
        this.logger.error({
          msg: 'guarantee watchdog: vehicle pass failed, continuing with the rest',
          vehicleId: v.vehicleId,
          carrierId: v.carrier.id,
          ...describeError(err),
        });
      }
    }

    const { due3, due1, violated, mailsSent } = await this._fanOut(
      triggers,
      today,
      now,
    );

    this.logger.log({
      msg: 'guarantee watchdog run complete',
      checked: scope.length,
      due3,
      due1,
      violated,
      resolved: resolvedCount,
      mailsSent,
      vehicleErrors,
    });
    if (vehicleErrors > 0) {
      await this.alerts.send({
        key: `cron-partial:${WATCHDOG_JOB_NAME}`,
        severity: 'warning',
        title: 'Guarantee watchdog finished with per-vehicle errors',
        fields: { job: WATCHDOG_JOB_NAME, checked: scope.length, vehicleErrors },
      });
    }
  }

  /**
   * One vehicle of the daily pass: a trigger for the fan-out, `'resolved'`
   * when a stale open episode was closed, or `null` when nothing applies.
   */
  private async _processVehicle(
    v: WatchdogVehicleScopeRow,
    openEpisodes: Map<string, GuaranteeEpisodeRow>,
    today: Date,
    now: Date,
  ): Promise<VehicleTrigger | 'resolved' | null> {
    const result = this._compute(v, today);
    const open = openEpisodes.get(v.vehicleId);

    if (result.status === 'counting' || result.status === 'violated') {
      return this._processCounting(v, result, open, now);
    }

    // ok_active / inactive → close any open episode (fallback for cases the
    // add()-hook / toggle-hook missed).
    if (open) {
      await this._resolveOpen(open, result, now);
      return 'resolved';
    }
    return null;
  }

  /**
   * Per-vehicle counting/violated pass: ensure the episode row, escalate its
   * state, decide the due reminder (D-3 / D-1) with the "backfill the late D-3"
   * suppression, and flag a new violation for the opiekun digest. Returns the
   * trigger (episode + what to send) or `null` when nothing is due AND no
   * episode needs creating (a fresh `counting` vehicle with daysLeft > max
   * offset records NO row — plan §2).
   */
  private async _processCounting(
    v: WatchdogVehicleScopeRow,
    result: GuaranteeWatchdogResult,
    open: GuaranteeEpisodeRow | undefined,
    now: Date,
  ): Promise<VehicleTrigger | null> {
    const daysLeft = result.daysLeft ?? 0;
    const offsets = this._reminderOffsets();
    const dueOffset = reminderThreshold(daysLeft, offsets);
    const isViolated = result.status === 'violated';

    // No episode yet AND nothing to record → a healthy early-counting vehicle.
    if (!open && dueOffset === null && !isViolated) return null;

    const episode = open
      ? await this._escalate(open, result, isViolated, now)
      : await this._ensureEpisode(v, result, isViolated, now);

    // Which reminder is due today, honouring the per-episode dedup flags.
    let reminderKind: 'd3' | 'd1' | null = null;
    if (!isViolated) {
      // D-1 first (daysLeft <= 1) — suppresses a late D-3 by backfilling it.
      if (daysLeft <= 1 && episode.reminder1SentAt === null) {
        reminderKind = 'd1';
      } else if (
        daysLeft >= 2 &&
        daysLeft <= 3 &&
        episode.reminder3SentAt === null
      ) {
        reminderKind = 'd3';
      }
    }

    const newViolation = isViolated && episode.violationSentAt === null;

    return { scope: v, result, episode, reminderKind, newViolation };
  }

  /**
   * Create the first episode row for a bad cycle. On reopen-after-anulowany the
   * anchor is unchanged, so we copy the reminder/violation sent-flags from the
   * most recent episode with the SAME (vehicleId, anchorAt) — a reminder already
   * sent this cycle is not re-sent. Handles the partial-unique race (another
   * process created the open row first) by catching the unique violation and
   * updating the existing open row instead.
   */
  private async _ensureEpisode(
    v: WatchdogVehicleScopeRow,
    result: GuaranteeWatchdogResult,
    isViolated: boolean,
    now: Date,
  ): Promise<GuaranteeEpisodeRow> {
    const prior = await this.repo.findLatestEpisodeForAnchor(
      v.vehicleId,
      result.anchorAt as Date,
    );
    const state = isViolated
      ? PrismaEpisodeState.violated
      : PrismaEpisodeState.warning;

    try {
      return await this.repo.createEpisode({
        vehicleId: v.vehicleId,
        carrierId: v.carrier.id,
        anchorAt: result.anchorAt as Date,
        anchorSource: this._anchorSource(result),
        deadlineAt: result.deadlineAt as Date,
        state,
        // Copy sent-flags from a prior same-anchor cycle (reopen after anulowany).
        reminder3SentAt: prior?.reminder3SentAt ?? null,
        reminder1SentAt: prior?.reminder1SentAt ?? null,
        violationSentAt: prior?.violationSentAt ?? null,
        violatedAt: isViolated ? now : null,
      });
    } catch (err) {
      // Partial-unique race — an open episode already exists. Escalate it.
      if (isPrismaUniqueViolation(err)) {
        const open = await this.repo.findOpenEpisodeByVehicle(v.vehicleId);
        if (open) return this._escalate(open, result, isViolated, now);
      }
      throw err;
    }
  }

  /**
   * Escalate an existing open episode: warning → violated (stamping `violatedAt`
   * ONCE), keeping the anchor/deadline in sync if the cycle shifted. Sent-flags
   * are untouched here (they are stamped only after a successful enqueue).
   */
  private async _escalate(
    open: GuaranteeEpisodeRow,
    result: GuaranteeWatchdogResult,
    isViolated: boolean,
    now: Date,
  ): Promise<GuaranteeEpisodeRow> {
    const patch: Parameters<GuaranteeWatchdogRepository['updateEpisode']>[1] =
      {};
    if (isViolated && open.state !== PrismaEpisodeState.violated) {
      patch.state = PrismaEpisodeState.violated;
      if (open.violatedAt === null) patch.violatedAt = now;
    }
    if (Object.keys(patch).length === 0) return open;
    return this.repo.updateEpisode(open.id, patch);
  }

  /**
   * Auto-resolve an open episode the vehicle no longer needs (plan §2 fallback):
   *   - `ok_active` → reason `wyjazd` (a delegation is active now);
   *   - agreement off / out of scope → `agreement_off` (should be rare — the
   *     toggle-hook handles it live, this catches drift);
   *   - vehicle inactive/deleted or carrier dead → `vehicle_inactive`.
   * Here (cron path) the only statuses reaching us are `ok_active`/`inactive`
   * (scope already excludes off-guarantee / dead rows), so `wyjazd` vs
   * `vehicle_inactive` is decided by whether the counter is silenced.
   */
  private async _resolveOpen(
    open: GuaranteeEpisodeRow,
    result: GuaranteeWatchdogResult,
    now: Date,
  ): Promise<void> {
    const reason =
      result.status === 'ok_active'
        ? PrismaResolveReason.wyjazd
        : PrismaResolveReason.vehicle_inactive;
    await this.repo.updateEpisode(open.id, {
      state: PrismaEpisodeState.resolved,
      resolvedAt: now,
      resolvedReason: reason,
      resolvedDaysLeft: result.daysLeft,
    });
  }

  /**
   * Group triggers into ONE carrier reminder + ONE opiekun digest per recipient
   * and dispatch them. Per-mail isolation so one failing recipient never aborts
   * the run. Stamp semantics: see `_claimAndEnqueue`.
   */
  private async _fanOut(
    triggers: VehicleTrigger[],
    today: Date,
    now: Date,
  ): Promise<{ due3: number; due1: number; violated: number; mailsSent: number }> {
    const due3 = triggers.filter((t) => t.reminderKind === 'd3').length;
    const due1 = triggers.filter((t) => t.reminderKind === 'd1').length;
    const violated = triggers.filter((t) => t.newViolation).length;

    const dateLabel = this._fmtDate(today);
    const deeplink = this._buildDeeplink();
    let mailsSent = 0;

    mailsSent += await this._sendCarrierReminders(triggers, deeplink, now);
    mailsSent += await this._sendOpiekunDigests(triggers, dateLabel, now);

    return { due3, due1, violated, mailsSent };
  }

  /** Carrier fan-out — one reminder per carrier listing all its due vehicles. */
  private async _sendCarrierReminders(
    triggers: VehicleTrigger[],
    deeplink: string,
    now: Date,
  ): Promise<number> {
    const byCarrier = new Map<
      string,
      { userId: string; name: string; rows: VehicleTrigger[] }
    >();
    for (const t of triggers) {
      if (t.reminderKind === null) continue; // carriers get NO violation mail
      const key = t.scope.carrier.id;
      const bucket = byCarrier.get(key) ?? {
        userId: t.scope.carrier.userId,
        name: t.scope.carrier.name,
        rows: [],
      };
      bucket.rows.push(t);
      byCarrier.set(key, bucket);
    }

    let sent = 0;
    const deadlineWorkingDays = this._deadlineWorkingDays();
    for (const [carrierId, bucket] of byCarrier) {
      const email = await this._resolveCarrierEmail(bucket.userId);
      if (!email) {
        // Not stamped → the reminder is retried by the next daily run.
        this.logger.warn({
          msg: 'guarantee watchdog: carrier has no deliverable e-mail, reminder not sent',
          carrierId,
          vehicles: bucket.rows.length,
        });
        continue;
      }
      const props: GuaranteeReminderCarrierProps = {
        carrierName: bucket.name,
        deadlineWorkingDays,
        rows: bucket.rows.map((t) => this._toCarrierRow(t)),
        deeplink,
      };
      const delivered = await this._claimAndEnqueue(
        bucket.rows.map((t) => this._reminderClaim(t)),
        now,
        (compensation) =>
          this.mail.enqueueGuaranteeReminderCarrier(email, props, { compensation }),
        { kind: 'carrier reminder', carrierId },
      );
      if (delivered) sent += 1;
    }
    return sent;
  }

  /** Opiekun fan-out — one digest per opiekun (due-soon + newly-violated). */
  private async _sendOpiekunDigests(
    triggers: VehicleTrigger[],
    dateLabel: string,
    now: Date,
  ): Promise<number> {
    const { byOpiekun, unassignedViolations } = this._groupByOpiekun(triggers);
    this._warnUnassignedViolations(unassignedViolations);

    let sent = 0;
    for (const [opiekunId, bucket] of byOpiekun) {
      const dueSoon = this._toGroups(bucket.dueSoon);
      const violations = this._toGroups(bucket.violations);
      if (dueSoon.length === 0 && violations.length === 0) continue;
      const recipient = await this._resolveOpiekun(opiekunId);
      if (!recipient) {
        // Not stamped → reported by the first run after the opiekun is fixed.
        this.logger.warn({
          msg: 'guarantee watchdog: opiekun has no deliverable e-mail, digest not sent',
          opiekunId,
          dueSoonCarriers: dueSoon.length,
          violationCarriers: violations.length,
        });
        continue;
      }
      const violationRows = [...bucket.violations.values()].flatMap((g) => g.rows);
      const delivered = await this._claimAndEnqueue(
        violationRows.map((t) => this._violationClaim(t)),
        now,
        (compensation) =>
          this.mail.enqueueGuaranteeOpiekunDigest(
            recipient.email,
            { opiekunName: recipient.name, dateLabel, dueSoon, violations },
            { compensation },
          ),
        { kind: 'opiekun digest', opiekunId },
      );
      if (delivered) sent += 1;
    }
    return sent;
  }

  /** opiekunId → { dueSoon: carrier→rows, violations: carrier→rows }. */
  private _groupByOpiekun(triggers: VehicleTrigger[]): {
    byOpiekun: Map<string, OpiekunBucket>;
    unassignedViolations: VehicleTrigger[];
  } {
    const byOpiekun = new Map<string, OpiekunBucket>();
    const unassignedViolations: VehicleTrigger[] = [];
    for (const t of triggers) {
      const opiekunId = t.scope.carrier.opiekunId;
      if (!opiekunId) {
        if (t.newViolation) unassignedViolations.push(t);
        continue;
      }
      const bucket = byOpiekun.get(opiekunId) ?? {
        dueSoon: new Map(),
        violations: new Map(),
      };
      if (t.reminderKind !== null) pushToCarrierGroup(bucket.dueSoon, t);
      if (t.newViolation) pushToCarrierGroup(bucket.violations, t);
      byOpiekun.set(opiekunId, bucket);
    }
    return { byOpiekun, unassignedViolations };
  }

  /**
   * A newly-violated vehicle whose carrier has NO opiekun has nobody to report
   * to. Semantics (2026-08-14 logging audit, item 6): `violationSentAt` means
   * "the violation was reported to an opiekun", so it is NOT stamped — the old
   * code stamped it silently. The violation itself is durable regardless
   * (episode `state = violated`, `violatedAt`, visible on the admin compliance
   * board); once an opiekun is assigned, the next run puts it in their digest.
   * Until then every run says so here, once per run, as a data-quality WARN.
   */
  private _warnUnassignedViolations(triggers: VehicleTrigger[]): void {
    if (triggers.length === 0) return;
    this.logger.warn({
      msg: 'guarantee watchdog: violations on carriers without an opiekun — nobody notified, violationSentAt left unset',
      carrierIds: [...new Set(triggers.map((t) => t.scope.carrier.id))],
      vehicleIds: triggers.map((t) => t.scope.vehicleId),
    });
  }

  private _toGroups(
    byCarrier: Map<string, { name: string; rows: VehicleTrigger[] }>,
  ): GuaranteeOpiekunCarrierGroup[] {
    return [...byCarrier.values()].map((g) => ({
      carrierName: g.name,
      rows: g.rows.map((t): GuaranteeOpiekunVehicleRow => ({
        plateNumber: t.scope.plateNumber,
        anchorLabel: this._fmtDate(t.result.anchorAt as Date),
        anchorSource: this._anchorSource(t.result),
        deadlineLabel: this._fmtDate(t.result.deadlineAt as Date),
        daysLeft: t.result.daysLeft ?? 0,
      })),
    }));
  }

  private _toCarrierRow(t: VehicleTrigger): GuaranteeReminderCarrierRow {
    return {
      plateNumber: t.scope.plateNumber,
      anchorLabel: this._fmtDate(t.result.anchorAt as Date),
      anchorSource: this._anchorSource(t.result),
      deadlineLabel: this._fmtDate(t.result.deadlineAt as Date),
      daysLeft: t.result.daysLeft ?? 0,
    };
  }

  // ── Stamp claim / release ────────────────────────────────

  /** Which reminder stamps this trigger claims. */
  private _reminderClaim(t: VehicleTrigger): EpisodeStampClaim {
    if (t.reminderKind === 'd1') {
      // D-1 also backfills a (suppressed) late D-3 so it never fires afterward —
      // only when D-3 is still unset, so a release never wipes a real D-3.
      return {
        id: t.episode.id,
        fields:
          t.episode.reminder3SentAt === null
            ? ['reminder1SentAt', 'reminder3SentAt']
            : ['reminder1SentAt'],
      };
    }
    return {
      id: t.episode.id,
      fields: t.reminderKind === 'd3' ? ['reminder3SentAt'] : [],
    };
  }

  private _violationClaim(t: VehicleTrigger): EpisodeStampClaim {
    return {
      id: t.episode.id,
      fields: t.episode.violationSentAt === null ? ['violationSentAt'] : [],
    };
  }

  /**
   * Stamp semantics (2026-08-14 logging audit, item 6) — CLAIM, ENQUEUE,
   * RELEASE ON FAILURE:
   *
   *  1. claim: write the dedup stamps (`= now`) BEFORE enqueueing, so a second
   *     run can never double-send while the mail is still in the queue;
   *  2. enqueue the mail carrying a `MailCompensation` that names exactly the
   *     stamps claimed and the claimed value;
   *  3. release: if the claim or the enqueue throws, the stamps are cleared
   *     right here; if the mail later fails PERMANENTLY in the queue, the email
   *     processor calls `_releaseStampsFromPayload`. Either way the next daily
   *     run sees NULL and retries.
   *
   * Releases are compare-and-clear (only while the column still holds the
   * claimed instant), so a release can never erase a stamp a later successful
   * run wrote. A stamp therefore means "delivered or still being delivered",
   * never "attempted once". Returns whether the mail was enqueued.
   */
  private async _claimAndEnqueue(
    claims: EpisodeStampClaim[],
    now: Date,
    enqueue: (compensation: MailCompensation) => Promise<void>,
    logCtx: { kind: string } & Record<string, unknown>,
  ): Promise<boolean> {
    const effective = claims.filter((c) => c.fields.length > 0);
    const compensation: MailCompensation = {
      kind: STAMP_RELEASE_KIND,
      payload: { stampedAt: now.toISOString(), episodes: effective },
    };
    try {
      await this._applyClaims(effective, now);
      await enqueue(compensation);
      return true;
    } catch (err) {
      const { kind, ...extra } = logCtx;
      this._warnMail(kind, err, extra);
      await this._releaseClaims(effective, now);
      return false;
    }
  }

  private async _applyClaims(
    claims: EpisodeStampClaim[],
    now: Date,
  ): Promise<void> {
    for (const c of claims) {
      const patch: UpdateGuaranteeEpisodeData = {};
      for (const f of c.fields) patch[f] = now;
      await this.repo.updateEpisode(c.id, patch);
    }
  }

  /** Best-effort compare-and-clear of every claimed stamp. Never throws. */
  private async _releaseClaims(
    claims: EpisodeStampClaim[],
    stampedAt: Date,
  ): Promise<number> {
    let cleared = 0;
    for (const c of claims) {
      for (const f of c.fields) {
        try {
          if (await this.repo.clearEpisodeStampIfUnchanged(c.id, f, stampedAt)) {
            cleared += 1;
          }
        } catch (err) {
          this.logger.error({
            msg: 'guarantee watchdog: could not release a stamp — mail may be skipped next run',
            episodeId: c.id,
            field: f,
            ...describeError(err),
          });
        }
      }
    }
    return cleared;
  }

  /** Compensation handler: the queued mail failed permanently. */
  private async _releaseStampsFromPayload(payload: unknown): Promise<void> {
    const parsed = StampReleasePayloadSchema.safeParse(payload);
    if (!parsed.success) {
      this.logger.error({
        msg: 'guarantee watchdog: malformed stamp-release payload, nothing released',
      });
      return;
    }
    const stampedAt = new Date(parsed.data.stampedAt);
    const cleared = await this._releaseClaims(parsed.data.episodes, stampedAt);
    this.logger.warn({
      msg: 'guarantee watchdog: mail failed permanently — stamps released for the next run',
      episodeIds: parsed.data.episodes.map((e) => e.id),
      cleared,
    });
  }

  // ── Hooks (called from other services) ───────────────────

  /**
   * Resolve-hook for `DelegationsService.add()`: a fresh wyjazd closes the
   * vehicle's open episode instantly (banner clears without waiting for the
   * cron). Off-path: NEVER throws outward (a hook failure must not break add()).
   */
  async onDelegationCreated(
    vehicleId: string,
    delegationId: string,
    now: Date = new Date(),
  ): Promise<void> {
    try {
      const open = await this.repo.findOpenEpisodeByVehicle(vehicleId);
      if (!open) return;
      const today = startOfBusinessTodayUtc(now);
      const daysLeft = this._daysLeftForEpisode(open, today);
      await this.repo.updateEpisode(open.id, {
        state: PrismaEpisodeState.resolved,
        resolvedAt: now,
        resolvedByDelegationId: delegationId,
        resolvedDaysLeft: daysLeft,
        resolvedReason: PrismaResolveReason.wyjazd,
      });
    } catch (err) {
      this.logger.warn({
        msg: 'guarantee watchdog resolve-hook failed (non-fatal)',
        vehicleId,
        delegationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Toggle-hook for the vehicles update path when `agreement` flips true→false:
   * close the open episode (reason `agreement_off`). Off-path: never throws
   * outward. `agreementSince` maintenance itself is done inline in the vehicles
   * service (it is a scalar on the same update). No-op when no episode is open.
   */
  async onAgreementDisabled(
    vehicleId: string,
    now: Date = new Date(),
  ): Promise<void> {
    try {
      const open = await this.repo.findOpenEpisodeByVehicle(vehicleId);
      if (!open) return;
      const today = startOfBusinessTodayUtc(now);
      await this.repo.updateEpisode(open.id, {
        state: PrismaEpisodeState.resolved,
        resolvedAt: now,
        resolvedReason: PrismaResolveReason.agreement_off,
        resolvedDaysLeft: this._daysLeftForEpisode(open, today),
      });
    } catch (err) {
      this.logger.warn({
        msg: 'guarantee watchdog agreement-off hook failed (non-fatal)',
        vehicleId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Read side (board + archive) ──────────────────────────

  /**
   * Live compliance board (`GET /guarantee-compliance`). Admin → all; opiekun →
   * carriers where `carrier.opiekunId = user.sub`. Each row is computed live and
   * joined to its OPEN episode (if any). Keyed by vehicleId (web joins to fleet).
   */
  async getComplianceBoard(
    user: AuthUser,
    now: Date = new Date(),
  ): Promise<GuaranteeComplianceResponse> {
    // scope: opiekun → own carriers (Carrier.opiekunId), admin → all. Role-keyed
    // on purpose, not can('panel.opiekun'): the check guards the
    // `opiekun ? own : all` filter below, so a B6 grant of the panel right must
    // not widen it (docs/25 §0, R4).
    if (user.role !== 'admin' && user.role !== 'opiekun') {
      throw new ForbiddenException('Wymaga konta administratora lub opiekuna');
    }
    const today = startOfBusinessTodayUtc(now);
    const scope = await this.repo.findGuaranteedVehiclesInScope();
    const filtered =
      user.role === 'opiekun'
        ? scope.filter((v) => v.carrier.opiekunId === user.sub)
        : scope;
    const openEpisodes = await this.repo.findOpenEpisodes();

    const items = filtered.map((v) =>
      this._toComplianceItem(v, this._compute(v, today), openEpisodes, true),
    );
    return { items, summary: this._summarize(items) };
  }

  /**
   * Carrier self-board (`GET /guarantee-compliance/me`). Resolves the caller's
   * own carrier the same way other carrier `/me` endpoints do (login-user id →
   * carrier). Same item shape minus the carrier block.
   */
  async getMyCompliance(
    user: AuthUser,
    now: Date = new Date(),
  ): Promise<GuaranteeComplianceResponse> {
    // scope: the caller's own carrier (Carrier.userId = user.sub); role-keyed,
    // not can('panel.carrier') — only a przewoznik owns a carrier (docs/25 §0, R4).
    if (user.role !== 'przewoznik') {
      throw new ForbiddenException('Wymaga konta przewoźnika');
    }
    const today = startOfBusinessTodayUtc(now);
    const scope = await this.repo.findGuaranteedVehiclesInScope();
    const mine = scope.filter((v) => v.carrier.userId === user.sub);
    const openEpisodes = await this.repo.findOpenEpisodes();

    const items = mine.map((v) =>
      this._toComplianceItem(v, this._compute(v, today), openEpisodes, false),
    );
    return { items, summary: this._summarize(items) };
  }

  /**
   * Episode archive (`GET /guarantee-episodes`). Admin → all; opiekun → own
   * carriers (`carrier.opiekunId` scope enforced in the repo). Newest first,
   * cursor-paginated on `id`.
   */
  async listEpisodes(
    user: AuthUser,
    filters: GuaranteeEpisodeFilters,
  ): Promise<GuaranteeEpisodeListDto> {
    // scope: opiekun → own carriers (`opiekunScopeId`, Carrier.opiekunId), admin
    // → all. Role-keyed on purpose, not can('panel.opiekun'): the check guards
    // the `opiekun ? own : all` filter below (docs/25 §0, R4).
    if (user.role !== 'admin' && user.role !== 'opiekun') {
      throw new ForbiddenException('Wymaga konta administratora lub opiekuna');
    }
    const rows = await this.repo.listEpisodes({
      carrierId: filters.carrierId,
      vehicleId: filters.vehicleId,
      state: filters.state as PrismaEpisodeState | undefined,
      opiekunScopeId: user.role === 'opiekun' ? user.sub : undefined,
      cursor: filters.cursor,
      limit: filters.limit,
    });
    return this._paginateEpisodes(rows, filters.limit);
  }

  /**
   * Carrier self-archive (`GET /guarantee-episodes/me`). Hard-rejects any
   * non-przewoznik caller (defence-in-depth behind the controller's
   * `@RequirePermission('panel.carrier')`, a przewoznik-only right).
   * The carrier scope is ALWAYS derived from the JWT (`carrier.userId = user.sub`)
   * — `carrierId` is not even in `MyGuaranteeEpisodeFilters`, so a client can
   * never widen the scope (IDOR guard). Honours vehicleId/state/cursor/limit,
   * same cursor pagination as `listEpisodes`.
   */
  async listMyEpisodes(
    user: AuthUser,
    filters: MyGuaranteeEpisodeFilters,
  ): Promise<GuaranteeEpisodeListDto> {
    // scope: the caller's own carrier (`carrierUserScopeId`, Carrier.userId);
    // role-keyed, not can('panel.carrier') — only a przewoznik owns a carrier
    // (docs/25 §0, R4).
    if (user.role !== 'przewoznik') {
      throw new ForbiddenException('Wymaga konta przewoźnika');
    }
    const rows = await this.repo.listEpisodes({
      vehicleId: filters.vehicleId,
      state: filters.state as PrismaEpisodeState | undefined,
      carrierUserScopeId: user.sub,
      cursor: filters.cursor,
      limit: filters.limit,
    });
    return this._paginateEpisodes(rows, filters.limit);
  }

  /** Cursor-page a fetched-N+1 episode window into the wire envelope. */
  private _paginateEpisodes(
    rows: GuaranteeEpisodeListRow[],
    limit: number,
  ): GuaranteeEpisodeListDto {
    const hasNext = rows.length > limit;
    const page = hasNext ? rows.slice(0, limit) : rows;
    return {
      items: page.map((r) => this._toEpisodeDto(r)),
      nextCursor: hasNext ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  // ── Internals: computation + mapping ─────────────────────

  private _compute(
    v: WatchdogVehicleScopeRow,
    today: Date,
  ): GuaranteeWatchdogResult {
    return computeGuaranteeWatchdog({
      today,
      hasActiveDelegation: v.hasActiveDelegation,
      lastReturnAt: v.lastReturnAt,
      agreementSince: v.agreementSince,
      config: {
        deadlineWorkingDays: this._deadlineWorkingDays(),
        reminderOffsets: this._reminderOffsets(),
      },
    });
  }

  private _toComplianceItem(
    v: WatchdogVehicleScopeRow,
    result: GuaranteeWatchdogResult,
    openEpisodes: Map<string, GuaranteeEpisodeRow>,
    withCarrier: boolean,
  ): GuaranteeComplianceItem {
    const open = openEpisodes.get(v.vehicleId) ?? null;
    return {
      vehicleId: v.vehicleId,
      plateNumber: v.plateNumber,
      sideNumber: v.sideNumber,
      ...(withCarrier
        ? { carrier: { id: v.carrier.id, name: v.carrier.name } }
        : {}),
      anchorAt: result.anchorAt ? this._toIsoDate(result.anchorAt) : null,
      anchorSource: result.anchorSource,
      deadlineAt: result.deadlineAt ? this._toIsoDate(result.deadlineAt) : null,
      daysLeft: result.daysLeft,
      state: result.status,
      openEpisode: open
        ? {
            id: open.id,
            state: open.state,
            violatedAt: open.violatedAt ? open.violatedAt.toISOString() : null,
            reminder3SentAt: open.reminder3SentAt
              ? open.reminder3SentAt.toISOString()
              : null,
            reminder1SentAt: open.reminder1SentAt
              ? open.reminder1SentAt.toISOString()
              : null,
          }
        : null,
    };
  }

  private _summarize(items: GuaranteeComplianceItem[]) {
    let violated = 0;
    let dueSoon = 0;
    for (const i of items) {
      if (i.state === 'violated') violated += 1;
      else if (i.state === 'counting' && (i.daysLeft ?? 99) <= 3) dueSoon += 1;
    }
    return { violated, dueSoon, watched: items.length };
  }

  private _toEpisodeDto(r: GuaranteeEpisodeListRow): GuaranteeEpisodeDto {
    return {
      id: r.id,
      vehicleId: r.vehicleId,
      plateNumber: r.plateNumber,
      sideNumber: r.sideNumber,
      carrierId: r.carrierId,
      carrierName: r.carrierName,
      anchorAt: this._toIsoDate(r.anchorAt),
      anchorSource: r.anchorSource,
      deadlineAt: this._toIsoDate(r.deadlineAt),
      state: r.state,
      reminder3SentAt: r.reminder3SentAt ? r.reminder3SentAt.toISOString() : null,
      reminder1SentAt: r.reminder1SentAt ? r.reminder1SentAt.toISOString() : null,
      violationSentAt: r.violationSentAt ? r.violationSentAt.toISOString() : null,
      violatedAt: r.violatedAt ? r.violatedAt.toISOString() : null,
      resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
      resolvedByDelegationId: r.resolvedByDelegationId,
      resolvedDaysLeft: r.resolvedDaysLeft,
      resolvedReason: r.resolvedReason,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  /** Signed working days from `today` to an open episode's fixed deadline. */
  private _daysLeftForEpisode(open: GuaranteeEpisodeRow, today: Date): number {
    const result = computeGuaranteeWatchdog({
      today,
      hasActiveDelegation: false,
      lastReturnAt: open.anchorAt,
      agreementSince: null,
      config: {
        deadlineWorkingDays: this._deadlineWorkingDays(),
        reminderOffsets: this._reminderOffsets(),
      },
    });
    return result.daysLeft ?? 0;
  }

  private _anchorSource(result: GuaranteeWatchdogResult): PrismaAnchorSource {
    return result.anchorSource === 'agreement'
      ? PrismaAnchorSource.agreement
      : PrismaAnchorSource.zjechal;
  }

  private _deadlineWorkingDays(): number {
    return this.config.get('GUARANTEE_DEADLINE_WORKING_DAYS', { infer: true });
  }

  private _reminderOffsets(): number[] {
    return this.config.get('GUARANTEE_REMINDER_OFFSETS', { infer: true });
  }

  // ── Recipient resolution ─────────────────────────────────

  /**
   * Carrier-facing recipient — resolved EXACTLY as carrier-submitted / delegation-
   * announced do: `Carrier.user.email` (the login-user's email), NOT
   * `ordersEmail`. Delegated to the repository.
   */
  private _resolveCarrierEmail(userId: string): Promise<string | null> {
    return this.repo.findUserEmail(userId);
  }

  /** Opiekun recipient — personal `User.email` (NOT the DAF-OW@ group). */
  private _resolveOpiekun(
    opiekunId: string,
  ): Promise<{ email: string; name: string } | null> {
    return this.repo.findOpiekunRecipient(opiekunId);
  }

  // ── Formatting / config ──────────────────────────────────

  private _toIsoDate(d: Date): string {
    // Date-only `YYYY-MM-DD` from a UTC-midnight `@db.Date` / engine Date.
    return d.toISOString().slice(0, 10);
  }

  private _fmtDate(d: Date): string {
    return new Intl.DateTimeFormat('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(d);
  }

  private _buildDeeplink(): string {
    const appUrl = this.config.get('APP_URL', { infer: true });
    // Carrier "zgłoś wyjazd" form — VERIFIED at apps/web
    // /carrier/delegations/new (the zgłoszenie-wyjazdu surface; the wniosek
    // form lives at /carrier/claims/new and is NOT this).
    return `${appUrl.replace(/\/$/u, '')}/carrier/delegations/new`;
  }

  private _warnMail(
    kind: string,
    err: unknown,
    extra: Record<string, unknown>,
  ): void {
    this.logger.warn({
      msg: `guarantee watchdog ${kind} could not be dispatched — stamps released`,
      ...extra,
      ...describeError(err),
    });
  }
}
