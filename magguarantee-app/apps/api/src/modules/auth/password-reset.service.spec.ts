import { HttpException, Logger, UnauthorizedException } from '@nestjs/common';

import { PasswordResetService } from './password-reset.service';
import { PWRESET_REDIS_KEY } from './auth.constants';
import type { RedisService } from '../redis/redis.service';
import type { PrismaService } from '../prisma/prisma.service';
import {
  VerificationCodeLockoutException,
  VerificationCodeOrphanedException,
} from './verification-code.errors';

/**
 * In-memory Redis stand-in (mirrors the one in two-factor.service.spec.ts) —
 * tracks TTLs as absolute deadlines so `ttl()` matches ioredis semantics.
 */
class FakeRedis {
  private store = new Map<string, { value: string; expiresAt: number }>();

  private isAlive(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  async get(key: string): Promise<string | null> {
    return this.isAlive(key) ? this.store.get(key)!.value : null;
  }

  async setex(key: string, ttlSec: number, value: string): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
  }

  async del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) if (this.store.delete(k)) n++;
    return n;
  }

  async incr(key: string): Promise<number> {
    const cur = (await this.get(key)) ?? '0';
    const next = Number.parseInt(cur, 10) + 1;
    const existing = this.store.get(key);
    const expiresAt = existing?.expiresAt ?? Date.now() + 60_000;
    this.store.set(key, { value: String(next), expiresAt });
    return next;
  }

  async expire(key: string, ttlSec: number): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + ttlSec * 1000;
    return 1;
  }

  async exists(key: string): Promise<boolean> {
    return this.isAlive(key);
  }

  async ttl(key: string): Promise<number> {
    if (!this.isAlive(key)) return -2;
    const entry = this.store.get(key)!;
    return Math.max(0, Math.floor((entry.expiresAt - Date.now()) / 1000));
  }
}

function makeService(): { svc: PasswordResetService; redis: FakeRedis } {
  const redis = new FakeRedis();
  const prisma = {
    appConfig: {
      findMany: async () => [
        { key: 'login_code_ttl_seconds', value: '600' },
        { key: 'login_max_attempts', value: '5' },
        { key: 'login_lockout_seconds', value: '300' },
      ],
    },
  } as unknown as PrismaService;
  const svc = new PasswordResetService(
    redis as unknown as RedisService,
    prisma,
  );
  return { svc, redis };
}

describe('PasswordResetService', () => {
  it('issues a 6-digit code + 64-char hex sessionToken in the pwreset namespace', async () => {
    const { svc, redis } = makeService();
    const { sessionToken, code } = await svc.issueCode('user-1');
    expect(sessionToken).toMatch(/^[0-9a-f]{64}$/);
    expect(code).toMatch(/^\d{6}$/);
    expect(await redis.get(PWRESET_REDIS_KEY.code(sessionToken))).toBe(code);
    expect(await redis.get(PWRESET_REDIS_KEY.session(sessionToken))).toBe(
      'user-1',
    );
    // It must NOT touch the 2FA namespace.
    expect(await redis.get(`2fa:code:${sessionToken}`)).toBeNull();
  });

  it('verifies a correct code and consumes the session', async () => {
    const { svc, redis } = makeService();
    const { sessionToken, code } = await svc.issueCode('user-1');
    const userId = await svc.verifyCode(sessionToken, code);
    expect(userId).toBe('user-1');
    expect(await redis.get(PWRESET_REDIS_KEY.code(sessionToken))).toBeNull();
    expect(await redis.get(PWRESET_REDIS_KEY.session(sessionToken))).toBeNull();
  });

  it('rejects wrong codes, increments attempts, then locks out on the 5th', async () => {
    const { svc, redis } = makeService();
    const { sessionToken } = await svc.issueCode('user-1');

    for (let i = 1; i <= 4; i++) {
      await expect(svc.verifyCode(sessionToken, '000000')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(await redis.get(PWRESET_REDIS_KEY.attempts(sessionToken))).toBe(
        String(i),
      );
    }
    // 5th wrong attempt → 423 + lockout key set; code burned.
    await expect(svc.verifyCode(sessionToken, '000000')).rejects.toThrow(
      HttpException,
    );
    expect(await redis.exists(PWRESET_REDIS_KEY.lockout(sessionToken))).toBe(
      true,
    );
    expect(await redis.get(PWRESET_REDIS_KEY.code(sessionToken))).toBeNull();
  });

  it('returns 423 immediately while a lockout is active', async () => {
    const { svc, redis } = makeService();
    const { sessionToken } = await svc.issueCode('user-1');
    await redis.setex(PWRESET_REDIS_KEY.lockout(sessionToken), 300, '1');
    await expect(svc.verifyCode(sessionToken, '123456')).rejects.toThrow(
      HttpException,
    );
  });

  it('issues decoy tokens with no matching code (verify always fails)', async () => {
    const { svc } = makeService();
    const decoy = await svc.issueDecoyToken();
    expect(decoy).toMatch(/^[0-9a-f]{64}$/);
    await expect(svc.verifyCode(decoy, '123456')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('peekUserId returns null for decoy / unknown and the id for a real session', async () => {
    const { svc } = makeService();
    expect(await svc.peekUserId('a'.repeat(64))).toBeNull();
    const decoy = await svc.issueDecoyToken();
    expect(await svc.peekUserId(decoy)).toBeNull();
    const { sessionToken } = await svc.issueCode('user-42');
    expect(await svc.peekUserId(sessionToken)).toBe('user-42');
  });

  it('resend issues a fresh code, resets attempts, applies 60s cooldown', async () => {
    const { svc, redis } = makeService();
    const { sessionToken } = await svc.issueCode('user-1');
    // burn an attempt first
    await svc.verifyCode(sessionToken, '000000').catch(() => undefined);
    const result = await svc.resend(sessionToken);
    expect(result).not.toBeNull();
    expect(result!.code).toMatch(/^\d{6}$/);
    expect(result!.cooldownSec).toBe(60);
    expect(await redis.get(PWRESET_REDIS_KEY.code(sessionToken))).toBe(
      result!.code,
    );
    expect(await redis.get(PWRESET_REDIS_KEY.attempts(sessionToken))).toBeNull();
    expect(await redis.exists(PWRESET_REDIS_KEY.resend(sessionToken))).toBe(
      true,
    );
  });

  it('resend throws 429 when the cooldown is active', async () => {
    const { svc, redis } = makeService();
    const { sessionToken } = await svc.issueCode('user-1');
    await redis.setex(PWRESET_REDIS_KEY.resend(sessionToken), 60, '1');
    await expect(svc.resend(sessionToken)).rejects.toThrow(HttpException);
  });

  it('resend returns null for a decoy session (anti-enumeration)', async () => {
    const { svc } = makeService();
    const decoy = await svc.issueDecoyToken();
    expect(await svc.resend(decoy)).toBeNull();
  });
});

describe('PasswordResetService — audit hand-off and refused-attempt logs', () => {
  const CTX = { ipAddress: '192.0.2.45', userAgent: 'jest-ua' };
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('the lockout throws a typed 423 carrying the session owner, wire body unchanged', async () => {
    const { svc } = makeService();
    const { sessionToken } = await svc.issueCode('user-1');
    for (let i = 1; i < 5; i++) {
      await svc.verifyCode(sessionToken, '000000', CTX).catch(() => undefined);
    }

    const err = await svc.verifyCode(sessionToken, '000000', CTX).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(VerificationCodeLockoutException);
    expect((err as VerificationCodeLockoutException).userId).toBe('user-1');
    expect((err as VerificationCodeLockoutException).getResponse()).toEqual({
      statusCode: 423,
      message: 'Too many attempts',
      lockedForSec: 300,
    });
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'passwordResetCodeRejected',
        reason: 'too_many_attempts',
        userId: 'user-1',
        ipAddress: CTX.ipAddress,
      }),
    );
  });

  it('a matched code with no session throws the orphaned variant', async () => {
    const { svc, redis } = makeService();
    const { sessionToken, code } = await svc.issueCode('user-1');
    await redis.del(PWRESET_REDIS_KEY.session(sessionToken));

    await expect(svc.verifyCode(sessionToken, code, CTX)).rejects.toBeInstanceOf(
      VerificationCodeOrphanedException,
    );
  });

  it('a wrong reset code is logged without the code or the session token', async () => {
    const { svc } = makeService();
    const { sessionToken, code } = await svc.issueCode('user-1');

    await expect(svc.verifyCode(sessionToken, '000000', CTX)).rejects.toThrow(
      UnauthorizedException,
    );

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'passwordResetCodeRejected',
        reason: 'wrong_code',
        userId: 'user-1',
        attemptsLeft: 4,
      }),
    );
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(sessionToken);
    expect(logged).not.toContain(code);
  });
});
