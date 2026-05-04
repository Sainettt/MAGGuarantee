import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type {
  CarrierDto,
  CarrierFilters,
  CarrierWithTemporaryPasswordDto,
  CreateCarrierDto,
  UpdateCarrierDto,
} from '@magguarantee/shared';

import {
  isPrismaUniqueViolation,
  uniqueViolationToConflict,
} from '../../common/errors/prisma-error';
import { generateRandomPassword } from '../../common/utils/random-password';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { PasswordService } from '../auth/password.service';
import { UsersRepository } from '../users/users.repository';
import {
  CarriersRepository,
  type CarrierRow,
} from './carriers.repository';

/**
 * Phase 2 carrier service.
 *
 * Per docs/03-roles.md:
 *  - admin / pracownik can act on every carrier;
 *  - opiekun can act on carriers where `carrier.opiekunId === user.sub`
 *    (ownership enforced by `OpiekunOwnershipGuard` upstream — we only
 *    re-check on `list` because guards don't fire on collection routes).
 *
 * Per docs/04-data-model.md `Carrier.opiekunId` MUST point to a `User` with
 * `role='opiekun'`. The service throws 422 on assignment otherwise.
 */
@Injectable()
export class CarriersService {
  private readonly logger = new Logger(CarriersService.name);

  constructor(
    private readonly carriers: CarriersRepository,
    private readonly users: UsersRepository,
    private readonly passwords: PasswordService,
  ) {}

  // ── List + read ──────────────────────────────────────────

  async list(
    user: AuthUser,
    filters: CarrierFilters,
  ): Promise<{ items: CarrierDto[]; nextCursor: string | null }> {
    // Per docs/03-roles.md opiekun sees only their carriers — enforce here
    // because the guard cannot fire without a per-row id.
    const effective: CarrierFilters = { ...filters };
    if (user.role === 'opiekun') {
      effective.opiekunId = user.sub;
    } else if (
      user.role !== 'admin' &&
      user.role !== 'pracownik'
    ) {
      // Other roles have no business listing carriers.
      throw new ForbiddenException('Brak uprawnień do listy przewoźników');
    }
    const rows = await this.carriers.list({
      opiekunId: effective.opiekunId,
      active: effective.active,
      q: effective.q,
      cursor: effective.cursor,
      limit: effective.limit,
    });
    const hasNext = rows.length > effective.limit;
    const page = hasNext ? rows.slice(0, effective.limit) : rows;
    return {
      items: page.map((r) => this.toDto(r)),
      nextCursor: hasNext ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async getById(id: string): Promise<CarrierDto> {
    const row = await this.carriers.findById(id);
    if (!row) throw new NotFoundException('Przewoźnik nie znaleziony');
    return this.toDto(row);
  }

  // ── Create ───────────────────────────────────────────────

  async create(
    user: AuthUser,
    dto: CreateCarrierDto,
  ): Promise<CarrierWithTemporaryPasswordDto> {
    const opiekunId = await this._resolveOpiekunId(user, dto.opiekunId);

    const plain = dto.password ?? generateRandomPassword();
    const passwordHash = await this.passwords.hash(plain);

    let row: CarrierRow;
    try {
      row = await this.carriers.create({
        login: dto.login,
        email: dto.email,
        name: dto.name,
        company: dto.company ?? null,
        passwordHash,
        nip: dto.nip ?? null,
        vatId: dto.vatId ?? null,
        contactPerson: dto.contactPerson ?? null,
        phone: dto.phone ?? null,
        ordersEmail: dto.ordersEmail ?? null,
        accountEur: dto.accountEur ?? null,
        accountPln: dto.accountPln ?? null,
        paymentTerms: dto.paymentTerms ?? null,
        insuranceValue: dto.insuranceValue ?? null,
        insuranceExpiry: dto.insuranceExpiry ? new Date(dto.insuranceExpiry) : null,
        licenseExpiry: dto.licenseExpiry ? new Date(dto.licenseExpiry) : null,
        numberOfPermits: dto.numberOfPermits ?? null,
        companyAddress: dto.companyAddress ?? null,
        opiekunId,
      });
    } catch (err) {
      throw uniqueViolationToConflict(
        err,
        'Login lub email są już zajęte',
      );
    }

    if (!dto.password) {
      // TODO: replace with email send when MailService.sendAccountCreated is implemented (Phase 9).
      this.logger.log({
        msg: 'carrier created with generated password (Phase 2 stub)',
        carrierId: row.id,
        login: row.login,
      });
    }

    return { ...this.toDto(row), temporaryPassword: plain };
  }

  // ── Update ───────────────────────────────────────────────

  async update(
    user: AuthUser,
    id: string,
    dto: UpdateCarrierDto,
  ): Promise<CarrierDto> {
    const existing = await this.carriers.findById(id);
    if (!existing) throw new NotFoundException('Przewoźnik nie znaleziony');

    const opiekunPatch =
      dto.opiekunId !== undefined
        ? await this._resolveOpiekunPatch(user, dto.opiekunId)
        : undefined;

    try {
      const row = await this.carriers.update(id, {
        ...(dto.email !== undefined ? { email: dto.email ?? null } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.company !== undefined ? { company: dto.company } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.nip !== undefined ? { nip: dto.nip } : {}),
        ...(dto.vatId !== undefined ? { vatId: dto.vatId } : {}),
        ...(dto.contactPerson !== undefined
          ? { contactPerson: dto.contactPerson }
          : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.ordersEmail !== undefined
          ? { ordersEmail: dto.ordersEmail }
          : {}),
        ...(dto.accountEur !== undefined
          ? { accountEur: dto.accountEur }
          : {}),
        ...(dto.accountPln !== undefined
          ? { accountPln: dto.accountPln }
          : {}),
        ...(dto.paymentTerms !== undefined
          ? { paymentTerms: dto.paymentTerms }
          : {}),
        ...(dto.insuranceValue !== undefined
          ? { insuranceValue: dto.insuranceValue }
          : {}),
        ...(dto.insuranceExpiry !== undefined
          ? {
              insuranceExpiry: dto.insuranceExpiry
                ? new Date(dto.insuranceExpiry)
                : null,
            }
          : {}),
        ...(dto.licenseExpiry !== undefined
          ? {
              licenseExpiry: dto.licenseExpiry
                ? new Date(dto.licenseExpiry)
                : null,
            }
          : {}),
        ...(dto.numberOfPermits !== undefined
          ? { numberOfPermits: dto.numberOfPermits }
          : {}),
        ...(dto.companyAddress !== undefined
          ? { companyAddress: dto.companyAddress }
          : {}),
        ...(opiekunPatch !== undefined ? opiekunPatch : {}),
      });
      return this.toDto(row);
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        throw uniqueViolationToConflict(err, 'Konflikt unikalności');
      }
      throw err;
    }
  }

  async deactivate(id: string): Promise<CarrierDto> {
    const existing = await this.carriers.findById(id);
    if (!existing) throw new NotFoundException('Przewoźnik nie znaleziony');
    if (!existing.active) {
      throw new ConflictException('Przewoźnik jest już nieaktywny');
    }
    const row = await this.carriers.setActive(id, false);
    return this.toDto(row);
  }

  async reactivate(id: string): Promise<CarrierDto> {
    const existing = await this.carriers.findById(id);
    if (!existing) throw new NotFoundException('Przewoźnik nie znaleziony');
    if (existing.active) {
      throw new ConflictException('Przewoźnik jest już aktywny');
    }
    const row = await this.carriers.setActive(id, true);
    return this.toDto(row);
  }

  async resetPassword(id: string): Promise<CarrierWithTemporaryPasswordDto> {
    const existing = await this.carriers.findById(id);
    if (!existing) throw new NotFoundException('Przewoźnik nie znaleziony');
    const plain = generateRandomPassword();
    const passwordHash = await this.passwords.hash(plain);
    const row = await this.carriers.update(id, { passwordHash });
    // TODO: replace with email send when MailService.sendAccountReset is implemented (Phase 9).
    this.logger.log({
      msg: 'carrier password reset (Phase 2 stub — email pending)',
      carrierId: id,
      login: row.login,
    });
    return { ...this.toDto(row), temporaryPassword: plain };
  }

  async softDelete(id: string): Promise<void> {
    const existing = await this.carriers.findById(id);
    if (!existing) throw new NotFoundException('Przewoźnik nie znaleziony');
    await this.carriers.softDelete(id);
  }

  // ── Internals ────────────────────────────────────────────

  private async _resolveOpiekunId(
    user: AuthUser,
    requested: string | undefined,
  ): Promise<string | null> {
    // Opiekun callers: default to themselves if no opiekunId provided; if
    // they specify a different one, reject — they cannot reassign.
    if (user.role === 'opiekun') {
      if (requested && requested !== user.sub) {
        throw new ForbiddenException(
          'Opiekun może utworzyć przewoźnika tylko pod sobą',
        );
      }
      return user.sub;
    }
    if (!requested) return null;
    await this._assertIsOpiekun(requested);
    return requested;
  }

  private async _resolveOpiekunPatch(
    user: AuthUser,
    requested: string | null,
  ): Promise<{ opiekunId: string | null }> {
    if (requested === null) {
      if (user.role === 'opiekun') {
        throw new ForbiddenException(
          'Opiekun nie może odpiąć przewoźnika od siebie',
        );
      }
      return { opiekunId: null };
    }
    if (user.role === 'opiekun' && requested !== user.sub) {
      throw new ForbiddenException(
        'Opiekun nie może przypisać innego opiekuna',
      );
    }
    await this._assertIsOpiekun(requested);
    return { opiekunId: requested };
  }

  private async _assertIsOpiekun(userId: string): Promise<void> {
    const target = await this.users.findById(userId);
    if (!target) {
      throw new UnprocessableEntityException(
        'Wskazany opiekun nie istnieje',
      );
    }
    if (target.role !== 'opiekun') {
      throw new UnprocessableEntityException(
        'Wskazany użytkownik nie ma roli opiekun',
      );
    }
    if (!target.active) {
      throw new UnprocessableEntityException(
        'Wskazany opiekun jest nieaktywny',
      );
    }
  }

  // ── DTO mapping ──────────────────────────────────────────

  toDto(row: CarrierRow): CarrierDto {
    return {
      id: row.id,
      userId: row.userId,
      login: row.login,
      email: row.email,
      name: row.name,
      company: row.company,
      active: row.active,
      nip: row.nip,
      vatId: row.vatId,
      contactPerson: row.contactPerson,
      phone: row.phone,
      ordersEmail: row.ordersEmail,
      accountEur: row.accountEur,
      accountPln: row.accountPln,
      paymentTerms: row.paymentTerms,
      insuranceValue: row.insuranceValue,
      insuranceExpiry: row.insuranceExpiry
        ? toDateString(row.insuranceExpiry)
        : null,
      licenseExpiry: row.licenseExpiry ? toDateString(row.licenseExpiry) : null,
      numberOfPermits: row.numberOfPermits,
      companyAddress: row.companyAddress,
      opiekunId: row.opiekunId,
      opiekun: row.opiekun,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function toDateString(d: Date): string {
  // Prisma `@db.Date` columns surface as Date with the time at 00:00 UTC.
  // We emit the date-only ISO slice to match docs/13-api-design.md JSON shape.
  return d.toISOString().slice(0, 10);
}
