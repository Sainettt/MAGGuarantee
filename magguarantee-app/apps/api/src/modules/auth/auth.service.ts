import { createHash, randomUUID } from 'node:crypto';

import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { UserDto } from '@magguarantee/shared';

import type { Env } from '../../config/env.schema';
import { REFRESH_ROTATION_GRACE_MS } from './auth.constants';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import type { UserRow } from '../users/users.repository';
import { PasswordService } from './password.service';
import { PasswordResetService } from './password-reset.service';
import { RefreshTokenRepository } from './refresh-token.repository';
import { TwoFactorService } from './two-factor.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenId: string;
  refreshExpiresAt: Date;
}

interface IssueOptions {
  ipAddress?: string;
  userAgent?: string;
  /** When set, the new refresh row's `replacedById` chain is updated. */
  oldRefreshTokenId?: string;
}

/**
 * Internal sentinel thrown from `issuePair` when the atomic "claim" of the
 * old refresh token matches 0 rows — i.e. a concurrent refresh already
 * rotated (revoked) it between our read and our write. Treated as token
 * reuse by the caller: revoke all sessions and 401. Never leaves the service.
 */
class RefreshReuseError extends Error {}

/**
 * Phase 1 auth orchestrator.
 *
 * Responsibilities:
 *  - login: validate creds → issue 2FA code (or decoy on failure)
 *  - verifyCode: consume code → mint JWT pair + persist refresh hash
 *  - resendCode: throttled second code email
 *  - refresh: rotate token; revoke-all on reuse
 *  - logout: revoke a single refresh token row
 *
 * Business invariants (per docs/15-auth-strategy.md):
 *  - account-enumeration safety: same response shape on bad creds vs unknown
 *  - bcrypt 12 rounds, constant-time compare even on missing user
 *  - refresh rotation in a transaction; reuse → revokeAllForUser
 *  - tokens stored only as SHA-256 hashes
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly twoFactor: TwoFactorService,
    private readonly passwordReset: PasswordResetService,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly mail: MailService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // ── Step 1: login ────────────────────────────────────

  async login(
    login: string,
    password: string,
  ): Promise<{ sessionToken: string; maskedEmail: string }> {
    const user = await this.users.findByLogin(login);
    const credsOk = await this.validateCredentials(user, password);

    if (!credsOk) {
      // Account-enumeration safety: same shape on unknown login or wrong
      // password. Issue a decoy sessionToken with no code in Redis.
      const decoy = await this.twoFactor.issueDecoyToken();
      // Use a stable mask shape that does not depend on whether the user
      // exists. We always derive from the submitted login (not the email).
      return { sessionToken: decoy, maskedEmail: this.synthesizeMask(login) };
    }

    // From here we know `user` is a valid, active record with email.
    // The compiler doesn't track that through the helper, so re-narrow.
    if (!user || !user.email) {
      const decoy = await this.twoFactor.issueDecoyToken();
      return { sessionToken: decoy, maskedEmail: this.synthesizeMask(login) };
    }

    const { sessionToken, code } = await this.twoFactor.issueCode(user.id);
    // Phase 9 (early) — enqueue onto the `email-send` BullMQ queue; the
    // in-process EmailSendProcessor delivers off the request path (Mailhog in
    // dev). See docs/15-auth-strategy.md#2fa.
    await this.mail.enqueue2faCode(user.email, code);

    return {
      sessionToken,
      maskedEmail: this.maskEmail(user.email),
    };
  }

  // ── Step 2: verify code ──────────────────────────────

  async verifyCode(
    sessionToken: string,
    code: string,
    ctx: { ipAddress?: string; userAgent?: string },
  ): Promise<{ user: UserDto; tokens: TokenPair }> {
    const userId = await this.twoFactor.verifyCode(sessionToken, code);
    const user = await this.users.findById(userId);
    if (!user || !user.active || user.deletedAt || !user.email) {
      throw new UnauthorizedException('Account is no longer active');
    }
    await this.users.resetFailedAttempts(user.id);
    await this.users.updateLastLogin(user.id, new Date());

    const tokens = await this.issuePair(user, ctx);
    return { user: this.toUserDto(user), tokens };
  }

  // ── Resend ───────────────────────────────────────────

  async resendCode(
    sessionToken: string,
  ): Promise<{ ok: true; cooldownSec: number }> {
    const userId = await this.twoFactor.peekUserId(sessionToken);
    if (!userId) {
      // Account-enumeration safety: still return ok so an attacker cannot
      // tell whether the session existed. We do NOT call resend() to avoid
      // setting Redis state for a phantom session.
      return { ok: true, cooldownSec: 60 };
    }
    const result = await this.twoFactor.resend(sessionToken);
    if (!result) {
      // Concurrent expiry between peek and resend — same opaque response.
      return { ok: true, cooldownSec: 60 };
    }
    const user = await this.users.findById(userId);
    if (user?.email) {
      // Phase 9 (early) — same async path as the login send.
      await this.mail.enqueue2faCode(user.email, result.code);
    }
    return { ok: true, cooldownSec: result.cooldownSec };
  }

  // ── Forgot / reset password (anti-enumeration) ───────

  /**
   * Step 1 of the forgot-password flow. Keyed by `login`. ALWAYS returns the
   * same `{ sessionToken, maskedEmail }` shape whether or not the account
   * exists (docs/15-auth-strategy.md#account-enumeration, #reset-flooding):
   *  - known login → issue a reset code into the `pwreset:*` namespace + email.
   *  - unknown login → decoy sessionToken + plausible mask, send NOTHING.
   */
  async forgotPassword(
    login: string,
  ): Promise<{ sessionToken: string; maskedEmail: string }> {
    const user = await this.users.findByLogin(login);

    if (!user || !user.active || user.deletedAt || !user.email) {
      const decoy = await this.passwordReset.issueDecoyToken();
      return { sessionToken: decoy, maskedEmail: this.synthesizeMask(login) };
    }

    const { sessionToken, code } = await this.passwordReset.issueCode(user.id);
    await this.mail.enqueuePasswordReset(user.email, code, 10);
    return { sessionToken, maskedEmail: this.maskEmail(user.email) };
  }

  /**
   * Step 2 — confirm with the reset code + a new password. Verifies the code
   * (attempts/lockout via PasswordResetService), persists the new hash, stamps
   * `passwordChangedAt`, clears `mustChangePassword`, and revokes ALL refresh
   * tokens for the user (kills every old session). Does NOT auto-login — the
   * user returns to /login.
   */
  async resetPassword(
    sessionToken: string,
    code: string,
    newPassword: string,
  ): Promise<void> {
    const userId = await this.passwordReset.verifyCode(sessionToken, code);
    const user = await this.users.findById(userId);
    if (!user || !user.active || user.deletedAt) {
      throw new UnauthorizedException('Account is no longer active');
    }
    const passwordHash = await this.passwords.hash(newPassword);
    await this.users.applyPasswordChange(user.id, passwordHash, {
      mustChangePassword: false,
    });
    await this.revokeAllForUser(user.id);
    this.logger.log({
      msg: 'password reset confirmed; all sessions revoked',
      userId: user.id,
    });
  }

  /**
   * Resends the reset code under an existing session, honouring the 60s
   * cooldown. Opaque on unknown/decoy sessions (anti-enumeration) — mirrors
   * `resendCode` for the 2FA flow.
   */
  async resendResetCode(
    sessionToken: string,
  ): Promise<{ ok: true; cooldownSec: number }> {
    const userId = await this.passwordReset.peekUserId(sessionToken);
    if (!userId) {
      return { ok: true, cooldownSec: 60 };
    }
    const result = await this.passwordReset.resend(sessionToken);
    if (!result) {
      return { ok: true, cooldownSec: 60 };
    }
    const user = await this.users.findById(userId);
    if (user?.email) {
      await this.mail.enqueuePasswordReset(user.email, result.code, 10);
    }
    return { ok: true, cooldownSec: result.cooldownSec };
  }

  // ── Change password (authenticated, forced-change) ───

  /**
   * Authenticated change-password — covers the forced-change flow. No
   * current-password (the JWT session already proves identity; 2FA gated
   * login). Persists the new hash, stamps `passwordChangedAt`, clears
   * `mustChangePassword`, then mints a FRESH access+refresh pair carrying the
   * cleared claim (so the middleware gate lifts immediately) and revokes the
   * user's OTHER refresh tokens (keeps this session alive).
   */
  async changePassword(
    userId: string,
    newPassword: string,
    ctx: { ipAddress?: string; userAgent?: string },
  ): Promise<{ user: UserDto; tokens: TokenPair }> {
    const user = await this.users.findById(userId);
    if (!user || !user.active || user.deletedAt || !user.email) {
      throw new UnauthorizedException('Account is no longer active');
    }
    const passwordHash = await this.passwords.hash(newPassword);
    await this.users.applyPasswordChange(user.id, passwordHash, {
      mustChangePassword: false,
    });
    // Re-fetch so the issued tokens + DTO carry the cleared flag.
    const refreshed = await this.users.findById(userId);
    const effective = refreshed ?? { ...user, mustChangePassword: false };

    const tokens = await this.issuePair(effective, ctx);
    // Kill every OTHER live session; keep the one we just minted.
    await this.refreshTokens.revokeAllForUserExcept(
      user.id,
      tokens.refreshTokenId,
    );
    this.logger.log({
      msg: 'password changed; other sessions revoked',
      userId: user.id,
    });
    return { user: this.toUserDto(effective), tokens };
  }

  // ── Refresh ──────────────────────────────────────────

  async refresh(
    userId: string,
    rawRefreshToken: string,
    ctx: { ipAddress?: string; userAgent?: string },
  ): Promise<{ user: UserDto; tokens: TokenPair }> {
    const tokenHash = this.sha256(rawRefreshToken);
    const stored = await this.refreshTokens.findByHash(tokenHash);
    if (!stored || stored.userId !== userId) {
      throw new UnauthorizedException('No such token');
    }
    if (stored.revokedAt) {
      // The token is revoked. Distinguish a benign concurrent-rotation race
      // from genuine theft. A normal rotation just happened iff the token was
      // revoked very recently (within REFRESH_ROTATION_GRACE_MS) AND it points
      // at its successor (`replacedById != null`). That is the loser of the
      // parallel /auth/refresh calls the Next.js edge middleware fires on one
      // page load — NOT theft, so we must NOT kill the just-minted sibling
      // session. Anything else (revoked long ago → replay, or revoked without
      // a successor → logout/reset/admin revoke-all) is genuine reuse.
      const revokedAgeMs = Date.now() - stored.revokedAt.getTime();
      const isBenignRotationRace =
        revokedAgeMs <= REFRESH_ROTATION_GRACE_MS &&
        stored.replacedById != null;

      if (isBenignRotationRace) {
        this.logger.debug({
          msg: 'refresh-token already rotated (benign concurrent race), 401 only this request',
          userId,
          tokenId: stored.id,
          replacedById: stored.replacedById,
          revokedAgeMs,
        });
        throw new UnauthorizedException('Refresh token already rotated');
      }

      // Genuine theft — revoke ALL active tokens for this user.
      await this.revokeAllForUser(userId);
      this.logger.warn({
        msg: 'refresh-token reuse detected, revoked all sessions',
        userId,
        tokenId: stored.id,
      });
      throw new UnauthorizedException('Token reuse detected — all sessions revoked');
    }
    if (stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.users.findById(userId);
    if (!user || !user.active || user.deletedAt || !user.email) {
      throw new UnauthorizedException('Account is no longer active');
    }

    let tokens: TokenPair;
    try {
      tokens = await this.issuePair(user, {
        ...ctx,
        oldRefreshTokenId: stored.id,
      });
    } catch (err) {
      if (err instanceof RefreshReuseError) {
        // The atomic claim inside issuePair matched 0 rows: between our
        // read-time `revokedAt` check (which saw the token still live) and our
        // write, a CONCURRENT /auth/refresh rotated this exact token. This is
        // ALWAYS a benign rotation race — a genuine replay would have had
        // `revokedAt` already set at read time and been caught (and judged) in
        // Part A above. So 401 only this losing request; do NOT revoke the
        // sibling session the winner just minted.
        this.logger.debug({
          msg: 'refresh-token rotated concurrently (claim lost the race), 401 only this request',
          userId,
          tokenId: stored.id,
        });
        throw new UnauthorizedException('Refresh token already rotated');
      }
      throw err;
    }
    return { user: this.toUserDto(user), tokens };
  }

  // ── Logout ───────────────────────────────────────────

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) return;
    const tokenHash = this.sha256(rawRefreshToken);
    const stored = await this.refreshTokens.findByHash(tokenHash);
    if (!stored || stored.revokedAt) return;
    await this.refreshTokens.revokeById(stored.id);
  }

  // ── Public helpers used by controllers ───────────────

  toUserDto(user: UserRow): UserDto {
    return {
      id: user.id,
      login: user.login,
      email: user.email ?? '',
      name: user.name ?? user.login,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
  }

  // ── Internals ────────────────────────────────────────

  private async validateCredentials(
    user: UserRow | null,
    password: string,
  ): Promise<boolean> {
    if (!user) {
      // Constant-time miss — runs bcrypt against the dummy hash.
      await this.passwords.compareConstantTime(password, null);
      return false;
    }
    if (!user.active || user.deletedAt) {
      // Same constant-time penalty so timing doesn't differ.
      await this.passwords.compareConstantTime(password, user.passwordHash);
      return false;
    }
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await this.passwords.compareConstantTime(password, user.passwordHash);
      return false;
    }
    const ok = await this.passwords.compareConstantTime(
      password,
      user.passwordHash,
    );
    if (!ok) {
      // Bump failed-attempts counter only for real users — never for unknown
      // logins (per docs/15-auth-strategy.md#account-enumeration).
      try {
        await this.users.incrementFailedAttempts(user.id);
      } catch (err) {
        this.logger.warn({
          msg: 'failed to bump failedAttempts',
          userId: user.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return ok;
  }

  private async issuePair(
    user: UserRow,
    opts: IssueOptions,
  ): Promise<TokenPair> {
    const refreshTtlMs = this.parseTtlMs(
      this.config.get('JWT_REFRESH_TTL', { infer: true }),
    );
    const accessTtl = this.config.get('JWT_ACCESS_TTL', { infer: true });
    const refreshTtl = this.config.get('JWT_REFRESH_TTL', { infer: true });
    const accessSecret = this.config.get('JWT_ACCESS_SECRET', { infer: true });
    const refreshSecret = this.config.get('JWT_REFRESH_SECRET', {
      infer: true,
    });

    const jti = randomUUID();
    const refreshExpiresAt = new Date(Date.now() + refreshTtlMs);

    // Note: @nestjs/jwt v11 narrows `expiresIn` to its `ms`-style template
    // literal — env-driven strings ('15m', '30d') are valid at runtime but
    // not statically inferred. Cast through `unknown` to keep strict mode.
    // `mustChangePassword` is part of the access-token claims so the Next.js
    // edge middleware can gate the forced-change screen by decoding `mt_access`
    // alone — without a round-trip to /auth/me. See docs/15-auth-strategy.md
    // (forced-change gate) and apps/web/middleware.ts.
    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
      {
        secret: accessSecret,
        expiresIn: accessTtl as unknown as number,
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, jti },
      {
        secret: refreshSecret,
        expiresIn: refreshTtl as unknown as number,
      },
    );
    const tokenHash = this.sha256(refreshToken);

    // One transaction: atomically claim+revoke old (if rotating) + insert new
    // + link chain. The "claim" is a guarded `updateMany` that only matches a
    // still-active row — if a concurrent refresh already rotated this token,
    // it matches 0 rows and we abort the whole tx (no new token minted) so the
    // caller can treat it as reuse. This closes the read-then-write TOCTOU
    // window that the plain pre-read `revokedAt` check left open.
    const created = await this.prisma.$transaction(async (tx) => {
      if (opts.oldRefreshTokenId) {
        const claimed = await tx.refreshToken.updateMany({
          where: { id: opts.oldRefreshTokenId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        if (claimed.count !== 1) {
          throw new RefreshReuseError();
        }
      }
      const newRow = await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: refreshExpiresAt,
          ipAddress: opts.ipAddress ?? null,
          userAgent: opts.userAgent ?? null,
        },
      });
      if (opts.oldRefreshTokenId) {
        // Old token "was replaced by" the new one. Per our schema:
        // oldToken.replacedById = newToken.id.
        await tx.refreshToken.update({
          where: { id: opts.oldRefreshTokenId },
          data: { replacedById: newRow.id },
        });
      }
      return newRow;
    });

    return {
      accessToken,
      refreshToken,
      refreshTokenId: created.id,
      refreshExpiresAt,
    };
  }

  private async revokeAllForUser(userId: string): Promise<void> {
    await this.refreshTokens.revokeAllForUser(userId);
  }

  private sha256(s: string): string {
    return createHash('sha256').update(s).digest('hex');
  }

  private parseTtlMs(ttl: string): number {
    // Supports `<number>` (ms), `<n>s`, `<n>m`, `<n>h`, `<n>d`.
    const match = /^(\d+)\s*(ms|s|m|h|d)?$/.exec(ttl.trim());
    if (!match) {
      throw new Error(`Invalid TTL: ${ttl}`);
    }
    const n = Number.parseInt(match[1] ?? '0', 10);
    const unit = match[2] ?? 'ms';
    const factor: Record<string, number> = {
      ms: 1,
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return n * (factor[unit] ?? 1);
  }

  private maskEmail(email: string): string {
    const at = email.indexOf('@');
    if (at <= 0) return '***';
    const local = email.slice(0, at);
    const domain = email.slice(at);
    if (local.length <= 2) return `${local[0] ?? ''}***${domain}`;
    return `${local.slice(0, 2)}***${domain}`;
  }

  private synthesizeMask(login: string): string {
    // Generate a plausible-looking masked email for unknown logins so the
    // response is shape-equivalent to a real one.
    const base = login.toLowerCase().replace(/[^a-z0-9._-]/g, '');
    const local = base.length >= 2 ? base.slice(0, 2) : (base + 'xx').slice(0, 2);
    return `${local}***@magtrans.eu`;
  }
}
