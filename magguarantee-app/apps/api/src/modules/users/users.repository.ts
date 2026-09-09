import { Injectable } from '@nestjs/common';

import type { Prisma } from '@magguarantee/database';

import { PrismaService } from '../prisma/prisma.service';
import { INCLUDE_SOFT_DELETED } from '../prisma/soft-delete.extension';

/**
 * Row shape returned by the user repository.
 *
 * `email` is NOT NULL post-phase3_blocks. `passwordHash` is NULLABLE — the
 * NOT NULL added by phase3_blocks was dropped again by
 * `20260507195536_phase3_blocks_audit_revert`, and Google-provisioned users
 * (docs/24) genuinely have no hash until they set one through the ordinary
 * "Zapomniałem hasła" flow. `PasswordService.compareConstantTime` already
 * treats a null hash as "no password login", so nothing downstream has to
 * branch on it — but the type must not claim otherwise, because these rows are
 * cast (`row as UserRow`), never parsed.
 */
export type UserRow = {
  id: string;
  login: string;
  email: string;
  passwordHash: string | null;
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
  // Phase 11 — dispatch team membership (role=dyspozytor only; NULL otherwise).
  // Drives the dyspozytor fleet/km/delegations scope (resolved into AuthUser).
  teamId: string | null;
  // Forced change-password gate + last-change stamp (migration
  // 20260616120000_user_password_lifecycle).
  mustChangePassword: boolean;
  passwordChangedAt: Date | null;
  failedAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  // ── SSO / MAGSpace (docs/24) ───────────────────────────
  authProvider: 'local' | 'google';
  /**
   * `magspace` rows have their `role`/`active` owned by the employee directory;
   * `local` rows — every admin among them — are managed here and never touched
   * by the reconcile.
   */
  managedBy: 'local' | 'magspace';
  googleSub: string | null;
  /** MAGSpace `Employee.id` — a cuid, not a uuid. */
  magspaceEmployeeId: string | null;
  directorySyncedAt: Date | null;
  /**
   * Role granted by hand; when set the reconcile leaves the role alone.
   *
   * Narrowed to the assignable roles, which is not wishful typing: the
   * `user_role_override_not_privileged` CHECK constraint rejects `admin` and
   * `przewoznik` at the database level, so a row can never carry one.
   */
  roleOverride: Exclude<UserRow['role'], 'admin' | 'przewoznik'> | null;
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

  /**
   * Google SSO match key (docs/24 decision #10). The FIRST sign-in matches on
   * e-mail and stores the `sub`; every later one comes through here, because a
   * Workspace e-mail can be renamed and `sub` cannot.
   */
  async findByGoogleSub(googleSub: string): Promise<UserRow | null> {
    const row = await this.prisma.user.findFirst({ where: { googleSub } });
    return (row as UserRow | null) ?? null;
  }

  /**
   * Login-collision probe for the directory's login allocator. Counts
   * soft-deleted rows too: `login` is UNIQUE at the database level and that
   * index does not care about `deletedAt`, so a slug held by a deleted user is
   * genuinely unavailable.
   */
  async existsLogin(login: string): Promise<boolean> {
    const row = await this.prisma.user.findFirst({
      where: { login },
      select: { id: true },
      [INCLUDE_SOFT_DELETED]: true,
    } as unknown as Prisma.UserFindFirstArgs);
    return row !== null;
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
    mustChangePassword?: boolean;
    passwordChangedAt?: Date | null;
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
        mustChangePassword: data.mustChangePassword ?? false,
        passwordChangedAt: data.passwordChangedAt ?? null,
      },
    });
    return row as unknown as UserRow;
  }

  // ── Directory-driven provisioning (docs/24) ──────────────

  /**
   * Creates an account from the employee directory on first Google sign-in.
   *
   * Separate from `create()` on purpose: that one exists for the admin form and
   * insists on a `passwordHash`, while a JIT-provisioned employee has none —
   * they authenticate through Google and may never set a password at all. It
   * also must NOT set `mustChangePassword`, which would bounce a perfectly
   * authenticated user into a change-password screen for a password that does
   * not exist.
   */
  async createFromDirectory(data: {
    login: string;
    email: string;
    name: string | null;
    role: UserRow['role'];
    googleSub: string;
    magspaceEmployeeId: string;
    directorySyncedAt: Date;
  }): Promise<UserRow> {
    const row = await this.prisma.user.create({
      data: {
        login: data.login,
        email: data.email,
        name: data.name,
        role: data.role,
        passwordHash: null,
        active: true,
        authProvider: 'google',
        managedBy: 'magspace',
        googleSub: data.googleSub,
        magspaceEmployeeId: data.magspaceEmployeeId,
        directorySyncedAt: data.directorySyncedAt,
      },
    });
    return row as unknown as UserRow;
  }

  /**
   * Everyone the directory owns — the reconcile's working set. Soft-deleted
   * rows are excluded by the extension, which is right: a deleted account has
   * no access to revoke.
   */
  async listManagedByDirectory(): Promise<UserRow[]> {
    const rows = await this.prisma.user.findMany({
      where: { managedBy: 'magspace' },
      orderBy: { login: 'asc' },
    });
    return rows as unknown as UserRow[];
  }

  /**
   * Locally-managed staff accounts, for the reconcile's advisory report: a
   * `local` admin who has been terminated in MAGSpace is worth telling the
   * other admins about, but the job must never disable them by itself.
   */
  async listLocalStaff(): Promise<UserRow[]> {
    const rows = await this.prisma.user.findMany({
      where: { managedBy: 'local', active: true, role: { not: 'przewoznik' } },
      orderBy: { login: 'asc' },
    });
    return rows as unknown as UserRow[];
  }

  /**
   * `email` cannot be nulled — the column is NOT NULL post-phase3_blocks. The
   * Partial<> typing reflects that: omit means "do not touch", `undefined` is
   * fine, but the value type is non-nullable. `passwordHash` IS nullable in the
   * database, but no caller has a reason to clear one, so it stays non-nullable
   * here as well.
   *
   * The directory columns are writable through the same method — the reconcile
   * and the JIT provisioning both go through `UsersService`, which decides what
   * a `managedBy = magspace` row is allowed to change (docs/24 §A2).
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
      mustChangePassword: boolean;
      passwordChangedAt: Date | null;
      authProvider: UserRow['authProvider'];
      managedBy: UserRow['managedBy'];
      googleSub: string | null;
      magspaceEmployeeId: string | null;
      directorySyncedAt: Date | null;
      roleOverride: UserRow['roleOverride'];
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
