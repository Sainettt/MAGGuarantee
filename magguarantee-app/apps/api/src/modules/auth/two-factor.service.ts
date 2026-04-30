import { randomBytes, randomInt } from 'node:crypto';

import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

// HttpStatus does not include 423 LOCKED. Use a literal — single source.
const HTTP_LOCKED = 423;

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  APP_CONFIG_KEY,
  DEFAULT_CODE_TTL_SECONDS,
  DEFAULT_LOCKOUT_SECONDS,
  DEFAULT_MAX_ATTEMPTS,
  REDIS_KEY,
  RESEND_COOLDOWN_SECONDS,
} from './auth.constants';

export interface TwoFactorSettings {
  codeTtlSeconds: number;
  maxAttempts: number;
  lockoutSeconds: number;
}

/**
 * 2FA implementation per docs/15-auth-strategy.md#2fa.
 *
 * Redis is the only source of truth for code state. Keys:
 *   2fa:code:{sessionToken}      → 6-digit code (TTL = code-ttl)
 *   2fa:session:{sessionToken}   → userId (TTL = code-ttl)
 *   2fa:attempts:{sessionToken}  → counter
 *   2fa:lockout:{sessionToken}   → marker (TTL = lockout)
 *   2fa:resend:{sessionToken}    → marker (TTL = 60s)
 *
 * Tunables come from AppConfig with hard-coded fallbacks if a row is missing.
 */
@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Mints a new sessionToken + 6-digit code, persists both, returns them so
   * the AuthService can email the code.
   */
  async issueCode(userId: string): Promise<{ sessionToken: string; code: string }> {
    const settings = await this.loadSettings();
    const sessionToken = randomBytes(32).toString('hex');
    const code = this.generateCode();

    await this.redis.setex(
      REDIS_KEY.code(sessionToken),
      settings.codeTtlSeconds,
      code,
    );
    await this.redis.setex(
      REDIS_KEY.session(sessionToken),
      settings.codeTtlSeconds,
      userId,
    );

    return { sessionToken, code };
  }

  /**
   * Mints a fake sessionToken with NO matching code in Redis. Used by the
   * account-enumeration-safe response path: callers always get a sessionToken
   * back, but for unknown logins / wrong passwords the token will never
   * verify. Adds a session marker holding a sentinel userId so /verify-code
   * burns attempts identically to a real session.
   */
  async issueDecoyToken(): Promise<string> {
    const settings = await this.loadSettings();
    const sessionToken = randomBytes(32).toString('hex');
    // No 2fa:code:* key — verify will always fail with "code expired".
    await this.redis.setex(
      REDIS_KEY.session(sessionToken),
      settings.codeTtlSeconds,
      'decoy',
    );
    return sessionToken;
  }

  /**
   * Returns the userId tied to the session and consumes the code on success.
   *
   * Throws:
   *  - 423 LOCKED (`Locked`) if the session is currently locked out.
   *  - 401 (`Code expired`) if no code is in Redis (TTL elapsed or decoy).
   *  - 401 (`Invalid code, attempts left N`) on a wrong code that did NOT
   *    yet hit max attempts.
   *  - 423 LOCKED (`Too many attempts`) when the wrong code was the
   *    `maxAttempts`-th in a row.
   */
  async verifyCode(sessionToken: string, code: string): Promise<string> {
    const settings = await this.loadSettings();

    if (await this.redis.exists(REDIS_KEY.lockout(sessionToken))) {
      const lockedForSec = await this.redis.ttl(REDIS_KEY.lockout(sessionToken));
      throw new HttpException(
        {
          statusCode: HTTP_LOCKED,
          message: 'Too many attempts',
          lockedForSec: Math.max(0, lockedForSec),
        },
        HTTP_LOCKED,
      );
    }

    const stored = await this.redis.get(REDIS_KEY.code(sessionToken));
    if (!stored) {
      throw new UnauthorizedException('Code expired');
    }

    if (stored !== code) {
      const attempts = await this.redis.incr(REDIS_KEY.attempts(sessionToken));
      // Keep the attempts counter aligned with the code TTL — once the code
      // expires, attempts reset naturally.
      await this.redis.expire(
        REDIS_KEY.attempts(sessionToken),
        settings.codeTtlSeconds,
      );

      if (attempts >= settings.maxAttempts) {
        await this.redis.setex(
          REDIS_KEY.lockout(sessionToken),
          settings.lockoutSeconds,
          '1',
        );
        // Burn the code — the user must restart the login flow.
        await this.redis.del(
          REDIS_KEY.code(sessionToken),
          REDIS_KEY.attempts(sessionToken),
          REDIS_KEY.session(sessionToken),
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

    const userId = await this.redis.get(REDIS_KEY.session(sessionToken));
    if (!userId || userId === 'decoy') {
      // Should be impossible — code matched but session is missing/decoy.
      // Treat as theft suspicion: clean up and reject.
      await this.consumeSession(sessionToken);
      throw new UnauthorizedException('Code expired');
    }
    await this.consumeSession(sessionToken);
    return userId;
  }

  /**
   * Returns the userId tied to this session, or null if the session is
   * unknown / decoy. Read-only — does not consume the session.
   */
  async peekUserId(sessionToken: string): Promise<string | null> {
    const userId = await this.redis.get(REDIS_KEY.session(sessionToken));
    if (!userId || userId === 'decoy') return null;
    return userId;
  }

  /**
   * Generates a fresh code under an existing sessionToken and applies the
   * 60s resend cooldown. Returns null if the session no longer exists.
   */
  async resend(sessionToken: string): Promise<{ code: string; cooldownSec: number } | null> {
    if (await this.redis.exists(REDIS_KEY.resend(sessionToken))) {
      const cooldownSec = await this.redis.ttl(REDIS_KEY.resend(sessionToken));
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Resend cooldown active',
          cooldownSec: Math.max(0, cooldownSec),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const userId = await this.redis.get(REDIS_KEY.session(sessionToken));
    if (!userId || userId === 'decoy') {
      // Either the session expired or this was a decoy from an enumeration
      // probe — return null so the controller can decide on the response.
      return null;
    }

    const settings = await this.loadSettings();
    const code = this.generateCode();
    await this.redis.setex(REDIS_KEY.code(sessionToken), settings.codeTtlSeconds, code);
    // Reset attempts on a fresh code.
    await this.redis.del(REDIS_KEY.attempts(sessionToken));
    await this.redis.setex(
      REDIS_KEY.resend(sessionToken),
      RESEND_COOLDOWN_SECONDS,
      '1',
    );
    return { code, cooldownSec: RESEND_COOLDOWN_SECONDS };
  }

  // ── Helpers ────────────────────────────────────────────

  private generateCode(): string {
    // randomInt is upper-bound exclusive — produces 100000..999999 inclusive.
    return randomInt(100000, 1000000).toString().padStart(6, '0');
  }

  private async consumeSession(sessionToken: string): Promise<void> {
    await this.redis.del(
      REDIS_KEY.code(sessionToken),
      REDIS_KEY.attempts(sessionToken),
      REDIS_KEY.session(sessionToken),
      REDIS_KEY.resend(sessionToken),
    );
  }

  private async loadSettings(): Promise<TwoFactorSettings> {
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
        msg: '2fa settings: AppConfig read failed, using defaults',
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
