import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import type { Env } from '../../config/env.schema';
import { REFRESH_ROTATION_GRACE_MS } from './auth.constants';
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
import {
  RefreshTokenRepository,
  type RefreshTokenRow,
} from './refresh-token.repository';
import { TwoFactorService } from './two-factor.service';

// Fixed "now" so revokedAt-age math against REFRESH_ROTATION_GRACE_MS is
// deterministic. Tests pin Date.now() to NOW via fake timers.
const NOW = new Date('2026-06-29T12:00:00.000Z');
const FUTURE = new Date('2026-07-29T12:00:00.000Z'); // > now → not expired

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

function makeRow(overrides: Partial<RefreshTokenRow> = {}): RefreshTokenRow {
  return {
    id: 'rt-old',
    userId: 'u-1',
    tokenHash: 'hash-old',
    expiresAt: FUTURE,
    revokedAt: null,
    replacedById: null,
    ipAddress: null,
    userAgent: null,
    createdAt: NOW,
    ...overrides,
  };
}

interface Harness {
  svc: AuthService;
  users: jest.Mocked<Pick<UsersService, 'findById'>>;
  refreshTokens: jest.Mocked<
    Pick<RefreshTokenRepository, 'findByHash' | 'findById' | 'revokeAllForUser'>
  >;
  prismaTx: jest.Mock;
  audit: jest.Mocked<Pick<AuditWriter, 'log'>>;
}

function makeHarness(
  opts: {
    user?: UserRow | null;
    storedRow?: RefreshTokenRow | null;
    // When set, the issuePair $transaction throws this (simulates the
    // claim-time updateMany losing the race → RefreshReuseError).
    txThrowsReuse?: boolean;
    // Rows returned by refreshTokens.findById — the `replacedById` successor
    // chain the benign-race heal walks. Unlisted ids resolve to null.
    chainRows?: Record<string, RefreshTokenRow>;
    // What findByHash returns on the SECOND call (the branch-B re-read after
    // a claim-time RefreshReuseError). Defaults to `storedRow`.
    reReadRow?: RefreshTokenRow | null;
  } = {},
): Harness {
  const user = opts.user === undefined ? makeUser() : opts.user;
  const storedRow =
    opts.storedRow === undefined ? makeRow() : opts.storedRow;

  const users = {
    findById: jest.fn(async () => user),
  } as unknown as Harness['users'];

  const refreshTokens = {
    findByHash: jest.fn(async () => storedRow),
    findById: jest.fn(async (id: string) => opts.chainRows?.[id] ?? null),
    revokeAllForUser: jest.fn(async () => 2),
  } as unknown as Harness['refreshTokens'];
  if (opts.reReadRow !== undefined) {
    refreshTokens.findByHash
      .mockResolvedValueOnce(storedRow)
      .mockResolvedValue(opts.reReadRow);
  }

  const mail = {
    enqueue2faCode: jest.fn(async () => undefined),
    enqueuePasswordReset: jest.fn(async () => undefined),
  } as unknown as MailService;

  const passwords = {
    hash: jest.fn(async (s: string) => `hashed:${s}`),
  } as unknown as PasswordService;

  const jwt = {
    signAsync: jest.fn(async () => 'signed.jwt.token'),
  } as unknown as JwtService;

  // issuePair runs prisma.$transaction(fn). Emulate the interactive tx; the
  // guarded updateMany "claim" returns count 1 (happy) or 0 (lost race), which
  // makes issuePair throw its internal RefreshReuseError.
  const prismaTx = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      refreshToken: {
        updateMany: async () => ({
          count: opts.txThrowsReuse ? 0 : 1,
        }),
        create: async () => ({ id: 'rt-new' }),
        update: async () => ({}),
      },
    }),
  );
  const prisma = {
    $transaction: prismaTx,
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

  const audit = {
    log: jest.fn(async () => undefined),
  } as unknown as Harness['audit'];

  const svc = new AuthService(
    users as unknown as UsersService,
    passwords,
    {} as unknown as TwoFactorService,
    {} as unknown as PasswordResetService,
    refreshTokens as unknown as RefreshTokenRepository,
    mail,
    jwt,
    prisma,
    config,
    // Google SSO collaborators — neither path under test touches them.
    {} as unknown as GoogleIdTokenService,
    {} as unknown as DirectoryService,
    audit as unknown as AuditWriter,
  );

  return { svc, users, refreshTokens, prismaTx, audit };
}

describe('AuthService — refresh (rotation race vs theft)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('benign race (successor alive): healed with an access-only token — 200, NO rotation, NO revoke-all', async () => {
    const stored = makeRow({
      revokedAt: new Date(NOW.getTime() - 5_000), // 5s ago, well inside grace
      replacedById: 'rt-new',
    });
    const h = makeHarness({
      storedRow: stored,
      chainRows: {
        'rt-new': makeRow({ id: 'rt-new', tokenHash: 'hash-new' }), // live
      },
    });

    const { user, tokens } = await h.svc.refresh('u-1', 'raw-refresh-jwt', {});

    expect(tokens.accessToken).toBe('signed.jwt.token');
    // Access-only: the loser must NOT receive (or overwrite) a refresh cookie.
    expect('refreshToken' in tokens).toBe(false);
    expect(user.id).toBe('u-1');
    expect(h.refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
    // No rotation attempted for a token we already know is revoked.
    expect(h.prismaTx).not.toHaveBeenCalled();
  });

  it('benign race at the grace boundary (exactly grace ms) → still healed', async () => {
    const stored = makeRow({
      revokedAt: new Date(NOW.getTime() - REFRESH_ROTATION_GRACE_MS),
      replacedById: 'rt-new',
    });
    const h = makeHarness({
      storedRow: stored,
      chainRows: { 'rt-new': makeRow({ id: 'rt-new' }) },
    });

    const { tokens } = await h.svc.refresh('u-1', 'raw-refresh-jwt', {});
    expect('refreshToken' in tokens).toBe(false);
    expect(h.refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('benign race but successor revoked WITHOUT replacement (logout raced in) → 401, NO revoke-all, NO heal', async () => {
    const stored = makeRow({
      revokedAt: new Date(NOW.getTime() - 5_000),
      replacedById: 'rt-new',
    });
    const h = makeHarness({
      storedRow: stored,
      chainRows: {
        'rt-new': makeRow({
          id: 'rt-new',
          revokedAt: new Date(NOW.getTime() - 1_000),
          replacedById: null, // session ended for real
        }),
      },
    });

    await expect(
      h.svc.refresh('u-1', 'raw-refresh-jwt', {}),
    ).rejects.toThrow('Refresh token already rotated');
    expect(h.refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('benign race but successor row missing → 401, no heal', async () => {
    const stored = makeRow({
      revokedAt: new Date(NOW.getTime() - 5_000),
      replacedById: 'rt-gone',
    });
    const h = makeHarness({ storedRow: stored }); // no chainRows → findById null

    await expect(
      h.svc.refresh('u-1', 'raw-refresh-jwt', {}),
    ).rejects.toThrow('Refresh token already rotated');
    expect(h.refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('benign race, successor itself rotated (chain walk) → healed via the live grandchild', async () => {
    const stored = makeRow({
      revokedAt: new Date(NOW.getTime() - 5_000),
      replacedById: 'rt-new',
    });
    const h = makeHarness({
      storedRow: stored,
      chainRows: {
        'rt-new': makeRow({
          id: 'rt-new',
          revokedAt: new Date(NOW.getTime() - 2_000),
          replacedById: 'rt-newer', // rotated again (prefetch → click → nav)
        }),
        'rt-newer': makeRow({ id: 'rt-newer' }), // live end of the chain
      },
    });

    const { tokens } = await h.svc.refresh('u-1', 'raw-refresh-jwt', {});
    expect(tokens.accessToken).toBe('signed.jwt.token');
    expect('refreshToken' in tokens).toBe(false);
  });

  it('benign race but the live successor is expired → 401, no heal', async () => {
    const stored = makeRow({
      revokedAt: new Date(NOW.getTime() - 5_000),
      replacedById: 'rt-new',
    });
    const h = makeHarness({
      storedRow: stored,
      chainRows: {
        'rt-new': makeRow({
          id: 'rt-new',
          expiresAt: new Date(NOW.getTime() - 1_000),
        }),
      },
    });

    await expect(
      h.svc.refresh('u-1', 'raw-refresh-jwt', {}),
    ).rejects.toThrow('Refresh token already rotated');
  });

  it('benign race but user deactivated meanwhile → 401, no heal', async () => {
    const stored = makeRow({
      revokedAt: new Date(NOW.getTime() - 5_000),
      replacedById: 'rt-new',
    });
    const h = makeHarness({
      user: makeUser({ active: false }),
      storedRow: stored,
      chainRows: { 'rt-new': makeRow({ id: 'rt-new' }) },
    });

    await expect(
      h.svc.refresh('u-1', 'raw-refresh-jwt', {}),
    ).rejects.toThrow('Refresh token already rotated');
  });

  it('genuine theft: revoked long ago (outside grace) even with replacedById → revoke-all', async () => {
    const stored = makeRow({
      revokedAt: new Date(NOW.getTime() - REFRESH_ROTATION_GRACE_MS - 1),
      replacedById: 'rt-new',
    });
    const h = makeHarness({ storedRow: stored });

    await expect(
      h.svc.refresh('u-1', 'raw-refresh-jwt', {}),
    ).rejects.toThrow('Token reuse detected — all sessions revoked');
    expect(h.refreshTokens.revokeAllForUser).toHaveBeenCalledWith('u-1');
  });

  it('genuine theft: replacedById == null (logout/reset/admin) replayed within grace → revoke-all', async () => {
    const stored = makeRow({
      revokedAt: new Date(NOW.getTime() - 1_000), // recent, but...
      replacedById: null, // ...not a rotation
    });
    const h = makeHarness({ storedRow: stored });

    await expect(
      h.svc.refresh('u-1', 'raw-refresh-jwt', {}),
    ).rejects.toThrow('Token reuse detected — all sessions revoked');
    expect(h.refreshTokens.revokeAllForUser).toHaveBeenCalledWith('u-1');
  });

  it('claim-time RefreshReuseError (TOCTOU): re-read shows a live successor → healed access-only, NO revoke-all', async () => {
    // Token reads as LIVE (revokedAt null), so Part A passes; the concurrent
    // rotation is only caught by the atomic claim inside issuePair → Part B.
    // The re-read then sees the winner's rotation (revokedAt + replacedById).
    const stored = makeRow({ revokedAt: null, replacedById: null });
    const h = makeHarness({
      storedRow: stored,
      txThrowsReuse: true,
      reReadRow: makeRow({
        revokedAt: new Date(NOW.getTime() - 100),
        replacedById: 'rt-new',
      }),
      chainRows: { 'rt-new': makeRow({ id: 'rt-new' }) },
    });

    const { user, tokens } = await h.svc.refresh('u-1', 'raw-refresh-jwt', {});

    expect(tokens.accessToken).toBe('signed.jwt.token');
    expect('refreshToken' in tokens).toBe(false);
    expect(user.id).toBe('u-1');
    expect(h.prismaTx).toHaveBeenCalled();
    expect(h.refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('claim-time RefreshReuseError but re-read shows NO successor (logout raced the claim) → 401, NO revoke-all', async () => {
    const h = makeHarness({
      storedRow: makeRow({ revokedAt: null, replacedById: null }),
      txThrowsReuse: true,
      reReadRow: makeRow({
        revokedAt: new Date(NOW.getTime() - 100),
        replacedById: null, // revoked by logout, not rotation
      }),
    });

    await expect(
      h.svc.refresh('u-1', 'raw-refresh-jwt', {}),
    ).rejects.toThrow('Refresh token already rotated');
    expect(h.prismaTx).toHaveBeenCalled();
    expect(h.refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('happy path: a live token rotates successfully (new branches do not regress)', async () => {
    const h = makeHarness({
      storedRow: makeRow({ revokedAt: null, replacedById: null }),
    });

    const { user, tokens } = await h.svc.refresh('u-1', 'raw-refresh-jwt', {});

    expect('refreshToken' in tokens).toBe(true);
    if (!('refreshToken' in tokens)) throw new Error('expected a full pair');
    expect(tokens.accessToken).toBe('signed.jwt.token');
    expect(tokens.refreshToken).toBe('signed.jwt.token');
    expect(tokens.refreshTokenId).toBe('rt-new');
    expect(user.id).toBe('u-1');
    expect(h.prismaTx).toHaveBeenCalledTimes(1);
    expect(h.refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('unknown token: findByHash returns null → 401 "No such token", no revoke-all', async () => {
    const h = makeHarness({ storedRow: null });
    await expect(
      h.svc.refresh('u-1', 'raw-refresh-jwt', {}),
    ).rejects.toThrow('No such token');
    expect(h.refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('token belongs to a different user → 401 "No such token"', async () => {
    const h = makeHarness({ storedRow: makeRow({ userId: 'someone-else' }) });
    await expect(
      h.svc.refresh('u-1', 'raw-refresh-jwt', {}),
    ).rejects.toThrow('No such token');
    expect(h.refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('expired (but live) token → 401 "Refresh token expired", no rotation', async () => {
    const h = makeHarness({
      storedRow: makeRow({
        revokedAt: null,
        expiresAt: new Date(NOW.getTime() - 1_000),
      }),
    });
    await expect(
      h.svc.refresh('u-1', 'raw-refresh-jwt', {}),
    ).rejects.toThrow('Refresh token expired');
    expect(h.prismaTx).not.toHaveBeenCalled();
  });

  it('no audit row on a rotation or a benign-race heal — those are not security events', async () => {
    const rotate = makeHarness({ storedRow: makeRow({ revokedAt: null }) });
    await rotate.svc.refresh('u-1', 'raw-refresh-jwt', {});
    expect(rotate.audit.log).not.toHaveBeenCalled();

    const heal = makeHarness({
      storedRow: makeRow({
        revokedAt: new Date(NOW.getTime() - 5_000),
        replacedById: 'rt-new',
      }),
      chainRows: { 'rt-new': makeRow({ id: 'rt-new' }) },
    });
    await heal.svc.refresh('u-1', 'raw-refresh-jwt', {});
    expect(heal.audit.log).not.toHaveBeenCalled();
  });

  it('inactive account on a live token → 401, no rotation', async () => {
    const h = makeHarness({
      user: makeUser({ active: false }),
      storedRow: makeRow({ revokedAt: null }),
    });
    await expect(
      h.svc.refresh('u-1', 'raw-refresh-jwt', {}),
    ).rejects.toThrow('Account is no longer active');
    expect(h.prismaTx).not.toHaveBeenCalled();
  });
});

describe('AuthService — refresh-token reuse audit trail', () => {
  const CTX = { ipAddress: '203.0.113.5', userAgent: 'replay-ua' };

  let warn: jest.SpyInstance;
  let info: jest.SpyInstance;
  let debug: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    info = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    debug = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  const replayed = () =>
    makeRow({
      revokedAt: new Date(NOW.getTime() - REFRESH_ROTATION_GRACE_MS - 1),
      replacedById: 'rt-new',
    });

  it('writes detectRefreshTokenReuse attributed to the token owner, with IP and UA', async () => {
    const h = makeHarness({ storedRow: replayed() });

    await expect(h.svc.refresh('u-1', 'raw-refresh-jwt', CTX)).rejects.toThrow(
      'Token reuse detected — all sessions revoked',
    );

    expect(h.audit.log).toHaveBeenCalledTimes(1);
    expect(h.audit.log).toHaveBeenCalledWith({
      action: 'detectRefreshTokenReuse',
      targetType: 'User',
      targetKey: 'jan.kowalski',
      metadata: {
        tokenId: 'rt-old',
        revokedAgeMs: REFRESH_ROTATION_GRACE_MS + 1,
        rotated: true,
        sessionsRevoked: 2,
        userAgent: 'replay-ua',
      },
      actor: { userId: 'u-1', userRole: 'opiekun', ipAddress: '203.0.113.5' },
    });
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'refresh-token reuse detected, revoked all sessions',
        userId: 'u-1',
        sessionsRevoked: 2,
        ipAddress: '203.0.113.5',
        userAgent: 'replay-ua',
      }),
    );
    // The raw refresh token is never logged or audited.
    expect(JSON.stringify([warn.mock.calls, h.audit.log.mock.calls])).not.toContain(
      'raw-refresh-jwt',
    );
  });

  it('marks a replay of a logged-out (never rotated) token as rotated: false', async () => {
    const h = makeHarness({
      storedRow: makeRow({
        revokedAt: new Date(NOW.getTime() - 1_000),
        replacedById: null,
      }),
    });

    await expect(h.svc.refresh('u-1', 'raw-refresh-jwt', CTX)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(h.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ rotated: false }),
      }),
    );
  });

  it('a failed audit write neither blocks the revocation nor changes the 401', async () => {
    const h = makeHarness({ storedRow: replayed() });
    h.audit.log.mockRejectedValue(new Error('db down'));

    await expect(h.svc.refresh('u-1', 'raw-refresh-jwt', CTX)).rejects.toThrow(
      'Token reuse detected — all sessions revoked',
    );
    expect(h.refreshTokens.revokeAllForUser).toHaveBeenCalledWith('u-1');
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'detectRefreshTokenReuse' }),
    );
  });

  it('logs the benign-race heal at INFO (was DEBUG) with the caller IP', async () => {
    const h = makeHarness({
      storedRow: makeRow({
        revokedAt: new Date(NOW.getTime() - 5_000),
        replacedById: 'rt-new',
      }),
      chainRows: { 'rt-new': makeRow({ id: 'rt-new' }) },
    });

    await h.svc.refresh('u-1', 'raw-refresh-jwt', CTX);

    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        replacedById: 'rt-new',
        ipAddress: '203.0.113.5',
      }),
    );
    expect(debug).not.toHaveBeenCalled();
  });
});
