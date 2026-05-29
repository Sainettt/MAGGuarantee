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
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import type { UserRow } from '../users/users.repository';
import { PasswordService } from './password.service';
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
    await this.mail.send2faCode(user.email, code);

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
      await this.mail.send2faCode(user.email, result.code);
    }
    return { ok: true, cooldownSec: result.cooldownSec };
  }

  // ── Refresh ──────────────────────────────────────────

  async refresh(
    userId: string,
    rawRefreshToken: string,
    ctx: { ipAddress?: string; userAgent?: string },
  ): Promise<{ user: UserDto; tokens: TokenPair }> {
    const tokenHash = this.sha256(rawRefreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (!stored || stored.userId !== userId) {
      throw new UnauthorizedException('No such token');
    }
    if (stored.revokedAt) {
      // Theft detected — revoke ALL active tokens for this user.
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
        // Concurrent rotation of the SAME token slipped past the read-time
        // `revokedAt` check above (TOCTOU). The atomic claim inside issuePair
        // caught it — treat as theft and revoke every active session.
        await this.revokeAllForUser(userId);
        this.logger.warn({
          msg: 'refresh-token reuse detected (concurrent rotation), revoked all sessions',
          userId,
          tokenId: stored.id,
        });
        throw new UnauthorizedException(
          'Token reuse detected — all sessions revoked',
        );
      }
      throw err;
    }
    return { user: this.toUserDto(user), tokens };
  }

  // ── Logout ───────────────────────────────────────────

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) return;
    const tokenHash = this.sha256(rawRefreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (!stored || stored.revokedAt) return;
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
  }

  // ── Public helpers used by controllers ───────────────

  toUserDto(user: UserRow): UserDto {
    return {
      id: user.id,
      login: user.login,
      email: user.email ?? '',
      name: user.name ?? user.login,
      role: user.role,
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
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role },
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
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
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
