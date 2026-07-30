import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  CreateUserDto,
  ResetPasswordModeDto,
  UpdateUserDto,
  UserDtoFull,
  UserFilters,
  UserWithTemporaryPasswordDto,
} from '@magguarantee/shared';

import type { Env } from '../../config/env.schema';
import { PasswordService } from '../auth/password.service';
import { RefreshTokenRepository } from '../auth/refresh-token.repository';
import { MailService } from '../mail/mail.service';
import { generateRandomPassword } from '../../common/utils/random-password';
import {
  isPrismaUniqueViolation,
  uniqueViolationToConflict,
} from '../../common/errors/prisma-error';
import { UsersRepository, type UserRow } from './users.repository';

/**
 * Phase 2 admin-CRUD service for `User`. The auth slice (login + 2FA) keeps
 * its own narrow methods at the bottom of this class — they are unchanged
 * from Phase 1.
 *
 * Per docs/13-api-design.md#users-admin-only every endpoint here is
 * admin-only. `przewoznik` users are NOT created via this service — they
 * come in through `CarriersService.create`, which provisions a user + carrier
 * row in the same transaction.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly repo: UsersRepository,
    private readonly passwords: PasswordService,
    private readonly refreshTokens: RefreshTokenRepository,
    // Optional so existing unit tests (which construct the service with three
    // args) keep compiling; production DI always injects both.
    @Optional() private readonly mailService?: MailService,
    @Optional() private readonly configService?: ConfigService<Env, true>,
  ) {}

  /** Sign-in URL for account lifecycle emails (APP_URL root). */
  private loginUrl(): string {
    const appUrl =
      this.configService?.get('APP_URL', { infer: true }) ??
      'http://localhost:3000';
    return appUrl.replace(/\/$/, '');
  }

  /**
   * Fire-and-log account-lifecycle email. Never throws into the caller — a
   * mail hiccup must not fail the admin's create/deactivate/reactivate action
   * (the DB mutation already committed). No-op when MailService is absent
   * (unit tests).
   */
  private notifyAccount(send: () => Promise<void>, context: string): void {
    if (!this.mailService) return;
    void send().catch((err) => {
      this.logger.warn({
        msg: `account ${context} email failed`,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  // ── Admin CRUD ───────────────────────────────────────────

  async list(filters: UserFilters): Promise<{
    items: UserDtoFull[];
    nextCursor: string | null;
  }> {
    const rows = await this.repo.list({
      role: filters.role,
      active: filters.active,
      cursor: filters.cursor,
      limit: filters.limit,
    });
    const hasNext = rows.length > filters.limit;
    const page = hasNext ? rows.slice(0, filters.limit) : rows;
    return {
      items: page.map((r) => this.toDto(r)),
      nextCursor: hasNext ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async getById(id: string): Promise<UserDtoFull> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException('Użytkownik nie znaleziony');
    return this.toDto(row);
  }

  async create(dto: CreateUserDto): Promise<UserWithTemporaryPasswordDto> {
    // The Zod schema already excludes `przewoznik`; this assertion is
    // defence-in-depth in case the pipe is bypassed in tests.
    if ((dto.role as string) === 'przewoznik') {
      throw new UnprocessableEntityException(
        'Przewoźników utwórz endpointem POST /carriers',
      );
    }
    const plain = dto.password ?? generateRandomPassword();
    const passwordHash = await this.passwords.hash(plain);
    let row: UserRow;
    try {
      row = await this.repo.create({
        login: dto.login,
        email: dto.email,
        name: dto.name,
        role: dto.role,
        passwordHash,
        liderEmail: dto.liderEmail ?? null,
        active: dto.active ?? true,
        // Force is always on: every admin-issued password (generated OR custom)
        // must be changed on first login. The issuance counts as a change, so
        // stamp `passwordChangedAt` too (docs/15-auth-strategy.md).
        mustChangePassword: true,
        passwordChangedAt: new Date(),
      });
    } catch (err) {
      throw uniqueViolationToConflict(
        err,
        'Login lub email są już zajęte',
      );
    }
    if (!dto.password) {
      this.logger.log({
        msg: 'user created with generated password',
        userId: row.id,
        login: row.login,
      });
    }
    // Account-created notification (no password — the admin hands the temp
    // password over out-of-band; it is returned on-screen below).
    this.notifyAccount(
      () =>
        this.mailService!.enqueueAccountCreated(row.email, {
          name: row.name || row.login,
          loginName: row.login,
          temporaryPassword: plain,
          loginUrl: this.loginUrl(),
        }),
      'created',
    );
    return { ...this.toDto(row), temporaryPassword: plain };
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserDtoFull> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Użytkownik nie znaleziony');
    if (dto.role && (dto.role as string) === 'przewoznik') {
      throw new UnprocessableEntityException(
        'Nie można zmienić roli na przewoźnika tym endpointem',
      );
    }
    try {
      const updated = await this.repo.update(id, {
        // `email` is NOT NULL post-phase3_blocks — patch with the value
        // verbatim; the Zod schema already rejected null upstream.
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.liderEmail !== undefined ? { liderEmail: dto.liderEmail } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      });
      return this.toDto(updated);
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        throw uniqueViolationToConflict(err, 'Konflikt unikalności');
      }
      throw err;
    }
  }

  async deactivate(id: string): Promise<UserDtoFull> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Użytkownik nie znaleziony');
    if (!existing.active) {
      throw new ConflictException('Użytkownik jest już nieaktywny');
    }
    const updated = await this.repo.update(id, { active: false });
    this.notifyAccount(
      () =>
        this.mailService!.enqueueAccountDeactivated(updated.email, {
          name: updated.name || updated.login,
          loginName: updated.login,
        }),
      'deactivated',
    );
    return this.toDto(updated);
  }

  async reactivate(id: string): Promise<UserDtoFull> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Użytkownik nie znaleziony');
    if (existing.active) {
      throw new ConflictException('Użytkownik jest już aktywny');
    }
    const updated = await this.repo.update(id, { active: true });
    this.notifyAccount(
      () =>
        this.mailService!.enqueueAccountReactivated(updated.email, {
          name: updated.name || updated.login,
          loginName: updated.login,
          loginUrl: this.loginUrl(),
        }),
      'reactivated',
    );
    return this.toDto(updated);
  }

  /**
   * Admin reset-password. Body is a discriminated union:
   *  - `{ mode: 'generate' }`         → API generates the password.
   *  - `{ mode: 'custom', password }` → admin supplies it (PasswordSchema).
   *
   * Either way: set `mustChangePassword=true` (force is always on), stamp
   * `passwordChangedAt`, persist the hash, REVOKE every refresh token of the
   * target user (a reset must kill the victim's old sessions), and return the
   * effective plaintext once as `temporaryPassword`.
   */
  async resetPassword(
    id: string,
    mode: ResetPasswordModeDto,
  ): Promise<UserWithTemporaryPasswordDto> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Użytkownik nie znaleziony');
    const plain =
      mode.mode === 'custom' ? mode.password : generateRandomPassword();
    const passwordHash = await this.passwords.hash(plain);
    const updated = await this.repo.update(id, {
      passwordHash,
      mustChangePassword: true,
      passwordChangedAt: new Date(),
    });
    // A reset invalidates the victim's existing sessions.
    const revoked = await this.refreshTokens.revokeAllForUser(id);
    this.logger.log({
      msg: 'admin password reset issued; sessions revoked',
      userId: id,
      login: updated.login,
      mode: mode.mode,
      revokedSessions: revoked,
    });
    // Same template as the carrier reset — one `account-password-reset` for
    // both audiences (decision 2026-07-30). Sent for `custom` mode too: the
    // user's old password stopped working either way.
    this.notifyAccount(
      () =>
        this.mailService!.enqueueAccountPasswordReset(updated.email, {
          name: updated.name || updated.login,
          loginName: updated.login,
          temporaryPassword: plain,
          loginUrl: this.loginUrl(),
        }),
      'password reset',
    );
    return { ...this.toDto(updated), temporaryPassword: plain };
  }

  async softDelete(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Użytkownik nie znaleziony');
    await this.repo.softDelete(id);
  }

  // ── DTO mapping ──────────────────────────────────────────

  toDto(row: UserRow): UserDtoFull {
    return {
      id: row.id,
      login: row.login,
      email: row.email,
      name: row.name,
      role: row.role,
      active: row.active,
      liderEmail: row.liderEmail,
      mustChangePassword: row.mustChangePassword,
      lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // ── Auth-slice helpers (used by AuthService) ─────────────

  findByLogin(login: string): Promise<UserRow | null> {
    return this.repo.findByLogin(login);
  }

  findById(id: string): Promise<UserRow | null> {
    return this.repo.findById(id);
  }

  incrementFailedAttempts(id: string): Promise<number> {
    return this.repo.incrementFailedAttempts(id);
  }

  resetFailedAttempts(id: string): Promise<void> {
    return this.repo.resetFailedAttempts(id);
  }

  lockUntil(id: string, until: Date): Promise<void> {
    return this.repo.lockUntil(id, until);
  }

  updateLastLogin(id: string, at: Date): Promise<void> {
    return this.repo.updateLastLogin(id, at);
  }

  /**
   * Persist a password change initiated by the auth slice (self-service reset
   * confirm / forced change). Sets the new hash, stamps `passwordChangedAt`,
   * and applies the `mustChangePassword` flag. Token revocation is the
   * caller's responsibility (AuthService owns refresh-token lifecycle).
   */
  async applyPasswordChange(
    id: string,
    passwordHash: string,
    opts: { mustChangePassword: boolean },
  ): Promise<void> {
    await this.repo.update(id, {
      passwordHash,
      passwordChangedAt: new Date(),
      mustChangePassword: opts.mustChangePassword,
    });
  }
}
