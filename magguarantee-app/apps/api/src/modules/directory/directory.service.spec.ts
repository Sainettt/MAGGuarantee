// Provisioning rules for directory-managed accounts (docs/24 §A2/§4).

import type { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.schema';
import type { AuditWriter } from '../audit/audit.service';
import type { RefreshTokenRepository } from '../auth/refresh-token.repository';
import type { MailService } from '../mail/mail.service';
import type { RedisService } from '../redis/redis.service';
import type { UsersRepository, UserRow } from '../users/users.repository';
import { DirectoryService } from './directory.service';
import {
  DirectoryUnavailableError,
  EmployeeNotFoundError,
  type MagspaceClient,
  type MagspaceEmployee,
} from './magspace.client';
import type { StanowiskoRoleMappingRepository } from './stanowisko-role-mapping.repository';

function makeEmployee(overrides: Partial<MagspaceEmployee> = {}): MagspaceEmployee {
  return {
    id: 'emp-1',
    email: 'jan.kowalski@magtrans.eu',
    firstName: 'Jan',
    lastName: 'Kowalski',
    active: true,
    stanowisko: { code: 'PLANISTA', name: 'Planista' },
    employedFrom: null,
    employedTo: null,
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

function makeUser(overrides: Partial<UserRow> = {}): UserRow {
  const now = new Date('2026-09-01T10:00:00.000Z');
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
    googleSub: 'google-sub-1',
    magspaceEmployeeId: 'emp-1',
    directorySyncedAt: now,
    roleOverride: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
    deletedAt: overrides.deletedAt ?? null,
  };
}

function makeHarness(opts: { existingLogins?: string[] } = {}) {
  const taken = new Set(opts.existingLogins ?? []);

  const users = {
    existsLogin: jest.fn(async (login: string) => taken.has(login)),
    createFromDirectory: jest.fn(async (data: Record<string, unknown>) =>
      makeUser({ ...(data as Partial<UserRow>) }),
    ),
    update: jest.fn(async (id: string, data: Partial<UserRow>) =>
      makeUser({ id, ...data }),
    ),
    listByRole: jest.fn(async () => [makeUser({ id: 'a-1', login: 'admin', role: 'admin', email: 'admin@magtrans.eu' })]),
  } as unknown as jest.Mocked<UsersRepository>;

  const mappings = {
    findByCode: jest.fn(async () => null),
  } as unknown as jest.Mocked<StanowiskoRoleMappingRepository>;

  const magspace = {
    lookupByEmail: jest.fn(),
    isConfigured: true,
  } as unknown as jest.Mocked<MagspaceClient>;

  const refreshTokens = {
    revokeAllForUser: jest.fn(async () => 3),
  } as unknown as jest.Mocked<RefreshTokenRepository>;

  const mail = {
    enqueueSsoAccessRequested: jest.fn(async () => undefined),
  } as unknown as jest.Mocked<MailService>;

  const redis = {
    client: { set: jest.fn(async () => 'OK') },
  } as unknown as RedisService;

  const audit = { log: jest.fn(async () => undefined) } as unknown as jest.Mocked<AuditWriter>;

  const config = {
    get: (key: keyof Env) => (key === 'APP_URL' ? 'https://mymag.magtrans.eu/' : undefined),
  } as unknown as ConfigService<Env, true>;

  const svc = new DirectoryService(
    magspace,
    mappings,
    users,
    refreshTokens,
    mail,
    redis,
    audit,
    config,
  );
  return { svc, users, mappings, magspace, refreshTokens, mail, redis, audit };
}

describe('DirectoryService.resolveEmployee', () => {
  it('separates "not an employee" from "could not ask"', async () => {
    // The whole safety of the login path rests on these two NOT collapsing into
    // one error: the first revokes access, the second must not.
    const h = makeHarness();
    h.magspace.lookupByEmail.mockRejectedValueOnce(new EmployeeNotFoundError());
    await expect(h.svc.resolveEmployee('x@magtrans.eu')).resolves.toEqual({
      kind: 'not_found',
    });

    h.magspace.lookupByEmail.mockRejectedValueOnce(new DirectoryUnavailableError('down'));
    await expect(h.svc.resolveEmployee('x@magtrans.eu')).resolves.toEqual({
      kind: 'unavailable',
    });
  });
});

describe('DirectoryService.roleFor', () => {
  it('returns null for a stanowisko with no mapping', async () => {
    const h = makeHarness();
    await expect(h.svc.roleFor({ code: 'CONTROLLING', name: 'Controlling' })).resolves.toBeNull();
  });

  it('treats "no stanowisko assigned" as no access, without hitting the table', async () => {
    const h = makeHarness();
    await expect(h.svc.roleFor(null)).resolves.toBeNull();
    expect(h.mappings.findByCode).not.toHaveBeenCalled();
  });

  it('returns the mapped role', async () => {
    const h = makeHarness();
    (h.mappings.findByCode as jest.Mock).mockResolvedValue({
      id: 'm-1',
      stanowiskoCode: 'PLANISTA',
      stanowiskoName: 'Planista',
      role: 'planista',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await expect(h.svc.roleFor({ code: 'PLANISTA', name: 'Planista' })).resolves.toBe('planista');
  });
});

describe('DirectoryService.allocateLogin', () => {
  it('uses the address local part when it is free', async () => {
    const h = makeHarness();
    await expect(h.svc.allocateLogin('jan.kowalski@magtrans.eu')).resolves.toBe('jan.kowalski');
  });

  it('appends -2, then -3, on collisions', async () => {
    const h = makeHarness({ existingLogins: ['jan.kowalski', 'jan.kowalski-2'] });
    await expect(h.svc.allocateLogin('jan.kowalski@magtrans.eu')).resolves.toBe('jan.kowalski-3');
  });

  it('strips characters the login schema would reject', async () => {
    const h = makeHarness();
    await expect(h.svc.allocateLogin('Jan+Kowalski@magtrans.eu')).resolves.toBe('jan-kowalski');
  });
});

describe('DirectoryService.provisionOrSync', () => {
  it('creates a passwordless, magspace-managed account for a new employee', async () => {
    const h = makeHarness();

    await h.svc.provisionOrSync({
      existing: null,
      employee: makeEmployee(),
      role: 'planista',
      googleSub: 'google-sub-1',
    });

    expect(h.users.createFromDirectory).toHaveBeenCalledWith(
      expect.objectContaining({
        login: 'jan.kowalski',
        email: 'jan.kowalski@magtrans.eu',
        name: 'Jan Kowalski',
        role: 'planista',
        magspaceEmployeeId: 'emp-1',
      }),
    );
    expect(h.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'provisionUserFromDirectory' }),
    );
  });

  it('applies a new mapped role to an existing user', async () => {
    const h = makeHarness();
    const existing = makeUser({ role: 'dyspozytor' });

    const updated = await h.svc.provisionOrSync({
      existing,
      employee: makeEmployee(),
      role: 'planista',
      googleSub: 'google-sub-1',
    });

    expect(updated.role).toBe('planista');
    expect(h.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'syncUserFromDirectory' }),
    );
  });

  it('never lets the mapping overwrite a hand-granted roleOverride', async () => {
    // The manual-approval path (docs/24 §4): an admin decided this person is a
    // weryfikator, and no stanowisko mapping may take that away.
    const h = makeHarness();
    const existing = makeUser({ role: 'weryfikator', roleOverride: 'weryfikator' });

    const updated = await h.svc.provisionOrSync({
      existing,
      employee: makeEmployee(),
      role: 'planista',
      googleSub: 'google-sub-1',
    });

    expect(updated.role).toBe('weryfikator');
    expect(h.users.update).toHaveBeenCalledWith(
      existing.id,
      expect.objectContaining({ role: 'weryfikator' }),
    );
  });

  it('reactivates a returning employee', async () => {
    const h = makeHarness();
    const existing = makeUser({ active: false });

    const updated = await h.svc.provisionOrSync({
      existing,
      employee: makeEmployee(),
      role: 'planista',
      googleSub: 'google-sub-1',
    });

    expect(updated.active).toBe(true);
  });

  it('writes no audit row when nothing actually changed', async () => {
    const h = makeHarness();

    await h.svc.provisionOrSync({
      existing: makeUser(),
      employee: makeEmployee(),
      role: 'planista',
      googleSub: 'google-sub-1',
    });

    expect(h.audit.log).not.toHaveBeenCalled();
  });
});

describe('DirectoryService.deprovision', () => {
  it('deactivates, revokes every refresh token, and audits as a system action', async () => {
    const h = makeHarness();
    const user = makeUser();

    await h.svc.deprovision(user, 'inactive');

    expect(h.users.update).toHaveBeenCalledWith(
      user.id,
      expect.objectContaining({ active: false }),
    );
    expect(h.refreshTokens.revokeAllForUser).toHaveBeenCalledWith(user.id);
    // `AuditWriter` throws on a system action without the `system.` prefix.
    expect(h.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'system',
        action: 'system.deprovisionUserFromDirectory',
        reason: 'inactive',
      }),
    );
  });

  it('still revokes tokens for an already-inactive user', async () => {
    // Idempotency matters: the reconcile re-visits the same rows every run.
    const h = makeHarness();

    await h.svc.deprovision(makeUser({ active: false }), 'reconcile_inactive');

    expect(h.users.update).not.toHaveBeenCalled();
    expect(h.refreshTokens.revokeAllForUser).toHaveBeenCalled();
  });
});

describe('DirectoryService.notifyAccessRequested', () => {
  it('audits the refusal and mails every admin', async () => {
    const h = makeHarness();

    await h.svc.notifyAccessRequested(
      makeEmployee({ stanowisko: { code: 'CONTROLLING', name: 'Controlling' } }),
    );

    expect(h.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'system.denyDirectoryAccess', actor: 'system' }),
    );
    expect(h.mail.enqueueSsoAccessRequested).toHaveBeenCalledWith(
      'admin@magtrans.eu',
      expect.objectContaining({
        employeeEmail: 'jan.kowalski@magtrans.eu',
        stanowiskoCode: 'CONTROLLING',
        // APP_URL carries a trailing slash in some .env files.
        usersUrl: 'https://mymag.magtrans.eu/employee/users',
      }),
    );
  });

  it('stays quiet on a repeat attempt inside the dedup window', async () => {
    const h = makeHarness();
    (h.redis.client.set as jest.Mock).mockResolvedValue(null); // SET NX lost

    await h.svc.notifyAccessRequested(makeEmployee());

    expect(h.mail.enqueueSsoAccessRequested).not.toHaveBeenCalled();
    // The audit row is still written — every refusal is a recorded event.
    expect(h.audit.log).toHaveBeenCalled();
  });

  it('never lets a mail failure break the caller', async () => {
    // This runs on someone's login screen; a broken SMTP must produce a 403,
    // not a 500.
    const h = makeHarness();
    (h.mail.enqueueSsoAccessRequested as jest.Mock).mockRejectedValue(new Error('smtp down'));

    await expect(h.svc.notifyAccessRequested(makeEmployee())).resolves.toBeUndefined();
  });
});
