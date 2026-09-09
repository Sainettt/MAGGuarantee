// Pull-based deprovisioning: keep MAGGuarantee's directory-managed accounts in
// step with MAGSpace (docs/24 §A4).
//
// MAGSpace sends nothing on its own, so we ask. Every run pulls the full roster
// — active AND terminated, which is what lets us tell "left the company" from
// "vanished from the contract" — and reconciles it against every
// `managedBy = 'magspace'` user.
//
// The interval comes from env, which rules out `@Cron`: a cron expression is
// fixed at decoration time. `SchedulerRegistry.addInterval` in `onModuleInit`
// is the standard Nest answer and the only dynamic schedule in this codebase;
// everything else here follows the shape of the four `@Cron` jobs.
//
// Like those four, this runs IN-PROCESS: N replicas would reconcile N times.
// That is harmless (the work is idempotent) but wasteful, and the alert mails
// would multiply. Before scaling out, gate the body behind a Redis lock keyed
// on the run minute.

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';

import type { Env } from '../../config/env.schema';
import { AuditWriter } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import type {
  DirectoryReconcileReportProps,
  ReconcileDeprovisionRow,
  ReconcileLocalNoticeRow,
  ReconcileRoleChangeRow,
} from '../mail/templates/directory-reconcile-report';
import { UsersRepository, type UserRow } from '../users/users.repository';
import { DirectoryState } from './directory-state';
import { DirectoryService, type DeprovisionReason } from './directory.service';
import { MagspaceClient, type MagspaceEmployee } from './magspace.client';

const INTERVAL_NAME = 'directory-reconcile';

/**
 * Safety valve. A run may disable at most this many accounts, or this fraction
 * of the managed population, whichever is larger — beyond that it refuses to
 * act and alerts instead.
 *
 * The failure this guards against is not "many people were fired on the same
 * day"; it is a contract or configuration fault — an empty roster, a rotated
 * token, a MAGSpace deploy that changed a field name — quietly locking the
 * whole company out. Doing nothing and shouting is strictly the better answer.
 */
const ABORT_MIN_ABSOLUTE = 5;
const ABORT_MAX_FRACTION = 0.3;

/** How long MAGSpace may be unreachable before the admins hear about it. */
const OUTAGE_ALERT_AFTER_MS = 2 * 60 * 60 * 1000;

const REASON_LABELS: Record<DeprovisionReason, string> = {
  not_found: 'brak w MAGSpace',
  inactive: 'pracownik nieaktywny',
  unmapped: 'stanowisko bez przypisanej roli',
  reconcile_not_found: 'brak w MAGSpace',
  reconcile_inactive: 'pracownik nieaktywny',
  reconcile_unmapped: 'stanowisko bez przypisanej roli',
};

/** What a run decided, before anything was applied. */
interface ReconcilePlan {
  deprovision: { user: UserRow; reason: DeprovisionReason }[];
  roleChanges: { user: UserRow; toRole: UserRow['role'] }[];
  nameChanges: { user: UserRow; name: string | null }[];
  localNotices: UserRow[];
  managedTotal: number;
}

export interface ReconcileOutcome {
  ran: boolean;
  skippedReason?: 'disabled' | 'not_configured' | 'unavailable';
  aborted?: boolean;
  deprovisioned?: number;
  roleChanged?: number;
}

@Injectable()
export class DirectoryReconcileService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DirectoryReconcileService.name);
  /**
   * Kept alongside the registry entry so shutdown can `clearInterval` directly.
   * Relying on `SchedulerRegistry.deleteInterval` alone is not enough in tests,
   * where the registry is a mock — and an un-cleared interval keeps the Node
   * event loop alive, which turns a passing suite into a hanging one.
   */
  private handle: NodeJS.Timeout | null = null;

  constructor(
    private readonly magspace: MagspaceClient,
    private readonly directory: DirectoryService,
    private readonly users: UsersRepository,
    private readonly state: DirectoryState,
    private readonly mail: MailService,
    private readonly audit: AuditWriter,
    private readonly config: ConfigService<Env, true>,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    if (!this.config.get('DIRECTORY_RECONCILE_ENABLED', { infer: true })) {
      this.logger.log({ msg: 'directory reconcile disabled by env, not scheduling' });
      return;
    }
    if (!this.magspace.isConfigured) {
      this.logger.warn({
        msg: 'directory reconcile not scheduled — MAGSPACE_INTERNAL_TOKEN is unset',
      });
      return;
    }
    const minutes = this.config.get('DIRECTORY_RECONCILE_INTERVAL_MIN', { infer: true });
    const handle = setInterval(() => {
      // Fire-and-forget: `setInterval` cannot await, and a failed run must not
      // take the process down. Every failure path inside logs for itself.
      void this.run().catch((err: unknown) => {
        this.logger.error({
          msg: 'directory reconcile threw',
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, minutes * 60_000);
    this.handle = handle;
    this.scheduler.addInterval(INTERVAL_NAME, handle);
    this.logger.log({ msg: 'directory reconcile scheduled', everyMinutes: minutes });
  }

  onModuleDestroy(): void {
    // Jest and the dev watcher both re-instantiate the module; an orphaned
    // interval would keep the process alive and double up.
    if (this.handle) {
      clearInterval(this.handle);
      this.handle = null;
    }
    if (this.scheduler.doesExist('interval', INTERVAL_NAME)) {
      this.scheduler.deleteInterval(INTERVAL_NAME);
    }
  }

  /**
   * One reconcile pass. Exposed (and taking `now`) so a spec can drive it
   * directly, the same way the four `@Cron` services do.
   */
  async run(now: Date = new Date()): Promise<ReconcileOutcome> {
    if (!this.magspace.isConfigured) {
      return { ran: false, skippedReason: 'not_configured' };
    }

    let roster: MagspaceEmployee[];
    let generatedAt: string;
    try {
      const res = await this.magspace.listAll();
      roster = res.items;
      generatedAt = res.generatedAt;
    } catch (err) {
      await this._handleOutage(now, err);
      return { ran: false, skippedReason: 'unavailable' };
    }
    await this.state.clearFailure();

    const managed = await this.users.listManagedByDirectory();
    const plan = await this._plan(managed, roster);

    const mode = this.config.get('DIRECTORY_RECONCILE_MODE', { infer: true });
    const limit = Math.max(
      ABORT_MIN_ABSOLUTE,
      Math.floor(plan.managedTotal * ABORT_MAX_FRACTION),
    );
    // An empty roster with a non-empty managed population is always a fault:
    // it cannot mean "everyone was fired", only "the answer was not real".
    const emptyRoster = roster.length === 0 && plan.managedTotal > 0;
    const aborted = emptyRoster || plan.deprovision.length > limit;

    if (aborted) {
      this.logger.error({
        msg: 'directory reconcile aborted by the safety valve',
        wouldDisable: plan.deprovision.length,
        managedTotal: plan.managedTotal,
        limit,
        rosterSize: roster.length,
        generatedAt,
      });
      await this.audit.log({
        action: 'system.abortDirectoryReconcile',
        reason: emptyRoster ? 'empty roster' : 'too many deprovisions',
        metadata: {
          wouldDisable: plan.deprovision.length,
          managedTotal: plan.managedTotal,
          limit,
          rosterSize: roster.length,
        },
        actor: 'system',
      });
      await this._report(now, mode, plan, true, {
        wouldDisable: plan.deprovision.length,
        managedTotal: plan.managedTotal,
      });
      await this.state.markReconcileRun(now);
      return { ran: true, aborted: true };
    }

    if (mode === 'enforce') {
      for (const item of plan.deprovision) {
        await this.directory.deprovision(item.user, item.reason);
      }
      for (const change of plan.roleChanges) {
        await this.users.update(change.user.id, {
          role: change.toRole,
          directorySyncedAt: now,
        });
        await this.audit.log({
          action: 'system.syncUserFromDirectory',
          targetType: 'User',
          targetKey: change.user.login,
          before: { role: change.user.role },
          after: { role: change.toRole },
          actor: 'system',
        });
      }
      for (const change of plan.nameChanges) {
        await this.users.update(change.user.id, {
          name: change.name,
          directorySyncedAt: now,
        });
      }
    }

    await this.state.markReconcileRun(now);
    await this._report(now, mode, plan, false, null);

    this.logger.log({
      msg: 'directory reconcile finished',
      mode,
      managedTotal: plan.managedTotal,
      rosterSize: roster.length,
      deprovisioned: plan.deprovision.length,
      roleChanges: plan.roleChanges.length,
      nameChanges: plan.nameChanges.length,
      localNotices: plan.localNotices.length,
    });
    return {
      ran: true,
      aborted: false,
      deprovisioned: plan.deprovision.length,
      roleChanged: plan.roleChanges.length,
    };
  }

  // ── internals ──────────────────────────────────────────

  /**
   * Decides what should change, touching nothing. Keeping the decision separate
   * from the application is what makes both the safety valve and `report` mode
   * possible — and it means the two modes can never disagree about what a run
   * would have done.
   */
  private async _plan(
    managed: UserRow[],
    roster: MagspaceEmployee[],
  ): Promise<ReconcilePlan> {
    const byId = new Map(roster.map((e) => [e.id, e]));
    const byEmail = new Map(roster.map((e) => [e.email.toLowerCase(), e]));

    const plan: ReconcilePlan = {
      deprovision: [],
      roleChanges: [],
      nameChanges: [],
      localNotices: [],
      managedTotal: managed.length,
    };

    for (const user of managed) {
      // Match on the MAGSpace id first; the e-mail is the fallback for a row
      // provisioned before the id was recorded.
      const employee =
        (user.magspaceEmployeeId ? byId.get(user.magspaceEmployeeId) : undefined) ??
        byEmail.get(user.email.toLowerCase());

      if (!employee) {
        if (user.active) plan.deprovision.push({ user, reason: 'reconcile_not_found' });
        continue;
      }
      if (!employee.active) {
        if (user.active) plan.deprovision.push({ user, reason: 'reconcile_inactive' });
        continue;
      }

      // A hand-granted role exempts the account from the mapping entirely —
      // that is the whole point of `roleOverride` (docs/24 §4). Without this
      // branch, the very people an admin approved by hand would be disabled on
      // the next run, because their stanowisko is unmapped by design.
      if (user.roleOverride === null) {
        const role = await this.directory.roleFor(employee.stanowisko);
        if (!role) {
          if (user.active) plan.deprovision.push({ user, reason: 'reconcile_unmapped' });
          continue;
        }
        if (role !== user.role) plan.roleChanges.push({ user, toRole: role });
      }

      const name = `${employee.firstName} ${employee.lastName}`.trim() || null;
      if (name !== user.name) plan.nameChanges.push({ user, name });
    }

    // Advisory only: a locally-managed staff account whose owner has left. The
    // reconcile must never disable these — `local` includes every admin, and
    // auto-disabling an admin is how you lock yourself out of your own system.
    const localStaff = await this.users.listLocalStaff();
    for (const user of localStaff) {
      const employee = byEmail.get(user.email.toLowerCase());
      if (employee && !employee.active) plan.localNotices.push(user);
    }

    return plan;
  }

  /** Nothing to say → no mail. A quiet run is the normal case. */
  private async _report(
    now: Date,
    mode: 'enforce' | 'report',
    plan: ReconcilePlan,
    aborted: boolean,
    abortDetail: { wouldDisable: number; managedTotal: number } | null,
  ): Promise<void> {
    const hasNews =
      aborted ||
      plan.deprovision.length > 0 ||
      plan.roleChanges.length > 0 ||
      plan.localNotices.length > 0;
    if (!hasNews) return;

    const admins = await this.users.listByRole('admin');
    if (admins.length === 0) {
      this.logger.warn({ msg: 'directory reconcile has news but there is no active admin' });
      return;
    }

    const deprovisioned: ReconcileDeprovisionRow[] = plan.deprovision.map((d) => ({
      login: d.user.login,
      name: d.user.name,
      reasonLabel: REASON_LABELS[d.reason],
    }));
    const roleChanges: ReconcileRoleChangeRow[] = plan.roleChanges.map((c) => ({
      login: c.user.login,
      name: c.user.name,
      fromRole: c.user.role,
      toRole: c.toRole,
    }));
    const localNotices: ReconcileLocalNoticeRow[] = plan.localNotices.map((u) => ({
      login: u.login,
      name: u.name,
      role: u.role,
    }));

    const base: Omit<DirectoryReconcileReportProps, 'adminName'> = {
      runAtLabel: formatWarsawTimestamp(now),
      mode,
      aborted,
      abortDetail,
      deprovisioned,
      roleChanges,
      localNotices,
    };

    // Per-admin, so one bad address cannot swallow the rest of the report.
    await Promise.allSettled(
      admins.map((admin) =>
        this.mail.enqueueDirectoryReconcileReport(admin.email, {
          ...base,
          adminName: admin.name ?? admin.login,
        }),
      ),
    );
  }

  /**
   * MAGSpace is unreachable. A single failed run is a non-event — the next one
   * is fifteen minutes away and sign-in still works off the cached roles — so
   * we only escalate once the outage has lasted long enough to be a problem,
   * and only once per outage.
   */
  private async _handleOutage(now: Date, err: unknown): Promise<void> {
    const { since, alreadyAlerted } = await this.state.recordFailure(now);
    const downForMs = now.getTime() - since.getTime();
    this.logger.warn({
      msg: 'directory reconcile skipped — MAGSpace unavailable',
      downForMinutes: Math.round(downForMs / 60_000),
      error: err instanceof Error ? err.message : String(err),
    });

    if (alreadyAlerted || downForMs < OUTAGE_ALERT_AFTER_MS) return;

    const admins = await this.users.listByRole('admin');
    if (admins.length > 0) {
      await Promise.allSettled(
        admins.map((admin) =>
          this.mail.enqueueDirectoryReconcileReport(admin.email, {
            adminName: admin.name ?? admin.login,
            runAtLabel: formatWarsawTimestamp(now),
            mode: this.config.get('DIRECTORY_RECONCILE_MODE', { infer: true }),
            aborted: true,
            abortDetail: null,
            deprovisioned: [],
            roleChanges: [],
            localNotices: [],
          }),
        ),
      );
    }
    await this.state.markFailureAlerted();
    await this.audit.log({
      action: 'system.abortDirectoryReconcile',
      reason: 'magspace unreachable',
      metadata: { downForMinutes: Math.round(downForMs / 60_000) },
      actor: 'system',
    });
  }
}

/** dd.MM.yyyy HH:mm in the business timezone. */
function formatWarsawTimestamp(at: Date): string {
  const parts = new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'Europe/Warsaw',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(at);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}.${get('month')}.${get('year')} ${get('hour')}:${get('minute')}`;
}
