import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type {
  CreateUserDto,
  UpdateUserDto,
  UserDtoFull,
  UserFilters,
  UserWithTemporaryPasswordDto,
} from '@magguarantee/shared';

import { PasswordService } from '../auth/password.service';
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
  ) {}

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
        company: dto.company ?? null,
        liderEmail: dto.liderEmail ?? null,
        active: dto.active ?? true,
      });
    } catch (err) {
      throw uniqueViolationToConflict(
        err,
        'Login lub email są już zajęte',
      );
    }
    // TODO: replace with email send when MailService.sendAccountReset is implemented (Phase 9).
    if (!dto.password) {
      this.logger.log({
        msg: 'user created with generated password (Phase 2 stub)',
        userId: row.id,
        login: row.login,
      });
    }
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
        ...(dto.email !== undefined ? { email: dto.email ?? null } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.company !== undefined ? { company: dto.company } : {}),
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
    // TODO: send "account deactivated" email when Phase 9 ships.
    return this.toDto(updated);
  }

  async reactivate(id: string): Promise<UserDtoFull> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Użytkownik nie znaleziony');
    if (existing.active) {
      throw new ConflictException('Użytkownik jest już aktywny');
    }
    const updated = await this.repo.update(id, { active: true });
    // TODO: send "account reactivated" email when Phase 9 ships.
    return this.toDto(updated);
  }

  async resetPassword(id: string): Promise<UserWithTemporaryPasswordDto> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Użytkownik nie znaleziony');
    const plain = generateRandomPassword();
    const passwordHash = await this.passwords.hash(plain);
    const updated = await this.repo.update(id, { passwordHash });
    // TODO: replace with email send when MailService.sendAccountReset is implemented (Phase 9).
    this.logger.log({
      msg: 'password reset issued (Phase 2 stub — email pending)',
      userId: id,
      login: updated.login,
    });
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
      company: row.company,
      active: row.active,
      liderEmail: row.liderEmail,
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
}
