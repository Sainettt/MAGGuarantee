import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type {
  CreateVehicleDto,
  UpdateVehicleDto,
  VehicleDto,
  VehicleFilters,
} from '@magguarantee/shared';

import {
  isPrismaUniqueViolation,
  uniqueViolationToConflict,
} from '../../common/errors/prisma-error';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CarriersRepository } from '../carriers/carriers.repository';
import { UsersRepository } from '../users/users.repository';
import {
  VehiclesRepository,
  type VehicleRow,
} from './vehicles.repository';

/**
 * Vehicle CRUD service per docs/13-api-design.md#vehicles.
 *
 * Invariants enforced here (per docs/04-data-model.md):
 *   - `plannerId` → User.role='planista'
 *   - `dispatcherId` → User.role='dyspozytor'
 *   - composite UNIQUE (carrierId, plateNumber) — DB; we translate the
 *     P2002 to 409 Conflict.
 *
 * Role-scoped list filtering happens here because guards can only fire on
 * per-row routes; collection routes need service-side narrowing.
 */
@Injectable()
export class VehiclesService {
  constructor(
    private readonly vehicles: VehiclesRepository,
    private readonly users: UsersRepository,
    private readonly carriers: CarriersRepository,
  ) {}

  async list(
    user: AuthUser,
    filters: VehicleFilters,
  ): Promise<{ items: VehicleDto[]; nextCursor: string | null }> {
    const effective = await this._scopeFilters(user, filters);
    const rows = await this.vehicles.list(effective);
    const hasNext = rows.length > effective.limit;
    const page = hasNext ? rows.slice(0, effective.limit) : rows;
    return {
      items: page.map((r) => this.toDto(r)),
      nextCursor: hasNext ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async getById(id: string): Promise<VehicleDto> {
    const row = await this.vehicles.findById(id);
    if (!row) throw new NotFoundException('Pojazd nie znaleziony');
    return this.toDto(row);
  }

  async create(user: AuthUser, dto: CreateVehicleDto): Promise<VehicleDto> {
    await this._assertCarrierAccessibleForWrite(user, dto.carrierId);
    if (dto.plannerId) await this._assertRole(dto.plannerId, 'planista');
    if (dto.dispatcherId)
      await this._assertRole(dto.dispatcherId, 'dyspozytor');
    // Defence-in-depth — Zod refine in CreateVehicleSchema already enforces
    // this, but if the pipe is bypassed we want the friendlier 422 instead
    // of a Postgres CHECK violation surfacing as 500.
    this._assertGpsInvariant(dto.gps ?? false, dto.gpsMobilePhone ?? null);

    let row: VehicleRow;
    try {
      row = await this.vehicles.create({
        carrierId: dto.carrierId,
        plateNumber: dto.plateNumber,
        active: dto.active,
        plannerId: dto.plannerId ?? null,
        dispatcherId: dto.dispatcherId ?? null,
        brand: dto.brand ?? null,
        model: dto.model ?? null,
        year: dto.year ?? null,
        notes: dto.notes ?? null,
        // Required post-phase3_blocks — Zod already enforced presence.
        certificateL: dto.certificateL,
        euro: dto.euro,
        adrClasses: dto.adrClasses ?? [],
        gps: dto.gps,
        fuelCard: dto.fuelCard,
        type: dto.type,
        gb: dto.gb ?? null,
        it: dto.it ?? null,
        fr: dto.fr ?? null,
        agreement: dto.agreement ?? null,
        contract: dto.contract ?? null,
        rateDe: dto.rateDe,
        rateUe: dto.rateUe,
        rateExport: dto.rateExport,
        rateImport: dto.rateImport,
        wasteAllowed: dto.wasteAllowed,
        wasteCountries: dto.wasteCountries ?? [],
        cabotageDe: dto.cabotageDe,
        cabotageFr: dto.cabotageFr,
        // Nullable per Revert #2 — `vehicle_gps_device_when_gps_on` CHECK
        // enforces presence iff `gps=true`. Zod refine pre-validates so we
        // 422 instead of 500.
        gpsMobilePhone: dto.gpsMobilePhone ?? null,
        nextInspectionDate: dto.nextInspectionDate
          ? new Date(dto.nextInspectionDate)
          : null,
        sideNumber: dto.sideNumber ?? null,
        createdById: user.sub,
      });
    } catch (err) {
      throw uniqueViolationToConflict(
        err,
        'Pojazd o tym numerze rejestracyjnym już istnieje u tego przewoźnika',
      );
    }

    // Onboarding wizard step advancement (display-only — never blocks).
    // Vehicle created → bump PENDING_VEHICLE to PENDING_TRAILER. Already-
    // advanced carriers (PENDING_TRAILER / PENDING_DRIVER / COMPLETE) stay
    // put — `updateMany` with the WHERE filter on the lower set guarantees
    // we never regress, even under concurrent fleet creations.
    // Failure here MUST NOT undo the vehicle insert; we log and swallow.
    await this._advanceCarrierOnboarding(row.carrierId, 'PENDING_TRAILER', [
      'PENDING_VEHICLE',
    ]);

    return this.toDto(row);
  }

  /**
   * Conditional advance helper — see `CarriersRepository.advanceOnboardingStatus`.
   * Wrapped here so each Service can log a consistent line if the carrier row
   * disappeared (e.g. concurrent soft-delete) without breaking the create.
   */
  private async _advanceCarrierOnboarding(
    carrierId: string,
    next: 'PENDING_TRAILER' | 'PENDING_DRIVER' | 'COMPLETE',
    from: ReadonlyArray<'PENDING_VEHICLE' | 'PENDING_TRAILER' | 'PENDING_DRIVER'>,
  ): Promise<void> {
    try {
      await this.carriers.advanceOnboardingStatus(carrierId, next, [...from]);
    } catch {
      // Display-only — swallow so a stale carrier row never breaks the
      // primary entity create. The DB-level default keeps the field sane.
    }
  }

  async update(id: string, dto: UpdateVehicleDto): Promise<VehicleDto> {
    const existing = await this.vehicles.findById(id);
    if (!existing) throw new NotFoundException('Pojazd nie znaleziony');
    if (dto.plannerId !== undefined && dto.plannerId !== null) {
      await this._assertRole(dto.plannerId, 'planista');
    }
    if (dto.dispatcherId !== undefined && dto.dispatcherId !== null) {
      await this._assertRole(dto.dispatcherId, 'dyspozytor');
    }
    // Resolve the post-patch (gps, gpsMobilePhone) values. PATCH semantics:
    // if the field isn't in dto, fall back to the existing row.
    const nextGps = dto.gps !== undefined ? dto.gps : existing.gps;
    const nextDevice =
      dto.gpsMobilePhone !== undefined
        ? dto.gpsMobilePhone
        : existing.gpsMobilePhone;
    this._assertGpsInvariant(nextGps, nextDevice ?? null);

    const patch: Record<string, unknown> = {};
    const passthrough: (keyof UpdateVehicleDto)[] = [
      'plateNumber',
      'active',
      'plannerId',
      'dispatcherId',
      'brand',
      'model',
      'year',
      'notes',
      'certificateL',
      'euro',
      'adrClasses',
      'gps',
      'fuelCard',
      'type',
      'gb',
      'it',
      'fr',
      'agreement',
      'contract',
      'rateDe',
      'rateUe',
      'rateExport',
      'rateImport',
      'wasteAllowed',
      'wasteCountries',
      'cabotageDe',
      'cabotageFr',
      'gpsMobilePhone',
      'sideNumber',
    ];
    for (const k of passthrough) {
      if (dto[k] !== undefined) patch[k] = dto[k];
    }
    if (dto.nextInspectionDate !== undefined) {
      patch.nextInspectionDate = dto.nextInspectionDate
        ? new Date(dto.nextInspectionDate)
        : null;
    }
    if (dto.active !== undefined && !dto.active) {
      patch.deactivatedAt = new Date();
    } else if (dto.active === true) {
      patch.deactivatedAt = null;
    }

    try {
      const row = await this.vehicles.update(id, patch);
      return this.toDto(row);
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        throw uniqueViolationToConflict(
          err,
          'Pojazd o tym numerze rejestracyjnym już istnieje u tego przewoźnika',
        );
      }
      throw err;
    }
  }

  async deactivate(id: string): Promise<VehicleDto> {
    const existing = await this.vehicles.findById(id);
    if (!existing) throw new NotFoundException('Pojazd nie znaleziony');
    if (!existing.active) {
      throw new ConflictException('Pojazd jest już nieaktywny');
    }
    const row = await this.vehicles.setActive(id, false);
    return this.toDto(row);
  }

  async reactivate(id: string): Promise<VehicleDto> {
    const existing = await this.vehicles.findById(id);
    if (!existing) throw new NotFoundException('Pojazd nie znaleziony');
    if (existing.active) {
      throw new ConflictException('Pojazd jest już aktywny');
    }
    const row = await this.vehicles.setActive(id, true);
    return this.toDto(row);
  }

  async softDelete(id: string): Promise<void> {
    const existing = await this.vehicles.findById(id);
    if (!existing) throw new NotFoundException('Pojazd nie znaleziony');
    await this.vehicles.softDelete(id);
  }

  // ── Internals ────────────────────────────────────────────

  private async _scopeFilters(
    user: AuthUser,
    filters: VehicleFilters,
  ): Promise<VehicleFilters> {
    if (user.role === 'admin') {
      return filters;
    }
    if (user.role === 'opiekun') {
      // Restrict to vehicles of carriers this opiekun owns.
      const opiekunCarriers = await this.carriers.list({
        opiekunId: user.sub,
        limit: 200,
      });
      if (filters.carrierId) {
        const hit = opiekunCarriers.find((c) => c.id === filters.carrierId);
        if (!hit) {
          throw new ForbiddenException(
            'Nie masz uprawnień do tego przewoźnika',
          );
        }
        return filters;
      }
      // No carrierId provided — narrow to the union of opiekun's carriers.
      // The repo accepts a single `carrierId` filter; if there are many
      // carriers, we have to fall back to listing all and filtering client-
      // side. For Phase 2 we keep it simple: opiekun must pass a carrierId.
      throw new UnprocessableEntityException(
        'Opiekun musi wskazać `carrierId` w zapytaniu',
      );
    }
    if (user.role === 'planista') {
      return { ...filters, plannerId: user.sub };
    }
    if (user.role === 'dyspozytor') {
      return { ...filters, dispatcherId: user.sub };
    }
    if (user.role === 'przewoznik') {
      const own = await this.carriers.list({
        // We want THIS user's carrier — there's no opiekunId match here, so
        // we list with a tight limit and filter by the matching userId.
        limit: 200,
      });
      const mine = own.find((c) => c.userId === user.sub);
      if (!mine) {
        throw new ForbiddenException('Brak profilu przewoźnika');
      }
      if (filters.carrierId && filters.carrierId !== mine.id) {
        throw new ForbiddenException('Nie masz uprawnień do tego przewoźnika');
      }
      return { ...filters, carrierId: mine.id };
    }
    throw new ForbiddenException('Brak uprawnień');
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

  /**
   * Mirrors the SQL `vehicle_gps_device_when_gps_on` CHECK constraint at
   * the service layer so we 422 on bad input instead of bouncing off a
   * Postgres violation. Per Revert #2 the column itself stays NULLable —
   * non-GPS trucks have no device id.
   */
  private _assertGpsInvariant(
    gps: boolean,
    gpsMobilePhone: string | null,
  ): void {
    if (gps && (gpsMobilePhone === null || gpsMobilePhone.length === 0)) {
      throw new UnprocessableEntityException(
        'gpsMobilePhone wymagany gdy gps=true',
      );
    }
  }

  private async _assertRole(
    userId: string,
    requiredRole: 'planista' | 'dyspozytor',
  ): Promise<void> {
    const target = await this.users.findById(userId);
    if (!target) {
      throw new UnprocessableEntityException(
        `Wskazany użytkownik (${requiredRole}) nie istnieje`,
      );
    }
    if (target.role !== requiredRole) {
      throw new UnprocessableEntityException(
        `Wskazany użytkownik nie ma roli ${requiredRole}`,
      );
    }
    if (!target.active) {
      throw new UnprocessableEntityException(
        `Wskazany użytkownik (${requiredRole}) jest nieaktywny`,
      );
    }
  }

  // ── DTO mapping ──────────────────────────────────────────

  toDto(row: VehicleRow): VehicleDto {
    return {
      id: row.id,
      carrierId: row.carrierId,
      plateNumber: row.plateNumber,
      active: row.active,
      brand: row.brand,
      model: row.model,
      year: row.year,
      notes: row.notes,
      certificateL: row.certificateL,
      euro: row.euro,
      adrClasses: row.adrClasses,
      gps: row.gps,
      fuelCard: row.fuelCard,
      type: row.type,
      gb: row.gb,
      it: row.it,
      fr: row.fr,
      agreement: row.agreement,
      contract: row.contract,
      rateDe: row.rateDe,
      rateUe: row.rateUe,
      rateExport: row.rateExport,
      rateImport: row.rateImport,
      wasteAllowed: row.wasteAllowed,
      wasteCountries: row.wasteCountries,
      cabotageDe: row.cabotageDe,
      cabotageFr: row.cabotageFr,
      gpsMobilePhone: row.gpsMobilePhone,
      nextInspectionDate: row.nextInspectionDate
        ? toDateString(row.nextInspectionDate)
        : null,
      sideNumber: row.sideNumber,
      lastDroveAt: row.lastDroveAt ? row.lastDroveAt.toISOString() : null,
      plannerId: row.plannerId,
      planner: row.planner,
      dispatcherId: row.dispatcherId,
      dispatcher: row.dispatcher,
      carrier: row.carrier,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}
