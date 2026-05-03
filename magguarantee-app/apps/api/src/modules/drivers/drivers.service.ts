import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type {
  CreateDriverDto,
  DriverDto,
  DriverFilters,
  UpdateDriverDto,
} from '@magguarantee/shared';

import {
  isPrismaUniqueViolation,
  uniqueViolationToConflict,
} from '../../common/errors/prisma-error';
import { buildLoginSlug } from '../../common/utils/login-slug';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CarriersRepository } from '../carriers/carriers.repository';
import {
  DriversRepository,
  type DriverRow,
} from './drivers.repository';

const MAX_SLUG_SUFFIX = 50;

/**
 * Drivers CRUD service per docs/13-api-design.md#drivers.
 *
 * Invariants enforced here:
 *   - `loginSlug` is generated from `firstName.lastName` (Polish-aware
 *     transliteration in `buildLoginSlug`).
 *   - Collisions append `-2`, `-3`, … up to MAX_SLUG_SUFFIX before giving up.
 *
 * Role scoping mirrors Vehicles: opiekun → must own carrier; przewoznik →
 * defaults to their own carrier when `carrierId` omitted.
 */
@Injectable()
export class DriversService {
  constructor(
    private readonly drivers: DriversRepository,
    private readonly carriers: CarriersRepository,
  ) {}

  async list(
    user: AuthUser,
    filters: DriverFilters,
  ): Promise<{ items: DriverDto[]; nextCursor: string | null }> {
    const effective = await this._scopeFilters(user, filters);
    const rows = await this.drivers.list(effective);
    const hasNext = rows.length > effective.limit;
    const page = hasNext ? rows.slice(0, effective.limit) : rows;
    return {
      items: page.map((r) => this.toDto(r)),
      nextCursor: hasNext ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async getById(id: string): Promise<DriverDto> {
    const row = await this.drivers.findById(id);
    if (!row) throw new NotFoundException('Kierowca nie znaleziony');
    return this.toDto(row);
  }

  async create(user: AuthUser, dto: CreateDriverDto): Promise<DriverDto> {
    const carrierId = await this._resolveCarrierId(user, dto.carrierId);
    await this._assertCarrierAccessibleForWrite(user, carrierId);

    const slug = await this._allocateLoginSlug(dto.firstName, dto.lastName);

    try {
      const row = await this.drivers.create({
        carrierId,
        loginSlug: slug,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone ?? null,
        phone2: dto.phone2 ?? null,
        email: dto.email ?? null,
        driverLicenseNumber: dto.driverLicenseNumber ?? null,
        licenseExpiry: dto.licenseExpiry ? new Date(dto.licenseExpiry) : null,
        bankAccount: dto.bankAccount ?? null,
        notes: dto.notes ?? null,
        active: dto.active,
      });
      return this.toDto(row);
    } catch (err) {
      throw uniqueViolationToConflict(
        err,
        'Kierowca o takim slug już istnieje',
      );
    }
  }

  async update(id: string, dto: UpdateDriverDto): Promise<DriverDto> {
    const existing = await this.drivers.findById(id);
    if (!existing) throw new NotFoundException('Kierowca nie znaleziony');

    const patch: Record<string, unknown> = {};
    const passthrough: (keyof UpdateDriverDto)[] = [
      'firstName',
      'lastName',
      'phone',
      'phone2',
      'email',
      'driverLicenseNumber',
      'bankAccount',
      'notes',
      'active',
    ];
    for (const k of passthrough) {
      if (dto[k] !== undefined) patch[k] = dto[k];
    }
    if (dto.licenseExpiry !== undefined) {
      patch.licenseExpiry = dto.licenseExpiry
        ? new Date(dto.licenseExpiry)
        : null;
    }

    try {
      const row = await this.drivers.update(id, patch);
      return this.toDto(row);
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        throw uniqueViolationToConflict(err, 'Konflikt unikalności');
      }
      throw err;
    }
  }

  async deactivate(id: string): Promise<DriverDto> {
    const existing = await this.drivers.findById(id);
    if (!existing) throw new NotFoundException('Kierowca nie znaleziony');
    if (!existing.active) {
      throw new ConflictException('Kierowca jest już nieaktywny');
    }
    const row = await this.drivers.setActive(id, false);
    return this.toDto(row);
  }

  async reactivate(id: string): Promise<DriverDto> {
    const existing = await this.drivers.findById(id);
    if (!existing) throw new NotFoundException('Kierowca nie znaleziony');
    if (existing.active) {
      throw new ConflictException('Kierowca jest już aktywny');
    }
    const row = await this.drivers.setActive(id, true);
    return this.toDto(row);
  }

  async softDelete(id: string): Promise<void> {
    const existing = await this.drivers.findById(id);
    if (!existing) throw new NotFoundException('Kierowca nie znaleziony');
    await this.drivers.softDelete(id);
  }

  // ── Internals ────────────────────────────────────────────

  private async _allocateLoginSlug(
    firstName: string,
    lastName: string,
  ): Promise<string> {
    const base = buildLoginSlug(firstName, lastName);
    if (!(await this.drivers.existsLoginSlug(base))) return base;
    for (let i = 2; i <= MAX_SLUG_SUFFIX; i += 1) {
      const candidate = `${base}-${i}`;
      if (!(await this.drivers.existsLoginSlug(candidate))) return candidate;
    }
    throw new ConflictException(
      `Nie udało się wygenerować unikalnego slug-a dla "${firstName} ${lastName}"`,
    );
  }

  private async _resolveCarrierId(
    user: AuthUser,
    requested: string | undefined,
  ): Promise<string> {
    if (requested) return requested;
    if (user.role === 'przewoznik') {
      const list = await this.carriers.list({ limit: 200 });
      const mine = list.find((c) => c.userId === user.sub);
      if (!mine) {
        throw new UnprocessableEntityException(
          'Brak profilu przewoźnika dla bieżącego użytkownika',
        );
      }
      return mine.id;
    }
    throw new UnprocessableEntityException(
      'Pole `carrierId` jest wymagane',
    );
  }

  private async _assertCarrierAccessibleForWrite(
    user: AuthUser,
    carrierId: string,
  ): Promise<void> {
    if (user.role === 'admin' || user.role === 'pracownik') return;
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
    filters: DriverFilters,
  ): Promise<DriverFilters> {
    if (user.role === 'admin' || user.role === 'pracownik') return filters;
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

  toDto(row: DriverRow): DriverDto {
    return {
      id: row.id,
      carrierId: row.carrierId,
      loginSlug: row.loginSlug,
      firstName: row.firstName,
      lastName: row.lastName,
      phone: row.phone,
      phone2: row.phone2,
      email: row.email,
      driverLicenseNumber: row.driverLicenseNumber,
      licenseExpiry: row.licenseExpiry
        ? row.licenseExpiry.toISOString().slice(0, 10)
        : null,
      bankAccount: row.bankAccount,
      notes: row.notes,
      active: row.active,
      carrier: row.carrier,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
