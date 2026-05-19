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
        equipment: dto.equipment ?? null,
        nextInspectionDate: dto.nextInspectionDate
          ? new Date(dto.nextInspectionDate)
          : null,
        belts: dto.belts ?? null,
        mats: dto.mats ?? null,
        innerLength: dto.innerLength ?? null,
        innerWidth: dto.innerWidth ?? null,
        innerHeight: dto.innerHeight ?? null,
        capacity: dto.capacity ?? null,
        airSuspension: dto.airSuspension ?? null,
        loadFromBack: dto.loadFromBack ?? null,
        loadFromSide: dto.loadFromSide ?? null,
        loadFromTop: dto.loadFromTop ?? null,
        slidingRoof: dto.slidingRoof ?? null,
        edschaSlidingRoof: dto.edschaSlidingRoof ?? null,
        notes: dto.notes ?? null,
      });
    } catch (err) {
      throw uniqueViolationToConflict(
        err,
        'Naczepa o tym numerze rejestracyjnym już istnieje u tego przewoźnika',
      );
    }

    // Onboarding wizard step advancement (display-only — never blocks).
    // Trailer created → bump to PENDING_DRIVER from either of the two prior
    // steps. Out-of-wizard creates (trailer before vehicle) also advance
    // past PENDING_VEHICLE — the spec confirms status reflects "highest step
    // completed", so a carrier with a trailer but no vehicle is correctly
    // waiting on a driver next. `updateMany` with the WHERE-in clause keeps
    // already-advanced carriers untouched (no regression).
    await this._advanceCarrierOnboarding(row.carrierId, 'PENDING_DRIVER', [
      'PENDING_VEHICLE',
      'PENDING_TRAILER',
    ]);

    return this.toDto(row);
  }

  /** See `VehiclesService._advanceCarrierOnboarding` for rationale. */
  private async _advanceCarrierOnboarding(
    carrierId: string,
    next: 'PENDING_TRAILER' | 'PENDING_DRIVER' | 'COMPLETE',
    from: ReadonlyArray<'PENDING_VEHICLE' | 'PENDING_TRAILER' | 'PENDING_DRIVER'>,
  ): Promise<void> {
    try {
      await this.carriers.advanceOnboardingStatus(carrierId, next, [...from]);
    } catch {
      // Display-only — swallow so a stale carrier row never breaks the
      // primary entity create.
    }
  }

  async update(id: string, dto: UpdateTrailerDto): Promise<TrailerDto> {
    const existing = await this.trailers.findById(id);
    if (!existing) throw new NotFoundException('Naczepa nie znaleziona');
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
      'equipment',
      'belts',
      'mats',
      'innerLength',
      'innerWidth',
      'innerHeight',
      'capacity',
      'airSuspension',
      'loadFromBack',
      'loadFromSide',
      'loadFromTop',
      'slidingRoof',
      'edschaSlidingRoof',
      'notes',
    ];
    for (const k of passthrough) {
      if (dto[k] !== undefined) patch[k] = dto[k];
    }
    if (dto.nextInspectionDate !== undefined) {
      patch.nextInspectionDate = dto.nextInspectionDate
        ? new Date(dto.nextInspectionDate)
        : null;
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
    const row = await this.trailers.setActive(id, false);
    return this.toDto(row);
  }

  async reactivate(id: string): Promise<TrailerDto> {
    const existing = await this.trailers.findById(id);
    if (!existing) throw new NotFoundException('Naczepa nie znaleziona');
    if (existing.active) {
      throw new ConflictException('Naczepa jest już aktywna');
    }
    const row = await this.trailers.setActive(id, true);
    return this.toDto(row);
  }

  async softDelete(id: string): Promise<void> {
    const existing = await this.trailers.findById(id);
    if (!existing) throw new NotFoundException('Naczepa nie znaleziona');
    await this.trailers.softDelete(id);
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
  ): Promise<TrailerFilters> {
    if (user.role === 'admin') return filters;
    if (user.role === 'opiekun') {
      if (!filters.carrierId) {
        throw new UnprocessableEntityException(
          'Opiekun musi wskazać `carrierId` w zapytaniu',
        );
      }
      const carrier = await this.carriers.findById(filters.carrierId);
      if (!carrier || carrier.opiekunId !== user.sub) {
        throw new ForbiddenException(
          'Nie masz uprawnień do tego przewoźnika',
        );
      }
      return filters;
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
      equipment: row.equipment,
      nextInspectionDate: row.nextInspectionDate
        ? row.nextInspectionDate.toISOString().slice(0, 10)
        : null,
      belts: row.belts,
      mats: row.mats,
      innerLength: row.innerLength,
      innerWidth: row.innerWidth,
      innerHeight: row.innerHeight,
      capacity: row.capacity,
      airSuspension: row.airSuspension,
      loadFromBack: row.loadFromBack,
      loadFromSide: row.loadFromSide,
      loadFromTop: row.loadFromTop,
      slidingRoof: row.slidingRoof,
      edschaSlidingRoof: row.edschaSlidingRoof,
      notes: row.notes,
      carrier: row.carrier,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
