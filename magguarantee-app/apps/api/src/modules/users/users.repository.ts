import { Injectable } from '@nestjs/common';

import type { Prisma } from '@magguarantee/database';

import { PrismaService } from '../prisma/prisma.service';
import { INCLUDE_SOFT_DELETED } from '../prisma/soft-delete.extension';

/**
 * Row shape returned by the user repository.
 *
 * `email` and `passwordHash` are NOT NULL post-phase3_blocks.
 */
export type UserRow = {
  id: string;
  login: string;
  email: string;
  passwordHash: string;
  role:
    | 'admin'
    | 'pracownik'
    | 'opiekun'
    | 'planista'
    | 'dyspozytor'
    | 'przewoznik'
    | 'eksport'
    | 'weryfikator';
  name: string | null;
  active: boolean;
  liderEmail: string | null;
  failedAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export interface UserListFilters {
  role?: UserRow['role'];
  active?: boolean;
  cursor?: string;
  limit: number;
}

/**
 * Read/write surface for the User table. Repositories own all Prisma access
 * per api-agent guidelines — services and controllers must not call
 * `prisma.user.*` directly.
 */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Auth-flow lookups (used by AuthService) ──────────────

  async findByLogin(login: string): Promise<UserRow | null> {
    const row = await this.prisma.user.findFirst({
      where: { login },
    });
    return (row as UserRow | null) ?? null;
  }

  async findById(id: string): Promise<UserRow | null> {
    const row = await this.prisma.user.findFirst({
      where: { id },
    });
    return (row as UserRow | null) ?? null;
  }

  /** Including soft-deleted — admin-only flow (restore, audit). */
  async findByIdIncludingDeleted(id: string): Promise<UserRow | null> {
    const row = await this.prisma.user.findFirst({
      where: { id },
      [INCLUDE_SOFT_DELETED]: true,
    } as unknown as Prisma.UserFindFirstArgs);
    return (row as UserRow | null) ?? null;
  }

  async findByEmail(email: string): Promise<UserRow | null> {
    const row = await this.prisma.user.findFirst({ where: { email } });
    return (row as UserRow | null) ?? null;
  }

  async incrementFailedAttempts(id: string): Promise<number> {
    const updated = await this.prisma.user.update({
      where: { id },
      data: { failedAttempts: { increment: 1 } },
      select: { failedAttempts: true },
    });
    return updated.failedAttempts;
  }

  async resetFailedAttempts(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { failedAttempts: 0, lockedUntil: null },
    });
  }

  async lockUntil(id: string, until: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { lockedUntil: until },
    });
  }

  async updateLastLogin(id: string, at: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: at },
    });
  }

  // ── Admin CRUD (Wave 3) ──────────────────────────────────

  async list(filters: UserListFilters): Promise<UserRow[]> {
    const where: Record<string, unknown> = {};
    if (filters.role) where.role = filters.role;
    if (typeof filters.active === 'boolean') where.active = filters.active;
    const rows = await this.prisma.user.findMany({
      where,
      take: filters.limit + 1,
      orderBy: { createdAt: 'desc' },
      ...(filters.cursor
        ? { skip: 1, cursor: { id: filters.cursor } }
        : {}),
    });
    return rows as unknown as UserRow[];
  }

  async create(data: {
    login: string;
    email: string;
    name: string | null;
    role: UserRow['role'];
    passwordHash: string;
    liderEmail?: string | null;
    active?: boolean;
  }): Promise<UserRow> {
    const row = await this.prisma.user.create({
      data: {
        login: data.login,
        email: data.email,
        name: data.name,
        role: data.role,
        passwordHash: data.passwordHash,
        liderEmail: data.liderEmail ?? null,
        active: data.active ?? true,
      },
    });
    return row as unknown as UserRow;
  }

  /**
   * `email` and `passwordHash` cannot be nulled — the columns are NOT NULL
   * post-phase3_blocks. The Partial<> typing reflects that: omit means
   * "do not touch", `undefined` is fine, but the value type is non-nullable.
   */
  async update(
    id: string,
    data: Partial<{
      email: string;
      name: string | null;
      role: UserRow['role'];
      liderEmail: string | null;
      active: boolean;
      passwordHash: string;
    }>,
  ): Promise<UserRow> {
    const row = await this.prisma.user.update({
      where: { id },
      data,
    });
    return row as unknown as UserRow;
  }

  async softDelete(id: string): Promise<void> {
    // The soft-delete extension rewrites delete → update(deletedAt=now()).
    await this.prisma.user.delete({ where: { id } });
  }

  // ── Lookups ──────────────────────────────────────────────

  async listByRole(role: UserRow['role']): Promise<UserRow[]> {
    const rows = await this.prisma.user.findMany({
      where: { role, active: true },
      orderBy: { name: 'asc' },
    });
    return rows as unknown as UserRow[];
  }

  /**
   * Admin users-autocomplete (Phase 4.5). Free-text substring match across
   * `login` and `name`; soft-deleted rows are excluded by the soft-delete
   * extension. Includes inactive users so the admin can filter audit rows
   * tied to deactivated accounts.
   *
   * `q` is treated as case-insensitive (Postgres `ILIKE` via Prisma's
   * `mode: 'insensitive'`). The cap is enforced by the service.
   */
  async searchAdmin(filters: {
    q?: string;
    limit: number;
  }): Promise<UserRow[]> {
    const where: Record<string, unknown> = {};
    if (filters.q) {
      const q = filters.q;
      where.OR = [
        { login: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.user.findMany({
      where,
      orderBy: [{ active: 'desc' }, { login: 'asc' }],
      take: filters.limit,
    });
    return rows as unknown as UserRow[];
  }
}
