import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type {
  CreateTrailerDto,
  TrailerDto,
  TrailerFilters,
  UpdateTrailerDto,
} from '@magguarantee/shared';

import { AuditContext } from '../../common/audit';
import {
  isPrismaUniqueViolation,
  uniqueViolationToConflict,
} from '../../common/errors/prisma-error';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CarriersRepository } from '../carriers/carriers.repository';
import { TrailerTypesRepository } from '../trailer-types/trailer-types.repository';
import {
  TrailersRepository,
  type TrailerRow,
} from './trailers.repository';

@Injectable()
export class TrailersService {
  constructor(
    private readonly trailers: TrailersRepository,
    private readonly carriers: CarriersRepository,
    private readonly trailerTypes: TrailerTypesRepository,
  ) {}

  async list(
    user: AuthUser,
    filters: TrailerFilters,
  ): Promise<{ items: TrailerDto[]; nextCursor: string | null }> {
    const effective = await this._scopeFilters(user, filters);
    const rows = await this.trailers.list(effective);
    const hasNext = rows.length > effective.limit;
    const page = hasNext ? rows.slice(0, effective.limit) : rows;
    return {
      items: page.map((r) => this.toDto(r)),
      nextCursor: hasNext ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async getById(id: string): Promise<TrailerDto> {
    const row = await this.trailers.findById(id);
    if (!row) throw new NotFoundException('Naczepa nie znaleziona');
    return this.toDto(row);
  }

  async create(user: AuthUser, dto: CreateTrailerDto): Promise<TrailerDto> {
    await this._assertCarrierAccessibleForWrite(user, dto.carrierId);
    // trailerTypeId is required by the schema; still validate the type exists
    // and is active so the FK + business rule are enforced together.
    await this._assertActiveTrailerType(dto.trailerTypeId);

    let row: TrailerRow;
    try {
      row = await this.trailers.create({
        carrierId: dto.carrierId,
        plateNumber: dto.plateNumber,
        active: dto.active,
        trailerTypeId: dto.trailerTypeId,
        brand: dto.brand ?? null,
        model: dto.model ?? null,
        year: dto.year ?? null,
        belts: dto.belts ?? null,
        beltsCount: dto.beltsCount ?? null,
        mats: dto.mats ?? null,
        matsCount: dto.matsCount ?? null,
        innerLength: dto.innerLength ?? null,
        innerWidth: dto.innerWidth ?? null,
        innerHeight: dto.innerHeight ?? null,
        capacity: dto.capacity ?? null,
        airSuspension: dto.airSuspension ?? null,
        certXl: dto.certXl ?? null,
        multilock: dto.multilock ?? null,
        notes: dto.notes ?? null,
      });
    } catch (err) {
      throw uniqueViolationToConflict(
        err,
        'Naczepa o tym numerze rejestracyjnym już istnieje u tego przewoźnika',
      );
    }

    // Onboarding state is derived on read from the live child-count snapshot
    // (see `CarriersService.toDto`) — creating a trailer no longer mutates
    // any carrier-level flag.
    return this.toDto(row);
  }

  async update(id: string, dto: UpdateTrailerDto): Promise<TrailerDto> {
    const existing = await this.trailers.findById(id);
    if (!existing) throw new NotFoundException('Naczepa nie znaleziona');
    AuditContext.setBefore(this.toDto(existing));
    if (dto.trailerTypeId !== undefined) {
      await this._assertActiveTrailerType(dto.trailerTypeId);
    }

    const patch: Record<string, unknown> = {};
    const passthrough: (keyof UpdateTrailerDto)[] = [
      'plateNumber',
      'active',
      'trailerTypeId',
      'brand',
      'model',
      'year',
      'belts',
      'beltsCount',
      'mats',
      'matsCount',
      'innerLength',
      'innerWidth',
      'innerHeight',
      'capacity',
      'airSuspension',
      'certXl',
      'multilock',
      'notes',
    ];
    for (const k of passthrough) {
      if (dto[k] !== undefined) patch[k] = dto[k];
    }

    try {
      const row = await this.trailers.update(id, patch);
      return this.toDto(row);
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        throw uniqueViolationToConflict(
          err,
          'Naczepa o tym numerze rejestracyjnym już istnieje u tego przewoźnika',
        );
      }
      throw err;
    }
  }

  async deactivate(id: string): Promise<TrailerDto> {
    const existing = await this.trailers.findById(id);
    if (!existing) throw new NotFoundException('Naczepa nie znaleziona');
    if (!existing.active) {
      throw new ConflictException('Naczepa jest już nieaktywna');
    }
    AuditContext.setBefore(this.toDto(existing));
    const row = await this.trailers.setActive(id, false);
    return this.toDto(row);
  }

  async reactivate(id: string): Promise<TrailerDto> {
    const existing = await this.trailers.findById(id);
    if (!existing) throw new NotFoundException('Naczepa nie znaleziona');
    if (existing.active) {
      throw new ConflictException('Naczepa jest już aktywna');
    }
    AuditContext.setBefore(this.toDto(existing));
    const row = await this.trailers.setActive(id, true);
    return this.toDto(row);
  }

  async softDelete(id: string): Promise<void> {
    const existing = await this.trailers.findById(id);
    if (!existing) throw new NotFoundException('Naczepa nie znaleziona');
    AuditContext.setBefore(this.toDto(existing));
    await this.trailers.softDelete(id);
  }

  /**
   * Hard-deletes a trailer row. Phase 4.4 admin-only flow — `reason` is
   * required (Zod-validated upstream) and lands in
   * `audit_log.metadata.reason` via `AuditContext.setMetadata`.
   */
  async hardDelete(id: string, reason: string): Promise<void> {
    const existing = await this.trailers.findById(id);
    if (!existing) throw new NotFoundException('Naczepa nie znaleziona');
    AuditContext.setBefore(this.toDto(existing));
    AuditContext.setMetadata({ reason });
    await this.trailers.hardDelete(id);
  }

  // ── Internals ────────────────────────────────────────────

  private async _assertActiveTrailerType(typeId: string): Promise<void> {
    const t = await this.trailerTypes.findById(typeId);
    if (!t) {
      throw new UnprocessableEntityException(
        'Wskazany typ naczepy nie istnieje',
      );
    }
    if (!t.active) {
      throw new UnprocessableEntityException(
        'Wskazany typ naczepy jest nieaktywny',
      );
    }
  }

  private async _assertCarrierAccessibleForWrite(
    user: AuthUser,
    carrierId: string,
  ): Promise<void> {
    if (user.role === 'admin') return;
    const carrier = await this.carriers.findById(carrierId);
    if (!carrier) throw new NotFoundException('Przewoźnik nie znaleziony');
    if (user.role === 'opiekun') {
      if (carrier.opiekunId !== user.sub) {
        throw new ForbiddenException(
          'Nie masz uprawnień do tego przewoźnika',
        );
      }
      return;
    }
    if (user.role === 'przewoznik') {
      if (carrier.userId !== user.sub) {
        throw new ForbiddenException(
          'Nie masz uprawnień do tego przewoźnika',
        );
      }
      return;
    }
    throw new ForbiddenException('Brak uprawnień');
  }

  private async _scopeFilters(
    user: AuthUser,
    filters: TrailerFilters,
  ): Promise<TrailerFilters & { carrierIds?: string[] }> {
    if (user.role === 'admin') return filters;
    if (user.role === 'opiekun') {
      // Phase 5.1 — mirror VehiclesService._scopeFilters: opiekun no longer
      // needs to pass `carrierId`. Without one we narrow to the union of
      // their owned carriers' trailers; with one we verify it's in the union
      // (else 403) and keep the FK-indexed `carrierId =` path.
      const opiekunCarriers = await this.carriers.list({
        opiekunId: user.sub,
        limit: 200,
      });
      const ownedIds = opiekunCarriers.map((c) => c.id);
      if (filters.carrierId) {
        if (!ownedIds.includes(filters.carrierId)) {
          throw new ForbiddenException(
            'Nie masz uprawnień do tego przewoźnika',
          );
        }
        return filters;
      }
      return { ...filters, carrierIds: ownedIds };
    }
    if (user.role === 'przewoznik') {
      const list = await this.carriers.list({ limit: 200 });
      const mine = list.find((c) => c.userId === user.sub);
      if (!mine) throw new ForbiddenException('Brak profilu przewoźnika');
      if (filters.carrierId && filters.carrierId !== mine.id) {
        throw new ForbiddenException('Nie masz uprawnień do tego przewoźnika');
      }
      return { ...filters, carrierId: mine.id };
    }
    throw new ForbiddenException('Brak uprawnień');
  }

  // ── DTO mapping ──────────────────────────────────────────

  toDto(row: TrailerRow): TrailerDto {
    return {
      id: row.id,
      carrierId: row.carrierId,
      plateNumber: row.plateNumber,
      active: row.active,
      trailerTypeId: row.trailerTypeId,
      trailerType: row.trailerType,
      brand: row.brand,
      model: row.model,
      year: row.year,
      belts: row.belts,
      beltsCount: row.beltsCount,
      mats: row.mats,
      matsCount: row.matsCount,
      innerLength: row.innerLength,
      innerWidth: row.innerWidth,
      innerHeight: row.innerHeight,
      capacity: row.capacity,
      airSuspension: row.airSuspension,
      certXl: row.certXl,
      multilock: row.multilock,
      notes: row.notes,
      carrier: row.carrier,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
