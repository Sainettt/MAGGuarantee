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

import { AuditContext } from '../../common/audit';
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
 *  - admin can act on every carrier;
 *  - opiekun can act on carriers where `carrier.opiekunId === user.sub`
 *    (ownership enforced by `OpiekunOwnershipGuard` upstream — we only
 *    re-check on `list` because guards don't fire on collection routes).
 *  - pracownik is NOT permitted here per docs/03-roles.md#pracownik
 *    (narrow claims-only role — no carrier CRUD).
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
    } else if (user.role !== 'admin') {
      // Other roles (incl. pracownik per docs/03-roles.md#pracownik) have
      // no business listing carriers.
      throw new ForbiddenException('Brak uprawnień do listy przewoźników');
    }
    const rows = await this.carriers.list({
      opiekunId: effective.opiekunId,
      active: effective.active,
      q: effective.q,
      onboardingComplete: effective.onboardingComplete,
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
        nip: dto.nip,
        vatId: dto.vatId,
        // Required post-phase3_blocks — Zod already enforced presence.
        contactPerson: dto.contactPerson,
        phone: dto.phone,
        ordersEmail: dto.ordersEmail,
        accountEur: dto.accountEur,
        accountPln: dto.accountPln ?? null,
        paymentTerms: dto.paymentTerms,
        insuranceValue: dto.insuranceValue,
        insuranceExpiry: dto.insuranceExpiry ? new Date(dto.insuranceExpiry) : null,
        licenseExpiry: dto.licenseExpiry ? new Date(dto.licenseExpiry) : null,
        numberOfVehicle: dto.numberOfVehicle ?? null,
        companyAddress: dto.companyAddress,
        opiekunId,
      });
    } catch (err) {
      throw this.translateUserUniqueViolation(err);
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

    // Stash the pre-mutation row so the audit interceptor can compute a diff
    // on commit. Trimming to the after-shape is done in the interceptor —
    // here we just hand off the full repo row.
    AuditContext.setBefore(this.toDto(existing));

    const opiekunPatch =
      dto.opiekunId !== undefined
        ? await this._resolveOpiekunPatch(user, dto.opiekunId)
        : undefined;

    // PATCH semantics: omit means "do not touch". Some PATCH fields tolerate
    // an explicit null in the schema (e.g. clearing `nip`) but not for the
    // post-phase3_blocks NOT NULL columns — for those we drop null silently
    // here so the column never sees null, even if a stale client sent one.
    try {
      const row = await this.carriers.update(id, {
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.company !== undefined ? { company: dto.company } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.nip !== undefined ? { nip: dto.nip } : {}),
        ...(dto.vatId !== undefined ? { vatId: dto.vatId } : {}),
        ...(dto.contactPerson !== undefined && dto.contactPerson !== null
          ? { contactPerson: dto.contactPerson }
          : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.ordersEmail !== undefined && dto.ordersEmail !== null
          ? { ordersEmail: dto.ordersEmail }
          : {}),
        ...(dto.accountEur !== undefined && dto.accountEur !== null
          ? { accountEur: dto.accountEur }
          : {}),
        ...(dto.accountPln !== undefined
          ? { accountPln: dto.accountPln }
          : {}),
        ...(dto.paymentTerms !== undefined && dto.paymentTerms !== null
          ? { paymentTerms: dto.paymentTerms }
          : {}),
        ...(dto.insuranceValue !== undefined
          ? { insuranceValue: dto.insuranceValue }
          : {}),
        ...(dto.insuranceExpiry !== undefined && dto.insuranceExpiry !== null
          ? { insuranceExpiry: new Date(dto.insuranceExpiry) }
          : {}),
        ...(dto.licenseExpiry !== undefined && dto.licenseExpiry !== null
          ? { licenseExpiry: new Date(dto.licenseExpiry) }
          : {}),
        ...(dto.numberOfVehicle !== undefined
          ? { numberOfVehicle: dto.numberOfVehicle }
          : {}),
        ...(dto.companyAddress !== undefined && dto.companyAddress !== null
          ? { companyAddress: dto.companyAddress }
          : {}),
        ...(opiekunPatch !== undefined ? opiekunPatch : {}),
      });
      return this.toDto(row);
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        throw this.translateUserUniqueViolation(err);
      }
      throw err;
    }
  }

  /**
   * Map Prisma's `users` unique-constraint failure to a per-field 409 message.
   * `meta.target` carries the field that collided — we surface it directly so
   * the UI can show "Email jest już zajęty" instead of the generic
   * "Login lub email są już zajęte". Falls back to the generic message for
   * any other unique constraint or non-Prisma error.
   */
  private translateUserUniqueViolation(err: unknown): ConflictException {
    if (!isPrismaUniqueViolation(err)) {
      return uniqueViolationToConflict(err, 'Login lub email są już zajęte');
    }
    const target = err.meta?.target;
    const fields = Array.isArray(target) ? target : target ? [target] : [];
    if (fields.includes('login')) {
      return new ConflictException('Login jest już zajęty');
    }
    if (fields.includes('email')) {
      return new ConflictException('Email jest już zajęty');
    }
    return uniqueViolationToConflict(err, 'Login lub email są już zajęte');
  }

  async deactivate(id: string): Promise<CarrierDto> {
    const existing = await this.carriers.findById(id);
    if (!existing) throw new NotFoundException('Przewoźnik nie znaleziony');
    if (!existing.active) {
      throw new ConflictException('Przewoźnik jest już nieaktywny');
    }
    AuditContext.setBefore(this.toDto(existing));
    const row = await this.carriers.setActive(id, false);
    return this.toDto(row);
  }

  async reactivate(id: string): Promise<CarrierDto> {
    const existing = await this.carriers.findById(id);
    if (!existing) throw new NotFoundException('Przewoźnik nie znaleziony');
    if (existing.active) {
      throw new ConflictException('Przewoźnik jest już aktywny');
    }
    AuditContext.setBefore(this.toDto(existing));
    const row = await this.carriers.setActive(id, true);
    return this.toDto(row);
  }

  async resetPassword(id: string): Promise<CarrierWithTemporaryPasswordDto> {
    const existing = await this.carriers.findById(id);
    if (!existing) throw new NotFoundException('Przewoźnik nie znaleziony');
    AuditContext.setBefore(this.toDto(existing));
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
    // Capture the pre-mutation row so the audit row carries the carrier's
    // identity (login + name) for the admin audit page diff view.
    AuditContext.setBefore(this.toDto(existing));
    await this.carriers.softDelete(id);
  }

  /**
   * Hard-deletes a carrier plus its 1:1 User shadow. Phase 4.4 admin-only
   * flow — `reason` is required (validated by the Zod pipe upstream) and
   * lands in `audit_log.metadata.reason` via `AuditContext.setMetadata`.
   *
   * Cascade: Vehicle/Driver/Trailer FK is `ON DELETE CASCADE` per the
   * Prisma schema, so all carrier-owned fleet rows are removed atomically.
   * The pre-mutation snapshot is captured for the admin audit view.
   */
  async hardDelete(id: string, reason: string): Promise<void> {
    const existing = await this.carriers.findById(id);
    if (!existing) throw new NotFoundException('Przewoźnik nie znaleziony');
    AuditContext.setBefore(this.toDto(existing));
    AuditContext.setMetadata({ reason });
    await this.carriers.hardDelete(id);
  }

  /**
   * Cheap completeness check used as the seam for a future
   * `@RequiresCompleteOnboarding()` guard. The guard's expected shape is:
   *   - extract `carrierId` from `req.user` (or the request),
   *   - call this helper,
   *   - throw 403 if it returns false.
   *
   * Today there are no callers — this is intentionally a 3-line method so
   * the guard slot has a stable, one-line dependency. The composite rule
   * lives in exactly one place (the `_count` filter + `toDto` mapping) so
   * the guard cannot drift from the DTO.
   *
   * Returns `false` for missing carriers (defensive — a guard hitting a
   * deleted carrier should not be granted access).
   */
  async isCarrierOnboardingComplete(carrierId: string): Promise<boolean> {
    const row = await this.carriers.findById(carrierId);
    if (!row) return false;
    return (
      row.counts.vehicles > 0 &&
      row.counts.trailers > 0 &&
      row.counts.drivers > 0
    );
  }

  // ── Internals ────────────────────────────────────────────

  private async _resolveOpiekunId(
    user: AuthUser,
    requested: string | undefined,
  ): Promise<string> {
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
    // Carrier.opiekunId is NOT NULL since the phase-2 migration. The schema
    // makes it required, but this branch defends against any legacy caller
    // (e.g. seed scripts) that bypasses the Zod pipe.
    if (!requested) {
      throw new UnprocessableEntityException(
        'Pole `opiekunId` jest wymagane',
      );
    }
    await this._assertIsOpiekun(requested);
    return requested;
  }

  private async _resolveOpiekunPatch(
    user: AuthUser,
    requested: string | undefined,
  ): Promise<{ opiekunId: string } | undefined> {
    // The schema strips `null` from the optional UUID via emptyStringToUndefined,
    // so we only ever see a string or undefined here. `undefined` means "do
    // not touch"; the carriers.service caller passes us only strings.
    if (requested === undefined) return undefined;
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
    // Derive the onboarding block from the live counts surfaced by the repo
    // (`_count.{vehicles,trailers,drivers}` filtered to active + not soft-
    // deleted). Single source of truth — both the booleans and the composite
    // `isComplete` flag are computed here, so clients never re-derive.
    const hasVehicle = row.counts.vehicles > 0;
    const hasTrailer = row.counts.trailers > 0;
    const hasDriver = row.counts.drivers > 0;
    const isComplete = hasVehicle && hasTrailer && hasDriver;
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
      // Nullable per phase3_blocks_audit_revert.
      insuranceExpiry: row.insuranceExpiry ? toDateString(row.insuranceExpiry) : null,
      licenseExpiry: row.licenseExpiry ? toDateString(row.licenseExpiry) : null,
      numberOfVehicle: row.numberOfVehicle,
      companyAddress: row.companyAddress,
      onboarding: { hasVehicle, hasTrailer, hasDriver, isComplete },
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
