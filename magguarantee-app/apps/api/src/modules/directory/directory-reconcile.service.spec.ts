// The reconcile pass (docs/24 §A4).
//
// Two failure modes are worth more than the rest of this suite combined:
// silently disabling the whole company because MAGSpace answered oddly, and
// silently disabling the people an admin approved by hand. Both get tests that
// say so.

import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { SchedulerRegistry } from '@nestjs/schedule';

import type { Env } from '../../config/env.schema';
import type { AuditWriter } from '../audit/audit.service';
import type { MailService } from '../mail/mail.service';
import type { UsersRepository, UserRow } from '../users/users.repository';
import { DirectoryReconcileService } from './directory-reconcile.service';
import type { DirectoryState } from './directory-state';
import type { DirectoryService } from './directory.service';
import { DirectoryUnavailableError, type MagspaceClient, type MagspaceEmployee } from './magspace.client';

const NOW = new Date('2026-09-09T12:00:00.000Z');

function employee(over: Partial<MagspaceEmployee> = {}): MagspaceEmployee {
  return {
    id: 'emp-1',
    email: 'jan.kowalski@magtrans.eu',
    firstName: 'Jan',
    lastName: 'Kowalski',
    active: true,
    stanowisko: { code: 'PLANISTA', name: 'Planista' },
    employedFrom: null,
    employedTo: null,
    updatedAt: NOW.toISOString(),
    ...over,
  };
}

function user(over: Partial<UserRow> = {}): UserRow {
  return {
    id: 'u-1',
    login: 'jan.kowalski',
    email: 'jan.kowalski@magtrans.eu',
    passwordHash: null,
    role: 'planista',
    name: 'Jan Kowalski',
    active: true,
    liderEmail: null,
    teamId: null,
    mustChangePassword: false,
    passwordChangedAt: null,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    authProvider: 'google',
    managedBy: 'magspace',
    googleSub: 'sub-1',
    magspaceEmployeeId: 'emp-1',
    directorySyncedAt: NOW,
    roleOverride: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
    deletedAt: over.deletedAt ?? null,
  };
}

function makeHarness(opts: {
  managed?: UserRow[];
  localStaff?: UserRow[];
  roster?: MagspaceEmployee[];
  mode?: 'enforce' | 'report';
  roleFor?: (s: MagspaceEmployee['stanowisko']) => string | null;
  rosterFails?: boolean;
  failureSince?: Date;
  alreadyAlerted?: boolean;
} = {}) {
  const magspace = {
    isConfigured: true,
    listAll: jest.fn(async () => {
      if (opts.rosterFails) throw new DirectoryUnavailableError('down');
      return { items: opts.roster ?? [], generatedAt: NOW.toISOString() };
    }),
  } as unknown as jest.Mocked<MagspaceClient>;

  const directory = {
    deprovision: jest.fn(async () => undefined),
    roleFor: jest.fn(async (s: MagspaceEmployee['stanowisko']) =>
      opts.roleFor ? opts.roleFor(s) : s ? 'planista' : null,
    ),
  } as unknown as jest.Mocked<DirectoryService>;

  const users = {
    listManagedByDirectory: jest.fn(async () => opts.managed ?? []),
    listLocalStaff: jest.fn(async () => opts.localStaff ?? []),
    listByRole: jest.fn(async () => [
      user({ id: 'a-1', login: 'admin', email: 'admin@magtrans.eu', role: 'admin', managedBy: 'local' }),
    ]),
    update: jest.fn(async (id: string, data: Partial<UserRow>) => user({ id, ...data })),
  } as unknown as jest.Mocked<UsersRepository>;

  const state = {
    markReconcileRun: jest.fn(async () => undefined),
    clearFailure: jest.fn(async () => undefined),
    markFailureAlerted: jest.fn(async () => undefined),
    recordFailure: jest.fn(async () => ({
      since: opts.failureSince ?? NOW,
      alreadyAlerted: opts.alreadyAlerted ?? false,
    })),
  } as unknown as jest.Mocked<DirectoryState>;

  const mail = {
    enqueueDirectoryReconcileReport: jest.fn(async () => undefined),
  } as unknown as jest.Mocked<MailService>;

  const audit = { log: jest.fn(async () => undefined) } as unknown as jest.Mocked<AuditWriter>;

  const config = {
    get: (key: keyof Env) => {
      switch (key) {
        case 'DIRECTORY_RECONCILE_MODE':
          return opts.mode ?? 'enforce';
        case 'DIRECTORY_RECONCILE_ENABLED':
          return true;
        case 'DIRECTORY_RECONCILE_INTERVAL_MIN':
          return 15;
        default:
          return undefined;
      }
    },
  } as unknown as ConfigService<Env, true>;

  const scheduler = {
    addInterval: jest.fn(),
    deleteInterval: jest.fn(),
    doesExist: jest.fn(() => false),
  } as unknown as jest.Mocked<SchedulerRegistry>;

  const svc = new DirectoryReconcileService(
    magspace,
    directory,
    users,
    state,
    mail,
    audit,
    config,
    scheduler,
  );
  return { svc, magspace, directory, users, state, mail, audit, scheduler };
}

/** 12 managed users so the 30 % valve sits above the 5-account floor. */
function manyManaged(n: number): UserRow[] {
  return Array.from({ length: n }, (_, i) =>
    user({
      id: `u-${i}`,
      login: `user${i}`,
      email: `user${i}@magtrans.eu`,
      magspaceEmployeeId: `emp-${i}`,
    }),
  );
}

describe('DirectoryReconcileService.run', () => {
  it('does nothing when the directory is not configured', async () => {
    const h = makeHarness();
    (h.magspace as unknown as { isConfigured: boolean }).isConfigured = false;

    await expect(h.svc.run(NOW)).resolves.toMatchObject({
      ran: false,
      skippedReason: 'not_configured',
    });
    expect(h.magspace.listAll).not.toHaveBeenCalled();
  });

  it('disables an account whose employee is terminated', async () => {
    const u = user();
    const h = makeHarness({
      managed: [u],
      roster: [employee({ active: false })],
    });

    await h.svc.run(NOW);

    expect(h.directory.deprovision).toHaveBeenCalledWith(u, 'reconcile_inactive');
  });

  it('disables an account whose employee vanished from the roster', async () => {
    const u = user();
    const h = makeHarness({ managed: [u], roster: [employee({ id: 'someone-else', email: 'x@magtrans.eu' })] });

    await h.svc.run(NOW);

    expect(h.directory.deprovision).toHaveBeenCalledWith(u, 'reconcile_not_found');
  });

  it('disables an account whose stanowisko lost its mapping', async () => {
    const u = user();
    const h = makeHarness({ managed: [u], roster: [employee()], roleFor: () => null });

    await h.svc.run(NOW);

    expect(h.directory.deprovision).toHaveBeenCalledWith(u, 'reconcile_unmapped');
  });

  it('NEVER disables a hand-approved user whose stanowisko is unmapped', async () => {
    // The manual-approval path (docs/24 §4). Their stanowisko is unmapped by
    // design and always will be — without the roleOverride branch, the very
    // people an admin approved would be disabled every fifteen minutes.
    const u = user({ role: 'weryfikator', roleOverride: 'weryfikator' });
    const h = makeHarness({
      managed: [u],
      roster: [employee({ stanowisko: { code: 'CONTROLLING', name: 'Controlling' } })],
      roleFor: () => null,
    });

    await h.svc.run(NOW);

    expect(h.directory.deprovision).not.toHaveBeenCalled();
    expect(h.directory.roleFor).not.toHaveBeenCalled();
  });

  it('never re-points a hand-approved user at the mapped role', async () => {
    const u = user({ role: 'weryfikator', roleOverride: 'weryfikator' });
    const h = makeHarness({ managed: [u], roster: [employee()], roleFor: () => 'planista' });

    await h.svc.run(NOW);

    expect(h.users.update).not.toHaveBeenCalledWith(
      u.id,
      expect.objectContaining({ role: 'planista' }),
    );
  });

  it('applies a changed role and audits it as a system action', async () => {
    const u = user({ role: 'dyspozytor' });
    const h = makeHarness({ managed: [u], roster: [employee()], roleFor: () => 'planista' });

    await h.svc.run(NOW);

    expect(h.users.update).toHaveBeenCalledWith(
      u.id,
      expect.objectContaining({ role: 'planista' }),
    );
    expect(h.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'system.syncUserFromDirectory', actor: 'system' }),
    );
  });

  it('propagates a renamed employee', async () => {
    const u = user({ name: 'Jan Kowalski' });
    const h = makeHarness({
      managed: [u],
      roster: [employee({ lastName: 'Kowalska-Nowak' })],
    });

    await h.svc.run(NOW);

    expect(h.users.update).toHaveBeenCalledWith(
      u.id,
      expect.objectContaining({ name: 'Jan Kowalska-Nowak' }),
    );
  });

  it('matches on the MAGSpace id even after a Workspace e-mail rename', async () => {
    const u = user({ email: 'old.address@magtrans.eu' });
    const h = makeHarness({
      managed: [u],
      roster: [employee({ id: 'emp-1', email: 'new.address@magtrans.eu' })],
    });

    await h.svc.run(NOW);

    expect(h.directory.deprovision).not.toHaveBeenCalled();
  });

  it('sends nothing when the run is quiet', async () => {
    const h = makeHarness({ managed: [user()], roster: [employee()] });

    await h.svc.run(NOW);

    expect(h.mail.enqueueDirectoryReconcileReport).not.toHaveBeenCalled();
  });

  // ── the safety valve ────────────────────────────────────

  it('aborts and changes NOTHING when the roster comes back empty', async () => {
    // An empty roster cannot mean "everyone was fired" — only that the answer
    // was not real. This is the single most destructive thing this job could do.
    const h = makeHarness({ managed: manyManaged(12), roster: [] });

    await expect(h.svc.run(NOW)).resolves.toMatchObject({ aborted: true });

    expect(h.directory.deprovision).not.toHaveBeenCalled();
    expect(h.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'system.abortDirectoryReconcile',
        reason: 'empty roster',
      }),
    );
    expect(h.mail.enqueueDirectoryReconcileReport).toHaveBeenCalledWith(
      'admin@magtrans.eu',
      expect.objectContaining({ aborted: true }),
    );
  });

  it('aborts when a run would disable more than 30 % of the managed users', async () => {
    const managed = manyManaged(20);
    // Roster only knows the first 5 → 15 would be disabled, over the limit of 6.
    const roster = managed.slice(0, 5).map((u, i) => employee({ id: `emp-${i}`, email: u.email }));
    const h = makeHarness({ managed, roster });

    await expect(h.svc.run(NOW)).resolves.toMatchObject({ aborted: true });
    expect(h.directory.deprovision).not.toHaveBeenCalled();
  });

  it('allows a small purge to go through — the floor is 5 accounts', async () => {
    // 4 of 6, which is over 30 % but under the absolute floor: a genuinely
    // small company must not be permanently blocked by the percentage rule.
    const managed = manyManaged(6);
    const roster = managed.slice(0, 2).map((u, i) => employee({ id: `emp-${i}`, email: u.email }));
    const h = makeHarness({ managed, roster });

    await expect(h.svc.run(NOW)).resolves.toMatchObject({ aborted: false, deprovisioned: 4 });
    expect(h.directory.deprovision).toHaveBeenCalledTimes(4);
  });

  // ── report mode ─────────────────────────────────────────

  it('in report mode it decides everything and applies nothing', async () => {
    const h = makeHarness({
      managed: [user()],
      roster: [employee({ active: false })],
      mode: 'report',
    });

    await h.svc.run(NOW);

    expect(h.directory.deprovision).not.toHaveBeenCalled();
    expect(h.users.update).not.toHaveBeenCalled();
    expect(h.mail.enqueueDirectoryReconcileReport).toHaveBeenCalledWith(
      'admin@magtrans.eu',
      expect.objectContaining({ mode: 'report', deprovisioned: [expect.anything()] }),
    );
  });

  // ── local accounts ──────────────────────────────────────

  it('reports, but never disables, a locally-managed staff account of a departed employee', async () => {
    // `local` includes every admin. Auto-disabling one is how you lock yourself
    // out of your own system during an incident.
    const localAdmin = user({
      id: 'a-2',
      login: 'old.admin',
      email: 'old.admin@magtrans.eu',
      role: 'admin',
      managedBy: 'local',
    });
    const h = makeHarness({
      managed: [],
      localStaff: [localAdmin],
      roster: [employee({ id: 'emp-9', email: 'old.admin@magtrans.eu', active: false })],
    });

    await h.svc.run(NOW);

    expect(h.directory.deprovision).not.toHaveBeenCalled();
    expect(h.mail.enqueueDirectoryReconcileReport).toHaveBeenCalledWith(
      'admin@magtrans.eu',
      expect.objectContaining({ localNotices: [expect.objectContaining({ login: 'old.admin' })] }),
    );
  });

  // ── outages ─────────────────────────────────────────────

  it('skips the run quietly when MAGSpace is briefly unreachable', async () => {
    const h = makeHarness({ rosterFails: true, failureSince: NOW });

    await expect(h.svc.run(NOW)).resolves.toMatchObject({
      ran: false,
      skippedReason: 'unavailable',
    });
    expect(h.mail.enqueueDirectoryReconcileReport).not.toHaveBeenCalled();
    // Crucially: a directory we cannot reach disables nobody.
    expect(h.directory.deprovision).not.toHaveBeenCalled();
  });

  it('alerts once when the outage passes two hours', async () => {
    const threeHoursAgo = new Date(NOW.getTime() - 3 * 60 * 60 * 1000);
    const h = makeHarness({ rosterFails: true, failureSince: threeHoursAgo });

    await h.svc.run(NOW);

    expect(h.mail.enqueueDirectoryReconcileReport).toHaveBeenCalled();
    expect(h.state.markFailureAlerted).toHaveBeenCalled();
  });

  it('does not re-alert for an outage it already reported', async () => {
    const threeHoursAgo = new Date(NOW.getTime() - 3 * 60 * 60 * 1000);
    const h = makeHarness({
      rosterFails: true,
      failureSince: threeHoursAgo,
      alreadyAlerted: true,
    });

    await h.svc.run(NOW);

    expect(h.mail.enqueueDirectoryReconcileReport).not.toHaveBeenCalled();
  });

  it('clears the outage state after a successful run', async () => {
    const h = makeHarness({ managed: [user()], roster: [employee()] });

    await h.svc.run(NOW);

    expect(h.state.clearFailure).toHaveBeenCalled();
    expect(h.state.markReconcileRun).toHaveBeenCalledWith(NOW);
  });

  // ── report dispatch visibility (logging audit item 11) ─────

  it('logs the reason for every admin whose report could not be enqueued', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const h = makeHarness({
      managed: [user({ id: 'u-9', login: 'gone' })],
      roster: [],
      // An empty roster with managed users aborts → the admins get a report.
    });
    h.mail.enqueueDirectoryReconcileReport.mockRejectedValueOnce(
      new Error('Queue is closed'),
    );

    await h.svc.run(NOW);

    const rejected = warn.mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .filter((l) => l.msg === 'directory reconcile report: enqueue rejected for admin');
    expect(rejected).toEqual([
      expect.objectContaining({
        report: 'aborted-run',
        adminId: 'a-1',
        errorName: 'Error',
        errorMessage: 'Queue is closed',
      }),
    ]);
    // The admin is identified by id — no address in the log line.
    expect(JSON.stringify(rejected)).not.toContain('admin@magtrans.eu');
    warn.mockRestore();
  });

  it('logs rejected outage alerts too', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const threeHoursAgo = new Date(NOW.getTime() - 3 * 60 * 60 * 1000);
    const h = makeHarness({ rosterFails: true, failureSince: threeHoursAgo });
    h.mail.enqueueDirectoryReconcileReport.mockRejectedValueOnce(new Error('boom'));

    await h.svc.run(NOW);

    expect(
      warn.mock.calls.some(
        (c) =>
          (c[0] as Record<string, unknown>).msg ===
            'directory reconcile report: enqueue rejected for admin' &&
          (c[0] as Record<string, unknown>).report === 'outage',
      ),
    ).toBe(true);
    warn.mockRestore();
  });
});

describe('DirectoryReconcileService scheduling', () => {
  it('registers a dynamic interval from env', async () => {
    const h = makeHarness();
    h.svc.onModuleInit();

    expect(h.scheduler.addInterval).toHaveBeenCalledWith(
      'directory-reconcile',
      expect.anything(),
    );
    h.svc.onModuleDestroy();
  });

  it('does not schedule when MAGSpace is unconfigured', () => {
    const h = makeHarness();
    (h.magspace as unknown as { isConfigured: boolean }).isConfigured = false;

    h.svc.onModuleInit();

    expect(h.scheduler.addInterval).not.toHaveBeenCalled();
  });
});
