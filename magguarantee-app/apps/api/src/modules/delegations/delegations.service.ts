import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type {
  CancelDelegationDto,
  DelegationDto,
  DelegationFilters,
  SubmitDelegationDto,
} from '@magguarantee/shared';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CarriersRepository } from '../carriers/carriers.repository';
import { DriversRepository } from '../drivers/drivers.repository';
import { TrailersRepository } from '../trailers/trailers.repository';
import { VehiclesRepository } from '../vehicles/vehicles.repository';
import {
  DelegationsRepository,
  type DelegationRow,
} from './delegations.repository';

/**
 * Phase 3 — Delegations service.
 *
 * Carrier-driven flow only: register a delegation (zgloszony) and cancel
 * one's own zgloszony rows. The weryfikator-driven transitions
 * (`markInTransit`, `markReturned`) land in Phase 7 (out of scope).
 */
@Injectable()
export class DelegationsService {
  private readonly logger = new Logger(DelegationsService.name);

  constructor(
    private readonly delegations: DelegationsRepository,
    private readonly carriers: CarriersRepository,
    private readonly vehicles: VehiclesRepository,
    private readonly drivers: DriversRepository,
    private readonly trailers: TrailersRepository,
  ) {}

  // ── Submit ──────────────────────────────────────────────

  async add(user: AuthUser, dto: SubmitDelegationDto): Promise<DelegationDto> {
    const carrier = await this._requireCarrierProfile(user);
    const vehicle = await this._requireOwnedVehicle(carrier.id, dto.vehicleId);
    // Trailer + driver are required post-migration; ownership checks
    // become unconditional.
    await this._requireOwnedTrailer(carrier.id, dto.trailerId);
    const driverSnapshot = await this._snapshotDriver(carrier.id, dto.driverId);

    const row = await this.delegations.create({
      carrierId: carrier.id,
      vehicleId: vehicle.id,
      trailerId: dto.trailerId,
      driverId: dto.driverId,
      driverNameSnapshot: driverSnapshot.name,
      driverPhoneSnapshot: driverSnapshot.phone,
      departureAt: new Date(dto.departureAt),
      departureCountry: dto.departureCountry,
      departurePostalCode: dto.departurePostalCode,
      // `plannedReturnAt` is `YYYY-MM-DD` (date-only). `new Date("YYYY-MM-DD")`
      // parses as UTC midnight, which matches Prisma's `@db.Date` round-trip.
      plannedReturnAt: new Date(dto.plannedReturnAt),
      returnCountry: dto.returnCountry,
      returnPostalCode: dto.returnPostalCode,
      notes: dto.comment ?? null,
      reportedById: user.sub,
    });

    return this.toDto(row);
  }

  // ── Cancel ──────────────────────────────────────────────

  async cancel(
    user: AuthUser,
    id: string,
    dto: CancelDelegationDto,
  ): Promise<DelegationDto> {
    const row = await this.delegations.findById(id);
    if (!row) throw new NotFoundException('Delegacja nie znaleziona');

    // Ownership: carriers may only cancel their own delegations. Other roles
    // are out of scope in Phase 3 (weryfikator handles them in Phase 7).
    if (user.role !== 'przewoznik') {
      throw new ForbiddenException(
        'Tylko przewoźnik może anulować zgłoszoną delegację w tej fazie',
      );
    }
    const carrier = await this._requireCarrierProfile(user);
    if (row.carrierId !== carrier.id) {
      throw new ForbiddenException('Brak uprawnień do tej delegacji');
    }

    // Status gate — carrier may only cancel `zgloszony` rows. Mirrors
    // docs/13-api-design.md#delegations.
    if (row.status !== 'zgloszony') {
      throw new ConflictException(
        'Można anulować tylko delegację w statusie „zgłoszony".',
      );
    }

    const updated = await this.delegations.update(row.id, {
      status: 'anulowany',
      notes: dto.reason
        ? appendCancellationNote(row.notes, dto.reason)
        : row.notes,
    });
    return this.toDto(updated);
  }

  // ── Read ────────────────────────────────────────────────

  async list(
    user: AuthUser,
    filters: DelegationFilters,
  ): Promise<{ items: DelegationDto[]; nextCursor: string | null }> {
    const effective = await this._scopeListFilters(user, filters);
    const rows = await this.delegations.list(effective);
    const hasNext = rows.length > effective.limit;
    const page = hasNext ? rows.slice(0, effective.limit) : rows;
    return {
      items: page.map((r) => this.toDto(r)),
      nextCursor: hasNext ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async getOne(user: AuthUser, id: string): Promise<DelegationDto> {
    const row = await this.delegations.findById(id);
    if (!row) throw new NotFoundException('Delegacja nie znaleziona');
    if (user.role === 'przewoznik') {
      const carrier = await this._requireCarrierProfile(user);
      if (row.carrierId !== carrier.id) {
        throw new ForbiddenException('Brak uprawnień do tej delegacji');
      }
    }
    return this.toDto(row);
  }

  // ── Mappers ─────────────────────────────────────────────

  toDto(row: DelegationRow): DelegationDto {
    return {
      id: row.id,
      vehicleId: row.vehicleId,
      vehicle: row.vehicle,
      trailerId: row.trailerId,
      trailer: row.trailer,
      driverId: row.driverId,
      driver: row.driver,
      carrierId: row.carrierId,
      carrier: row.carrier,
      driverNameSnapshot: row.driverNameSnapshot,
      driverPhoneSnapshot: row.driverPhoneSnapshot,
      departureAt: row.departureAt.toISOString(),
      departureCountry: row.departureCountry,
      departurePostalCode: row.departurePostalCode,
      // Date-only (`YYYY-MM-DD`) — strip the time portion of the UTC midnight
      // Prisma returns for a `@db.Date` column to keep the wire shape stable.
      plannedReturnAt: row.plannedReturnAt.toISOString().slice(0, 10),
      returnCountry: row.returnCountry,
      returnPostalCode: row.returnPostalCode,
      status: row.status,
      actualReturnAt: row.actualReturnAt
        ? row.actualReturnAt.toISOString()
        : null,
      reportedById: row.reportedById,
      reportedBy: row.reportedBy,
      reportedAt: row.reportedAt.toISOString(),
      verifiedById: row.verifiedById,
      verifiedBy: row.verifiedBy,
      verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // ── Internals ───────────────────────────────────────────

  private async _requireCarrierProfile(
    user: AuthUser,
  ): Promise<{ id: string }> {
    if (user.role !== 'przewoznik') {
      throw new ForbiddenException('Wymaga konta przewoźnika');
    }
    const list = await this.carriers.list({ limit: 200 });
    const mine = list.find((c) => c.userId === user.sub);
    if (!mine) {
      throw new ForbiddenException('Brak profilu przewoźnika');
    }
    return { id: mine.id };
  }

  private async _requireOwnedVehicle(
    carrierId: string,
    vehicleId: string,
  ): Promise<{ id: string; plateNumber: string }> {
    const v = await this.vehicles.findById(vehicleId);
    if (!v || v.carrierId !== carrierId) {
      throw new UnprocessableEntityException('Nieprawidłowy pojazd');
    }
    if (!v.active) {
      throw new UnprocessableEntityException('Pojazd jest nieaktywny');
    }
    return { id: v.id, plateNumber: v.plateNumber };
  }

  private async _requireOwnedTrailer(
    carrierId: string,
    trailerId: string,
  ): Promise<void> {
    const t = await this.trailers.findById(trailerId);
    if (!t || t.carrierId !== carrierId) {
      throw new UnprocessableEntityException('Nieprawidłowa naczepa');
    }
  }

  private async _snapshotDriver(
    carrierId: string,
    driverId: string,
  ): Promise<{ name: string; phone: string }> {
    const d = await this.drivers.findById(driverId);
    if (!d || d.carrierId !== carrierId) {
      throw new UnprocessableEntityException('Nieprawidłowy kierowca');
    }
    if (!d.active) {
      throw new UnprocessableEntityException('Kierowca jest nieaktywny');
    }
    return {
      name: `${d.firstName} ${d.lastName}`.trim(),
      phone: d.phone,
    };
  }

  private async _scopeListFilters(
    user: AuthUser,
    filters: DelegationFilters,
  ): Promise<DelegationFilters> {
    if (
      user.role === 'admin' ||
      user.role === 'opiekun' ||
      user.role === 'planista' ||
      user.role === 'dyspozytor' ||
      user.role === 'eksport' ||
      user.role === 'weryfikator'
    ) {
      return filters;
    }
    if (user.role === 'przewoznik') {
      const carrier = await this._requireCarrierProfile(user);
      if (filters.carrierId && filters.carrierId !== carrier.id) {
        throw new ForbiddenException('Brak uprawnień do tego przewoźnika');
      }
      return { ...filters, carrierId: carrier.id };
    }
    throw new ForbiddenException('Brak uprawnień');
  }
}

// ─── Pure helpers ────────────────────────────────────────

function appendCancellationNote(
  existing: string | null,
  reason: string,
): string {
  const ts = new Date().toISOString();
  const entry = `[ANULOWANO ${ts}] ${reason}`;
  return existing ? `${existing}\n${entry}` : entry;
}
