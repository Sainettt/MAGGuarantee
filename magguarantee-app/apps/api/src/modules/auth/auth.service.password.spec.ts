import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import type { Env } from '../../config/env.schema';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import type { UserRow } from '../users/users.repository';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';
import { PasswordService } from './password.service';
import { RefreshTokenRepository } from './refresh-token.repository';
import { TwoFactorService } from './two-factor.service';

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
    liderEmail: null,
    mustChangePassword: false,
    passwordChangedAt: null,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
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
  );

  return { svc, users, passwordReset, refreshTokens, mail, passwords };
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
  });

  it('rejects when the account is no longer active', async () => {
    const h = makeHarness(makeUser({ active: false }));
    await expect(
      h.svc.changePassword('u-1', 'NewPass1234', {}),
    ).rejects.toThrow(UnauthorizedException);
    expect(h.users.applyPasswordChange).not.toHaveBeenCalled();
  });
});
