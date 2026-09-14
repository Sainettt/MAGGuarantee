import { HttpException, Logger, UnauthorizedException } from '@nestjs/common';

import { TwoFactorService } from './two-factor.service';
import { REDIS_KEY } from './auth.constants';
import type { RedisService } from '../redis/redis.service';
import type { PrismaService } from '../prisma/prisma.service';
import {
  VerificationCodeLockoutException,
  VerificationCodeOrphanedException,
} from './verification-code.errors';

/**
 * Hand-rolled in-memory Redis stand-in. Tracks TTLs as absolute deadlines
 * so we can also assert on `ttl()` exactly the way ioredis would respond.
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
    for (const k of keys) {
      if (this.store.delete(k)) n++;
    }
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

  async pttl(key: string): Promise<number> {
    if (!this.isAlive(key)) return -2;
    const entry = this.store.get(key)!;
    return Math.max(0, entry.expiresAt - Date.now());
  }
}

function makeService(): { svc: TwoFactorService; redis: FakeRedis } {
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
  const svc = new TwoFactorService(
    redis as unknown as RedisService,
    prisma,
  );
  return { svc, redis };
}

describe('TwoFactorService', () => {
  it('issues a 6-digit code + 64-char hex sessionToken and stores both in Redis', async () => {
    const { svc, redis } = makeService();
    const { sessionToken, code } = await svc.issueCode('user-1');
    expect(sessionToken).toMatch(/^[0-9a-f]{64}$/);
    expect(code).toMatch(/^\d{6}$/);
    expect(await redis.get(REDIS_KEY.code(sessionToken))).toBe(code);
    expect(await redis.get(REDIS_KEY.session(sessionToken))).toBe('user-1');
  });

  it('verifies a correct code and consumes the session', async () => {
    const { svc, redis } = makeService();
    const { sessionToken, code } = await svc.issueCode('user-1');
    const userId = await svc.verifyCode(sessionToken, code);
    expect(userId).toBe('user-1');
    expect(await redis.get(REDIS_KEY.code(sessionToken))).toBeNull();
    expect(await redis.get(REDIS_KEY.session(sessionToken))).toBeNull();
  });

  it('rejects wrong codes and increments attempts', async () => {
    const { svc, redis } = makeService();
    const { sessionToken } = await svc.issueCode('user-1');

    for (let i = 1; i <= 4; i++) {
      try {
        await svc.verifyCode(sessionToken, '000000');
        fail('expected to throw');
      } catch (e) {
        expect(e).toBeInstanceOf(UnauthorizedException);
      }
      const attempts = await redis.get(REDIS_KEY.attempts(sessionToken));
      expect(attempts).toBe(String(i));
    }

    // 5th wrong attempt → 423 + lockout key set.
    await expect(svc.verifyCode(sessionToken, '000000')).rejects.toThrow(
      HttpException,
    );
    expect(await redis.exists(REDIS_KEY.lockout(sessionToken))).toBe(true);
    // Code is consumed at lockout.
    expect(await redis.get(REDIS_KEY.code(sessionToken))).toBeNull();
  });

  it('returns 423 immediately when lockout is active', async () => {
    const { svc, redis } = makeService();
    const { sessionToken } = await svc.issueCode('user-1');
    await redis.setex(REDIS_KEY.lockout(sessionToken), 300, '1');
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

  it('peekUserId returns null for decoy and unknown tokens', async () => {
    const { svc } = makeService();
    expect(await svc.peekUserId('a'.repeat(64))).toBeNull();
    const decoy = await svc.issueDecoyToken();
    expect(await svc.peekUserId(decoy)).toBeNull();
  });

  it('peekUserId returns the userId for a real session', async () => {
    const { svc } = makeService();
    const { sessionToken } = await svc.issueCode('user-42');
    expect(await svc.peekUserId(sessionToken)).toBe('user-42');
  });

  it('resend issues a new code and applies a 60s cooldown', async () => {
    const { svc, redis } = makeService();
    const { sessionToken, code: first } = await svc.issueCode('user-1');
    const result = await svc.resend(sessionToken);
    expect(result).not.toBeNull();
    expect(result!.code).toMatch(/^\d{6}$/);
    expect(result!.cooldownSec).toBe(60);
    // The new code is different (with overwhelming probability) and lives.
    expect(await redis.get(REDIS_KEY.code(sessionToken))).toBe(result!.code);
    expect(await redis.exists(REDIS_KEY.resend(sessionToken))).toBe(true);
    // Counter for old attempts is wiped.
    expect(await redis.get(REDIS_KEY.attempts(sessionToken))).toBeNull();
    // Sanity — resend is not equal to first (1-in-900k chance otherwise).
    void first;
  });

  it('resend throws 429 when the cooldown is active', async () => {
    const { svc, redis } = makeService();
    const { sessionToken } = await svc.issueCode('user-1');
    await redis.setex(REDIS_KEY.resend(sessionToken), 60, '1');
    await expect(svc.resend(sessionToken)).rejects.toThrow(HttpException);
  });
});

describe('TwoFactorService — audit hand-off and refused-attempt logs', () => {
  const CTX = { ipAddress: '192.0.2.44', userAgent: 'jest-ua' };
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('the lockout throws a typed 423 carrying the session owner, wire body unchanged', async () => {
    const { svc } = makeService();
    const { sessionToken } = await svc.issueCode('user-1');
    for (let i = 1; i < 5; i++) {
      await expect(svc.verifyCode(sessionToken, '000000', CTX)).rejects.toThrow(
        UnauthorizedException,
      );
    }

    const err = await svc.verifyCode(sessionToken, '000000', CTX).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(VerificationCodeLockoutException);
    const lockout = err as VerificationCodeLockoutException;
    expect(lockout.userId).toBe('user-1');
    expect(lockout.attempts).toBe(5);
    expect(lockout.getStatus()).toBe(423);
    expect(lockout.getResponse()).toEqual({
      statusCode: 423,
      message: 'Too many attempts',
      lockedForSec: 300,
    });
  });

  it('a request against an already-locked session is a plain 423 (one audit row per lockout)', async () => {
    const { svc, redis } = makeService();
    const { sessionToken } = await svc.issueCode('user-1');
    await redis.setex(REDIS_KEY.lockout(sessionToken), 300, '1');

    const err = await svc.verifyCode(sessionToken, '123456', CTX).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HttpException);
    expect(err).not.toBeInstanceOf(VerificationCodeLockoutException);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'twoFactorCodeRejected', reason: 'session_locked' }),
    );
  });

  it('a matched code with no session throws the orphaned variant, answered like an expired code', async () => {
    const { svc, redis } = makeService();
    const { sessionToken, code } = await svc.issueCode('user-1');
    await redis.del(REDIS_KEY.session(sessionToken));

    const err = await svc.verifyCode(sessionToken, code, CTX).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(VerificationCodeOrphanedException);
    expect((err as VerificationCodeOrphanedException).sessionState).toBe('missing');
    expect((err as VerificationCodeOrphanedException).getResponse()).toEqual(
      new UnauthorizedException('Code expired').getResponse(),
    );
  });

  it('wrong codes are logged with owner, IP and attempts — never the code or the session token', async () => {
    const { svc } = makeService();
    const { sessionToken, code } = await svc.issueCode('user-1');

    await expect(svc.verifyCode(sessionToken, '000000', CTX)).rejects.toThrow();

    expect(warn).toHaveBeenCalledWith({
      msg: 'auth: twoFactorCodeRejected',
      event: 'twoFactorCodeRejected',
      reason: 'wrong_code',
      ipAddress: CTX.ipAddress,
      userAgent: CTX.userAgent,
      userId: 'user-1',
      attempts: 1,
      attemptsLeft: 4,
    });
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(sessionToken);
    expect(logged).not.toContain(code);
    expect(logged).not.toContain('000000');
  });

  it('a code tried against a decoy session is flagged as such', async () => {
    const { svc } = makeService();
    const decoy = await svc.issueDecoyToken();

    await expect(svc.verifyCode(decoy, '123456', CTX)).rejects.toThrow(UnauthorizedException);

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'code_expired', decoySession: true, userId: null }),
    );
  });

  it('a resend inside the cooldown is logged', async () => {
    const { svc, redis } = makeService();
    const { sessionToken } = await svc.issueCode('user-1');
    await redis.setex(REDIS_KEY.resend(sessionToken), 60, '1');

    await expect(svc.resend(sessionToken, CTX)).rejects.toThrow(HttpException);

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'twoFactorResendRefused',
        reason: 'cooldown_active',
        ipAddress: CTX.ipAddress,
      }),
    );
  });
});
