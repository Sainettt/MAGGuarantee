import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/**
 * A dispatcher (role=dyspozytor) attached to a team — compact `{ id, name,
 * login, active }`. `active` is carried so the lookup payload can render
 * greyed-out members; the admin grid DTO drops it.
 */
export interface TeamDispatcherRow {
  id: string;
  name: string | null;
  login: string;
  active: boolean;
}

/**
 * Flat Team row returned by the repository. `Team` uses an `active` flag and
 * NO `deletedAt` soft-delete (per docs/04-data-model.md), so this repository
 * never filters on `deletedAt` and the model is NOT in the soft-delete
 * extension's model list.
 */
export interface TeamRow {
  id: string;
  code: string;
  name: string | null;
  active: boolean;
  dispatchers: TeamDispatcherRow[];
  /** Count of vehicles currently assigned to this team. */
  vehicleCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamListFilters {
  active?: boolean;
  q?: string;
}

@Injectable()
export class TeamsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<TeamRow | null> {
    const row = await this.prisma.tx.team.findUnique({
      where: { id },
      ...this.queryShape(),
    });
    return row ? this.flatten(row) : null;
  }

  async findByCode(code: string): Promise<TeamRow | null> {
    const row = await this.prisma.tx.team.findUnique({
      where: { code },
      ...this.queryShape(),
    });
    return row ? this.flatten(row) : null;
  }

  async list(filters: TeamListFilters): Promise<TeamRow[]> {
    const where: Record<string, unknown> = {};
    if (typeof filters.active === 'boolean') where.active = filters.active;
    if (filters.q) {
      where.OR = [
        { code: { contains: filters.q, mode: 'insensitive' } },
        { name: { contains: filters.q, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.tx.team.findMany({
      where,
      orderBy: { code: 'asc' },
      ...this.queryShape(),
    });
    return rows.map((r) => this.flatten(r));
  }

  async create(data: {
    code: string;
    name?: string | null;
    active?: boolean;
  }): Promise<TeamRow> {
    const row = await this.prisma.tx.team.create({
      data: {
        code: data.code,
        name: data.name ?? null,
        active: data.active ?? true,
      },
      ...this.queryShape(),
    });
    return this.flatten(row);
  }

  async update(
    id: string,
    data: Partial<{ code: string; name: string | null; active: boolean }>,
  ): Promise<TeamRow> {
    const row = await this.prisma.tx.team.update({
      where: { id },
      data,
      ...this.queryShape(),
    });
    return this.flatten(row);
  }

  /**
   * Hard-deletes a team row. The service guards against deletion when the team
   * still references users or vehicles — a referenced team must be deactivated
   * (`active=false`) instead. `Team` is NOT a soft-delete model, so this is a
   * straight `delete` (the soft-delete extension does not rewrite it).
   */
  async hardDelete(id: string): Promise<void> {
    await this.prisma.tx.team.delete({ where: { id } });
  }

  // ── Membership ───────────────────────────────────────────

  /**
   * Loads the active dispatchers (`role=dyspozytor`) named by `ids`, returning
   * `{ id, role, active }` so the service can validate role/active before
   * assigning. Short-circuits on an empty id set. Soft-deleted users are
   * excluded by the soft-delete extension on `User`.
   */
  async findDispatchersByIds(
    ids: string[],
  ): Promise<{ id: string; role: string; active: boolean; teamId: string | null }[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.tx.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, role: true, active: true, teamId: true },
    });
    return rows;
  }

  /** Ids of the dispatchers currently attached to a team. */
  async listMemberIds(teamId: string): Promise<string[]> {
    const rows = await this.prisma.tx.user.findMany({
      where: { teamId },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /** Sets `User.teamId` for a single dispatcher (attach when non-null, detach when null). */
  async setUserTeam(userId: string, teamId: string | null): Promise<void> {
    await this.prisma.tx.user.update({
      where: { id: userId },
      data: { teamId },
    });
  }

  // ── Reference checks (hard-delete guard) ─────────────────

  /** Count of dispatchers (`User.teamId`) still pointing at this team. */
  async countMembers(teamId: string): Promise<number> {
    return this.prisma.tx.user.count({ where: { teamId } });
  }

  /** Count of vehicles (`Vehicle.dispatchTeamId`) still pointing at this team. */
  async countVehicles(teamId: string): Promise<number> {
    return this.prisma.tx.vehicle.count({ where: { dispatchTeamId: teamId } });
  }

  // ── helpers ──────────────────────────────────────────────

  private queryShape() {
    return {
      include: {
        dispatchers: {
          select: { id: true, name: true, login: true, active: true },
          orderBy: { login: 'asc' as const },
        },
        _count: { select: { vehicles: true } },
      },
    } as const;
  }

  private flatten(row: TeamPrismaShape): TeamRow {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      active: row.active,
      dispatchers: (row.dispatchers ?? []).map((d) => ({
        id: d.id,
        name: d.name,
        login: d.login,
        active: d.active,
      })),
      vehicleCount: row._count?.vehicles ?? 0,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

interface TeamPrismaShape {
  id: string;
  code: string;
  name: string | null;
  active: boolean;
  dispatchers?: { id: string; name: string | null; login: string; active: boolean }[];
  _count?: { vehicles: number };
  createdAt: Date;
  updatedAt: Date;
}
