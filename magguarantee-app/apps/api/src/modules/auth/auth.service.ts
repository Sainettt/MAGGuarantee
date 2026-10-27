import { createHash, randomUUID } from 'node:crypto';

import {
  ForbiddenException,
  type HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  SSO_DIRECTORY_UNAVAILABLE,
  SSO_INACTIVE,
  SSO_NOT_EMPLOYEE,
  SSO_NOT_FOR_CARRIER,
  SSO_NO_ROLE,
  type Role,
  type UserDto,
} from '@magguarantee/shared';

import {
  effectivePermissions,
  toPermissionList,
} from '../../common/authz/effective-permissions';
import type { Env } from '../../config/env.schema';
import {
  LOGIN_LOCKOUT_MS,
  LOGIN_MAX_FAILED_ATTEMPTS,
  REFRESH_ROTATION_GRACE_MS,
} from './auth.constants';
import { AuditWriter } from '../audit/audit.service';
import type { AuditActor, AuditEntryInput } from '../audit/audit.types';
import {
  logAuthFailure,
  loginFingerprint,
  type AuthRequestContext,
} from './auth-security-log';
import {
  VerificationCodeLockoutException,
  VerificationCodeOrphanedException,
} from './verification-code.errors';
import { MailService } from '../mail/mail.service';
import { DirectoryService } from '../directory/directory.service';
import { GoogleIdTokenService } from './google/google-id-token.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import type { UserRow } from '../users/users.repository';
import { PasswordService } from './password.service';
import { PasswordResetService } from './password-reset.service';
import {
  RefreshTokenRepository,
  type RefreshTokenRow,
} from './refresh-token.repository';
import { TwoFactorService } from './two-factor.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenId: string;
  refreshExpiresAt: Date;
}

/**
 * Result of a refresh that lost a benign concurrent-rotation race and was
 * healed with a fresh access token only (see `healRotationRace`). No rotation
 * happened, so there is no refresh token to set — the winner's rotated pair
 * is already in (or on its way to) the browser jar.
 */
export interface AccessOnlyToken {
  accessToken: string;
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
 * Which branch of `loginWithGoogle` admitted the user. Recorded on the
 * `googleLogin` audit row so an operator can tell a break-glass admin sign-in
 * (`local`) and an admission on a cached role while MAGSpace was down
 * (`directory_unavailable`) apart from the normal path.
 */
type GoogleLoginPath = 'local' | 'directory' | 'directory_unavailable';

/**
 * Outcome of the password check. The reason never reaches the client — every
 * failure gets the same decoy response — it only feeds the WARN log line.
 */
type CredentialCheck =
  | { ok: true }
  | {
      ok: false;
      reason: 'unknown_login' | 'account_inactive' | 'account_locked' | 'wrong_password';
    };

/** Which code flow a verification-code audit event belongs to. */
type CodeFlow = 'twoFactor' | 'passwordReset';

const CODE_LOCKOUT_ACTION: Record<CodeFlow, string> = {
  twoFactor: 'lockTwoFactorSession',
  passwordReset: 'lockPasswordResetSession',
};

/**
 * Phase 1 auth orchestrator.
 *
 * Responsibilities:
 *  - login: validate creds → issue 2FA code (or decoy on failure)
 *  - verifyCode: consume code → mint JWT pair + persist refresh hash
 *  - loginWithGoogle: verify id_token → resolve against MAGSpace → mint pair
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
    private readonly googleIdToken: GoogleIdTokenService,
    private readonly directory: DirectoryService,
    private readonly audit: AuditWriter,
  ) {}

  // ── Step 1: login ────────────────────────────────────

  async login(
    login: string,
    password: string,
    ctx: AuthRequestContext = {},
  ): Promise<{ sessionToken: string; maskedEmail: string }> {
    const user = await this.users.findByLogin(login);
    const check = await this.validateCredentials(user, password, ctx);

    // `user` is re-narrowed here because the compiler doesn't track that
    // through the helper; an active account without an e-mail cannot receive
    // a code, so it takes the decoy path too.
    if (!check.ok || !user || !user.email) {
      // Account-enumeration safety: same shape on unknown login or wrong
      // password. The log line is the only place the reason goes.
      logAuthFailure(
        this.logger,
        'loginRefused',
        check.ok ? 'account_without_email' : check.reason,
        ctx,
        user ? { userId: user.id } : { loginFingerprint: loginFingerprint(login) },
      );
      // Issue a decoy sessionToken with no code in Redis.
      const decoy = await this.twoFactor.issueDecoyToken();
      // Use a stable mask shape that does not depend on whether the user
      // exists. We always derive from the submitted login (not the email).
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

  /**
   * The `passwordLogin` audit row is written here for the same reason as
   * `googleLogin` (see `_finishGoogleLogin`): the route is `@Public()`, so
   * only the service knows who signed in. Written before the tokens are
   * minted — a failed audit write costs the session, never the trail.
   */
  async verifyCode(
    sessionToken: string,
    code: string,
    ctx: AuthRequestContext,
  ): Promise<{ user: UserDto; tokens: TokenPair }> {
    const userId = await this._withCodeAudit('twoFactor', ctx, () =>
      this.twoFactor.verifyCode(sessionToken, code, ctx),
    );
    const user = await this.users.findById(userId);
    if (!user || !user.active || user.deletedAt || !user.email) {
      // Deactivated between the password step and the code step.
      logAuthFailure(this.logger, 'loginRefused', 'account_inactive_at_verify', ctx, {
        userId,
      });
      throw new UnauthorizedException('Account is no longer active');
    }
    await this.audit.log({
      action: 'passwordLogin',
      targetType: 'User',
      targetKey: user.login,
      metadata: { userAgent: ctx.userAgent ?? null },
      actor: this._actorFor(user, ctx),
    });
    await this.users.resetFailedAttempts(user.id);
    await this.users.updateLastLogin(user.id, new Date());

    const tokens = await this.issuePair(user, ctx);
    this.logger.log({ msg: 'password login', userId: user.id, role: user.role });
    return { user: await this.toUserDto(user), tokens };
  }

  // ── Google SSO (docs/24 трек A) ──────────────────────

  /**
   * Signs an employee in with a Google `id_token`.
   *
   * Ends in exactly the same place as `verifyCode`: cookies set, `UserDto`
   * returned. No 2FA code is sent — Google already proved the account belongs
   * to this person and Workspace applied its own second factor (decision #6).
   *
   * The order of the checks below is the whole design, so it is worth being
   * explicit about why each one is where it is:
   *
   *   1. **Carriers first.** A carrier who happens to hold a `@magtrans.eu`
   *      address must be told to use their password, not silently handed an
   *      employee session.
   *   2. **Locally-managed users skip MAGSpace entirely.** Admins are the
   *      break-glass path: they must be able to sign in while the directory is
   *      down, and their role must never be derivable from a stanowisko.
   *   3. **Directory unreachable ≠ not an employee.** An existing active
   *      managed user is let in on their last synced role; only someone we have
   *      no record of is turned away. The reconcile bounds how stale that role
   *      can be.
   *   4. **Anything the directory refuses deprovisions an existing account.**
   *      Terminated, unknown, or holding a stanowisko with no mapping — all
   *      three mean "no access from now on", and leaving the account live until
   *      the next cron run would be a strictly worse answer than revoking it
   *      here, where we already know.
   */
  async loginWithGoogle(
    idToken: string,
    ctx: AuthRequestContext,
  ): Promise<{ user: UserDto; tokens: TokenPair }> {
    const identity = await this.googleIdToken.verifyIdToken(idToken, ctx);

    // `sub` is the durable key; e-mail only bootstraps the very first link.
    const local =
      (await this.users.findByGoogleSub(identity.sub)) ??
      (await this.users.findByEmail(identity.email));

    if (local?.role === 'przewoznik') {
      this._refuseGoogleLogin(
        'carrier_account',
        ctx,
        local.id,
        new ForbiddenException({
          message: 'Przewoźnicy logują się loginem i hasłem.',
          extensions: { code: SSO_NOT_FOR_CARRIER },
        }),
      );
    }

    // ── Locally-managed accounts (admins and anyone an admin took back) ──
    if (local && local.managedBy === 'local') {
      if (!local.active || local.deletedAt) {
        this._refuseGoogleLogin(
          'account_inactive',
          ctx,
          local.id,
          new UnauthorizedException('Account is no longer active'),
        );
      }
      const linked = local.googleSub
        ? local
        : await this.directory.linkGoogleAccount(local, identity.sub);
      return this._finishGoogleLogin(linked, ctx, 'local');
    }

    // ── Directory-managed accounts ──────────────────────
    const lookup = await this.directory.resolveEmployee(identity.email);

    if (lookup.kind === 'unavailable') {
      if (local && local.active && !local.deletedAt) {
        this.logger.warn({
          msg: 'MAGSpace unavailable — admitting an existing managed user on the cached role',
          userId: local.id,
          role: local.role,
        });
        return this._finishGoogleLogin(local, ctx, 'directory_unavailable');
      }
      this._refuseGoogleLogin(
        'directory_unavailable',
        ctx,
        local?.id ?? null,
        new ServiceUnavailableException({
          message: 'MAGSpace chwilowo niedostępny. Spróbuj za chwilę lub zaloguj się hasłem.',
          extensions: { code: SSO_DIRECTORY_UNAVAILABLE },
        }),
      );
    }

    if (lookup.kind === 'not_found') {
      if (local) await this.directory.deprovision(local, 'not_found');
      this._refuseGoogleLogin(
        'not_in_directory',
        ctx,
        local?.id ?? null,
        new ForbiddenException({
          message: 'Nie znaleziono Cię w MAGSpace. Skontaktuj się z przełożonym.',
          extensions: { code: SSO_NOT_EMPLOYEE },
        }),
      );
    }

    const employee = lookup.employee;
    if (!employee.active) {
      if (local) await this.directory.deprovision(local, 'inactive');
      this._refuseGoogleLogin(
        'employee_inactive',
        ctx,
        local?.id ?? null,
        new ForbiddenException({
          message: 'Twoje konto pracownika jest nieaktywne.',
          extensions: { code: SSO_INACTIVE },
        }),
      );
    }

    // An admin-granted role bypasses the mapping — that is what it is for.
    const mapped = await this.directory.accessFor(employee.stanowisko);
    const role = local?.roleOverride ?? mapped?.role ?? null;
    if (!role) {
      // Not an error condition so much as an onboarding step for the mixed
      // stanowiska: tell the admins who is waiting, then refuse (docs/24 §4).
      await this.directory.notifyAccessRequested(employee);
      if (local) await this.directory.deprovision(local, 'unmapped');
      this._refuseGoogleLogin(
        'no_role_for_stanowisko',
        ctx,
        local?.id ?? null,
        new ForbiddenException({
          message:
            'Twoje stanowisko nie ma jeszcze dostępu do MAGGuarantee. Administrator został powiadomiony.',
          extensions: { code: SSO_NO_ROLE },
        }),
      );
    }

    const user = await this.directory.provisionOrSync({
      existing: local,
      employee,
      role,
      // The mapping's flag. `provisionOrSync` ignores it for a hand-granted
      // role (the stored flag stays) — same ownership rule as `role`, docs/28 §2.
      lider: mapped?.lider ?? false,
      googleSub: identity.sub,
    });
    return this._finishGoogleLogin(user, ctx, 'directory');
  }

  /**
   * Shared tail of every successful Google sign-in. Mirrors `verifyCode`:
   * clearing `failedAttempts` matters because a lockout earned on the password
   * form would otherwise outlive a perfectly good Google login.
   *
   * The `googleLogin` audit row is written here and not by an `@Audit()` on the
   * controller: the route is `@Public()`, so the interceptor has no `req.user`
   * to attribute it to and falls back to `actor: 'system'` — which
   * `AuditWriter` refuses for a non-`system.` action, turning every successful
   * sign-in into a 500. Only this method knows who signed in. It runs before
   * the tokens are minted, so a failed audit write costs the session rather
   * than leaving an unaudited one.
   */
  private async _finishGoogleLogin(
    user: UserRow,
    ctx: AuthRequestContext,
    via: GoogleLoginPath,
  ): Promise<{ user: UserDto; tokens: TokenPair }> {
    await this.audit.log({
      action: 'googleLogin',
      targetType: 'User',
      targetKey: user.login,
      metadata: { via, userAgent: ctx.userAgent ?? null },
      actor: this._actorFor(user, ctx),
    });
    await this.users.resetFailedAttempts(user.id);
    await this.users.updateLastLogin(user.id, new Date());
    const tokens = await this.issuePair(user, ctx);
    this.logger.log({ msg: 'google login', userId: user.id, role: user.role, via });
    return { user: await this.toUserDto(user), tokens };
  }

  // ── Resend ───────────────────────────────────────────

  async resendCode(
    sessionToken: string,
    ctx: AuthRequestContext = {},
  ): Promise<{ ok: true; cooldownSec: number }> {
    const userId = await this.twoFactor.peekUserId(sessionToken);
    if (!userId) {
      // Account-enumeration safety: still return ok so an attacker cannot
      // tell whether the session existed. We do NOT call resend() to avoid
      // setting Redis state for a phantom session.
      return { ok: true, cooldownSec: 60 };
    }
    const result = await this.twoFactor.resend(sessionToken, ctx);
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
   *
   * The `resetPassword` audit row is written from here (public route, see
   * `verifyCode`), right before the change: a failed audit write costs the
   * reset — the user asks for a new code — rather than leaving it unaudited.
   */
  async resetPassword(
    sessionToken: string,
    code: string,
    newPassword: string,
    ctx: AuthRequestContext = {},
  ): Promise<void> {
    const userId = await this._withCodeAudit('passwordReset', ctx, () =>
      this.passwordReset.verifyCode(sessionToken, code, ctx),
    );
    const user = await this.users.findById(userId);
    if (!user || !user.active || user.deletedAt) {
      logAuthFailure(this.logger, 'passwordResetRefused', 'account_inactive', ctx, {
        userId,
      });
      throw new UnauthorizedException('Account is no longer active');
    }
    const passwordHash = await this.passwords.hash(newPassword);
    await this.audit.log({
      action: 'resetPassword',
      targetType: 'User',
      targetKey: user.login,
      metadata: { via: 'forgotPassword', userAgent: ctx.userAgent ?? null },
      actor: this._actorFor(user, ctx),
    });
    await this.users.applyPasswordChange(user.id, passwordHash, {
      mustChangePassword: false,
    });
    const sessionsRevoked = await this.revokeAllForUser(user.id);
    this.logger.log({
      msg: 'password reset confirmed; all sessions revoked',
      userId: user.id,
      sessionsRevoked,
      ipAddress: ctx.ipAddress ?? null,
    });
  }

  /**
   * Resends the reset code under an existing session, honouring the 60s
   * cooldown. Opaque on unknown/decoy sessions (anti-enumeration) — mirrors
   * `resendCode` for the 2FA flow.
   */
  async resendResetCode(
    sessionToken: string,
    ctx: AuthRequestContext = {},
  ): Promise<{ ok: true; cooldownSec: number }> {
    const userId = await this.passwordReset.peekUserId(sessionToken);
    if (!userId) {
      return { ok: true, cooldownSec: 60 };
    }
    const result = await this.passwordReset.resend(sessionToken, ctx);
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
    ctx: AuthRequestContext,
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
    return { user: await this.toUserDto(effective), tokens };
  }

  // ── Refresh ──────────────────────────────────────────

  async refresh(
    userId: string,
    rawRefreshToken: string,
    ctx: AuthRequestContext,
  ): Promise<{ user: UserDto; tokens: TokenPair | AccessOnlyToken }> {
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
      // parallel /auth/refresh calls (edge middleware per document/RSC/prefetch
      // request, the client interceptor, sibling tabs) on one shared token —
      // NOT theft, so we must NOT kill the just-minted sibling session.
      // Anything else (revoked long ago → replay, or revoked without a
      // successor → logout/reset/admin revoke-all) is genuine reuse.
      const revokedAgeMs = Date.now() - stored.revokedAt.getTime();
      const isBenignRotationRace =
        revokedAgeMs <= REFRESH_ROTATION_GRACE_MS &&
        stored.replacedById != null;

      if (isBenignRotationRace) {
        // Heal the loser instead of 401-ing it: the Next.js middleware
        // translates a failed refresh into a login redirect, so a benign
        // race on a document navigation used to bounce a LIVE session to
        // /login. Mint an access-only token bound to the winner's session.
        const healed = await this.healRotationRace(userId, stored.replacedById);
        if (healed) {
          // INFO, not DEBUG: this branch hands out an access token for a
          // revoked refresh token, which is exactly what a replay inside the
          // grace window also looks like — it must be visible in prod logs.
          this.logger.log({
            msg: 'refresh-token already rotated (benign concurrent race) — healed with access-only token',
            userId,
            tokenId: stored.id,
            replacedById: stored.replacedById,
            revokedAgeMs,
            ipAddress: ctx.ipAddress ?? null,
          });
          return healed;
        }
        // Successor chain is dead (logout/reset raced in) or user inactive —
        // the session is genuinely over; 401 without revoke-all.
        throw new UnauthorizedException('Refresh token already rotated');
      }

      // Genuine theft — revoke ALL active tokens for this user.
      await this._handleRefreshReuse(stored, revokedAgeMs, ctx);
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
        // Part A above. Heal the loser with an access-only token (same
        // contract as the Part A benign branch); do NOT revoke the sibling
        // session the winner just minted.
        const reRead = await this.refreshTokens.findByHash(tokenHash);
        const healed = await this.healRotationRace(
          userId,
          reRead?.replacedById ?? null,
        );
        if (healed) {
          this.logger.log({
            msg: 'refresh-token rotated concurrently (claim lost the race) — healed with access-only token',
            userId,
            tokenId: stored.id,
            ipAddress: ctx.ipAddress ?? null,
          });
          return healed;
        }
        throw new UnauthorizedException('Refresh token already rotated');
      }
      throw err;
    }
    return { user: await this.toUserDto(user), tokens };
  }

  /**
   * Benign concurrent-rotation heal (the "reuse interval" pattern): the caller
   * lost a refresh race that a sibling request won moments ago. Instead of
   * 401-ing — which the web layer translates into a login redirect for
   * document navigations — mint a fresh ACCESS token for the same user,
   * WITHOUT rotating again and WITHOUT touching the refresh cookie.
   *
   * Guarded by the successor-chain check so a session that was genuinely ended
   * (logout / password reset / admin revoke revokes the successor) cannot be
   * resurrected by its predecessor inside the grace window. Returns null when
   * the session is dead or the user is no longer active — callers then 401.
   */
  private async healRotationRace(
    userId: string,
    firstSuccessorId: string | null,
  ): Promise<{ user: UserDto; tokens: AccessOnlyToken } | null> {
    if (!firstSuccessorId) return null;
    if (!(await this.successorChainAlive(firstSuccessorId))) return null;
    const user = await this.users.findById(userId);
    if (!user || !user.active || user.deletedAt || !user.email) return null;
    return {
      user: await this.toUserDto(user),
      tokens: { accessToken: await this.signAccessToken(user) },
    };
  }

  /**
   * Follows the `replacedById` chain from a rotation's successor to its live
   * end. Rapid successive rotations (prefetch → click → another nav) can chain
   * several rows within one grace window, so a revoked-but-replaced link keeps
   * the walk going; a revoked link WITHOUT a successor means the session was
   * ended for real. Depth-capped against pathological cycles.
   */
  private async successorChainAlive(firstId: string): Promise<boolean> {
    let nextId: string | null = firstId;
    for (let depth = 0; nextId && depth < 10; depth += 1) {
      const row: RefreshTokenRow | null =
        await this.refreshTokens.findById(nextId);
      if (!row) return false;
      if (row.revokedAt === null) {
        return row.expiresAt.getTime() > Date.now();
      }
      nextId = row.replacedById;
    }
    return false;
  }

  // ── Logout ───────────────────────────────────────────

  /**
   * Revokes the session first and audits second, best-effort: a logout that
   * 500s on a failed audit write would leave the very session the user is
   * trying to end alive, and the cookies uncleared. Nothing is audited when
   * there was no live session to end.
   */
  async logout(
    rawRefreshToken: string | undefined,
    ctx: AuthRequestContext = {},
  ): Promise<void> {
    if (!rawRefreshToken) return;
    const tokenHash = this.sha256(rawRefreshToken);
    const stored = await this.refreshTokens.findByHash(tokenHash);
    if (!stored || stored.revokedAt) return;
    await this.refreshTokens.revokeById(stored.id);
    await this._auditForUserId(stored.userId, (user) => ({
      action: 'logout',
      targetType: 'User',
      targetKey: user.login,
      metadata: { tokenId: stored.id, userAgent: ctx.userAgent ?? null },
      actor: this._actorFor(user, ctx),
    }));
  }

  // ── Public helpers used by controllers ───────────────

  /**
   * The `user` of every session-issuing response (verify-code, google,
   * refresh, change-password). The web seeds its `/auth/me` cache from it, so
   * it must match `GET /auth/me` field for field — `permissions` included
   * (docs/25 B4; with the B6 overrides), computed by the same helper the
   * access strategy uses, and `carrierId` resolved by {@link ownCarrierId}.
   */
  async toUserDto(user: UserRow): Promise<UserDto> {
    return {
      id: user.id,
      login: user.login,
      email: user.email ?? '',
      name: user.name ?? user.login,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      lider: user.lider,
      permissions: toPermissionList(effectivePermissions(user)),
      carrierId: await this.ownCarrierId(user.id, user.role),
    };
  }

  /**
   * `UserDto.carrierId` (docs/25 §3 B6, decision Q2): the user's own live
   * `Carrier.id` for a `przewoznik`, `null` for every other role WITHOUT a
   * query. One indexed lookup (`Carrier.userId` is UNIQUE), run only where a
   * `UserDto` is built — never in `JwtAccessStrategy`, so ordinary requests
   * pay nothing (see `UsersRepository.findOwnCarrierId`).
   */
  async ownCarrierId(userId: string, role: Role): Promise<string | null> {
    if (role !== 'przewoznik') return null;
    return this.users.findOwnCarrierId(userId);
  }

  // ── Internals ────────────────────────────────────────

  private async validateCredentials(
    user: UserRow | null,
    password: string,
    ctx: AuthRequestContext,
  ): Promise<CredentialCheck> {
    if (!user) {
      // Constant-time miss — runs bcrypt against the dummy hash.
      await this.passwords.compareConstantTime(password, null);
      return { ok: false, reason: 'unknown_login' };
    }
    if (!user.active || user.deletedAt) {
      // Same constant-time penalty so timing doesn't differ.
      await this.passwords.compareConstantTime(password, user.passwordHash);
      return { ok: false, reason: 'account_inactive' };
    }
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await this.passwords.compareConstantTime(password, user.passwordHash);
      return { ok: false, reason: 'account_locked' };
    }
    const ok = await this.passwords.compareConstantTime(
      password,
      user.passwordHash,
    );
    if (ok) return { ok: true };
    await this.recordFailedPassword(user, ctx);
    return { ok: false, reason: 'wrong_password' };
  }

  /**
   * Bump failed-attempts counter only for real users — never for unknown
   * logins (per docs/15-auth-strategy.md#account-enumeration). Once the
   * counter crosses the threshold, lock the account for LOGIN_LOCKOUT_MS so
   * an online password brute-force is stopped even if it rotates IPs (the
   * per-IP rate-limit alone does not). The counter resets on the next
   * successful 2FA verify (`resetFailedAttempts`).
   *
   * Never throws: the login response must look the same for every failure,
   * so neither a failed counter write nor a failed audit write may turn this
   * one attempt into a 500 that reveals the account exists.
   */
  private async recordFailedPassword(
    user: UserRow,
    ctx: AuthRequestContext,
  ): Promise<void> {
    let attempts: number;
    const lockedUntil = new Date(Date.now() + LOGIN_LOCKOUT_MS);
    try {
      attempts = await this.users.incrementFailedAttempts(user.id);
      if (attempts < LOGIN_MAX_FAILED_ATTEMPTS) return;
      await this.users.lockUntil(user.id, lockedUntil);
    } catch (err) {
      this.logger.warn({
        msg: 'failed to bump failedAttempts',
        userId: user.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    this.logger.warn({
      msg: 'account locked after too many failed logins',
      userId: user.id,
      attempts,
      lockoutMs: LOGIN_LOCKOUT_MS,
      ipAddress: ctx.ipAddress ?? null,
    });
    await this._auditBestEffort({
      action: 'lockAccount',
      targetType: 'User',
      targetKey: user.login,
      metadata: {
        reason: 'failedLoginAttempts',
        attempts,
        lockedUntil: lockedUntil.toISOString(),
        userAgent: ctx.userAgent ?? null,
      },
      actor: this._actorFor(user, ctx),
    });
  }

  // ── Security audit helpers ───────────────────────────
  //
  // Every row below is written on the root client (these routes are public or
  // un-@Audit-ed, so there is no ambient transaction) and attributed to the
  // affected user — `AuditWriter` accepts `actor: 'system'` only for
  // `system.`-prefixed actions, and the one event with no identifiable user
  // (`system.rejectOrphanedVerificationCode`) uses exactly that.

  /** The affected user as audit actor, with the caller's IP when known. */
  private _actorFor(user: UserRow, ctx: AuthRequestContext): AuditActor {
    return {
      userId: user.id,
      userRole: user.role as Role,
      ...(ctx.ipAddress ? { ipAddress: ctx.ipAddress } : {}),
    };
  }

  /**
   * For events whose security effect has already happened (a lock set, a
   * session family revoked) and whose response is fixed: a failed audit write
   * is logged at ERROR, never allowed to change the response.
   */
  private async _auditBestEffort(input: AuditEntryInput): Promise<void> {
    try {
      await this.audit.log(input);
    } catch (err) {
      this.logger.error({
        msg: 'security audit row could not be written',
        action: input.action,
        userId: input.actor === 'system' ? null : input.actor.userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** `_auditBestEffort` for events that only carry a user id. */
  private async _auditForUserId(
    userId: string,
    build: (user: UserRow) => AuditEntryInput,
  ): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) {
      this.logger.warn({
        msg: 'security audit row skipped: user not found',
        userId,
      });
      return;
    }
    await this._auditBestEffort(build(user));
  }

  /**
   * Runs a verification-code check and records the two failures that are
   * audit events rather than refused attempts, then rethrows the original
   * exception untouched (the wire response does not change).
   */
  private async _withCodeAudit(
    flow: CodeFlow,
    ctx: AuthRequestContext,
    verify: () => Promise<string>,
  ): Promise<string> {
    try {
      return await verify();
    } catch (err) {
      if (err instanceof VerificationCodeLockoutException && err.userId) {
        const { attempts, lockedForSec } = err;
        await this._auditForUserId(err.userId, (user) => ({
          action: CODE_LOCKOUT_ACTION[flow],
          targetType: 'User',
          targetKey: user.login,
          metadata: { attempts, lockedForSec, userAgent: ctx.userAgent ?? null },
          actor: this._actorFor(user, ctx),
        }));
      } else if (err instanceof VerificationCodeOrphanedException) {
        // No user to attribute it to — the session holding the id is gone.
        await this._auditBestEffort({
          action: 'system.rejectOrphanedVerificationCode',
          metadata: {
            flow,
            sessionState: err.sessionState,
            ipAddress: ctx.ipAddress ?? null,
            userAgent: ctx.userAgent ?? null,
          },
          actor: 'system',
        });
      }
      throw err;
    }
  }

  /**
   * Genuine refresh-token replay: kill the whole session family, then record
   * it. Revocation comes first — it must happen even if the audit write fails.
   */
  private async _handleRefreshReuse(
    stored: RefreshTokenRow,
    revokedAgeMs: number,
    ctx: AuthRequestContext,
  ): Promise<void> {
    const sessionsRevoked = await this.revokeAllForUser(stored.userId);
    this.logger.warn({
      msg: 'refresh-token reuse detected, revoked all sessions',
      userId: stored.userId,
      tokenId: stored.id,
      revokedAgeMs,
      sessionsRevoked,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    await this._auditForUserId(stored.userId, (user) => ({
      action: 'detectRefreshTokenReuse',
      targetType: 'User',
      targetKey: user.login,
      metadata: {
        tokenId: stored.id,
        revokedAgeMs,
        // false ⇒ the token was ended by logout / reset / admin, not rotated.
        rotated: stored.replacedById != null,
        sessionsRevoked,
        userAgent: ctx.userAgent ?? null,
      },
      actor: this._actorFor(user, ctx),
    }));
  }

  /** Logs a refused Google sign-in and throws the prepared response. */
  private _refuseGoogleLogin(
    reason: string,
    ctx: AuthRequestContext,
    userId: string | null,
    error: HttpException,
  ): never {
    logAuthFailure(this.logger, 'googleLoginRefused', reason, ctx, { userId });
    throw error;
  }

  /**
   * Signs a bare access token for `user`. Shared by `issuePair` (normal mint)
   * and `healRotationRace` (access-only heal, no rotation).
   *
   * Note: @nestjs/jwt v11 narrows `expiresIn` to its `ms`-style template
   * literal — env-driven strings ('15m', '30d') are valid at runtime but
   * not statically inferred. Cast through `unknown` to keep strict mode.
   * `mustChangePassword` is part of the access-token claims so the Next.js
   * edge middleware can gate the forced-change screen by decoding `mt_access`
   * alone — without a round-trip to /auth/me. See docs/15-auth-strategy.md
   * (forced-change gate) and apps/web/middleware.ts.
   */
  private async signAccessToken(user: UserRow): Promise<string> {
    return this.jwt.signAsync(
      {
        sub: user.id,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
      {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn: this.config.get('JWT_ACCESS_TTL', {
          infer: true,
        }) as unknown as number,
      },
    );
  }

  private async issuePair(
    user: UserRow,
    opts: IssueOptions,
  ): Promise<TokenPair> {
    const refreshTtlMs = this.parseTtlMs(
      this.config.get('JWT_REFRESH_TTL', { infer: true }),
    );
    const refreshTtl = this.config.get('JWT_REFRESH_TTL', { infer: true });
    const refreshSecret = this.config.get('JWT_REFRESH_SECRET', {
      infer: true,
    });

    const jti = randomUUID();
    const refreshExpiresAt = new Date(Date.now() + refreshTtlMs);

    const accessToken = await this.signAccessToken(user);
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

  /** Returns how many live sessions were revoked. */
  private async revokeAllForUser(userId: string): Promise<number> {
    return this.refreshTokens.revokeAllForUser(userId);
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
