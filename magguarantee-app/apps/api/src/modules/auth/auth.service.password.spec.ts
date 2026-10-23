import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { permissionsFor } from '@magguarantee/shared';

import type { Env } from '../../config/env.schema';
import type { AuditWriter } from '../audit/audit.service';
import { DirectoryService } from '../directory/directory.service';
import { MailService } from '../mail/mail.service';
import { GoogleIdTokenService } from './google/google-id-token.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import type { UserRow } from '../users/users.repository';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';
import { PasswordService } from './password.service';
import { RefreshTokenRepository } from './refresh-token.repository';
import { TwoFactorService } from './two-factor.service';
import {
  VerificationCodeLockoutException,
  VerificationCodeOrphanedException,
} from './verification-code.errors';

const NOW = new Date('2026-06-16T10:00:00.000Z');

function makeUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'u-1',
    login: 'jan.kowalski',
    email: 'jan@magtrans.eu',
    passwordHash: '$2b$12$old',
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
    // SSO defaults — a hand-created, locally managed account (docs/24).
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

interface Harness {
  svc: AuthService;
  users: jest.Mocked<Pick<UsersService, 'findByLogin' | 'findById' | 'applyPasswordChange'>>;
  passwordReset: jest.Mocked<
    Pick<PasswordResetService, 'issueCode' | 'issueDecoyToken' | 'verifyCode' | 'peekUserId' | 'resend'>
  >;
  refreshTokens: jest.Mocked<
    Pick<RefreshTokenRepository, 'revokeAllForUser' | 'revokeAllForUserExcept'>
  >;
  mail: jest.Mocked<Pick<MailService, 'enqueuePasswordReset' | 'enqueue2faCode'>>;
  passwords: jest.Mocked<Pick<PasswordService, 'hash'>>;
  audit: jest.Mocked<Pick<AuditWriter, 'log'>>;
}

function makeHarness(seed: UserRow | null = makeUser()): Harness {
  // Mutable view so a post-change `findById` reflects the cleared flag — the
  // real DB read would. `applyPasswordChange` updates the live row.
  let current = seed ? { ...seed } : null;
  const users = {
    findByLogin: jest.fn(async () => current),
    findById: jest.fn(async () => current),
    applyPasswordChange: jest.fn(
      async (
        _id: string,
        passwordHash: string,
        opts: { mustChangePassword: boolean },
      ) => {
        if (current) {
          current = {
            ...current,
            passwordHash,
            mustChangePassword: opts.mustChangePassword,
            passwordChangedAt: NOW,
          };
        }
      },
    ),
  } as unknown as Harness['users'];

  const passwordReset = {
    issueCode: jest.fn(async () => ({ sessionToken: 's'.repeat(64), code: '123456' })),
    issueDecoyToken: jest.fn(async () => 'd'.repeat(64)),
    verifyCode: jest.fn(async () => 'u-1'),
    peekUserId: jest.fn(async () => 'u-1'),
    resend: jest.fn(async () => ({ code: '654321', cooldownSec: 60 })),
  } as unknown as Harness['passwordReset'];

  const refreshTokens = {
    revokeAllForUser: jest.fn(async () => 2),
    revokeAllForUserExcept: jest.fn(async () => 1),
  } as unknown as Harness['refreshTokens'];

  const mail = {
    enqueuePasswordReset: jest.fn(async () => undefined),
    enqueue2faCode: jest.fn(async () => undefined),
  } as unknown as Harness['mail'];

  const passwords = {
    hash: jest.fn(async (s: string) => `hashed:${s}`),
  } as unknown as Harness['passwords'];

  const jwt = {
    signAsync: jest.fn(async () => 'signed.jwt.token'),
  } as unknown as JwtService;

  const audit = {
    log: jest.fn(async () => undefined),
  } as unknown as Harness['audit'];

  const prisma = {
    // changePassword's issuePair calls prisma.$transaction; emulate it by
    // running the callback against a tx whose refreshToken.create returns an id.
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
    users as unknown as UsersService,
    passwords as unknown as PasswordService,
    {} as unknown as TwoFactorService,
    passwordReset as unknown as PasswordResetService,
    refreshTokens as unknown as RefreshTokenRepository,
    mail as unknown as MailService,
    jwt,
    prisma,
    config,
    // Google SSO collaborators — neither path under test touches them.
    {} as unknown as GoogleIdTokenService,
    {} as unknown as DirectoryService,
    audit as unknown as AuditWriter,
  );

  return { svc, users, passwordReset, refreshTokens, mail, passwords, audit };
}

describe('AuthService — forgot password (anti-enumeration)', () => {
  it('known login: issues a real code + emails it; mask derives from email', async () => {
    const h = makeHarness(makeUser({ email: 'jan@magtrans.eu' }));
    const res = await h.svc.forgotPassword('jan.kowalski');
    expect(res.sessionToken).toHaveLength(64);
    expect(res.maskedEmail).toBe('ja***@magtrans.eu');
    expect(h.passwordReset.issueCode).toHaveBeenCalledWith('u-1');
    expect(h.passwordReset.issueDecoyToken).not.toHaveBeenCalled();
    expect(h.mail.enqueuePasswordReset).toHaveBeenCalledTimes(1);
  });

  it('unknown login: decoy token + synthesized mask, NO email sent', async () => {
    const h = makeHarness(null);
    const res = await h.svc.forgotPassword('ghost.user');
    expect(res.sessionToken).toHaveLength(64);
    expect(res.maskedEmail).toMatch(/^[a-z]{2}\*\*\*@magtrans\.eu$/);
    expect(h.passwordReset.issueDecoyToken).toHaveBeenCalledTimes(1);
    expect(h.passwordReset.issueCode).not.toHaveBeenCalled();
    expect(h.mail.enqueuePasswordReset).not.toHaveBeenCalled();
  });

  it('inactive account is treated like an unknown login (decoy, no email)', async () => {
    const h = makeHarness(makeUser({ active: false }));
    const res = await h.svc.forgotPassword('jan.kowalski');
    expect(res.sessionToken).toHaveLength(64);
    expect(h.passwordReset.issueDecoyToken).toHaveBeenCalledTimes(1);
    expect(h.mail.enqueuePasswordReset).not.toHaveBeenCalled();
  });

  it('known and unknown responses share the same SHAPE', async () => {
    const known = await makeHarness(makeUser()).svc.forgotPassword('jan.kowalski');
    const unknown = await makeHarness(null).svc.forgotPassword('nobody');
    expect(Object.keys(known).sort()).toEqual(Object.keys(unknown).sort());
    expect(typeof known.sessionToken).toBe(typeof unknown.sessionToken);
    expect(known.sessionToken).toHaveLength(unknown.sessionToken.length);
  });
});

describe('AuthService — reset password (confirm)', () => {
  it('happy path: hashes, clears flag, revokes ALL tokens, no auto-login', async () => {
    const h = makeHarness(makeUser({ mustChangePassword: true }));
    await h.svc.resetPassword('s'.repeat(64), '123456', 'NewPass1234');
    expect(h.passwords.hash).toHaveBeenCalledWith('NewPass1234');
    expect(h.users.applyPasswordChange).toHaveBeenCalledWith(
      'u-1',
      'hashed:NewPass1234',
      { mustChangePassword: false },
    );
    expect(h.refreshTokens.revokeAllForUser).toHaveBeenCalledWith('u-1');
  });

  it('bad / expired code: verifyCode throws → no password write, no revoke', async () => {
    const h = makeHarness(makeUser());
    h.passwordReset.verifyCode.mockRejectedValueOnce(
      new UnauthorizedException('Code expired'),
    );
    await expect(
      h.svc.resetPassword('s'.repeat(64), '000000', 'NewPass1234'),
    ).rejects.toThrow(UnauthorizedException);
    expect(h.users.applyPasswordChange).not.toHaveBeenCalled();
    expect(h.refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('rejects when the resolved account is no longer active', async () => {
    const h = makeHarness(makeUser({ active: false }));
    await expect(
      h.svc.resetPassword('s'.repeat(64), '123456', 'NewPass1234'),
    ).rejects.toThrow(UnauthorizedException);
    expect(h.users.applyPasswordChange).not.toHaveBeenCalled();
    expect(h.audit.log).not.toHaveBeenCalled();
  });
});

describe('AuthService — reset password audit trail', () => {
  // POST /auth/reset-password is @Public: an @Audit() there would 500 (no
  // req.user → actor 'system' → AuditWriter refuses), so the service audits.
  const CTX = { ipAddress: '10.0.0.9', userAgent: 'jest-ua' };

  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('writes one resetPassword row attributed to the user, before the change', async () => {
    const h = makeHarness(makeUser());
    const order: string[] = [];
    h.audit.log.mockImplementation(async () => {
      order.push('audit');
    });
    h.users.applyPasswordChange.mockImplementation(async () => {
      order.push('apply');
    });

    await h.svc.resetPassword('s'.repeat(64), '123456', 'NewPass1234', CTX);

    expect(h.audit.log).toHaveBeenCalledTimes(1);
    expect(h.audit.log).toHaveBeenCalledWith({
      action: 'resetPassword',
      targetType: 'User',
      targetKey: 'jan.kowalski',
      metadata: { via: 'forgotPassword', userAgent: 'jest-ua' },
      actor: { userId: 'u-1', userRole: 'opiekun', ipAddress: '10.0.0.9' },
    });
    expect(order).toEqual(['audit', 'apply']);
    // The new password never reaches the audit row.
    expect(JSON.stringify(h.audit.log.mock.calls)).not.toContain('NewPass1234');
  });

  it('a failed audit write costs the reset: no password change, no revoke', async () => {
    const h = makeHarness(makeUser());
    h.audit.log.mockRejectedValue(new Error('db down'));

    await expect(
      h.svc.resetPassword('s'.repeat(64), '123456', 'NewPass1234', CTX),
    ).rejects.toThrow('db down');
    expect(h.users.applyPasswordChange).not.toHaveBeenCalled();
    expect(h.refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('a wrong code writes no audit row', async () => {
    const h = makeHarness(makeUser());
    h.passwordReset.verifyCode.mockRejectedValueOnce(
      new UnauthorizedException('Invalid code'),
    );

    await expect(
      h.svc.resetPassword('s'.repeat(64), '000000', 'NewPass1234', CTX),
    ).rejects.toThrow(UnauthorizedException);
    expect(h.audit.log).not.toHaveBeenCalled();
  });

  it('a reset-code lockout writes lockPasswordResetSession and rethrows the same 423', async () => {
    const h = makeHarness(makeUser());
    const lockout = new VerificationCodeLockoutException('u-1', 5, 300);
    h.passwordReset.verifyCode.mockRejectedValueOnce(lockout);

    await expect(
      h.svc.resetPassword('s'.repeat(64), '000000', 'NewPass1234', CTX),
    ).rejects.toBe(lockout);
    expect(lockout.getStatus()).toBe(423);
    expect(h.audit.log).toHaveBeenCalledWith({
      action: 'lockPasswordResetSession',
      targetType: 'User',
      targetKey: 'jan.kowalski',
      metadata: { attempts: 5, lockedForSec: 300, userAgent: 'jest-ua' },
      actor: { userId: 'u-1', userRole: 'opiekun', ipAddress: '10.0.0.9' },
    });
    expect(h.users.applyPasswordChange).not.toHaveBeenCalled();
  });

  it('a matched code without a session is recorded as a system event', async () => {
    const h = makeHarness(makeUser());
    const orphan = new VerificationCodeOrphanedException('missing');
    h.passwordReset.verifyCode.mockRejectedValueOnce(orphan);

    await expect(
      h.svc.resetPassword('s'.repeat(64), '123456', 'NewPass1234', CTX),
    ).rejects.toBe(orphan);
    expect(h.audit.log).toHaveBeenCalledWith({
      action: 'system.rejectOrphanedVerificationCode',
      metadata: {
        flow: 'passwordReset',
        sessionState: 'missing',
        ipAddress: '10.0.0.9',
        userAgent: 'jest-ua',
      },
      actor: 'system',
    });
  });

  it('an account deactivated before the confirm is logged at WARN, not audited', async () => {
    const h = makeHarness(makeUser({ active: false }));

    await expect(
      h.svc.resetPassword('s'.repeat(64), '123456', 'NewPass1234', CTX),
    ).rejects.toThrow(UnauthorizedException);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'passwordResetRefused',
        reason: 'account_inactive',
        userId: 'u-1',
        ipAddress: '10.0.0.9',
      }),
    );
    expect(h.audit.log).not.toHaveBeenCalled();
  });
});

describe('AuthService — resend reset code (anti-enumeration)', () => {
  it('real session: resends + emails the new code', async () => {
    const h = makeHarness(makeUser());
    const res = await h.svc.resendResetCode('s'.repeat(64));
    expect(res).toEqual({ ok: true, cooldownSec: 60 });
    expect(h.mail.enqueuePasswordReset).toHaveBeenCalledTimes(1);
  });

  it('decoy/unknown session: opaque ok, no email', async () => {
    const h = makeHarness(makeUser());
    h.passwordReset.peekUserId.mockResolvedValueOnce(null);
    const res = await h.svc.resendResetCode('d'.repeat(64));
    expect(res).toEqual({ ok: true, cooldownSec: 60 });
    expect(h.mail.enqueuePasswordReset).not.toHaveBeenCalled();
  });
});

describe('AuthService — change password (authenticated / forced)', () => {
  it('clears the flag, rotates tokens, revokes OTHER sessions', async () => {
    const h = makeHarness(makeUser({ mustChangePassword: true }));
    const { user, tokens } = await h.svc.changePassword('u-1', 'NewPass1234', {});
    expect(h.passwords.hash).toHaveBeenCalledWith('NewPass1234');
    expect(h.users.applyPasswordChange).toHaveBeenCalledWith(
      'u-1',
      'hashed:NewPass1234',
      { mustChangePassword: false },
    );
    // A fresh pair is minted.
    expect(tokens.accessToken).toBe('signed.jwt.token');
    expect(tokens.refreshTokenId).toBe('rt-new');
    // Keeps THIS session, kills the others.
    expect(h.refreshTokens.revokeAllForUserExcept).toHaveBeenCalledWith(
      'u-1',
      'rt-new',
    );
    expect(h.refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
    // DTO carries the cleared flag (findById is re-read after the change).
    expect(user.mustChangePassword).toBe(false);
    // …and the effective permissions, like /auth/me (docs/25 B4).
    expect(user.permissions).toEqual(permissionsFor('opiekun', false));
  });

  it('rejects when the account is no longer active', async () => {
    const h = makeHarness(makeUser({ active: false }));
    await expect(
      h.svc.changePassword('u-1', 'NewPass1234', {}),
    ).rejects.toThrow(UnauthorizedException);
    expect(h.users.applyPasswordChange).not.toHaveBeenCalled();
  });
});
