import { randomBytes, randomInt } from 'node:crypto';

import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  APP_CONFIG_KEY,
  DEFAULT_CODE_TTL_SECONDS,
  DEFAULT_LOCKOUT_SECONDS,
  DEFAULT_MAX_ATTEMPTS,
  PWRESET_REDIS_KEY,
  RESEND_COOLDOWN_SECONDS,
} from './auth.constants';

// HttpStatus has no 423 LOCKED. Single literal — mirrors TwoFactorService.
const HTTP_LOCKED = 423;

export interface PasswordResetSettings {
  codeTtlSeconds: number;
  maxAttempts: number;
  lockoutSeconds: number;
}

/**
 * Forgot-password code lifecycle — mirrors `TwoFactorService` but lives in the
 * `pwreset:*` Redis namespace (docs/15-auth-strategy.md#account-enumeration,
 * #reset-flooding). Redis is the only source of truth for the reset code; it
 * is NEVER persisted to Postgres.
 *
 * Keys:
 *   pwreset:code:{sessionToken}      → 6-digit code (TTL = code-ttl)
 *   pwreset:session:{sessionToken}   → userId (TTL = code-ttl)
 *   pwreset:attempts:{sessionToken}  → counter
 *   pwreset:lockout:{sessionToken}   → marker (TTL = lockout)
 *   pwreset:resend:{sessionToken}    → marker (TTL = 60s)
 *
 * Tunables reuse the same AppConfig rows as the login 2FA flow with hard-coded
 * fallbacks, so the two flows stay aligned and there is no extra config to seed.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Mints a sessionToken + 6-digit code bound to `userId`, persists both,
   * returns them so the caller can email the code. Used only when the login
   * actually resolves to a user — the decoy path uses `issueDecoyToken`.
   */
  async issueCode(
    userId: string,
  ): Promise<{ sessionToken: string; code: string }> {
    const settings = await this.loadSettings();
    const sessionToken = randomBytes(32).toString('hex');
    const code = this.generateCode();

    await this.redis.setex(
      PWRESET_REDIS_KEY.code(sessionToken),
      settings.codeTtlSeconds,
      code,
    );
    await this.redis.setex(
      PWRESET_REDIS_KEY.session(sessionToken),
      settings.codeTtlSeconds,
      userId,
    );

    return { sessionToken, code };
  }

  /**
   * Mints a fake sessionToken with NO matching code — anti-enumeration decoy
   * for unknown logins. The session marker holds a `decoy` sentinel so resend
   * burns identically and verify always fails with "code expired".
   */
  async issueDecoyToken(): Promise<string> {
    const settings = await this.loadSettings();
    const sessionToken = randomBytes(32).toString('hex');
    await this.redis.setex(
      PWRESET_REDIS_KEY.session(sessionToken),
      settings.codeTtlSeconds,
      'decoy',
    );
    return sessionToken;
  }

  /**
   * Verifies the reset code and returns the bound userId, consuming the
   * session on success.
   *
   * Throws:
   *  - 423 LOCKED when the session is locked out.
   *  - 401 (`Code expired`) when no code is in Redis (TTL elapsed / decoy).
   *  - 401 (`Invalid code`, attemptsLeft) on a wrong code below max attempts.
   *  - 423 LOCKED (`Too many attempts`) on the max-th wrong code.
   */
  async verifyCode(sessionToken: string, code: string): Promise<string> {
    const settings = await this.loadSettings();

    if (await this.redis.exists(PWRESET_REDIS_KEY.lockout(sessionToken))) {
      const lockedForSec = await this.redis.ttl(
        PWRESET_REDIS_KEY.lockout(sessionToken),
      );
      throw new HttpException(
        {
          statusCode: HTTP_LOCKED,
          message: 'Too many attempts',
          lockedForSec: Math.max(0, lockedForSec),
        },
        HTTP_LOCKED,
      );
    }

    const stored = await this.redis.get(PWRESET_REDIS_KEY.code(sessionToken));
    if (!stored) {
      throw new UnauthorizedException('Code expired');
    }

    if (stored !== code) {
      const attempts = await this.redis.incr(
        PWRESET_REDIS_KEY.attempts(sessionToken),
      );
      await this.redis.expire(
        PWRESET_REDIS_KEY.attempts(sessionToken),
        settings.codeTtlSeconds,
      );

      if (attempts >= settings.maxAttempts) {
        await this.redis.setex(
          PWRESET_REDIS_KEY.lockout(sessionToken),
          settings.lockoutSeconds,
          '1',
        );
        await this.redis.del(
          PWRESET_REDIS_KEY.code(sessionToken),
          PWRESET_REDIS_KEY.attempts(sessionToken),
          PWRESET_REDIS_KEY.session(sessionToken),
        );
        throw new HttpException(
          {
            statusCode: HTTP_LOCKED,
            message: 'Too many attempts',
            lockedForSec: settings.lockoutSeconds,
          },
          HTTP_LOCKED,
        );
      }
      const attemptsLeft = settings.maxAttempts - attempts;
      throw new UnauthorizedException({
        statusCode: HttpStatus.UNAUTHORIZED,
        message: 'Invalid code',
        attemptsLeft,
      });
    }

    const userId = await this.redis.get(
      PWRESET_REDIS_KEY.session(sessionToken),
    );
    if (!userId || userId === 'decoy') {
      // Code matched but session is missing/decoy — should be impossible.
      await this.consumeSession(sessionToken);
      throw new UnauthorizedException('Code expired');
    }
    await this.consumeSession(sessionToken);
    return userId;
  }

  /**
   * Generates a fresh code under an existing session and applies the 60s
   * resend cooldown. Returns null when the session is unknown / decoy / expired
   * so the caller can keep the opaque (anti-enumeration) response.
   */
  async resend(
    sessionToken: string,
  ): Promise<{ code: string; cooldownSec: number } | null> {
    if (await this.redis.exists(PWRESET_REDIS_KEY.resend(sessionToken))) {
      const cooldownSec = await this.redis.ttl(
        PWRESET_REDIS_KEY.resend(sessionToken),
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Resend cooldown active',
          cooldownSec: Math.max(0, cooldownSec),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const userId = await this.redis.get(
      PWRESET_REDIS_KEY.session(sessionToken),
    );
    if (!userId || userId === 'decoy') {
      return null;
    }

    const settings = await this.loadSettings();
    const code = this.generateCode();
    await this.redis.setex(
      PWRESET_REDIS_KEY.code(sessionToken),
      settings.codeTtlSeconds,
      code,
    );
    await this.redis.del(PWRESET_REDIS_KEY.attempts(sessionToken));
    await this.redis.setex(
      PWRESET_REDIS_KEY.resend(sessionToken),
      RESEND_COOLDOWN_SECONDS,
      '1',
    );
    return { code, cooldownSec: RESEND_COOLDOWN_SECONDS };
  }

  /**
   * Read-only — returns the userId bound to the session, or null for
   * unknown/decoy/expired sessions. Does NOT consume the session.
   */
  async peekUserId(sessionToken: string): Promise<string | null> {
    const userId = await this.redis.get(
      PWRESET_REDIS_KEY.session(sessionToken),
    );
    if (!userId || userId === 'decoy') return null;
    return userId;
  }

  // ── Helpers ────────────────────────────────────────────

  private generateCode(): string {
    return randomInt(100000, 1000000).toString().padStart(6, '0');
  }

  private async consumeSession(sessionToken: string): Promise<void> {
    await this.redis.del(
      PWRESET_REDIS_KEY.code(sessionToken),
      PWRESET_REDIS_KEY.attempts(sessionToken),
      PWRESET_REDIS_KEY.session(sessionToken),
      PWRESET_REDIS_KEY.resend(sessionToken),
    );
  }

  private async loadSettings(): Promise<PasswordResetSettings> {
    try {
      const rows = await this.prisma.appConfig.findMany({
        where: {
          key: {
            in: [
              APP_CONFIG_KEY.loginCodeTtlSeconds,
              APP_CONFIG_KEY.loginMaxAttempts,
              APP_CONFIG_KEY.loginLockoutSeconds,
            ],
          },
        },
      });
      const map = new Map(rows.map((r) => [r.key, r.value]));
      return {
        codeTtlSeconds: this.toInt(
          map.get(APP_CONFIG_KEY.loginCodeTtlSeconds),
          DEFAULT_CODE_TTL_SECONDS,
        ),
        maxAttempts: this.toInt(
          map.get(APP_CONFIG_KEY.loginMaxAttempts),
          DEFAULT_MAX_ATTEMPTS,
        ),
        lockoutSeconds: this.toInt(
          map.get(APP_CONFIG_KEY.loginLockoutSeconds),
          DEFAULT_LOCKOUT_SECONDS,
        ),
      };
    } catch (err) {
      this.logger.warn({
        msg: 'pwreset settings: AppConfig read failed, using defaults',
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        codeTtlSeconds: DEFAULT_CODE_TTL_SECONDS,
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
        lockoutSeconds: DEFAULT_LOCKOUT_SECONDS,
      };
    }
  }

  private toInt(value: string | undefined, fallback: number): number {
    if (!value) return fallback;
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }
}
