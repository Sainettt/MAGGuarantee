// Provisioning rules for directory-managed accounts (docs/24 §A2/§4/§10).

import { HttpException, HttpStatus } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { AuditContext, type AuditContextStore } from '../../common/audit';
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
    lider: false,
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
    findByEmailIncludingDeleted: jest.fn(async (): Promise<UserRow | null> => null),
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

describe('DirectoryService.accessFor', () => {
  const mapping = (code: string, role: string, lider: boolean) => ({
    id: `m-${code}`,
    stanowiskoCode: code,
    stanowiskoName: code,
    role,
    lider,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it('returns null for a stanowisko with no mapping', async () => {
    const h = makeHarness();
    await expect(h.svc.accessFor({ code: 'CONTROLLING', name: 'Controlling' })).resolves.toBeNull();
  });

  it('treats "no stanowisko assigned" as no access, without hitting the table', async () => {
    const h = makeHarness();
    await expect(h.svc.accessFor(null)).resolves.toBeNull();
    expect(h.mappings.findByCode).not.toHaveBeenCalled();
  });

  it('returns the mapped role with lider=false for an ordinary position', async () => {
    const h = makeHarness();
    (h.mappings.findByCode as jest.Mock).mockResolvedValue(mapping('PLANISTA', 'planista', false));
    await expect(h.svc.accessFor({ code: 'PLANISTA', name: 'Planista' })).resolves.toEqual({
      role: 'planista',
      lider: false,
    });
    expect(h.mappings.findByCode).toHaveBeenCalledWith('PLANISTA');
  });

  it('returns the leader flag of a leader position (PLANISTA_LIDER → planista + lider)', async () => {
    const h = makeHarness();
    (h.mappings.findByCode as jest.Mock).mockResolvedValue(mapping('PLANISTA_LIDER', 'planista', true));
    await expect(
      h.svc.accessFor({ code: 'PLANISTA_LIDER', name: 'Planista lider' }),
    ).resolves.toEqual({ role: 'planista', lider: true });
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
      lider: false,
      googleSub: 'google-sub-1',
    });

    expect(h.users.createFromDirectory).toHaveBeenCalledWith(
      expect.objectContaining({
        login: 'jan.kowalski',
        email: 'jan.kowalski@magtrans.eu',
        name: 'Jan Kowalski',
        role: 'planista',
        magspaceEmployeeId: 'emp-1',
        // JIT path unchanged: linked to Google from birth, no hand-granted role.
        googleSub: 'google-sub-1',
        authProvider: 'google',
      }),
    );
    expect(h.users.createFromDirectory).toHaveBeenCalledWith(
      expect.not.objectContaining({ roleOverride: expect.anything() }),
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
      lider: false,
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
      lider: false,
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
      lider: false,
      googleSub: 'google-sub-1',
    });

    expect(updated.active).toBe(true);
  });

  it('stamps authProvider=google on the first Google sign-in of a pre-created account', async () => {
    // An account an admin created (by hand or through «Nadaj dostęp») starts
    // as `local` with no googleSub; signing in with Google is what makes it
    // `google` — the DTO documents the field as "signed in with Google once".
    const h = makeHarness();
    const existing = makeUser({ authProvider: 'local', googleSub: null, roleOverride: 'weryfikator', role: 'weryfikator' });

    const updated = await h.svc.provisionOrSync({
      existing,
      employee: makeEmployee(),
      role: 'weryfikator',
      lider: false,
      googleSub: 'google-sub-1',
    });

    expect(h.users.update).toHaveBeenCalledWith(
      existing.id,
      expect.objectContaining({ authProvider: 'google', googleSub: 'google-sub-1' }),
    );
    expect(updated.authProvider).toBe('google');
  });

  it('writes no audit row when nothing actually changed', async () => {
    const h = makeHarness();

    await h.svc.provisionOrSync({
      existing: makeUser(),
      employee: makeEmployee(),
      role: 'planista',
      lider: false,
      googleSub: 'google-sub-1',
    });

    expect(h.audit.log).not.toHaveBeenCalled();
  });

  // ── leader flag (docs/28 §2) ───────────────────────────

  it('JIT-creates a leader with the mapping’s flag and audits it', async () => {
    const h = makeHarness();

    const created = await h.svc.provisionOrSync({
      existing: null,
      employee: makeEmployee({ stanowisko: { code: 'PLANISTA_LIDER', name: 'Planista lider' } }),
      role: 'planista',
      lider: true,
      googleSub: 'google-sub-1',
    });

    expect(h.users.createFromDirectory).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'planista', lider: true }),
    );
    expect(created.lider).toBe(true);
    expect(h.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'provisionUserFromDirectory',
        after: expect.objectContaining({ role: 'planista', lider: true }),
      }),
    );
  });

  it('JIT-creates a non-leader with lider=false', async () => {
    const h = makeHarness();

    await h.svc.provisionOrSync({
      existing: null,
      employee: makeEmployee(),
      role: 'planista',
      lider: false,
      googleSub: 'google-sub-1',
    });

    expect(h.users.createFromDirectory).toHaveBeenCalledWith(
      expect.objectContaining({ lider: false }),
    );
  });

  it('without an override, writes the mapping’s flag in the same update as the role', async () => {
    const h = makeHarness();
    const existing = makeUser({ role: 'planista', lider: false });

    const updated = await h.svc.provisionOrSync({
      existing,
      employee: makeEmployee({ stanowisko: { code: 'PLANISTA_LIDER', name: 'Planista lider' } }),
      role: 'planista',
      lider: true,
      googleSub: 'google-sub-1',
    });

    expect(h.users.update).toHaveBeenCalledTimes(1);
    expect(h.users.update).toHaveBeenCalledWith(
      existing.id,
      expect.objectContaining({ role: 'planista', lider: true }),
    );
    expect(updated.lider).toBe(true);
  });

  it('a change of the flag alone is a change: audited with lider before → after', async () => {
    // Everything else identical — only PLANISTA → PLANISTA_LIDER happened.
    const h = makeHarness();
    const existing = makeUser({ lider: false });

    await h.svc.provisionOrSync({
      existing,
      employee: makeEmployee(),
      role: 'planista',
      lider: true,
      googleSub: 'google-sub-1',
    });

    expect(h.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'syncUserFromDirectory',
        before: expect.objectContaining({ role: 'planista', lider: false }),
        after: expect.objectContaining({ role: 'planista', lider: true }),
        metadata: expect.objectContaining({ roleFromOverride: false }),
      }),
    );
  });

  it('a demotion in MAGSpace takes the flag away from a mapped account', async () => {
    const h = makeHarness();
    const existing = makeUser({ lider: true });

    const updated = await h.svc.provisionOrSync({
      existing,
      employee: makeEmployee(),
      role: 'planista',
      lider: false,
      googleSub: 'google-sub-1',
    });

    expect(h.users.update).toHaveBeenCalledWith(existing.id, expect.objectContaining({ lider: false }));
    expect(updated.lider).toBe(false);
  });

  it('with an override, keeps the admin’s flag — the mapping cannot grant it…', async () => {
    const h = makeHarness();
    const existing = makeUser({ role: 'weryfikator', roleOverride: 'weryfikator', lider: false });

    const updated = await h.svc.provisionOrSync({
      existing,
      employee: makeEmployee({ stanowisko: { code: 'PLANISTA_LIDER', name: 'Planista lider' } }),
      role: 'weryfikator',
      lider: true,
      googleSub: 'google-sub-1',
    });

    expect(h.users.update).toHaveBeenCalledWith(
      existing.id,
      expect.objectContaining({ role: 'weryfikator', lider: false }),
    );
    expect(updated.lider).toBe(false);
  });

  it('…nor take it away', async () => {
    // A DAF leader: MAGSpace has no DAF_LIDER, the admin granted it by hand.
    const h = makeHarness();
    const existing = makeUser({ role: 'opiekun', roleOverride: 'opiekun', lider: true });

    await h.svc.provisionOrSync({
      existing,
      employee: makeEmployee({ stanowisko: { code: 'DAF', name: 'DAF' } }),
      role: 'opiekun',
      lider: false,
      googleSub: 'google-sub-1',
    });

    expect(h.users.update).toHaveBeenCalledWith(existing.id, expect.objectContaining({ lider: true }));
    // Nothing changed at all, so no audit row either.
    expect(h.audit.log).not.toHaveBeenCalled();
  });
});

describe('DirectoryService.linkGoogleAccount', () => {
  it('stores the sub and stamps authProvider=google', async () => {
    const h = makeHarness();
    const admin = makeUser({
      id: 'a-1',
      login: 'admin',
      role: 'admin',
      managedBy: 'local',
      authProvider: 'local',
      googleSub: null,
    });

    const linked = await h.svc.linkGoogleAccount(admin, 'google-sub-9');

    expect(h.users.update).toHaveBeenCalledWith('a-1', {
      googleSub: 'google-sub-9',
      authProvider: 'google',
    });
    expect(linked.authProvider).toBe('google');
    expect(h.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'linkGoogleAccount', targetKey: 'admin' }),
    );
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
  it('audits the refusal and mails every admin a link to the SSO screen', async () => {
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
        // The one-step «Nadaj dostęp» lives there. APP_URL carries a trailing
        // slash in some .env files.
        ssoUrl: 'https://mymag.magtrans.eu/employee/sso',
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

// ── «Nadaj dostęp» (docs/24 §10) ─────────────────────────

describe('DirectoryService.grantAccess', () => {
  const CONTROLLING = makeEmployee({ stanowisko: { code: 'CONTROLLING', name: 'Controlling' } });

  /** Runs the grant inside an audit context, the way the interceptor does. */
  async function grant(
    h: ReturnType<typeof makeHarness>,
    role: 'weryfikator' | 'eksport' | 'opiekun' = 'weryfikator',
    lider?: boolean,
  ) {
    const store: AuditContextStore = {
      actor: { userId: 'admin-1', userRole: 'admin' } as AuditContextStore['actor'],
      ipAddress: null,
    };
    const result = await AuditContext.run(store, () =>
      lider === undefined
        ? h.svc.grantAccess('jan.kowalski@magtrans.eu', role)
        : h.svc.grantAccess('jan.kowalski@magtrans.eu', role, lider),
    );
    return { result, store };
  }

  /** Captures the rejection so status + extensions can be asserted together. */
  async function refusal(p: Promise<unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
    try {
      await p;
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const e = err as HttpException;
      return { status: e.getStatus(), body: e.getResponse() as Record<string, unknown> };
    }
    throw new Error('expected the grant to be refused');
  }

  it('creates a directory-managed account with the hand-picked role', async () => {
    const h = makeHarness();
    h.magspace.lookupByEmail.mockResolvedValue(CONTROLLING);

    const { result, store } = await grant(h);

    expect(result.outcome).toBe('created');
    expect(h.users.createFromDirectory).toHaveBeenCalledWith(
      expect.objectContaining({
        login: 'jan.kowalski',
        email: 'jan.kowalski@magtrans.eu',
        name: 'Jan Kowalski',
        role: 'weryfikator',
        roleOverride: 'weryfikator',
        // Omitted on the wire = not a leader (docs/28).
        lider: false,
        // Not signed in with Google yet — that flips it later.
        authProvider: 'local',
        magspaceEmployeeId: 'emp-1',
        directorySyncedAt: expect.any(Date),
      }),
    );
    // No googleSub: the first sign-in links it by e-mail.
    expect(h.users.createFromDirectory).toHaveBeenCalledWith(
      expect.not.objectContaining({ googleSub: expect.anything() }),
    );
    expect(store.before).toBeUndefined();
    expect(store.metadata).toEqual({
      outcome: 'created',
      stanowiskoCode: 'CONTROLLING',
      magspaceEmployeeId: 'emp-1',
    });
    // The interceptor writes the one row, attributed to the admin — the
    // service must not add a second, self-attributed one.
    expect(h.audit.log).not.toHaveBeenCalled();
  });

  it('looks the account up by MAGSpace’s spelling of the address, including deleted rows', async () => {
    const h = makeHarness();
    h.magspace.lookupByEmail.mockResolvedValue(makeEmployee({ email: 'jan.kowalski@magtrans.eu' }));

    await grant(h);

    expect(h.users.findByEmailIncludingDeleted).toHaveBeenCalledWith('jan.kowalski@magtrans.eu');
  });

  it('updates an active directory-managed account: role + override, before snapshot', async () => {
    const h = makeHarness();
    h.magspace.lookupByEmail.mockResolvedValue(CONTROLLING);
    h.users.findByEmailIncludingDeleted.mockResolvedValue(makeUser({ role: 'planista' }));

    const { result, store } = await grant(h);

    expect(result.outcome).toBe('updated');
    expect(h.users.update).toHaveBeenCalledWith('u-1', {
      role: 'weryfikator',
      roleOverride: 'weryfikator',
      lider: false,
      active: true,
      directorySyncedAt: expect.any(Date),
    });
    expect(h.users.createFromDirectory).not.toHaveBeenCalled();
    expect(store.before).toEqual({
      user: { role: 'planista', lider: false, active: true, managedBy: 'magspace', roleOverride: null },
    });
    expect(store.metadata).toMatchObject({ outcome: 'updated' });
  });

  it('reactivates an inactive directory-managed account — the reconcile never would', async () => {
    const h = makeHarness();
    h.magspace.lookupByEmail.mockResolvedValue(CONTROLLING);
    h.users.findByEmailIncludingDeleted.mockResolvedValue(
      makeUser({ active: false, role: 'pracownik', roleOverride: 'pracownik' }),
    );

    const { result, store } = await grant(h, 'eksport');

    expect(result.outcome).toBe('reactivated');
    expect(result.user.active).toBe(true);
    expect(result.user.role).toBe('eksport');
    expect(result.user.roleOverride).toBe('eksport');
    expect(store.before).toEqual({
      user: { role: 'pracownik', lider: false, active: false, managedBy: 'magspace', roleOverride: 'pracownik' },
    });
    expect(store.metadata).toMatchObject({ outcome: 'reactivated' });
  });

  // ── leader flag (docs/28 §2) ───────────────────────────

  it('creates a leader in one step — the only way to get a DAF/opiekun leader', async () => {
    const h = makeHarness();
    h.magspace.lookupByEmail.mockResolvedValue(makeEmployee({ stanowisko: { code: 'DAF', name: 'DAF' } }));

    const { result } = await grant(h, 'opiekun', true);

    expect(result.outcome).toBe('created');
    expect(h.users.createFromDirectory).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'opiekun', roleOverride: 'opiekun', lider: true }),
    );
    expect(result.user.lider).toBe(true);
  });

  it('re-grant writes role, roleOverride and lider in ONE update; before carries the old flag', async () => {
    const h = makeHarness();
    h.magspace.lookupByEmail.mockResolvedValue(CONTROLLING);
    h.users.findByEmailIncludingDeleted.mockResolvedValue(
      makeUser({ role: 'pracownik', roleOverride: 'pracownik', lider: true }),
    );

    const { result, store } = await grant(h, 'eksport', false);

    expect(h.users.update).toHaveBeenCalledTimes(1);
    expect(h.users.update).toHaveBeenCalledWith('u-1', {
      role: 'eksport',
      roleOverride: 'eksport',
      lider: false,
      active: true,
      directorySyncedAt: expect.any(Date),
    });
    expect(result.user.lider).toBe(false);
    expect(store.before).toEqual({
      user: { role: 'pracownik', lider: true, active: true, managedBy: 'magspace', roleOverride: 'pracownik' },
    });
  });

  it('422 USER_LIDER_REQUIRES_LIDER_ROLE for a leader weryfikator — before MAGSpace is asked', async () => {
    const h = makeHarness();

    const r = await refusal(grant(h, 'weryfikator', true));

    expect(r.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(r.body).toMatchObject({ extensions: { code: 'USER_LIDER_REQUIRES_LIDER_ROLE' } });
    expect(h.magspace.lookupByEmail).not.toHaveBeenCalled();
    expect(h.users.createFromDirectory).not.toHaveBeenCalled();
    expect(h.users.update).not.toHaveBeenCalled();
  });

  it('sets the override even when the stanowisko has meanwhile been mapped', async () => {
    // The admin chose this role for this person; a later mapping of the
    // position must not silently decide for them.
    const h = makeHarness();
    h.magspace.lookupByEmail.mockResolvedValue(makeEmployee()); // PLANISTA
    (h.mappings.findByCode as jest.Mock).mockResolvedValue({
      id: 'm-1',
      stanowiskoCode: 'PLANISTA',
      stanowiskoName: 'Planista',
      role: 'planista',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { result } = await grant(h, 'eksport');

    expect(result.user.roleOverride).toBe('eksport');
    expect(h.mappings.findByCode).not.toHaveBeenCalled();
  });

  it('503 SSO_DIRECTORY_UNAVAILABLE when MAGSpace cannot be asked', async () => {
    const h = makeHarness();
    h.magspace.lookupByEmail.mockRejectedValue(new DirectoryUnavailableError('down'));

    const r = await refusal(grant(h));

    expect(r.status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(r.body).toMatchObject({ extensions: { code: 'SSO_DIRECTORY_UNAVAILABLE' } });
    expect(h.users.findByEmailIncludingDeleted).not.toHaveBeenCalled();
  });

  it('422 SSO_GRANT_NOT_EMPLOYEE when MAGSpace has no such address', async () => {
    const h = makeHarness();
    h.magspace.lookupByEmail.mockRejectedValue(new EmployeeNotFoundError());

    const r = await refusal(grant(h));

    expect(r.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(r.body).toMatchObject({ extensions: { code: 'SSO_GRANT_NOT_EMPLOYEE' } });
  });

  it('422 SSO_GRANT_EMPLOYEE_INACTIVE for someone whose employment has ended', async () => {
    const h = makeHarness();
    h.magspace.lookupByEmail.mockResolvedValue(makeEmployee({ active: false }));

    const r = await refusal(grant(h));

    expect(r.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(r.body).toMatchObject({ extensions: { code: 'SSO_GRANT_EMPLOYEE_INACTIVE' } });
    expect(h.users.createFromDirectory).not.toHaveBeenCalled();
  });

  it('409 (reason local) for a locally-managed account — edit it in Użytkownicy', async () => {
    const h = makeHarness();
    h.magspace.lookupByEmail.mockResolvedValue(CONTROLLING);
    h.users.findByEmailIncludingDeleted.mockResolvedValue(
      makeUser({ managedBy: 'local', role: 'pracownik', authProvider: 'local' }),
    );

    const r = await refusal(grant(h));

    expect(r.status).toBe(HttpStatus.CONFLICT);
    expect(r.body).toMatchObject({
      message: 'Konto istnieje i jest zarządzane lokalnie — edytuj je w Użytkownikach.',
      extensions: { code: 'SSO_GRANT_ACCOUNT_CONFLICT', reason: 'local' },
    });
    expect(h.users.update).not.toHaveBeenCalled();
  });

  it.each(['admin', 'przewoznik'] as const)(
    '409 (reason privileged) for an existing %s account',
    async (role) => {
      const h = makeHarness();
      h.magspace.lookupByEmail.mockResolvedValue(CONTROLLING);
      // Even a (mis)configured directory-managed privileged row is refused.
      h.users.findByEmailIncludingDeleted.mockResolvedValue(
        makeUser({ role, managedBy: role === 'admin' ? 'local' : 'magspace' }),
      );

      const r = await refusal(grant(h));

      expect(r.status).toBe(HttpStatus.CONFLICT);
      expect(r.body).toMatchObject({
        extensions: { code: 'SSO_GRANT_ACCOUNT_CONFLICT', reason: 'privileged' },
      });
      expect(h.users.update).not.toHaveBeenCalled();
    },
  );

  it('409 (reason deleted) when a soft-deleted row still holds the address', async () => {
    // `email` is UNIQUE including deleted rows: a create would fail, and
    // resurrecting the deleted row silently is not this screen's call.
    const h = makeHarness();
    h.magspace.lookupByEmail.mockResolvedValue(CONTROLLING);
    h.users.findByEmailIncludingDeleted.mockResolvedValue(
      makeUser({ deletedAt: new Date('2026-08-01T00:00:00.000Z') }),
    );

    const r = await refusal(grant(h));

    expect(r.status).toBe(HttpStatus.CONFLICT);
    expect(r.body).toMatchObject({
      extensions: { code: 'SSO_GRANT_ACCOUNT_CONFLICT', reason: 'deleted' },
    });
    expect(h.users.update).not.toHaveBeenCalled();
    expect(h.users.createFromDirectory).not.toHaveBeenCalled();
  });

  it('409 (reason unique) when the create loses a race on a UNIQUE column', async () => {
    const h = makeHarness();
    h.magspace.lookupByEmail.mockResolvedValue(CONTROLLING);
    h.users.createFromDirectory.mockRejectedValue(
      Object.assign(new Error('P2002'), { code: 'P2002', meta: { target: ['magspace_employee_id'] } }),
    );

    const r = await refusal(grant(h));

    expect(r.status).toBe(HttpStatus.CONFLICT);
    expect(r.body).toMatchObject({
      extensions: { code: 'SSO_GRANT_ACCOUNT_CONFLICT', reason: 'unique' },
    });
  });

  it('rethrows an unexpected persistence failure untouched', async () => {
    const h = makeHarness();
    h.magspace.lookupByEmail.mockResolvedValue(CONTROLLING);
    const boom = new Error('connection reset');
    h.users.createFromDirectory.mockRejectedValue(boom);

    await expect(grant(h)).rejects.toBe(boom);
  });
});
