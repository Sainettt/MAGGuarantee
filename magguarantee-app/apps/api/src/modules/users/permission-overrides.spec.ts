// Per-user permission overrides — the write side (docs/25 §3 B6).
//
// 1. The helpers: `assertOverridesFit` (the 422s of an admin write),
//    `overridePruneFor` (what a `(role, lider)` change drops),
//    `pruneAuditEntry` (the `system.pruneUserPermissions` row).
// 2. THE FOUR PRUNE SITES — every place that changes a user's `(role, lider)`
//    on an existing row, driven through its real service:
//      a. UsersService.update                 (admin, PATCH /users/:id)
//      b. DirectoryService.provisionOrSync    (sign-in sync, `_syncExisting`)
//      c. DirectoryService.grantAccess        («Nadaj dostęp», `_regrantExisting`)
//      d. DirectoryReconcileService.run       (reconcile, enforce mode)
//    Each one prunes in the SAME UPDATE as the pair; the three directory paths
//    record it as `system.pruneUserPermissions` and never SET the lists from
//    MAGSpace data. A census pins that these are the only callers of the
//    helper, so a fifth site shows up in review.
//
// The module specs (users.service.spec, directory*.spec) cover the same paths
// in their own context; this file is the one place that lists all four.

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import type { ConfigService } from '@nestjs/config';
import type { SchedulerRegistry } from '@nestjs/schedule';

import { AuditContext, type AuditContextStore } from '../../common/audit';
import type { Env } from '../../config/env.schema';
import type { AuditWriter } from '../audit/audit.service';
import type { RefreshTokenRepository } from '../auth/refresh-token.repository';
import type { PasswordService } from '../auth/password.service';
import { DirectoryReconcileService } from '../directory/directory-reconcile.service';
import type { DirectoryState } from '../directory/directory-state';
import { DirectoryService } from '../directory/directory.service';
import type { MagspaceClient, MagspaceEmployee } from '../directory/magspace.client';
import type { StanowiskoRoleMappingRepository } from '../directory/stanowisko-role-mapping.repository';
import type { MailService } from '../mail/mail.service';
import type { RedisService } from '../redis/redis.service';
import {
  PRUNE_USER_PERMISSIONS_AUDIT_ACTION,
  assertOverridesFit,
  overridePruneFor,
  pruneAuditEntry,
} from './permission-overrides';
import type { UsersRepository, UserRow } from './users.repository';
import { UsersService } from './users.service';

const NOW = new Date('2026-10-27T09:00:00.000Z');
const DELETE = 'carrier_documents.delete';
const READ = 'carrier_documents.read';
const ADD = 'carrier_documents.add';
const DECIDE = 'vehicles.planner_transfer.decide';

function row(over: Partial<UserRow> = {}): UserRow {
  return {
    id: 'u-1',
    login: 'jan.kowalski',
    email: 'jan.kowalski@magtrans.eu',
    passwordHash: null,
    role: 'opiekun',
    name: 'Jan Kowalski',
    active: true,
    liderId: null,
    teamId: null,
    mustChangePassword: false,
    passwordChangedAt: null,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    authProvider: 'google',
    managedBy: 'magspace',
    googleSub: 'g-1',
    magspaceEmployeeId: 'emp-1',
    directorySyncedAt: NOW,
    roleOverride: null,
    lider: false,
    extraPermissions: [],
    deniedPermissions: [],
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...over,
  };
}

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

// ─── 1. helpers ──────────────────────────────────────────────

describe('assertOverridesFit', () => {
  const fails = (fn: () => void, code: string, permissions: string[]) => {
    expect(fn).toThrow(
      expect.objectContaining({
        status: 422,
        response: expect.objectContaining({ extensions: { code, permissions } }),
      }),
    );
  };

  it('passes when nothing is sent', () => {
    expect(() => assertOverridesFit({ role: 'admin', lider: false }, {})).not.toThrow();
  });

  it('extra must be in GRANTABLE_EXTRA[role] — offending ids listed in the order sent', () => {
    expect(() => assertOverridesFit({ role: 'przewoznik', lider: false }, { extra: [READ, ADD] })).not.toThrow();
    fails(
      () => assertOverridesFit({ role: 'przewoznik', lider: false }, { extra: [DELETE, READ, 'users.manage'] }),
      'USER_PERMISSION_NOT_GRANTABLE',
      [DELETE, 'users.manage'],
    );
    fails(() => assertOverridesFit({ role: 'opiekun', lider: false }, { extra: [READ] }), 'USER_PERMISSION_NOT_GRANTABLE', [READ]);
  });

  it('denied must be in permissionsFor(role, lider)', () => {
    expect(() => assertOverridesFit({ role: 'planista', lider: true }, { denied: [DECIDE] })).not.toThrow();
    fails(
      () => assertOverridesFit({ role: 'planista', lider: false }, { denied: [DECIDE, 'gps.read'] }),
      'USER_PERMISSION_NOT_REVOCABLE',
      [DECIDE],
    );
  });

  it('admin: any denial is refused, the whole list echoed; [] is fine', () => {
    fails(
      () => assertOverridesFit({ role: 'admin', lider: false }, { denied: ['users.manage', 'audit.read'] }),
      'USER_ADMIN_CANNOT_BE_DENIED',
      ['users.manage', 'audit.read'],
    );
    expect(() => assertOverridesFit({ role: 'admin', lider: false }, { denied: [] })).not.toThrow();
  });
});

describe('overridePruneFor', () => {
  it('null when (role, lider) does not change — even with inert entries stored', () => {
    expect(overridePruneFor(row({ deniedPermissions: ['gone.permission'] }), { role: 'opiekun', lider: false })).toBeNull();
  });

  it('null when the pair changes but every stored entry still fits', () => {
    expect(overridePruneFor(row({ deniedPermissions: ['vehicles.read'] }), { role: 'planista', lider: false })).toBeNull();
  });

  it('both lists, catalog order, plus what was removed', () => {
    expect(
      overridePruneFor(row({ deniedPermissions: [DELETE, 'vehicles.read'] }), { role: 'planista', lider: false }),
    ).toEqual({
      data: { extraPermissions: [], deniedPermissions: ['vehicles.read'] },
      removed: { extra: [], denied: [DELETE] },
    });
  });

  it('a leader change alone triggers it', () => {
    expect(
      overridePruneFor(row({ role: 'planista', lider: true, deniedPermissions: [DECIDE] }), {
        role: 'planista',
        lider: false,
      }),
    ).toEqual({ data: { extraPermissions: [], deniedPermissions: [] }, removed: { extra: [], denied: [DECIDE] } });
  });
});

describe('pruneAuditEntry', () => {
  it('a system row with the pair and both lists before → after', () => {
    const user = row({ deniedPermissions: [DELETE, 'vehicles.read'] });
    const next = { role: 'planista' as const, lider: false };
    const prune = overridePruneFor(user, next);
    expect(prune).not.toBeNull();

    expect(pruneAuditEntry(user, next, prune!, 'reconcile')).toEqual({
      action: 'system.pruneUserPermissions',
      targetType: 'User',
      targetKey: 'jan.kowalski',
      before: { role: 'opiekun', lider: false, extraPermissions: [], deniedPermissions: [DELETE, 'vehicles.read'] },
      after: { role: 'planista', lider: false, extraPermissions: [], deniedPermissions: ['vehicles.read'] },
      metadata: { trigger: 'reconcile', removed: { extra: [], denied: [DELETE] } },
      actor: 'system',
    });
  });
});

// ─── 2. the four prune sites ─────────────────────────────────

/** A stored row that a move opiekun → planista must prune. */
const STALE = (over: Partial<UserRow> = {}): UserRow =>
  row({ role: 'opiekun', deniedPermissions: [DELETE, 'vehicles.read'], ...over });

const PRUNED = { extraPermissions: [], deniedPermissions: ['vehicles.read'] };

function directoryHarness(existing: UserRow) {
  const users = {
    update: jest.fn(async (id: string, data: Partial<UserRow>) => ({ ...existing, id, ...data })),
    findByEmailIncludingDeleted: jest.fn(async () => existing),
    createFromDirectory: jest.fn(),
    existsLogin: jest.fn(async () => false),
  } as unknown as jest.Mocked<UsersRepository>;
  const magspace = {
    isConfigured: true,
    lookupByEmail: jest.fn(async () => employee({ stanowisko: { code: 'CONTROLLING', name: 'Controlling' } })),
  } as unknown as jest.Mocked<MagspaceClient>;
  const audit = { log: jest.fn(async () => undefined) } as unknown as jest.Mocked<AuditWriter>;
  const svc = new DirectoryService(
    magspace,
    { findByCode: jest.fn(async () => null) } as unknown as StanowiskoRoleMappingRepository,
    users,
    {} as RefreshTokenRepository,
    {} as MailService,
    {} as RedisService,
    audit,
    { get: () => undefined } as unknown as ConfigService<Env, true>,
  );
  return { svc, users, audit };
}

function auditActions(audit: jest.Mocked<AuditWriter>): string[] {
  return audit.log.mock.calls.map(([entry]) => entry.action);
}

describe('the four prune sites', () => {
  it('a. UsersService.update — prune in the same UPDATE; recorded by updateUser (no system row)', async () => {
    const stored = STALE({ managedBy: 'local', id: 'u-loc' });
    const repo = {
      findById: jest.fn(async () => stored),
      update: jest.fn(async (id: string, data: Partial<UserRow>) => ({ ...stored, id, ...data })),
      findLiderMinis: jest.fn(async () => new Map()),
    } as unknown as jest.Mocked<UsersRepository>;
    const svc = new UsersService(repo, {} as PasswordService, {} as RefreshTokenRepository);

    const out = await svc.update('u-loc', { role: 'planista' });

    expect(repo.update).toHaveBeenCalledTimes(1);
    expect(repo.update).toHaveBeenCalledWith('u-loc', { role: 'planista', ...PRUNED });
    expect(out).toMatchObject({ role: 'planista', ...PRUNED });
  });

  it('b. DirectoryService sign-in sync — same UPDATE + system.pruneUserPermissions (trigger signIn)', async () => {
    const existing = STALE();
    const h = directoryHarness(existing);

    await h.svc.provisionOrSync({
      existing,
      employee: employee(),
      role: 'planista',
      lider: false,
      googleSub: 'g-1',
    });

    expect(h.users.update).toHaveBeenCalledTimes(1);
    expect(h.users.update).toHaveBeenCalledWith('u-1', expect.objectContaining({ role: 'planista', ...PRUNED }));
    expect(auditActions(h.audit)).toEqual(['syncUserFromDirectory', PRUNE_USER_PERMISSIONS_AUDIT_ACTION]);
    expect(h.audit.log).toHaveBeenLastCalledWith(
      expect.objectContaining({ actor: 'system', metadata: { trigger: 'signIn', removed: { extra: [], denied: [DELETE] } } }),
    );
  });

  it('c. DirectoryService.grantAccess — same UPDATE + system.pruneUserPermissions (trigger grantAccess)', async () => {
    const h = directoryHarness(STALE());
    const store: AuditContextStore = {
      actor: { userId: 'admin-1', userRole: 'admin' } as AuditContextStore['actor'],
      ipAddress: null,
    };

    await AuditContext.run(store, () => h.svc.grantAccess('jan.kowalski@magtrans.eu', 'planista'));

    expect(h.users.update).toHaveBeenCalledTimes(1);
    expect(h.users.update).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ role: 'planista', roleOverride: 'planista', ...PRUNED }),
    );
    expect(auditActions(h.audit)).toEqual([PRUNE_USER_PERMISSIONS_AUDIT_ACTION]);
    expect(h.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ actor: 'system', metadata: expect.objectContaining({ trigger: 'grantAccess' }) }),
    );
  });

  it('d. DirectoryReconcileService.run — same UPDATE + system.pruneUserPermissions (trigger reconcile)', async () => {
    const stale = STALE();
    const users = {
      listManagedByDirectory: jest.fn(async () => [stale]),
      listLocalStaff: jest.fn(async () => []),
      listByRole: jest.fn(async () => []),
      update: jest.fn(async (id: string, data: Partial<UserRow>) => ({ ...stale, id, ...data })),
    } as unknown as jest.Mocked<UsersRepository>;
    const audit = { log: jest.fn(async () => undefined) } as unknown as jest.Mocked<AuditWriter>;
    const svc = new DirectoryReconcileService(
      {
        isConfigured: true,
        listAll: jest.fn(async () => ({ items: [employee()], generatedAt: NOW.toISOString() })),
      } as unknown as MagspaceClient,
      { accessFor: jest.fn(async () => ({ role: 'planista', lider: false })) } as unknown as DirectoryService,
      users,
      {
        clearFailure: jest.fn(async () => undefined),
        markReconcileRun: jest.fn(async () => undefined),
      } as unknown as DirectoryState,
      { enqueueDirectoryReconcileReport: jest.fn(async () => undefined) } as unknown as MailService,
      audit,
      {
        get: (key: keyof Env) => (key === 'DIRECTORY_RECONCILE_MODE' ? 'enforce' : undefined),
      } as unknown as ConfigService<Env, true>,
      {} as SchedulerRegistry,
    );

    await svc.run(NOW);

    expect(users.update).toHaveBeenCalledWith('u-1', expect.objectContaining({ role: 'planista', ...PRUNED }));
    expect(auditActions(audit)).toEqual(['system.syncUserFromDirectory', PRUNE_USER_PERMISSIONS_AUDIT_ACTION]);
    expect(audit.log).toHaveBeenLastCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ trigger: 'reconcile' }) }),
    );
  });

  it('census: these four are the only callers of overridePruneFor in src/', () => {
    const src = join(__dirname, '..', '..');
    const callers: Record<string, number> = {};
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path);
        } else if (/\.tsx?$/.test(entry.name) && !/\.spec\.tsx?$/.test(entry.name)) {
          const source = readFileSync(path, 'utf8').replace(/export function overridePruneFor\(/g, '');
          const calls = (source.match(/\boverridePruneFor\(/g) ?? []).length;
          if (calls > 0) callers[relative(src, path).replace(/\\/g, '/')] = calls;
        }
      }
    };
    walk(src);

    expect(callers).toEqual({
      'modules/directory/directory-reconcile.service.ts': 1, // d. run
      'modules/directory/directory.service.ts': 2, // b. _syncExisting, c. _regrantExisting
      'modules/users/users.service.ts': 1, // a. update → _resolveOverrides
    });
  });
});
