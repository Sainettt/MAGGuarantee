import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type {
  CreateTeamDto,
  LookupTeamDto,
  TeamDto,
  TeamFilters,
  UpdateTeamDto,
} from '@magguarantee/shared';

import { AuditContext } from '../../common/audit';
import {
  isPrismaUniqueViolation,
  uniqueViolationToConflict,
} from '../../common/errors/prisma-error';
import { TeamsRepository, type TeamRow } from './teams.repository';

/**
 * Dispatch-team admin CRUD per docs/13-api-design.md#teams-admin-only.
 *
 * A `Team` is the dispatch unit a vehicle is assigned to (Phase 11) — it
 * replaces the legacy single `Vehicle.dispatcherId`. Maintained by `admin`.
 *
 * Invariants enforced here (per docs/04-data-model.md):
 *   - `code` is globally UNIQUE (`^\d+\.\d+\.\d+$` validated at Zod) — P2002 → 409.
 *   - dispatcher membership: each assigned user must be an ACTIVE `dyspozytor`
 *     (422 otherwise). Re-assigning a dispatcher already on another team is a
 *     SILENT move (just overwrites `User.teamId`) — audited, no 422.
 *   - hard-delete is GUARDED: a team referenced by users OR vehicles is 409 —
 *     deactivate (`active=false`) instead. `Team` is NOT a soft-delete model.
 */
@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(private readonly repo: TeamsRepository) {}

  async list(filters: TeamFilters): Promise<TeamDto[]> {
    const rows = await this.repo.list(filters);
    return rows.map((r) => this.toDto(r));
  }

  async getById(id: string): Promise<TeamDto> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException('Zespół nie znaleziony');
    return this.toDto(row);
  }

  async create(dto: CreateTeamDto): Promise<TeamDto> {
    // Validate the dispatcher set BEFORE creating the team so a bad id never
    // leaves an orphan team row behind.
    const dispatcherIds = dto.dispatcherIds ?? [];
    await this._assertValidDispatchers(dispatcherIds);

    let row: TeamRow;
    try {
      row = await this.repo.create({
        code: dto.code,
        name: dto.name ?? null,
        active: dto.active ?? true,
      });
    } catch (err) {
      throw uniqueViolationToConflict(
        err,
        'Zespół o tym kodzie już istnieje',
      );
    }

    // Silent cross-team move: just point each dispatcher at the new team.
    await this._attach(dispatcherIds, row.id);
    const fresh = await this.repo.findById(row.id);
    return this.toDto(fresh ?? row);
  }

  async update(id: string, dto: UpdateTeamDto): Promise<TeamDto> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Zespół nie znaleziony');
    AuditContext.setBefore(this.toDto(existing));

    if (dto.dispatcherIds !== undefined) {
      await this._assertValidDispatchers(dto.dispatcherIds);
    }

    let row: TeamRow;
    try {
      row = await this.repo.update(id, {
        ...(dto.code !== undefined ? { code: dto.code } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      });
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        throw uniqueViolationToConflict(
          err,
          'Zespół o tym kodzie już istnieje',
        );
      }
      throw err;
    }

    // Full-replacement membership sync when the field is present: detach the
    // dispatchers no longer listed, (re)attach the listed ones.
    if (dto.dispatcherIds !== undefined) {
      await this._syncMembership(id, dto.dispatcherIds);
    }

    const fresh = await this.repo.findById(id);
    return this.toDto(fresh ?? row);
  }

  /**
   * Toggles a team to `active=false` (deactivate) — the supported way to take a
   * referenced team out of service (hard-delete is guarded). Idempotent guard:
   * 409 if already inactive.
   */
  async deactivate(id: string): Promise<TeamDto> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Zespół nie znaleziony');
    if (!existing.active) {
      throw new ConflictException('Zespół jest już nieaktywny');
    }
    AuditContext.setBefore(this.toDto(existing));
    const row = await this.repo.update(id, { active: false });
    return this.toDto(row);
  }

  async reactivate(id: string): Promise<TeamDto> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Zespół nie znaleziony');
    if (existing.active) {
      throw new ConflictException('Zespół jest już aktywny');
    }
    AuditContext.setBefore(this.toDto(existing));
    const row = await this.repo.update(id, { active: true });
    return this.toDto(row);
  }

  /**
   * Hard-deletes a team. GUARDED: rejected with 409 if the team still has any
   * dispatcher members OR any vehicle assigned — those references must be moved
   * first (or the team deactivated via `active=false`) per the locked
   * decision. There is no `reason` requirement (Team is a small admin catalog,
   * not a tenant resource like Vehicle/Carrier).
   */
  async hardDelete(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Zespół nie znaleziony');

    const [members, vehicles] = await Promise.all([
      this.repo.countMembers(id),
      this.repo.countVehicles(id),
    ]);
    if (members > 0 || vehicles > 0) {
      throw new ConflictException(
        'Nie można usunąć zespołu przypisanego do dyspozytorów lub pojazdów. ' +
          'Przenieś przypisania albo dezaktywuj zespół (active=false).',
      );
    }

    AuditContext.setBefore(this.toDto(existing));
    await this.repo.hardDelete(id);
  }

  // ── Lookups ──────────────────────────────────────────────

  /**
   * `/lookups/teams` payload — every team with its dispatcher roster (incl. the
   * member `active` flag so the web form can preview greyed-out members without
   * an N+1). Returns ALL teams (active + inactive) so the admin form can show
   * historical assignments; the web layer filters as needed.
   */
  async lookup(): Promise<LookupTeamDto[]> {
    const rows = await this.repo.list({});
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      active: r.active,
      dispatchers: r.dispatchers.map((d) => ({
        id: d.id,
        name: d.name,
        login: d.login,
        active: d.active,
      })),
    }));
  }

  // ── Internals ────────────────────────────────────────────

  /**
   * Asserts every id resolves to an existing, active `dyspozytor`. Throws 422
   * naming the first offending id. A silent cross-team move (the dispatcher is
   * already on another team) is deliberately ALLOWED here.
   */
  private async _assertValidDispatchers(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const unique = [...new Set(ids)];
    const found = await this.repo.findDispatchersByIds(unique);
    const byId = new Map(found.map((u) => [u.id, u]));
    for (const id of unique) {
      const u = byId.get(id);
      if (!u) {
        throw new UnprocessableEntityException(
          `Wskazany dyspozytor (${id}) nie istnieje`,
        );
      }
      if (u.role !== 'dyspozytor') {
        throw new UnprocessableEntityException(
          `Wskazany użytkownik (${id}) nie ma roli dyspozytor`,
        );
      }
      if (!u.active) {
        throw new UnprocessableEntityException(
          `Wskazany dyspozytor (${id}) jest nieaktywny`,
        );
      }
    }
  }

  /** Points each dispatcher at `teamId` (silent move from any prior team). */
  private async _attach(ids: string[], teamId: string): Promise<void> {
    for (const id of [...new Set(ids)]) {
      await this.repo.setUserTeam(id, teamId);
    }
  }

  /**
   * Full-replacement membership sync: detach dispatchers currently on the team
   * but absent from `nextIds`, attach those in `nextIds` not yet on it. A
   * dispatcher moved IN from another team is silently re-pointed (the move is
   * implicit in `setUserTeam`); the audit row records the new roster.
   */
  private async _syncMembership(
    teamId: string,
    nextIds: string[],
  ): Promise<void> {
    const next = new Set(nextIds);
    const current = new Set(await this.repo.listMemberIds(teamId));

    // Detach members no longer listed.
    for (const id of current) {
      if (!next.has(id)) {
        await this.repo.setUserTeam(id, null);
      }
    }
    // Attach newly-listed members (incl. silent moves from other teams).
    for (const id of next) {
      if (!current.has(id)) {
        await this.repo.setUserTeam(id, teamId);
      }
    }
  }

  // ── DTO mapping ──────────────────────────────────────────

  toDto(row: TeamRow): TeamDto {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      active: row.active,
      dispatchers: row.dispatchers.map((d) => ({
        id: d.id,
        name: d.name,
        login: d.login,
      })),
      vehicleCount: row.vehicleCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
