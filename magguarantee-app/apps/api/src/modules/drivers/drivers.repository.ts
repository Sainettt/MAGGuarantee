import { Injectable } from '@nestjs/common';

import type { Prisma } from '@magguarantee/database';
import type {
  DriverAttachmentCategory,
  DriverLanguage,
  DriverNationality,
} from '@magguarantee/shared';

import { PrismaService } from '../prisma/prisma.service';
import { INCLUDE_SOFT_DELETED } from '../prisma/soft-delete.extension';

/** Included attachment row on a driver (live rows only). */
export interface DriverRowAttachment {
  id: string;
  driverId: string;
  category: DriverAttachmentCategory;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedById: string | null;
  createdAt: Date;
}

/**
 * Row shape returned by the driver repository.
 *
 * `phone` and `idDocumentNumber` are non-nullable since the phase-2
 * migration. `email` and `licenseExpiry` are non-nullable since
 * phase3_blocks. `adr` (świadectwo ADR permit flag) was added 2026-05-29
 * alongside the `DriverAttachment` model.
 */
export interface DriverRow {
  id: string;
  carrierId: string;
  loginSlug: string;
  firstName: string;
  lastName: string;
  phone: string;
  phone2: string | null;
  // Nullable per phase3_blocks_audit_revert (drivers in PL trucking often
  // don't have email; license may be unknown at registration).
  email: string | null;
  idDocumentNumber: string;
  licenseExpiry: Date | null;
  notes: string | null;
  active: boolean;
  adr: boolean;
  nationality: DriverNationality;
  languages: DriverLanguage[];
  adrClasses: string[];
  carrier: { id: string; login: string; name: string | null } | null;
  attachments: DriverRowAttachment[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface DriverListFilters {
  carrierId?: string;
  /**
   * Phase 5.1 union-scope path (`DriversService._scopeFilters`) — opiekun
   * without an explicit `carrierId` filter sees the union of their owned
   * carriers' drivers. Mirrors the vehicles repo so the single SQL query
   * still narrows by the FK index. `carrierId` (if also set) wins; an empty
   * `carrierIds: []` short-circuits to 0 rows (Postgres can't `IN ()`).
   */
  carrierIds?: string[];
  active?: boolean;
  q?: string;
  cursor?: string;
  limit: number;
}

@Injectable()
export class DriversRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<DriverRow | null> {
    const row = await this.prisma.tx.driver.findFirst({
      where: { id },
      include: this.includeShape(),
    });
    return row ? this.flatten(row) : null;
  }

  async findByLoginSlug(slug: string): Promise<DriverRow | null> {
    const row = await this.prisma.tx.driver.findFirst({
      where: { loginSlug: slug },
      include: this.includeShape(),
    });
    return row ? this.flatten(row) : null;
  }

  async existsLoginSlug(slug: string): Promise<boolean> {
    const row = await this.prisma.tx.driver.findFirst({
      where: { loginSlug: slug },
      select: { id: true },
    });
    return !!row;
  }

  async list(filters: DriverListFilters): Promise<DriverRow[]> {
    const where: Record<string, unknown> = {};
    // `carrierId` and `carrierIds` are both narrowing filters; the service
    // never sends both. If a future caller does, explicit `carrierId` wins.
    if (filters.carrierId) {
      where.carrierId = filters.carrierId;
    } else if (filters.carrierIds) {
      if (filters.carrierIds.length === 0) {
        // Empty union → 0 rows. Postgres rejects `IN ()`, so we short-circuit
        // with an impossible id filter and keep the canonical empty-page shape.
        where.id = '__no_such_driver__';
      } else {
        where.carrierId = { in: filters.carrierIds };
      }
    }
    if (typeof filters.active === 'boolean') where.active = filters.active;
    if (filters.q) {
      where.OR = [
        { firstName: { contains: filters.q, mode: 'insensitive' } },
        { lastName: { contains: filters.q, mode: 'insensitive' } },
        { loginSlug: { contains: filters.q, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.tx.driver.findMany({
      where,
      include: this.includeShape(),
      orderBy: { createdAt: 'desc' },
      take: filters.limit + 1,
      ...(filters.cursor
        ? { skip: 1, cursor: { id: filters.cursor } }
        : {}),
    });
    return rows.map((r) => this.flatten(r));
  }

  async create(data: {
    carrierId: string;
    loginSlug: string;
    firstName: string;
    lastName: string;
    phone: string;
    phone2?: string | null;
    email?: string | null;
    idDocumentNumber: string;
    licenseExpiry?: Date | null;
    notes?: string | null;
    active?: boolean;
    adr?: boolean;
    nationality: DriverNationality;
    languages?: DriverLanguage[];
    adrClasses?: string[];
  }): Promise<DriverRow> {
    const row = await this.prisma.tx.driver.create({
      data: {
        carrierId: data.carrierId,
        loginSlug: data.loginSlug,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        phone2: data.phone2 ?? null,
        email: data.email ?? null,
        idDocumentNumber: data.idDocumentNumber,
        licenseExpiry: data.licenseExpiry ?? null,
        notes: data.notes ?? null,
        active: data.active ?? true,
        adr: data.adr ?? false,
        nationality: data.nationality,
        languages: data.languages ?? [],
        adrClasses: data.adrClasses ?? [],
      },
      include: this.includeShape(),
    });
    return this.flatten(row);
  }

  async update(id: string, data: Record<string, unknown>): Promise<DriverRow> {
    const row = await this.prisma.tx.driver.update({
      where: { id },
      data,
      include: this.includeShape(),
    });
    return this.flatten(row);
  }

  async setActive(id: string, active: boolean): Promise<DriverRow> {
    return this.update(id, { active });
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.tx.driver.delete({ where: { id } });
  }

  /**
   * Hard-deletes a driver row. Phase 4.4 admin-only flow with a `reason`
   * captured upstream into the audit row's metadata. The soft-delete
   * extension rewrites BOTH `delete` and `deleteMany` into a soft-delete
   * update, so a physical row removal MUST opt out via the
   * `[INCLUDE_SOFT_DELETED]` escape hatch.
   */
  async hardDelete(id: string): Promise<void> {
    await this.prisma.tx.driver.deleteMany({
      where: { id },
      [INCLUDE_SOFT_DELETED]: true,
    } as unknown as Prisma.DriverDeleteManyArgs);
  }

  // ── helpers ──────────────────────────────────────────────

  private includeShape() {
    return {
      carrier: {
        select: {
          id: true,
          user: { select: { login: true, name: true } },
        },
      },
      // The soft-delete extension only intercepts TOP-LEVEL operations —
      // nested relation reads bypass it, so the live-rows filter must be
      // explicit here (ADR-cert enforcement reads this set).
      attachments: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          driverId: true,
          category: true,
          fileName: true,
          mimeType: true,
          size: true,
          uploadedById: true,
          createdAt: true,
        },
      },
    } as const;
  }

  private flatten(row: DriverPrismaShape): DriverRow {
    return {
      id: row.id,
      carrierId: row.carrierId,
      loginSlug: row.loginSlug,
      firstName: row.firstName ?? '',
      lastName: row.lastName ?? '',
      phone: row.phone ?? '',
      phone2: row.phone2,
      email: row.email,
      idDocumentNumber: row.idDocumentNumber ?? '',
      licenseExpiry: row.licenseExpiry,
      notes: row.notes,
      active: row.active,
      adr: row.adr,
      nationality: (row.nationality ?? 'OTHER') as DriverNationality,
      languages: (row.languages ?? []) as DriverLanguage[],
      adrClasses: row.adrClasses ?? [],
      carrier: row.carrier
        ? {
            id: row.carrier.id,
            login: row.carrier.user.login,
            name: row.carrier.user.name,
          }
        : null,
      attachments: (row.attachments ?? []).map((a) => ({
        id: a.id,
        driverId: a.driverId,
        category: a.category,
        fileName: a.fileName,
        mimeType: a.mimeType,
        size: a.size,
        uploadedById: a.uploadedById,
        createdAt: a.createdAt,
      })),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    };
  }
}

// Wide variant of the Prisma row to absorb the inferred-nullable shape
// produced by the soft-delete extension's typing (the underlying schema
// marks scalars NOT NULL post-phase3_blocks, but Prisma's `query` extension
// widens scalars in the inferred type). The `carrier` field is now
// optional in the wide shape — `findFirst` may surface it as undefined when
// `include: { carrier: ... }` is missing.
interface DriverPrismaShape {
  id: string;
  carrierId: string;
  loginSlug: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  idDocumentNumber: string | null;
  licenseExpiry: Date | null;
  notes: string | null;
  active: boolean;
  adr: boolean;
  nationality: DriverNationality | null;
  languages: DriverLanguage[] | null;
  adrClasses: string[] | null;
  carrier?: {
    id: string;
    user: { login: string; name: string | null };
  } | null;
  attachments?: Array<{
    id: string;
    driverId: string;
    category: DriverAttachmentCategory;
    fileName: string;
    mimeType: string;
    size: number;
    uploadedById: string | null;
    createdAt: Date;
  }> | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
