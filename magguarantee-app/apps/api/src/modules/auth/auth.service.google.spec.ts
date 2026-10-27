// The Google sign-in decision tree (docs/24 §A2).
//
// Every branch of `loginWithGoogle` is a policy decision that is expensive to
// get wrong in either direction — let the wrong person in, or lock the right
// one out during an outage — so each one gets a test that names the policy.

import {
  ForbiddenException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';

import { permissionsFor } from '@magguarantee/shared';

import type { Env } from '../../config/env.schema';
import type { AuditWriter } from '../audit/audit.service';
import type { DirectoryService } from '../directory/directory.service';
import type { MagspaceEmployee } from '../directory/magspace.client';
import type { MailService } from '../mail/mail.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { UsersService } from '../users/users.service';
import type { UserRow } from '../users/users.repository';
import { AuthService } from './auth.service';
import type { GoogleIdTokenService } from './google/google-id-token.service';
import type { PasswordResetService } from './password-reset.service';
import type { PasswordService } from './password.service';
import type { RefreshTokenRepository } from './refresh-token.repository';
import type { TwoFactorService } from './two-factor.service';

const IDENTITY = {
  sub: 'google-sub-1',
  email: 'jan.kowalski@magtrans.eu',
  name: 'Jan Kowalski',
};

function makeUser(overrides: Partial<UserRow> = {}): UserRow {
  const now = new Date('2026-09-01T10:00:00.000Z');
  return {
    id: 'u-1',
    login: 'jan.kowalski',
    email: IDENTITY.email,
    passwordHash: null,
    role: 'planista',
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
    googleSub: IDENTITY.sub,
    magspaceEmployeeId: 'emp-1',
    directorySyncedAt: now,
    roleOverride: null,
    // docs/25 B6 — no per-user overrides.
    extraPermissions: [],
    deniedPermissions: [],
    lider: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function makeEmployee(overrides: Partial<MagspaceEmployee> = {}): MagspaceEmployee {
  return {
    id: 'emp-1',
    email: IDENTITY.email,
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

function makeHarness(opts: {
  local?: UserRow | null;
  bySub?: UserRow | null;
} = {}) {
  const users = {
    findByGoogleSub: jest.fn(async () => opts.bySub ?? null),
    findByEmail: jest.fn(async () => opts.local ?? null),
    resetFailedAttempts: jest.fn(async () => undefined),
    updateLastLogin: jest.fn(async () => undefined),
  } as unknown as UsersService;

  const directory = {
    resolveEmployee: jest.fn(),
    accessFor: jest.fn(),
    provisionOrSync: jest.fn(),
    deprovision: jest.fn(async () => undefined),
    linkGoogleAccount: jest.fn(async (u: UserRow) => ({ ...u, googleSub: IDENTITY.sub })),
    notifyAccessRequested: jest.fn(async () => undefined),
  } as unknown as jest.Mocked<DirectoryService>;

  const googleIdToken = {
    verifyIdToken: jest.fn(async () => IDENTITY),
  } as unknown as jest.Mocked<GoogleIdTokenService>;

  const audit = {
    log: jest.fn(async () => undefined),
  } as unknown as jest.Mocked<AuditWriter>;

  const prisma = {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        refreshToken: {
          updateMany: async () => ({ count: 1 }),
          create: async () => ({ id: 'rt-new' }),
          update: async () => ({}),
        },
      }),
    ),
  } as unknown as PrismaService;

  const config = {
    get: (key: keyof Env) => {
      switch (key) {
        case 'JWT_ACCESS_TTL':
          return '15m';
        case 'JWT_REFRESH_TTL':
          return '30d';
        case 'JWT_ACCESS_SECRET':
          return 'a'.repeat(32);
        case 'JWT_REFRESH_SECRET':
          return 'b'.repeat(32);
        default:
          return undefined;
      }
    },
  } as unknown as ConfigService<Env, true>;

  const svc = new AuthService(
    users,
    {} as unknown as PasswordService,
    {} as unknown as TwoFactorService,
    {} as unknown as PasswordResetService,
    {} as unknown as RefreshTokenRepository,
    {} as unknown as MailService,
    { signAsync: jest.fn(async () => 'signed.jwt.token') } as unknown as JwtService,
    prisma,
    config,
    googleIdToken,
    directory,
    audit,
  );

  return { svc, users, directory, googleIdToken, audit, prisma };
}

describe('AuthService.loginWithGoogle', () => {
  it('provisions a new employee and issues a token pair', async () => {
    const h = makeHarness();
    const employee = makeEmployee();
    h.directory.resolveEmployee.mockResolvedValue({ kind: 'found', employee });
    h.directory.accessFor.mockResolvedValue({ role: 'planista', lider: false });
    h.directory.provisionOrSync.mockResolvedValue(makeUser());

    const res = await h.svc.loginWithGoogle('a.b.c', {});

    expect(h.directory.provisionOrSync).toHaveBeenCalledWith({
      existing: null,
      employee,
      role: 'planista',
      lider: false,
      googleSub: IDENTITY.sub,
    });
    expect(res.user.role).toBe('planista');
    expect(res.user.lider).toBe(false);
    expect(res.user.permissions).toEqual(permissionsFor('planista', false));
    expect(res.tokens.accessToken).toBeTruthy();
  });

  // ── leader flag from the mapping (docs/28 §2) ──────────────

  it('hands the mapping’s leader flag to provisionOrSync (PLANISTA_LIDER → planista + lider)', async () => {
    const h = makeHarness();
    const employee = makeEmployee({ stanowisko: { code: 'PLANISTA_LIDER', name: 'Planista lider' } });
    h.directory.resolveEmployee.mockResolvedValue({ kind: 'found', employee });
    h.directory.accessFor.mockResolvedValue({ role: 'planista', lider: true });
    h.directory.provisionOrSync.mockResolvedValue(makeUser({ lider: true }));

    const res = await h.svc.loginWithGoogle('a.b.c', {});

    expect(h.directory.accessFor).toHaveBeenCalledWith(employee.stanowisko);
    expect(h.directory.provisionOrSync).toHaveBeenCalledWith({
      existing: null,
      employee,
      role: 'planista',
      lider: true,
      googleSub: IDENTITY.sub,
    });
    // The sign-in response carries the flag (toUserDto), like /auth/me…
    expect(res.user).toMatchObject({ role: 'planista', lider: true });
    // …and the permissions it grants (docs/25 B4).
    expect(res.user.permissions).toEqual(permissionsFor('planista', true));
    expect(res.user.permissions).toContain('vehicles.planner_transfer.decide');
  });

  it('passes lider=false when a hand-granted role stands in for a missing mapping', async () => {
    // provisionOrSync keeps the stored flag for an override account; the login
    // path must not invent one from a mapping that does not exist.
    const existing = makeUser({ role: 'opiekun', roleOverride: 'opiekun', lider: true });
    const h = makeHarness({ bySub: existing });
    h.directory.resolveEmployee.mockResolvedValue({
      kind: 'found',
      employee: makeEmployee({ stanowisko: { code: 'CONTROLLING', name: 'Controlling' } }),
    });
    h.directory.accessFor.mockResolvedValue(null);
    h.directory.provisionOrSync.mockResolvedValue(existing);

    const res = await h.svc.loginWithGoogle('a.b.c', {});

    expect(h.directory.provisionOrSync).toHaveBeenCalledWith(
      expect.objectContaining({ existing, role: 'opiekun', lider: false }),
    );
    expect(res.user).toMatchObject({ role: 'opiekun', lider: true });
  });

  it('takes the override’s role but still forwards the mapping’s flag for provisionOrSync to ignore', async () => {
    const existing = makeUser({ role: 'weryfikator', roleOverride: 'weryfikator' });
    const h = makeHarness({ bySub: existing });
    h.directory.resolveEmployee.mockResolvedValue({ kind: 'found', employee: makeEmployee() });
    h.directory.accessFor.mockResolvedValue({ role: 'planista', lider: true });
    h.directory.provisionOrSync.mockResolvedValue(existing);

    await h.svc.loginWithGoogle('a.b.c', {});

    expect(h.directory.provisionOrSync).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'weryfikator', lider: true }),
    );
  });

  it('a locally-managed leader signs in with the flag from the row, MAGSpace unconsulted', async () => {
    const lead = makeUser({ role: 'eksport', managedBy: 'local', lider: true });
    const h = makeHarness({ bySub: lead });

    const res = await h.svc.loginWithGoogle('a.b.c', {});

    expect(res.user).toMatchObject({ role: 'eksport', lider: true });
    expect(h.directory.accessFor).not.toHaveBeenCalled();
  });

  it('matches on googleSub before falling back to the e-mail', async () => {
    // A Workspace address can be renamed; `sub` cannot. Matching on the address
    // first would create a second account for the same person after a rename.
    const bySub = makeUser({ id: 'u-sub', login: 'renamed.person' });
    const h = makeHarness({ bySub, local: makeUser({ id: 'u-email' }) });
    h.directory.resolveEmployee.mockResolvedValue({
      kind: 'found',
      employee: makeEmployee(),
    });
    h.directory.accessFor.mockResolvedValue({ role: 'planista', lider: false });
    h.directory.provisionOrSync.mockResolvedValue(bySub);

    await h.svc.loginWithGoogle('a.b.c', {});

    expect(h.directory.provisionOrSync).toHaveBeenCalledWith(
      expect.objectContaining({ existing: bySub }),
    );
    expect(h.users.findByEmail).not.toHaveBeenCalled();
  });

  it('refuses a carrier outright, without consulting MAGSpace', async () => {
    const h = makeHarness({ local: makeUser({ role: 'przewoznik', managedBy: 'local' }) });

    await expect(h.svc.loginWithGoogle('a.b.c', {})).rejects.toMatchObject({
      response: { extensions: { code: 'SSO_NOT_FOR_CARRIER' } },
    });
    expect(h.directory.resolveEmployee).not.toHaveBeenCalled();
  });

  it('lets a locally-managed admin in on the local role, without consulting MAGSpace', async () => {
    // The break-glass path: an admin must be able to sign in while the
    // directory is down, and `admin` must never come from a stanowisko.
    const admin = makeUser({ role: 'admin', managedBy: 'local', authProvider: 'local' });
    const h = makeHarness({ bySub: admin });

    const res = await h.svc.loginWithGoogle('a.b.c', {});

    expect(res.user.role).toBe('admin');
    expect(h.directory.resolveEmployee).not.toHaveBeenCalled();
  });

  it('links the google sub on a local user’s first Google sign-in', async () => {
    const admin = makeUser({ role: 'admin', managedBy: 'local', googleSub: null });
    const h = makeHarness({ local: admin });

    await h.svc.loginWithGoogle('a.b.c', {});

    expect(h.directory.linkGoogleAccount).toHaveBeenCalledWith(admin, IDENTITY.sub);
  });

  it('rejects a deactivated local user', async () => {
    const h = makeHarness({ bySub: makeUser({ managedBy: 'local', active: false }) });

    await expect(h.svc.loginWithGoogle('a.b.c', {})).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('admits an existing managed user on the cached role when MAGSpace is down', async () => {
    // "Cannot ask" is not "not an employee". The reconcile bounds how stale
    // that cached role can be.
    const existing = makeUser();
    const h = makeHarness({ bySub: existing });
    h.directory.resolveEmployee.mockResolvedValue({ kind: 'unavailable' });

    const res = await h.svc.loginWithGoogle('a.b.c', {});

    expect(res.user.id).toBe(existing.id);
    expect(h.directory.deprovision).not.toHaveBeenCalled();
  });

  it('turns away an unknown person when MAGSpace is down', async () => {
    const h = makeHarness();
    h.directory.resolveEmployee.mockResolvedValue({ kind: 'unavailable' });

    await expect(h.svc.loginWithGoogle('a.b.c', {})).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('deprovisions an existing account when MAGSpace no longer knows the person', async () => {
    const existing = makeUser();
    const h = makeHarness({ bySub: existing });
    h.directory.resolveEmployee.mockResolvedValue({ kind: 'not_found' });

    await expect(h.svc.loginWithGoogle('a.b.c', {})).rejects.toMatchObject({
      response: { extensions: { code: 'SSO_NOT_EMPLOYEE' } },
    });
    expect(h.directory.deprovision).toHaveBeenCalledWith(existing, 'not_found');
  });

  it('deprovisions a terminated employee', async () => {
    const existing = makeUser();
    const h = makeHarness({ bySub: existing });
    h.directory.resolveEmployee.mockResolvedValue({
      kind: 'found',
      employee: makeEmployee({ active: false }),
    });

    await expect(h.svc.loginWithGoogle('a.b.c', {})).rejects.toMatchObject({
      response: { extensions: { code: 'SSO_INACTIVE' } },
    });
    expect(h.directory.deprovision).toHaveBeenCalledWith(existing, 'inactive');
  });

  it('refuses an unmapped stanowisko and tells the admins who is waiting', async () => {
    // The designed onboarding path for HANDEL_* / CONTROLLING, not an error.
    const h = makeHarness();
    const employee = makeEmployee({
      stanowisko: { code: 'CONTROLLING', name: 'Controlling' },
    });
    h.directory.resolveEmployee.mockResolvedValue({ kind: 'found', employee });
    h.directory.accessFor.mockResolvedValue(null);

    await expect(h.svc.loginWithGoogle('a.b.c', {})).rejects.toMatchObject({
      response: { extensions: { code: 'SSO_NO_ROLE' } },
    });
    expect(h.directory.notifyAccessRequested).toHaveBeenCalledWith(employee);
  });

  it('lets an admin-granted roleOverride win over the missing mapping', async () => {
    // This is what makes the manual-approval path work: the person's stanowisko
    // is still unmapped and always will be, but they have been granted a role.
    const existing = makeUser({ role: 'weryfikator', roleOverride: 'weryfikator' });
    const h = makeHarness({ bySub: existing });
    h.directory.resolveEmployee.mockResolvedValue({
      kind: 'found',
      employee: makeEmployee({ stanowisko: { code: 'CONTROLLING', name: 'Controlling' } }),
    });
    h.directory.accessFor.mockResolvedValue(null);
    h.directory.provisionOrSync.mockResolvedValue(existing);

    const res = await h.svc.loginWithGoogle('a.b.c', {});

    expect(res.user.role).toBe('weryfikator');
    expect(h.directory.notifyAccessRequested).not.toHaveBeenCalled();
    expect(h.directory.deprovision).not.toHaveBeenCalled();
  });

  it('clears a password-form lockout on a successful Google sign-in', async () => {
    const h = makeHarness();
    h.directory.resolveEmployee.mockResolvedValue({
      kind: 'found',
      employee: makeEmployee(),
    });
    h.directory.accessFor.mockResolvedValue({ role: 'planista', lider: false });
    h.directory.provisionOrSync.mockResolvedValue(makeUser({ failedAttempts: 9 }));

    await h.svc.loginWithGoogle('a.b.c', {});

    expect(h.users.resetFailedAttempts).toHaveBeenCalledWith('u-1');
    expect(h.users.updateLastLogin).toHaveBeenCalled();
  });

  it('propagates a rejected id_token without touching the directory', async () => {
    const h = makeHarness();
    (h.googleIdToken.verifyIdToken as jest.Mock).mockRejectedValue(
      new ForbiddenException('nope'),
    );

    await expect(h.svc.loginWithGoogle('a.b.c', {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(h.directory.resolveEmployee).not.toHaveBeenCalled();
  });
});

describe('AuthService.loginWithGoogle — googleLogin audit row', () => {
  // `POST /auth/google` is @Public, so the controller cannot audit it: the
  // interceptor has no req.user, falls back to actor 'system', and AuditWriter
  // refuses 'googleLogin' for that actor — every successful sign-in was an
  // empty-bodied 500 (2026-09-10). The service writes the row instead,
  // attributed to the person who signed in.
  const CTX = { ipAddress: '10.0.0.7', userAgent: 'jest' };

  it('attributes a directory sign-in to the provisioned user', async () => {
    const h = makeHarness();
    h.directory.resolveEmployee.mockResolvedValue({
      kind: 'found',
      employee: makeEmployee(),
    });
    h.directory.accessFor.mockResolvedValue({ role: 'planista', lider: false });
    h.directory.provisionOrSync.mockResolvedValue(makeUser());

    await h.svc.loginWithGoogle('a.b.c', CTX);

    expect(h.audit.log).toHaveBeenCalledTimes(1);
    expect(h.audit.log).toHaveBeenCalledWith({
      action: 'googleLogin',
      targetType: 'User',
      targetKey: 'jan.kowalski',
      metadata: { via: 'directory', userAgent: 'jest' },
      actor: { userId: 'u-1', userRole: 'planista', ipAddress: '10.0.0.7' },
    });
  });

  it('marks a break-glass admin sign-in as local', async () => {
    const admin = makeUser({
      id: 'u-admin',
      login: 'admin',
      role: 'admin',
      managedBy: 'local',
    });
    const h = makeHarness({ bySub: admin });

    await h.svc.loginWithGoogle('a.b.c', CTX);

    expect(h.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        targetKey: 'admin',
        metadata: expect.objectContaining({ via: 'local' }),
        actor: { userId: 'u-admin', userRole: 'admin', ipAddress: '10.0.0.7' },
      }),
    );
  });

  it('marks an admission on the cached role while MAGSpace is down', async () => {
    const h = makeHarness({ bySub: makeUser() });
    h.directory.resolveEmployee.mockResolvedValue({ kind: 'unavailable' });

    await h.svc.loginWithGoogle('a.b.c', CTX);

    expect(h.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ via: 'directory_unavailable' }),
      }),
    );
  });

  it('leaves ipAddress off the actor when the request carried none', async () => {
    const h = makeHarness({ bySub: makeUser({ managedBy: 'local' }) });

    await h.svc.loginWithGoogle('a.b.c', {});

    expect(h.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { userId: 'u-1', userRole: 'planista' },
        metadata: { via: 'local', userAgent: null },
      }),
    );
  });

  it('writes no googleLogin row for a refused sign-in', async () => {
    const h = makeHarness();
    h.directory.resolveEmployee.mockResolvedValue({ kind: 'not_found' });

    await expect(h.svc.loginWithGoogle('a.b.c', CTX)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(h.audit.log).not.toHaveBeenCalled();
  });

  it('mints no session when the audit write fails', async () => {
    // Losing the session beats an unaudited one — same stance as AuditWriter.
    const h = makeHarness({ bySub: makeUser({ managedBy: 'local' }) });
    h.audit.log.mockRejectedValue(new Error('db down'));

    await expect(h.svc.loginWithGoogle('a.b.c', CTX)).rejects.toThrow('db down');
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
    expect(h.users.updateLastLogin).not.toHaveBeenCalled();
  });
});

describe('AuthService.loginWithGoogle — refused sign-ins are logged', () => {
  const CTX = { ipAddress: '10.0.0.8', userAgent: 'jest' };
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('passes the request context to the id_token check', async () => {
    const h = makeHarness({ bySub: makeUser({ managedBy: 'local' }) });

    await h.svc.loginWithGoogle('a.b.c', CTX);

    expect(h.googleIdToken.verifyIdToken).toHaveBeenCalledWith('a.b.c', CTX);
  });

  it.each([
    [
      'carrier_account',
      { local: makeUser({ role: 'przewoznik', managedBy: 'local' }) },
      undefined,
      'u-1',
    ],
    ['account_inactive', { bySub: makeUser({ managedBy: 'local', active: false }) }, undefined, 'u-1'],
    ['directory_unavailable', {}, { kind: 'unavailable' }, null],
    ['not_in_directory', { bySub: makeUser() }, { kind: 'not_found' }, 'u-1'],
    [
      'employee_inactive',
      {},
      { kind: 'found', employee: makeEmployee({ active: false }) },
      null,
    ],
  ])('%s → one WARN with IP/UA, no audit row', async (reason, locals, lookup, userId) => {
    const h = makeHarness(locals);
    if (lookup) h.directory.resolveEmployee.mockResolvedValue(lookup as never);

    await expect(h.svc.loginWithGoogle('a.b.c', CTX)).rejects.toBeDefined();

    expect(warn).toHaveBeenCalledWith({
      msg: 'auth: googleLoginRefused',
      event: 'googleLoginRefused',
      reason,
      ipAddress: CTX.ipAddress,
      userAgent: CTX.userAgent,
      userId,
    });
    expect(h.audit.log).not.toHaveBeenCalled();
    // The person's address stays out of the log line.
    expect(JSON.stringify(warn.mock.calls)).not.toContain(IDENTITY.email);
  });

  it('no_role_for_stanowisko → WARN after notifying the admins', async () => {
    const h = makeHarness();
    h.directory.resolveEmployee.mockResolvedValue({ kind: 'found', employee: makeEmployee() });
    h.directory.accessFor.mockResolvedValue(null);

    await expect(h.svc.loginWithGoogle('a.b.c', CTX)).rejects.toBeInstanceOf(ForbiddenException);

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'no_role_for_stanowisko', userId: null }),
    );
  });
});
