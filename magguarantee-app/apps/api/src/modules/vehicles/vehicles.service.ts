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
  CreateVehicleDto,
  UpdateVehicleDto,
  VehicleAttachmentCategory,
  VehicleAttachmentDto,
  VehicleDto,
  VehicleFilters,
} from '@magguarantee/shared';

import {
  isPrismaUniqueViolation,
  uniqueViolationToConflict,
} from '../../common/errors/prisma-error';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CarriersRepository } from '../carriers/carriers.repository';
import { StorageService, type StorageObject } from '../storage/storage.service';
import { UsersRepository } from '../users/users.repository';
import {
  extensionForMime,
  isAllowedMimeType,
  type CategorizedUpload,
} from './attachment-validation';
import {
  VehicleAttachmentsRepository,
  type VehicleAttachmentRow,
} from './vehicle-attachments.repository';
import {
  VehiclesRepository,
  type VehicleRow,
  type VehicleRowAttachment,
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
 * Required-attachment rule (umowa / cabotage screenshots) — service-layer,
 * because files arrive as separate multipart parts and cannot be expressed
 * in the body Zod schema:
 *   - `gps=true`        ⇒ ≥1 `contract`    attachment
 *   - `cabotageDe=true` ⇒ ≥1 `cabotage_de` attachment
 *   - `cabotageFr=true` ⇒ ≥1 `cabotage_fr` attachment
 * On create the rule is checked BEFORE any DB/storage write. On update it
 * must hold over (existing live attachments + newly uploaded − removed).
 *
 * Role-scoped list filtering happens here because guards can only fire on
 * per-row routes; collection routes need service-side narrowing.
 */
@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(
    private readonly vehicles: VehiclesRepository,
    private readonly users: UsersRepository,
    private readonly carriers: CarriersRepository,
    private readonly attachments: VehicleAttachmentsRepository,
    private readonly storage: StorageService,
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

  /**
   * Creates a vehicle plus its umowa/cabotage attachments.
   *
   * Order: validate required-attachment rule → create Vehicle → upload each
   * file to MinIO → insert `VehicleAttachment` rows. On any post-create
   * failure the uploaded objects and the vehicle row are rolled back so the
   * request is all-or-nothing.
   */
  async create(
    user: AuthUser,
    dto: CreateVehicleDto,
    uploads: CategorizedUpload[],
  ): Promise<VehicleDto> {
    await this._assertCarrierAccessibleForWrite(user, dto.carrierId);
    if (dto.plannerId) await this._assertRole(dto.plannerId, 'planista');
    if (dto.dispatcherId)
      await this._assertRole(dto.dispatcherId, 'dyspozytor');
    // Defence-in-depth — Zod refine in CreateVehicleSchema already enforces
    // this, but if the pipe is bypassed we want the friendlier 422 instead
    // of a Postgres CHECK violation surfacing as 500.
    this._assertGpsInvariant(dto.gps ?? false, dto.gpsMobilePhone ?? null);

    // Required-attachment rule — checked BEFORE any write so a missing
    // umowa/cabotage screenshot fails clean with 422 (no orphan rows).
    this._assertRequiredAttachmentsOnCreate(dto, uploads);

    const row = await this._persistVehicle(user, dto);
    const persisted = await this._attachUploadsWithRollback(
      row,
      uploads,
      user.sub,
      // On create, a failed attachment step must also remove the vehicle row
      // so the request is all-or-nothing (no half-built vehicle left behind).
      { rollbackVehicle: true },
    );

    // Onboarding state is derived on read from the live child-count snapshot
    // (see `CarriersService.toDto`) — creating a vehicle no longer needs a
    // side-effect to mutate any carrier-level flag.
    return this.toDto(persisted);
  }

  /**
   * Updates a vehicle. Supports adding new attachments (file parts) and
   * removing existing ones (`removeAttachmentIds`). The required-attachment
   * rule must hold over the post-update set: existing live attachments minus
   * removed plus newly uploaded.
   */
  async update(
    id: string,
    dto: UpdateVehicleDto,
    uploads: CategorizedUpload[],
  ): Promise<VehicleDto> {
    const existing = await this.vehicles.findById(id);
    if (!existing) throw new NotFoundException('Pojazd nie znaleziony');
    if (dto.plannerId !== undefined && dto.plannerId !== null) {
      await this._assertRole(dto.plannerId, 'planista');
    }
    if (dto.dispatcherId !== undefined && dto.dispatcherId !== null) {
      await this._assertRole(dto.dispatcherId, 'dyspozytor');
    }

    const removeIds = dto.removeAttachmentIds ?? [];
    const toRemove = await this._resolveRemovals(id, removeIds);

    // Resolve the post-patch (gps, gpsMobilePhone) values. PATCH semantics:
    // if the field isn't in dto, fall back to the existing row.
    const nextGps = dto.gps !== undefined ? dto.gps : existing.gps;
    const nextDevice =
      dto.gpsMobilePhone !== undefined
        ? dto.gpsMobilePhone
        : existing.gpsMobilePhone;
    this._assertGpsInvariant(nextGps, nextDevice ?? null);

    // Required-attachment rule over the post-update attachment set.
    this._assertRequiredAttachmentsOnUpdate(
      existing,
      dto,
      uploads,
      new Set(toRemove.map((a) => a.id)),
    );

    const patch = this._buildUpdatePatch(dto);

    let row: VehicleRow;
    try {
      row = await this.vehicles.update(id, patch);
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        throw uniqueViolationToConflict(
          err,
          'Pojazd o tym numerze rejestracyjnym już istnieje u tego przewoźnika',
        );
      }
      throw err;
    }

    // Apply attachment removals (soft-delete; MinIO object left intact) and
    // new uploads. The vehicle scalars are already persisted at this point.
    for (const a of toRemove) {
      await this.attachments.softDelete(a.id);
    }
    await this._attachUploadsWithRollback(row, uploads, /* createdById */ null);

    const fresh = await this.vehicles.findById(id);
    return this.toDto(fresh ?? row);
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

  // ── Attachments ──────────────────────────────────────────

  /** Lists the non-deleted attachments of a vehicle as public DTOs. */
  async listAttachments(vehicleId: string): Promise<VehicleAttachmentDto[]> {
    const vehicle = await this.vehicles.findById(vehicleId);
    if (!vehicle) throw new NotFoundException('Pojazd nie znaleziony');
    const rows = await this.attachments.listByVehicle(vehicleId);
    return rows.map((r) => attachmentRowToDto(r));
  }

  /**
   * Returns the byte stream + metadata for an attachment so the controller
   * can proxy it to the HTTP response. MinIO is not publicly reachable —
   * downloads always go through the API.
   */
  async downloadAttachment(
    vehicleId: string,
    attachmentId: string,
  ): Promise<{ object: StorageObject; fileName: string; mimeType: string }> {
    const att = await this._loadAttachmentOf(vehicleId, attachmentId);
    const object = await this.storage.getObject(att.storageKey);
    return { object, fileName: att.fileName, mimeType: att.mimeType };
  }

  /**
   * Soft-deletes an attachment row. The MinIO object is intentionally left in
   * place (per the task brief).
   */
  async deleteAttachment(
    vehicleId: string,
    attachmentId: string,
  ): Promise<void> {
    const att = await this._loadAttachmentOf(vehicleId, attachmentId);
    await this.attachments.softDelete(att.id);
  }

  // ── Internals: persistence ───────────────────────────────

  private async _persistVehicle(
    user: AuthUser,
    dto: CreateVehicleDto,
  ): Promise<VehicleRow> {
    try {
      return await this.vehicles.create({
        carrierId: dto.carrierId,
        plateNumber: dto.plateNumber,
        active: dto.active,
        plannerId: dto.plannerId ?? null,
        dispatcherId: dto.dispatcherId ?? null,
        brand: dto.brand ?? null,
        model: dto.model ?? null,
        year: dto.year ?? null,
        notes: dto.notes ?? null,
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
        rateDe: dto.rateDe,
        rateUe: dto.rateUe,
        rateExport: dto.rateExport,
        rateImport: dto.rateImport,
        wasteAllowed: dto.wasteAllowed,
        wasteCountries: dto.wasteCountries ?? [],
        cabotageDe: dto.cabotageDe,
        cabotageFr: dto.cabotageFr,
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
  }

  private _buildUpdatePatch(dto: UpdateVehicleDto): Record<string, unknown> {
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
    return patch;
  }

  /**
   * Uploads each file to MinIO then inserts its `VehicleAttachment` row. If
   * anything fails, every object/row touched in this call is removed; when
   * `opts.rollbackVehicle` is set (the CREATE path) the vehicle row is
   * removed too — so a failed create never leaves a half-built vehicle.
   */
  private async _attachUploadsWithRollback(
    vehicle: VehicleRow,
    uploads: CategorizedUpload[],
    createdById: string | null,
    opts: { rollbackVehicle?: boolean } = {},
  ): Promise<VehicleRow> {
    if (uploads.length === 0) return vehicle;

    const uploadedKeys: string[] = [];
    const insertedAttachmentIds: string[] = [];
    try {
      for (const up of uploads) {
        const key = this._buildStorageKey(vehicle.id, up);
        await this.storage.put(key, up.file.buffer, up.file.mimetype);
        uploadedKeys.push(key);
        const row = await this.attachments.create({
          vehicleId: vehicle.id,
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
      if (opts.rollbackVehicle) {
        try {
          await this.vehicles.hardDelete(vehicle.id);
        } catch (e) {
          this.logger.error(
            { err: e, vehicleId: vehicle.id },
            'Rollback: failed to remove vehicle row',
          );
        }
      }
      throw err;
    }

    const fresh = await this.vehicles.findById(vehicle.id);
    return fresh ?? vehicle;
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
        this.logger.error(
          { err: e, attachmentId: id },
          'Rollback: failed to remove attachment row',
        );
      }
    }
    for (const key of uploadedKeys) {
      try {
        await this.storage.delete(key);
      } catch (e) {
        this.logger.error(
          { err: e, key },
          'Rollback: failed to remove storage object',
        );
      }
    }
  }

  private _buildStorageKey(
    vehicleId: string,
    up: CategorizedUpload,
  ): string {
    const ext = isAllowedMimeType(up.file.mimetype)
      ? extensionForMime(up.file.mimetype)
      : 'bin';
    return `vehicles/${vehicleId}/${up.category}/${randomUUID()}.${ext}`;
  }

  /**
   * Resolves the `removeAttachmentIds` list to live attachment rows. Each id
   * must point at a non-deleted attachment of THIS vehicle — otherwise 404.
   */
  private async _resolveRemovals(
    vehicleId: string,
    ids: string[],
  ): Promise<VehicleAttachmentRow[]> {
    const rows: VehicleAttachmentRow[] = [];
    for (const id of ids) {
      const row = await this.attachments.findById(id);
      if (!row || row.vehicleId !== vehicleId) {
        throw new NotFoundException(
          `Załącznik ${id} nie należy do tego pojazdu`,
        );
      }
      rows.push(row);
    }
    return rows;
  }

  private async _loadAttachmentOf(
    vehicleId: string,
    attachmentId: string,
  ): Promise<VehicleAttachmentRow> {
    const vehicle = await this.vehicles.findById(vehicleId);
    if (!vehicle) throw new NotFoundException('Pojazd nie znaleziony');
    const att = await this.attachments.findById(attachmentId);
    if (!att || att.vehicleId !== vehicleId) {
      throw new NotFoundException('Załącznik nie znaleziony');
    }
    return att;
  }

  // ── Internals: required-attachment rule ──────────────────

  /**
   * Create-time rule: every flag that is `true` must have ≥1 matching
   * uploaded file. Throws 422 listing all missing categories.
   */
  private _assertRequiredAttachmentsOnCreate(
    dto: CreateVehicleDto,
    uploads: CategorizedUpload[],
  ): void {
    const present = this._categoriesPresent(uploads);
    const required = this._requiredCategories(
      dto.gps ?? false,
      dto.cabotageDe ?? false,
      dto.cabotageFr ?? false,
    );
    this._assertCategoriesSatisfied(required, present);
  }

  /**
   * Update-time rule: the post-update attachment set (existing live − removed
   * + newly uploaded) must satisfy every flag that is `true` AFTER the patch.
   */
  private _assertRequiredAttachmentsOnUpdate(
    existing: VehicleRow,
    dto: UpdateVehicleDto,
    uploads: CategorizedUpload[],
    removedIds: Set<string>,
  ): void {
    const nextGps = dto.gps !== undefined ? dto.gps : existing.gps;
    const nextCabotageDe =
      dto.cabotageDe !== undefined ? dto.cabotageDe : existing.cabotageDe;
    const nextCabotageFr =
      dto.cabotageFr !== undefined ? dto.cabotageFr : existing.cabotageFr;
    const required = this._requiredCategories(
      nextGps,
      nextCabotageDe,
      nextCabotageFr,
    );

    const survivingExisting = existing.attachments.filter(
      (a) => !removedIds.has(a.id),
    );
    const present = new Set<VehicleAttachmentCategory>([
      ...survivingExisting.map((a) => a.category),
      ...this._categoriesPresent(uploads),
    ]);
    this._assertCategoriesSatisfied(required, present);
  }

  /** Set of attachment categories present among the uploaded files. */
  private _categoriesPresent(
    uploads: CategorizedUpload[],
  ): Set<VehicleAttachmentCategory> {
    return new Set(uploads.map((u) => u.category));
  }

  /** Maps the three flags to the set of required attachment categories. */
  private _requiredCategories(
    gps: boolean,
    cabotageDe: boolean,
    cabotageFr: boolean,
  ): Set<VehicleAttachmentCategory> {
    const required = new Set<VehicleAttachmentCategory>();
    if (gps) required.add('contract');
    if (cabotageDe) required.add('cabotage_de');
    if (cabotageFr) required.add('cabotage_fr');
    return required;
  }

  private _assertCategoriesSatisfied(
    required: Set<VehicleAttachmentCategory>,
    present: Set<VehicleAttachmentCategory>,
  ): void {
    const violations: string[] = [];
    for (const cat of required) {
      if (!present.has(cat)) {
        violations.push(REQUIRED_ATTACHMENT_MESSAGES[cat]);
      }
    }
    if (violations.length > 0) {
      throw new UnprocessableEntityException({ violations });
    }
  }

  // ── Internals: scoping / role checks ─────────────────────

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
      attachments: row.attachments.map((a) => vehicleRowAttachmentToDto(a)),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

/** Polish 422 messages for each missing required-attachment category. */
const REQUIRED_ATTACHMENT_MESSAGES: Record<VehicleAttachmentCategory, string> =
  {
    contract:
      'Wymagany skan umowy (contract) gdy GPS jest włączony (gps=true)',
    cabotage_de:
      'Wymagany skan pozwolenia kabotażowego DE gdy cabotageDe=true',
    cabotage_fr:
      'Wymagany skan pozwolenia kabotażowego FR gdy cabotageFr=true',
  };

/** Maps a standalone attachment repo row to the public DTO (no storageKey). */
function attachmentRowToDto(row: VehicleAttachmentRow): VehicleAttachmentDto {
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    category: row.category,
    fileName: row.fileName,
    mimeType: row.mimeType,
    size: row.size,
    uploadedById: row.uploadedById,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Maps an included vehicle-row attachment to the public DTO (no storageKey). */
function vehicleRowAttachmentToDto(
  row: VehicleRowAttachment,
): VehicleAttachmentDto {
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    category: row.category,
    fileName: row.fileName,
    mimeType: row.mimeType,
    size: row.size,
    uploadedById: row.uploadedById,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}
