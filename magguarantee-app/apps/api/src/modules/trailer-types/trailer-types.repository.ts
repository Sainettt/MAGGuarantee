import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export interface TrailerTypeRow {
  id: string;
  name: string;
  shortCode: string | null;
  description: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TrailerTypeListFilters {
  active?: boolean;
  q?: string;
}

@Injectable()
export class TrailerTypesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<TrailerTypeRow | null> {
    const row = await this.prisma.tx.trailerType.findUnique({
      where: { id },
    });
    return row ? (row as TrailerTypeRow) : null;
  }

  async findByName(name: string): Promise<TrailerTypeRow | null> {
    const row = await this.prisma.tx.trailerType.findUnique({
      where: { name },
    });
    return row ? (row as TrailerTypeRow) : null;
  }

  async list(filters: TrailerTypeListFilters): Promise<TrailerTypeRow[]> {
    const where: Record<string, unknown> = {};
    if (typeof filters.active === 'boolean') where.active = filters.active;
    if (filters.q) {
      where.OR = [
        { name: { contains: filters.q, mode: 'insensitive' } },
        { shortCode: { contains: filters.q, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.tx.trailerType.findMany({
      where,
      orderBy: { name: 'asc' },
    });
    return rows as TrailerTypeRow[];
  }

  async create(data: {
    name: string;
    shortCode?: string | null;
    description?: string | null;
    active?: boolean;
  }): Promise<TrailerTypeRow> {
    const row = await this.prisma.tx.trailerType.create({
      data: {
        name: data.name,
        shortCode: data.shortCode ?? null,
        description: data.description ?? null,
        active: data.active ?? true,
      },
    });
    return row as TrailerTypeRow;
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      shortCode: string | null;
      description: string | null;
      active: boolean;
    }>,
  ): Promise<TrailerTypeRow> {
    const row = await this.prisma.tx.trailerType.update({
      where: { id },
      data,
    });
    return row as TrailerTypeRow;
  }

  /**
   * Hard-deletes a trailer-type lookup row. Phase 4.4 admin-only flow with a
   * `reason` captured upstream into the audit row's metadata.
   *
   * TrailerType has no soft-delete column (it's a global lookup, not a
   * tenant resource), so this is a straight `delete`. Trailers reference
   * `trailerTypeId` with a `Restrict` FK in the schema — Postgres will reject
   * the delete if any trailer still points at this type. The service-layer
   * `hardDelete` translates that into a 409 Conflict.
   */
  async hardDelete(id: string): Promise<void> {
    await this.prisma.tx.trailerType.delete({ where: { id } });
  }
}
