// Password sign-in audit trail and refused-attempt logging
// (logging/audit-trail audit 2026-08-14, §4).
//
// What happened to an account (session issued, lockout, logout) → audit row
// attributed to that user. What was merely attempted and refused → one WARN
// line with IP/UA, no audit row, and never the password or a raw unknown login.

import { Logger, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';

import { permissionsFor } from '@magguarantee/shared';

import { toPermissionList } from '../../common/authz/effective-permissions';
import type { Env } from '../../config/env.schema';
import type { AuditWriter } from '../audit/audit.service';
import type { DirectoryService } from '../directory/directory.service';
import type { MailService } from '../mail/mail.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { UsersService } from '../users/users.service';
import type { UserRow } from '../users/users.repository';
import { loginFingerprint } from './auth-security-log';
import { LOGIN_LOCKOUT_MS, LOGIN_MAX_FAILED_ATTEMPTS } from './auth.constants';
import { AuthService } from './auth.service';
import type { GoogleIdTokenService } from './google/google-id-token.service';
import type { PasswordResetService } from './password-reset.service';
import type { PasswordService } from './password.service';
import type {
  RefreshTokenRepository,
  RefreshTokenRow,
} from './refresh-token.repository';
import type { TwoFactorService } from './two-factor.service';
import {
  VerificationCodeLockoutException,
  VerificationCodeOrphanedException,
} from './verification-code.errors';

const NOW = new Date('2026-09-14T10:00:00.000Z');
const CTX = { ipAddress: '198.51.100.23', userAgent: 'jest-ua' };
const PASSWORD = 'Sup3r-Secret-Pass';

function makeUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'u-1',
    login: 'jan.kowalski',
    email: 'jan@magtrans.eu',
    passwordHash: '$2b$12$hash',
    role: 'opiekun',
    name: 'Jan',
    active: true,
    liderId: null,
    teamId: null,
    mustChangePassword: false,
    passwordChangedAt: null,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    authProvider: 'local',
    managedBy: 'local',
    googleSub: null,
    magspaceEmployeeId: null,
    directorySyncedAt: null,
    roleOverride: null,
    lider: false,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function makeTokenRow(overrides: Partial<RefreshTokenRow> = {}): RefreshTokenRow {
  return {
    id: 'rt-1',
    userId: 'u-1',
    tokenHash: 'hash',
    expiresAt: new Date(NOW.getTime() + 86_400_000),
    revokedAt: null,
    replacedById: null,
    ipAddress: null,
    userAgent: null,
    createdAt: NOW,
    ...overrides,
  };
}

function makeHarness(opts: { user?: UserRow | null; passwordOk?: boolean; attempts?: number } = {}) {
  const user = opts.user === undefined ? makeUser() : opts.user;

  const users = {
    findByLogin: jest.fn(async () => user),
    findById: jest.fn(async () => user),
    incrementFailedAttempts: jest.fn(async () => opts.attempts ?? 1),
    lockUntil: jest.fn(async () => undefined),
    resetFailedAttempts: jest.fn(async () => undefined),
    updateLastLogin: jest.fn(async () => undefined),
  };
  const passwords = {
    compareConstantTime: jest.fn(async () => opts.passwordOk ?? false),
  };
  const twoFactor = {
    issueDecoyToken: jest.fn(async () => 'd'.repeat(64)),
    issueCode: jest.fn(async () => ({ sessionToken: 's'.repeat(64), code: '123456' })),
    verifyCode: jest.fn(async () => 'u-1'),
  };
  const refreshTokens = {
    findByHash: jest.fn(async (): Promise<RefreshTokenRow | null> => makeTokenRow()),
    revokeById: jest.fn(async () => undefined),
  };
  const mail = { enqueue2faCode: jest.fn(async () => undefined) };
  const audit = { log: jest.fn(async () => undefined) };
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
  };
  const config = {
    get: (key: keyof Env) =>
      ({
        JWT_ACCESS_TTL: '15m',
        JWT_REFRESH_TTL: '30d',
        JWT_ACCESS_SECRET: 'a'.repeat(32),
        JWT_REFRESH_SECRET: 'b'.repeat(32),
      })[key as string],
  };

  const jwt = {
    signAsync: jest.fn(async (_payload: object, _options?: object) => 'signed.jwt.token'),
  };

  const svc = new AuthService(
    users as unknown as UsersService,
    passwords as unknown as PasswordService,
    twoFactor as unknown as TwoFactorService,
    {} as unknown as PasswordResetService,
    refreshTokens as unknown as RefreshTokenRepository,
    mail as unknown as MailService,
    jwt as unknown as JwtService,
    prisma as unknown as PrismaService,
    config as unknown as ConfigService<Env, true>,
    {} as unknown as GoogleIdTokenService,
    {} as unknown as DirectoryService,
    audit as unknown as AuditWriter,
  );
  return { svc, users, passwords, twoFactor, refreshTokens, mail, audit, prisma, jwt };
}

let warn: jest.SpyInstance;
let error: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

/** Everything the service handed to the logger or the audit writer. */
function everythingEmitted(h: ReturnType<typeof makeHarness>): string {
  return JSON.stringify([warn.mock.calls, error.mock.calls, h.audit.log.mock.calls]);
}

describe('AuthService.login — refused attempts', () => {
  it('wrong password: WARN with userId, IP and UA; decoy response; no audit row', async () => {
    const h = makeHarness({ attempts: 3 });

    const res = await h.svc.login('jan.kowalski', PASSWORD, CTX);

    expect(res.sessionToken).toBe('d'.repeat(64));
    expect(warn).toHaveBeenCalledWith({
      msg: 'auth: loginRefused',
      event: 'loginRefused',
      reason: 'wrong_password',
      ipAddress: CTX.ipAddress,
      userAgent: CTX.userAgent,
      userId: 'u-1',
    });
    expect(h.audit.log).not.toHaveBeenCalled();
    expect(h.users.lockUntil).not.toHaveBeenCalled();
    expect(everythingEmitted(h)).not.toContain(PASSWORD);
  });

  it('unknown login: WARN carries a fingerprint, never the submitted string', async () => {
    const h = makeHarness({ user: null });
    // What people actually paste into the login field by mistake.
    const submitted = 'MyPassword!2026';

    const res = await h.svc.login(submitted, PASSWORD, CTX);

    expect(res.sessionToken).toBe('d'.repeat(64));
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'loginRefused',
        reason: 'unknown_login',
        loginFingerprint: loginFingerprint(submitted),
      }),
    );
    expect(everythingEmitted(h)).not.toContain(submitted);
    expect(everythingEmitted(h)).not.toContain(PASSWORD);
    expect(h.users.incrementFailedAttempts).not.toHaveBeenCalled();
    expect(h.audit.log).not.toHaveBeenCalled();
  });

  it('inactive account: reason account_inactive, no counter bump', async () => {
    const h = makeHarness({ user: makeUser({ active: false }), passwordOk: true });

    await h.svc.login('jan.kowalski', PASSWORD, CTX);

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'account_inactive', userId: 'u-1' }),
    );
    expect(h.users.incrementFailedAttempts).not.toHaveBeenCalled();
    expect(h.twoFactor.issueCode).not.toHaveBeenCalled();
  });

  it('locked account: reason account_locked, even with the right password', async () => {
    const h = makeHarness({
      user: makeUser({ lockedUntil: new Date(NOW.getTime() + 60_000) }),
      passwordOk: true,
    });

    await h.svc.login('jan.kowalski', PASSWORD, CTX);

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'account_locked', userId: 'u-1' }),
    );
    expect(h.twoFactor.issueCode).not.toHaveBeenCalled();
  });

  it('every refusal gets the same response shape', async () => {
    const wrong = await makeHarness().svc.login('jan.kowalski', PASSWORD, CTX);
    const unknown = await makeHarness({ user: null }).svc.login('ghost', PASSWORD, CTX);
    expect(Object.keys(wrong).sort()).toEqual(Object.keys(unknown).sort());
    expect(wrong.sessionToken).toHaveLength(unknown.sessionToken.length);
  });

  it('correct password: code issued, no WARN, no audit row (no session yet)', async () => {
    const h = makeHarness({ passwordOk: true });

    const res = await h.svc.login('jan.kowalski', PASSWORD, CTX);

    expect(res.sessionToken).toBe('s'.repeat(64));
    expect(warn).not.toHaveBeenCalled();
    expect(h.audit.log).not.toHaveBeenCalled();
  });
});

describe('AuthService.login — account lockout', () => {
  it(`the ${LOGIN_MAX_FAILED_ATTEMPTS}th wrong password locks the account and writes lockAccount`, async () => {
    const h = makeHarness({ attempts: LOGIN_MAX_FAILED_ATTEMPTS });

    await h.svc.login('jan.kowalski', PASSWORD, CTX);

    const lockedUntil = new Date(NOW.getTime() + LOGIN_LOCKOUT_MS);
    expect(h.users.lockUntil).toHaveBeenCalledWith('u-1', lockedUntil);
    expect(h.audit.log).toHaveBeenCalledTimes(1);
    expect(h.audit.log).toHaveBeenCalledWith({
      action: 'lockAccount',
      targetType: 'User',
      targetKey: 'jan.kowalski',
      metadata: {
        reason: 'failedLoginAttempts',
        attempts: LOGIN_MAX_FAILED_ATTEMPTS,
        lockedUntil: lockedUntil.toISOString(),
        userAgent: CTX.userAgent,
      },
      actor: { userId: 'u-1', userRole: 'opiekun', ipAddress: CTX.ipAddress },
    });
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'account locked after too many failed logins',
        ipAddress: CTX.ipAddress,
      }),
    );
  });

  it('a failed lockAccount audit write does not surface — same decoy response, logged at ERROR', async () => {
    const h = makeHarness({ attempts: LOGIN_MAX_FAILED_ATTEMPTS });
    h.audit.log.mockRejectedValue(new Error('db down'));

    const res = await h.svc.login('jan.kowalski', PASSWORD, CTX);

    expect(res.sessionToken).toBe('d'.repeat(64));
    expect(h.users.lockUntil).toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'lockAccount', userId: 'u-1' }),
    );
  });

  it('a failed counter write writes no lockout row and does not throw', async () => {
    const h = makeHarness({ attempts: LOGIN_MAX_FAILED_ATTEMPTS });
    h.users.incrementFailedAttempts.mockRejectedValue(new Error('db down'));

    await expect(h.svc.login('jan.kowalski', PASSWORD, CTX)).resolves.toBeDefined();
    expect(h.audit.log).not.toHaveBeenCalled();
  });
});

describe('AuthService.verifyCode — passwordLogin audit row', () => {
  it('writes passwordLogin attributed to the user, before any token is minted', async () => {
    const h = makeHarness();
    const order: string[] = [];
    h.audit.log.mockImplementation(async () => {
      order.push('audit');
    });
    h.prisma.$transaction.mockImplementation(async () => {
      order.push('mint');
      return { id: 'rt-new' };
    });

    const res = await h.svc.verifyCode('s'.repeat(64), '123456', CTX);

    expect(res.user.id).toBe('u-1');
    expect(h.twoFactor.verifyCode).toHaveBeenCalledWith('s'.repeat(64), '123456', CTX);
    expect(h.audit.log).toHaveBeenCalledWith({
      action: 'passwordLogin',
      targetType: 'User',
      targetKey: 'jan.kowalski',
      metadata: { userAgent: CTX.userAgent },
      actor: { userId: 'u-1', userRole: 'opiekun', ipAddress: CTX.ipAddress },
    });
    expect(order).toEqual(['audit', 'mint']);
    expect(everythingEmitted(h)).not.toContain('123456');
  });

  it('a failed audit write costs the session', async () => {
    const h = makeHarness();
    h.audit.log.mockRejectedValue(new Error('db down'));

    await expect(h.svc.verifyCode('s'.repeat(64), '123456', CTX)).rejects.toThrow('db down');
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
    expect(h.users.updateLastLogin).not.toHaveBeenCalled();
  });

  it('a wrong code writes no audit row', async () => {
    const h = makeHarness();
    h.twoFactor.verifyCode.mockRejectedValue(new UnauthorizedException('Invalid code'));

    await expect(h.svc.verifyCode('s'.repeat(64), '000000', CTX)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(h.audit.log).not.toHaveBeenCalled();
  });

  it('a 2FA lockout writes lockTwoFactorSession and rethrows the same 423', async () => {
    const h = makeHarness();
    const lockout = new VerificationCodeLockoutException('u-1', 5, 300);
    h.twoFactor.verifyCode.mockRejectedValue(lockout);

    await expect(h.svc.verifyCode('s'.repeat(64), '000000', CTX)).rejects.toBe(lockout);
    expect(h.audit.log).toHaveBeenCalledTimes(1);
    expect(h.audit.log).toHaveBeenCalledWith({
      action: 'lockTwoFactorSession',
      targetType: 'User',
      targetKey: 'jan.kowalski',
      metadata: { attempts: 5, lockedForSec: 300, userAgent: CTX.userAgent },
      actor: { userId: 'u-1', userRole: 'opiekun', ipAddress: CTX.ipAddress },
    });
  });

  it('a lockout whose session owner is unknown writes no row', async () => {
    const h = makeHarness();
    h.twoFactor.verifyCode.mockRejectedValue(new VerificationCodeLockoutException(null, 5, 300));

    await expect(h.svc.verifyCode('s'.repeat(64), '000000', CTX)).rejects.toThrow(
      'Too many attempts',
    );
    expect(h.audit.log).not.toHaveBeenCalled();
  });

  it('the lockout audit row is best-effort: a failed write keeps the 423', async () => {
    const h = makeHarness();
    const lockout = new VerificationCodeLockoutException('u-1', 5, 300);
    h.twoFactor.verifyCode.mockRejectedValue(lockout);
    h.audit.log.mockRejectedValue(new Error('db down'));

    await expect(h.svc.verifyCode('s'.repeat(64), '000000', CTX)).rejects.toBe(lockout);
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'lockTwoFactorSession' }),
    );
  });

  it('code matched without a session → system.rejectOrphanedVerificationCode', async () => {
    const h = makeHarness();
    const orphan = new VerificationCodeOrphanedException('decoy');
    h.twoFactor.verifyCode.mockRejectedValue(orphan);

    await expect(h.svc.verifyCode('s'.repeat(64), '123456', CTX)).rejects.toBe(orphan);
    expect(h.audit.log).toHaveBeenCalledWith({
      action: 'system.rejectOrphanedVerificationCode',
      metadata: {
        flow: 'twoFactor',
        sessionState: 'decoy',
        ipAddress: CTX.ipAddress,
        userAgent: CTX.userAgent,
      },
      actor: 'system',
    });
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('account deactivated between the steps: WARN, no passwordLogin, no session', async () => {
    const h = makeHarness({ user: makeUser({ active: false }) });

    await expect(h.svc.verifyCode('s'.repeat(64), '123456', CTX)).rejects.toThrow(
      'Account is no longer active',
    );
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'loginRefused',
        reason: 'account_inactive_at_verify',
        userId: 'u-1',
      }),
    );
    expect(h.audit.log).not.toHaveBeenCalled();
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });
});

// docs/25 B4 — the web seeds its `/auth/me` cache from this `user`, so it must
// carry the same effective-permission list `/auth/me` serves.
describe('AuthService.verifyCode — UserDto.permissions', () => {
  it('echoes the full UserDto, permissions in catalog order', async () => {
    const h = makeHarness();

    const res = await h.svc.verifyCode('s'.repeat(64), '123456', CTX);

    expect(res.user).toEqual({
      id: 'u-1',
      login: 'jan.kowalski',
      email: 'jan@magtrans.eu',
      name: 'Jan',
      role: 'opiekun',
      mustChangePassword: false,
      lider: false,
      permissions: toPermissionList(new Set(permissionsFor('opiekun', false))),
    });
    expect(res.user.permissions).toEqual(permissionsFor('opiekun', false));
  });

  it('a lider planista gets the leader permission on the verify path', async () => {
    const h = makeHarness({ user: makeUser({ role: 'planista', lider: true }) });

    const res = await h.svc.verifyCode('s'.repeat(64), '123456', CTX);

    expect(res.user.permissions).toEqual(permissionsFor('planista', true));
    expect(res.user.permissions).toContain('vehicles.planner_transfer.decide');
  });

  it('a plain planista does not — the flag is what grants it', async () => {
    const h = makeHarness({ user: makeUser({ role: 'planista', lider: false }) });

    const res = await h.svc.verifyCode('s'.repeat(64), '123456', CTX);

    expect(res.user.permissions).toEqual(permissionsFor('planista', false));
    expect(res.user.permissions).not.toContain('vehicles.planner_transfer.decide');
  });

  it('never puts permissions into the access-token claims', async () => {
    const h = makeHarness();

    await h.svc.verifyCode('s'.repeat(64), '123456', CTX);

    const payloads = h.jwt.signAsync.mock.calls.map(([payload]) => payload);
    expect(payloads.length).toBeGreaterThan(0);
    for (const payload of payloads) expect(payload).not.toHaveProperty('permissions');
  });
});

describe('AuthService.logout — audit row', () => {
  it('revokes the live session, then writes logout attributed to its owner', async () => {
    const h = makeHarness();
    const order: string[] = [];
    h.refreshTokens.revokeById.mockImplementation(async () => {
      order.push('revoke');
    });
    h.audit.log.mockImplementation(async () => {
      order.push('audit');
    });

    await h.svc.logout('raw-refresh-jwt', CTX);

    expect(order).toEqual(['revoke', 'audit']);
    expect(h.audit.log).toHaveBeenCalledWith({
      action: 'logout',
      targetType: 'User',
      targetKey: 'jan.kowalski',
      metadata: { tokenId: 'rt-1', userAgent: CTX.userAgent },
      actor: { userId: 'u-1', userRole: 'opiekun', ipAddress: CTX.ipAddress },
    });
    expect(everythingEmitted(h)).not.toContain('raw-refresh-jwt');
  });

  it('no cookie, unknown or already-revoked token: nothing revoked, nothing audited', async () => {
    const none = makeHarness();
    await none.svc.logout(undefined, CTX);
    expect(none.audit.log).not.toHaveBeenCalled();

    const unknown = makeHarness();
    unknown.refreshTokens.findByHash.mockResolvedValue(null);
    await unknown.svc.logout('raw', CTX);
    expect(unknown.audit.log).not.toHaveBeenCalled();

    const revoked = makeHarness();
    revoked.refreshTokens.findByHash.mockResolvedValue(makeTokenRow({ revokedAt: NOW }));
    await revoked.svc.logout('raw', CTX);
    expect(revoked.refreshTokens.revokeById).not.toHaveBeenCalled();
    expect(revoked.audit.log).not.toHaveBeenCalled();
  });

  it('a failed audit write still ends the session and does not throw', async () => {
    const h = makeHarness();
    h.audit.log.mockRejectedValue(new Error('db down'));

    await expect(h.svc.logout('raw-refresh-jwt', CTX)).resolves.toBeUndefined();
    expect(h.refreshTokens.revokeById).toHaveBeenCalledWith('rt-1');
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ action: 'logout' }));
  });
});
