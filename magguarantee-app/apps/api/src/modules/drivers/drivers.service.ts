import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type {
  CreateDriverDto,
  DriverAttachmentCategory,
  DriverAttachmentDto,
  DriverDto,
  DriverFilters,
  UpdateDriverDto,
} from '@magguarantee/shared';

import { storageKeyExtension } from '../../common/attachments';
import { AuditContext } from '../../common/audit';
import {
  isPrismaForeignKeyViolation,
  isPrismaUniqueViolation,
  uniqueViolationToConflict,
} from '../../common/errors/prisma-error';
import { buildLoginSlug } from '../../common/utils/login-slug';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CarriersRepository } from '../carriers/carriers.repository';
import { StorageService, type StorageObject } from '../storage/storage.service';
import { type CategorizedUpload } from './attachment-validation';
import {
  DriverAttachmentsRepository,
  type DriverAttachmentRow,
} from './driver-attachments.repository';
import {
  DriversRepository,
  type DriverRow,
  type DriverRowAttachment,
} from './drivers.repository';

const MAX_SLUG_SUFFIX = 50;

/**
 * Machine code for the hard-delete reference-guard 409. Published in
 * docs/13-api-design.md#drivers — do NOT rename.
 */
const DRIVER_HAS_REFERENCES_CODE = 'DRIVER_HAS_REFERENCES';

/**
 * Drivers CRUD service per docs/13-api-design.md#drivers.
 *
 * Invariants enforced here:
 *   - `loginSlug` is generated from `firstName.lastName` (Polish-aware
 *     transliteration in `buildLoginSlug`).
 *   - Collisions append `-2`, `-3`, … up to MAX_SLUG_SUFFIX before giving up.
 *
 * Required-attachment rule (świadectwo ADR) — service-layer, because the file
 * arrives as a separate multipart part and cannot be expressed in the body
 * Zod schema (mirrors the cabotage rule formerly on the vehicle):
 *   - `adr=true` ⇒ ≥1 `adr` attachment.
 * On create the rule is checked BEFORE any DB/storage write. On update it must
 * hold over (existing live attachments + newly uploaded − removed).
 *
 * Role scoping mirrors Vehicles: opiekun → must own carrier; przewoznik →
 * defaults to their own carrier when `carrierId` omitted.
 */
@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);

  constructor(
    private readonly drivers: DriversRepository,
    private readonly carriers: CarriersRepository,
    private readonly attachments: DriverAttachmentsRepository,
    private readonly storage: StorageService,
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

  /**
   * Creates a driver plus its ADR-certificate attachment(s).
   *
   * Order: carrier-access check (service-layer, multipart guards can't read
   * the body) → required-attachment rule → create Driver → upload each file
   * to MinIO → insert `DriverAttachment` rows. On any post-create failure the
   * uploaded objects and the driver row are rolled back so the request is
   * all-or-nothing.
   */
  async create(
    user: AuthUser,
    dto: CreateDriverDto,
    uploads: CategorizedUpload[],
  ): Promise<DriverDto> {
    const carrierId = await this._resolveCarrierId(user, dto.carrierId);
    await this._assertCarrierAccessibleForWrite(user, carrierId);

    // Required-attachment rule — checked BEFORE any write so a missing ADR
    // scan fails clean with 422 (no orphan rows / slug burned).
    this._assertRequiredAttachmentsOnCreate(dto, uploads);

    const slug = await this._allocateLoginSlug(dto.firstName, dto.lastName);

    let row: DriverRow;
    try {
      row = await this.drivers.create({
        carrierId,
        loginSlug: slug,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        phone2: dto.phone2 ?? null,
        // Optional per phase3_blocks_audit_revert.
        email: dto.email ?? null,
        idDocumentNumber: dto.idDocumentNumber,
        licenseExpiry: dto.licenseExpiry ? new Date(dto.licenseExpiry) : null,
        notes: dto.notes ?? null,
        active: dto.active,
        adr: dto.adr,
        nationality: dto.nationality,
        languages: dto.languages,
        adrClasses: dto.adrClasses ?? [],
      });
    } catch (err) {
      throw uniqueViolationToConflict(
        err,
        'Kierowca o takim slug już istnieje',
      );
    }

    const persisted = await this._attachUploadsWithRollback(
      row,
      uploads,
      user.sub,
      // On create, a failed attachment step must also remove the driver row so
      // the request is all-or-nothing (no half-built driver left behind).
      { rollbackDriver: true },
    );

    // Onboarding state is derived on read from the live child-count snapshot
    // (see `CarriersService.toDto`) — creating a driver no longer mutates
    // any carrier-level flag.
    return this.toDto(persisted);
  }

  /**
   * Updates a driver. Supports adding new attachments (file parts) and
   * removing existing ones (`removeAttachmentIds`). The required-attachment
   * rule must hold over the post-update set: existing live attachments minus
   * removed plus newly uploaded.
   */
  async update(
    id: string,
    dto: UpdateDriverDto,
    uploads: CategorizedUpload[],
  ): Promise<DriverDto> {
    const existing = await this.drivers.findById(id);
    if (!existing) throw new NotFoundException('Kierowca nie znaleziony');
    AuditContext.setBefore(this.toDto(existing));

    const removeIds = dto.removeAttachmentIds ?? [];
    const toRemove = await this._resolveRemovals(id, removeIds);

    // Required-attachment rule over the post-update attachment set.
    this._assertRequiredAttachmentsOnUpdate(
      existing,
      dto,
      uploads,
      new Set(toRemove.map((a) => a.id)),
    );
    // Cross-field rules over the post-update effective state.
    this._assertCrossFieldOnUpdate(existing, dto);

    const patch = this._buildUpdatePatch(dto);

    try {
      await this.drivers.update(id, patch);
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        throw uniqueViolationToConflict(err, 'Konflikt unikalności');
      }
      throw err;
    }

    // Apply attachment removals (soft-delete + MinIO object) and new uploads.
    for (const a of toRemove) {
      await this.attachments.softDelete(a.id);
      await this._deleteStorageObject(a.storageKey);
    }
    await this._attachUploadsWithRollback(existing, uploads, /* createdById */ null);

    const fresh = await this.drivers.findById(id);
    return this.toDto(fresh ?? existing);
  }

  async deactivate(id: string): Promise<DriverDto> {
    const existing = await this.drivers.findById(id);
    if (!existing) throw new NotFoundException('Kierowca nie znaleziony');
    if (!existing.active) {
      throw new ConflictException('Kierowca jest już nieaktywny');
    }
    AuditContext.setBefore(this.toDto(existing));
    const row = await this.drivers.setActive(id, false);
    return this.toDto(row);
  }

  async reactivate(id: string): Promise<DriverDto> {
    const existing = await this.drivers.findById(id);
    if (!existing) throw new NotFoundException('Kierowca nie znaleziony');
    if (existing.active) {
      throw new ConflictException('Kierowca jest już aktywny');
    }
    AuditContext.setBefore(this.toDto(existing));
    const row = await this.drivers.setActive(id, true);
    return this.toDto(row);
  }

  async softDelete(id: string): Promise<void> {
    const existing = await this.drivers.findById(id);
    if (!existing) throw new NotFoundException('Kierowca nie znaleziony');
    AuditContext.setBefore(this.toDto(existing));
    await this.drivers.softDelete(id);
  }

  /**
   * Hard-deletes a driver row. Phase 4.4 admin-only flow — `reason` is
   * required (Zod-validated upstream) and lands in
   * `audit_log.metadata.reason` via `AuditContext.setMetadata`.
   *
   * `driver_attachments` is `ON DELETE CASCADE`, so those rows go with the
   * driver (the MinIO objects are intentionally left in place — same policy as
   * the vehicle hard-delete). But `delegations.driverId` is `ON DELETE
   * RESTRICT` (since migration 20260518113943): a physical delete of a
   * referenced driver would fail late with P2003 → 500. We refuse
   * deterministically with a 409 (`DRIVER_HAS_REFERENCES`) — a pre-flight
   * `countReferencingRows` guard (incl. soft-deleted delegations) plus a
   * TOCTOU P2003 catch.
   */
  async hardDelete(id: string, reason: string): Promise<void> {
    const existing = await this.drivers.findById(id);
    if (!existing) throw new NotFoundException('Kierowca nie znaleziony');

    const references = await this.drivers.countReferencingRows(id);
    if (references > 0) {
      throw this._referencesConflict();
    }

    AuditContext.setBefore(this.toDto(existing));
    AuditContext.setMetadata({ reason });
    try {
      await this.drivers.hardDelete(id);
    } catch (err) {
      if (isPrismaForeignKeyViolation(err)) {
        throw this._referencesConflict();
      }
      throw err;
    }
  }

  /**
   * Builds the 409 for a hard-delete blocked by referencing rows — 409
   * `ConflictException` (mirroring `TeamsService`/`TrailerTypesService`) with
   * the machine code lifted into the RFC-7807 `extensions` bag (the envelope
   * `ClaimAttachmentsService` uses) so the web reads `body.extensions.code`.
   * The code (`DRIVER_HAS_REFERENCES`) is published in
   * docs/13-api-design.md#drivers.
   */
  private _referencesConflict(): ConflictException {
    return new ConflictException({
      code: DRIVER_HAS_REFERENCES_CODE,
      message:
        'Nie można trwale usunąć kierowcy — istnieją powiązane rekordy ' +
        '(wyjazdy). Trwałe usunięcie jest możliwe tylko dla pustych rekordów.',
      extensions: { code: DRIVER_HAS_REFERENCES_CODE },
    });
  }

  // ── Attachments ──────────────────────────────────────────

  /** Lists the non-deleted attachments of a driver as public DTOs. */
  async listAttachments(driverId: string): Promise<DriverAttachmentDto[]> {
    const driver = await this.drivers.findById(driverId);
    if (!driver) throw new NotFoundException('Kierowca nie znaleziony');
    const rows = await this.attachments.listByDriver(driverId);
    return rows.map((r) => attachmentRowToDto(r));
  }

  /**
   * Returns the byte stream + metadata for an attachment so the controller
   * can proxy it to the HTTP response. MinIO is not publicly reachable —
   * downloads always go through the API.
   */
  async downloadAttachment(
    driverId: string,
    attachmentId: string,
  ): Promise<{
    object: StorageObject;
    fileName: string;
    mimeType: string;
    category: DriverAttachmentCategory;
  }> {
    const att = await this._loadAttachmentOf(driverId, attachmentId);
    const object = await this.storage.getObject(att.storageKey);
    return {
      object,
      fileName: att.fileName,
      mimeType: att.mimeType,
      // For the controller's download log line (ids + category, no filename).
      category: att.category,
    };
  }

  /**
   * Soft-deletes an attachment row and removes the MinIO object (mirrors the
   * carrier/standalone-delete policy — a deliberate delete clears the bytes).
   */
  async deleteAttachment(
    driverId: string,
    attachmentId: string,
  ): Promise<void> {
    const att = await this._loadAttachmentOf(driverId, attachmentId);
    await this.attachments.softDelete(att.id);
    await this._deleteStorageObject(att.storageKey);
  }

  // ── Internals: persistence ───────────────────────────────

  private _buildUpdatePatch(dto: UpdateDriverDto): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    const passthrough: (keyof UpdateDriverDto)[] = [
      'firstName',
      'lastName',
      'phone',
      'phone2',
      'email',
      'idDocumentNumber',
      'notes',
      'active',
      'adr',
      'nationality',
      'languages',
      'adrClasses',
    ];
    for (const k of passthrough) {
      if (dto[k] !== undefined) patch[k] = dto[k];
    }
    // PATCH cannot null `licenseExpiry` (NOT NULL post-phase3_blocks). The
    // Zod schema already drops null/empty; this branch sets the new value.
    if (dto.licenseExpiry !== undefined) {
      patch.licenseExpiry = new Date(dto.licenseExpiry);
    }
    return patch;
  }

  /**
   * Post-patch cross-field rules (service is authoritative — Zod can't see a
   * partial PATCH): `adr=true ⇒ adrClasses ≥1` and `languages ≥1` over the
   * effective (patched-or-existing) state. Throws a single 422 on violation.
   */
  private _assertCrossFieldOnUpdate(
    existing: DriverRow,
    dto: UpdateDriverDto,
  ): void {
    const nextAdr = dto.adr !== undefined ? dto.adr : existing.adr;
    const nextAdrClasses =
      dto.adrClasses !== undefined ? dto.adrClasses : existing.adrClasses;
    const nextLanguages =
      dto.languages !== undefined ? dto.languages : existing.languages;
    const violations: string[] = [];
    if (nextAdr && nextAdrClasses.length < 1) {
      violations.push('adrClasses wymaga min. 1 klasy gdy adr=true');
    }
    if (nextLanguages.length < 1) {
      violations.push('languages wymaga min. 1 języka');
    }
    if (violations.length > 0) {
      throw new UnprocessableEntityException({ violations });
    }
  }

  /**
   * Uploads each file to MinIO then inserts its `DriverAttachment` row. If
   * anything fails, every object/row touched in this call is removed; when
   * `opts.rollbackDriver` is set (the CREATE path) the driver row is removed
   * too — so a failed create never leaves a half-built driver.
   */
  private async _attachUploadsWithRollback(
    driver: DriverRow,
    uploads: CategorizedUpload[],
    createdById: string | null,
    opts: { rollbackDriver?: boolean } = {},
  ): Promise<DriverRow> {
    if (uploads.length === 0) {
      const fresh = await this.drivers.findById(driver.id);
      return fresh ?? driver;
    }

    const uploadedKeys: string[] = [];
    const insertedAttachmentIds: string[] = [];
    try {
      for (const up of uploads) {
        const key = this._buildStorageKey(driver.id, up);
        await this.storage.put(key, up.file.buffer, up.file.mimetype);
        uploadedKeys.push(key);
        const row = await this.attachments.create({
          driverId: driver.id,
          category: up.category,
          storageKey: key,
          fileName: up.file.originalname,
          mimeType: up.file.mimetype,
          size: up.file.size,
          uploadedById: createdById,
        });
        insertedAttachmentIds.push(row.id);
      }
    } catch (err) {
      await this._rollbackUploads(uploadedKeys, insertedAttachmentIds);
      if (opts.rollbackDriver) {
        try {
          await this.drivers.hardDelete(driver.id);
        } catch (e) {
          this.logger.error({
            msg: 'rollback: failed to remove driver row',
            driverId: driver.id,
            err: errorForLog(e),
          });
        }
      }
      throw err;
    }

    const fresh = await this.drivers.findById(driver.id);
    return fresh ?? driver;
  }

  /** Best-effort cleanup of partial uploads — never throws. */
  private async _rollbackUploads(
    uploadedKeys: string[],
    insertedAttachmentIds: string[],
  ): Promise<void> {
    for (const id of insertedAttachmentIds) {
      try {
        await this.attachments.hardDelete(id);
      } catch (e) {
        this.logger.error({
          msg: 'rollback: failed to remove driver attachment row',
          attachmentId: id,
          err: errorForLog(e),
        });
      }
    }
    for (const key of uploadedKeys) {
      try {
        await this.storage.delete(key);
      } catch (e) {
        this.logger.error({
          msg: 'rollback: failed to remove driver attachment storage object',
          key,
          err: errorForLog(e),
        });
      }
    }
  }

  /** Best-effort MinIO object delete — logs but never throws (idempotent). */
  private async _deleteStorageObject(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (e) {
      this.logger.error({
        msg: 'failed to remove driver attachment storage object',
        key,
        err: errorForLog(e),
      });
    }
  }

  private _buildStorageKey(driverId: string, up: CategorizedUpload): string {
    const ext = storageKeyExtension(up.file.mimetype);
    return `drivers/${driverId}/${up.category}/${randomUUID()}.${ext}`;
  }

  /**
   * Resolves the `removeAttachmentIds` list to live attachment rows. Each id
   * must point at a non-deleted attachment of THIS driver — otherwise 404.
   */
  private async _resolveRemovals(
    driverId: string,
    ids: string[],
  ): Promise<DriverAttachmentRow[]> {
    const rows: DriverAttachmentRow[] = [];
    for (const id of ids) {
      const row = await this.attachments.findById(id);
      if (!row || row.driverId !== driverId) {
        throw new NotFoundException(
          `Załącznik ${id} nie należy do tego kierowcy`,
        );
      }
      rows.push(row);
    }
    return rows;
  }

  private async _loadAttachmentOf(
    driverId: string,
    attachmentId: string,
  ): Promise<DriverAttachmentRow> {
    const driver = await this.drivers.findById(driverId);
    if (!driver) throw new NotFoundException('Kierowca nie znaleziony');
    const att = await this.attachments.findById(attachmentId);
    if (!att || att.driverId !== driverId) {
      throw new NotFoundException('Załącznik nie znaleziony');
    }
    return att;
  }

  // ── Internals: required-attachment rule ──────────────────

  /**
   * Create-time rule: when `adr=true` there must be ≥1 uploaded `adr` file.
   * Throws 422 with a Polish message on violation.
   */
  private _assertRequiredAttachmentsOnCreate(
    dto: CreateDriverDto,
    uploads: CategorizedUpload[],
  ): void {
    if (!dto.adr) return;
    if (!this._categoriesPresent(uploads).has('adr')) {
      throw new UnprocessableEntityException({
        violations: [ADR_ATTACHMENT_REQUIRED_MESSAGE],
      });
    }
  }

  /**
   * Update-time rule: the post-update attachment set (existing live − removed
   * + newly uploaded) must include an `adr` file when `adr` is true AFTER the
   * patch.
   */
  private _assertRequiredAttachmentsOnUpdate(
    existing: DriverRow,
    dto: UpdateDriverDto,
    uploads: CategorizedUpload[],
    removedIds: Set<string>,
  ): void {
    const nextAdr = dto.adr !== undefined ? dto.adr : existing.adr;
    if (!nextAdr) return;

    const survivingExisting = existing.attachments.filter(
      (a) => !removedIds.has(a.id),
    );
    const present = new Set<DriverAttachmentCategory>([
      ...survivingExisting.map((a) => a.category),
      ...this._categoriesPresent(uploads),
    ]);
    if (!present.has('adr')) {
      throw new UnprocessableEntityException({
        violations: [ADR_ATTACHMENT_REQUIRED_MESSAGE],
      });
    }
  }

  /** Set of attachment categories present among the uploaded files. */
  private _categoriesPresent(
    uploads: CategorizedUpload[],
  ): Set<DriverAttachmentCategory> {
    return new Set(uploads.map((u) => u.category));
  }

  // ── Internals: scoping / role checks ─────────────────────

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
    // scope: a carrier defaults to its own carrier (Carrier.userId = user.sub);
    // staff must name one. Access to it is `_assertCarrierAccessibleForWrite`
    // (docs/25 §0).
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
    throw new UnprocessableEntityException('Pole `carrierId` jest wymagane');
  }

  private async _assertCarrierAccessibleForWrite(
    user: AuthUser,
    carrierId: string,
  ): Promise<void> {
    // scope: writes only under a carrier the caller manages — admin any,
    // opiekun Carrier.opiekunId, przewoznik Carrier.userId; else 403 (docs/25 §0).
    if (user.role === 'admin') return;
    const carrier = await this.carriers.findById(carrierId);
    if (!carrier) throw new NotFoundException('Przewoźnik nie znaleziony');
    if (user.role === 'opiekun') {
      if (carrier.opiekunId !== user.sub) {
        throw new ForbiddenException('Nie masz uprawnień do tego przewoźnika');
      }
      return;
    }
    if (user.role === 'przewoznik') {
      if (carrier.userId !== user.sub) {
        throw new ForbiddenException('Nie masz uprawnień do tego przewoźnika');
      }
      return;
    }
    throw new ForbiddenException('Brak uprawnień');
  }

  private async _scopeFilters(
    user: AuthUser,
    filters: DriverFilters,
  ): Promise<DriverFilters & { carrierIds?: string[] }> {
    // scope: which drivers a list returns — admin all, opiekun via
    // Carrier.opiekunId, przewoznik Carrier.userId; else 403 (docs/25 §0).
    if (user.role === 'admin') return filters;
    if (user.role === 'opiekun') {
      // Phase 5.1 — mirror VehiclesService._scopeFilters: opiekun no longer
      // needs to pass `carrierId`. Without one we narrow to the union of
      // their owned carriers' drivers; with one we verify it's in the union
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
      idDocumentNumber: row.idDocumentNumber,
      // Nullable per phase3_blocks_audit_revert.
      licenseExpiry: row.licenseExpiry
        ? row.licenseExpiry.toISOString().slice(0, 10)
        : null,
      notes: row.notes,
      active: row.active,
      adr: row.adr,
      nationality: row.nationality,
      languages: row.languages,
      adrClasses: row.adrClasses as DriverDto['adrClasses'],
      carrier: row.carrier,
      attachments: row.attachments.map((a) => driverRowAttachmentToDto(a)),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

/** Polish 422 message for the missing required ADR-certificate attachment. */
const ADR_ATTACHMENT_REQUIRED_MESSAGE =
  'Wymagany skan świadectwa ADR gdy adr=true';

/** Maps a standalone attachment repo row to the public DTO (no storageKey). */
function attachmentRowToDto(row: DriverAttachmentRow): DriverAttachmentDto {
  return {
    id: row.id,
    driverId: row.driverId,
    category: row.category,
    fileName: row.fileName,
    mimeType: row.mimeType,
    size: row.size,
    uploadedById: row.uploadedById,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Error fields for a structured log line. Nest's `Logger` takes ONE object
 * (`{ msg, ... }`); the pino-style `(obj, 'msg')` signature does not fit it
 * (2026-08-14 logging audit, item 21).
 */
function errorForLog(e: unknown): { name: string; message: string; stack?: string } {
  return e instanceof Error
    ? { name: e.name, message: e.message, stack: e.stack }
    : { name: 'NonError', message: String(e) };
}

/** Maps an included driver-row attachment to the public DTO (no storageKey). */
function driverRowAttachmentToDto(
  row: DriverRowAttachment,
): DriverAttachmentDto {
  return {
    id: row.id,
    driverId: row.driverId,
    category: row.category,
    fileName: row.fileName,
    mimeType: row.mimeType,
    size: row.size,
    uploadedById: row.uploadedById,
    createdAt: row.createdAt.toISOString(),
  };
}
