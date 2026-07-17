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
  CreateTrailerDto,
  TrailerAttachmentCategory,
  TrailerAttachmentDto,
  TrailerDto,
  TrailerFilters,
  UpdateTrailerDto,
} from '@magguarantee/shared';

import { storageKeyExtension } from '../../common/attachments';
import { AuditContext } from '../../common/audit';
import {
  isPrismaForeignKeyViolation,
  isPrismaUniqueViolation,
  uniqueViolationToConflict,
} from '../../common/errors/prisma-error';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CarriersRepository } from '../carriers/carriers.repository';
import { StorageService, type StorageObject } from '../storage/storage.service';
import { TrailerTypesRepository } from '../trailer-types/trailer-types.repository';
import { type CategorizedUpload } from './attachment-validation';
import {
  TrailerAttachmentsRepository,
  type TrailerAttachmentRow,
} from './trailer-attachments.repository';
import {
  TrailersRepository,
  type TrailerRow,
  type TrailerRowAttachment,
} from './trailers.repository';

/** Minimum count required for belts / mats / beams when their flag is true. */
const MIN_SECURING_COUNT = 3;

/**
 * Machine code for the hard-delete reference-guard 409. Published in
 * docs/13-api-design.md#trailers — do NOT rename.
 */
const TRAILER_HAS_REFERENCES_CODE = 'TRAILER_HAS_REFERENCES';

/**
 * Trailers CRUD service per docs/13-api-design.md#trailers.
 *
 * Multipart: create/update accept file parts (the XL certificate) plus scalar
 * fields. Required-attachment rule (service-layer, file arrives out-of-band):
 *   - `certXl=true` ⇒ ≥1 live `cert_xl` attachment (PDF-only, MIME-checked in
 *     `collectAndValidateUploads`).
 * Cross-field rules (service-layer, authoritative post-patch — Zod can't see a
 * partial PATCH): belts/mats/beams counts ≥3 when flagged; slidingRoof ⇒ edscha.
 */
@Injectable()
export class TrailersService {
  private readonly logger = new Logger(TrailersService.name);

  constructor(
    private readonly trailers: TrailersRepository,
    private readonly carriers: CarriersRepository,
    private readonly trailerTypes: TrailerTypesRepository,
    private readonly attachments: TrailerAttachmentsRepository,
    private readonly storage: StorageService,
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

  /**
   * Creates a trailer plus its XL-certificate attachment(s). Order:
   * carrier-access check → active-type check → rules (cert_xl + counts/edscha)
   * → create Trailer → upload files → insert attachment rows. On any post-create
   * failure the uploaded objects and the trailer row are rolled back.
   */
  async create(
    user: AuthUser,
    dto: CreateTrailerDto,
    uploads: CategorizedUpload[],
  ): Promise<TrailerDto> {
    await this._assertCarrierAccessibleForWrite(user, dto.carrierId);
    await this._assertActiveTrailerType(dto.trailerTypeId);

    this._assertTrailerRulesOnCreate(dto, uploads);

    let row: TrailerRow;
    try {
      row = await this.trailers.create({
        carrierId: dto.carrierId,
        plateNumber: dto.plateNumber,
        active: dto.active,
        trailerTypeId: dto.trailerTypeId,
        sideClearanceCm: dto.sideClearanceCm,
        belts: dto.belts ?? null,
        beltsCount: dto.beltsCount ?? null,
        mats: dto.mats ?? null,
        matsCount: dto.matsCount ?? null,
        beams: dto.beams ?? null,
        beamsCount: dto.beamsCount ?? null,
        innerLength: dto.innerLength ?? null,
        innerWidth: dto.innerWidth ?? null,
        innerHeight: dto.innerHeight ?? null,
        capacity: dto.capacity ?? null,
        liftingRoof: dto.liftingRoof ?? false,
        slidingRoof: dto.slidingRoof ?? false,
        edscha: dto.edscha ?? null,
        palletBox: dto.palletBox ?? false,
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

    const persisted = await this._attachUploadsWithRollback(
      row,
      uploads,
      user.sub,
      { rollbackTrailer: true },
    );
    return this.toDto(persisted);
  }

  async update(
    id: string,
    dto: UpdateTrailerDto,
    uploads: CategorizedUpload[],
  ): Promise<TrailerDto> {
    const existing = await this.trailers.findById(id);
    if (!existing) throw new NotFoundException('Naczepa nie znaleziona');
    AuditContext.setBefore(this.toDto(existing));
    if (dto.trailerTypeId !== undefined) {
      await this._assertActiveTrailerType(dto.trailerTypeId);
    }

    const removeIds = dto.removeAttachmentIds ?? [];
    const toRemove = await this._resolveRemovals(id, removeIds);

    this._assertTrailerRulesOnUpdate(
      existing,
      dto,
      uploads,
      new Set(toRemove.map((a) => a.id)),
    );

    const patch = this._buildUpdatePatch(dto);

    try {
      await this.trailers.update(id, patch);
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        throw uniqueViolationToConflict(
          err,
          'Naczepa o tym numerze rejestracyjnym już istnieje u tego przewoźnika',
        );
      }
      throw err;
    }

    for (const a of toRemove) {
      await this.attachments.softDelete(a.id);
      await this._deleteStorageObject(a.storageKey);
    }
    await this._attachUploadsWithRollback(existing, uploads, /* createdById */ null);

    const fresh = await this.trailers.findById(id);
    return this.toDto(fresh ?? existing);
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
   * Hard-deletes a trailer row. Phase 4.4 admin-only flow — `reason` required
   * (Zod-validated upstream) and lands in `audit_log.metadata.reason`.
   *
   * `trailer_attachments` is `ON DELETE CASCADE`, so those rows go with the
   * trailer (MinIO objects left in place — same policy as the vehicle
   * hard-delete). But `delegations.trailerId` is `ON DELETE RESTRICT` (since
   * migration 20260518113943): a physical delete of a referenced trailer would
   * fail late with P2003 → 500. We refuse deterministically with a 409
   * (`TRAILER_HAS_REFERENCES`) — a pre-flight `countReferencingRows` guard
   * (incl. soft-deleted delegations) plus a TOCTOU P2003 catch.
   */
  async hardDelete(id: string, reason: string): Promise<void> {
    const existing = await this.trailers.findById(id);
    if (!existing) throw new NotFoundException('Naczepa nie znaleziona');

    const references = await this.trailers.countReferencingRows(id);
    if (references > 0) {
      throw this._referencesConflict();
    }

    AuditContext.setBefore(this.toDto(existing));
    AuditContext.setMetadata({ reason });
    try {
      await this.trailers.hardDelete(id);
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
   * The code (`TRAILER_HAS_REFERENCES`) is published in
   * docs/13-api-design.md#trailers.
   */
  private _referencesConflict(): ConflictException {
    return new ConflictException({
      code: TRAILER_HAS_REFERENCES_CODE,
      message:
        'Nie można trwale usunąć naczepy — istnieją powiązane rekordy ' +
        '(wyjazdy). Trwałe usunięcie jest możliwe tylko dla pustych rekordów.',
      extensions: { code: TRAILER_HAS_REFERENCES_CODE },
    });
  }

  // ── Attachments ──────────────────────────────────────────

  /** Lists the non-deleted attachments of a trailer as public DTOs. */
  async listAttachments(trailerId: string): Promise<TrailerAttachmentDto[]> {
    const trailer = await this.trailers.findById(trailerId);
    if (!trailer) throw new NotFoundException('Naczepa nie znaleziona');
    const rows = await this.attachments.listByTrailer(trailerId);
    return rows.map((r) => attachmentRowToDto(r));
  }

  /**
   * Returns the byte stream + metadata for an attachment so the controller can
   * proxy it to the HTTP response (MinIO is not publicly reachable).
   */
  async downloadAttachment(
    trailerId: string,
    attachmentId: string,
  ): Promise<{ object: StorageObject; fileName: string; mimeType: string }> {
    const att = await this._loadAttachmentOf(trailerId, attachmentId);
    const object = await this.storage.getObject(att.storageKey);
    return { object, fileName: att.fileName, mimeType: att.mimeType };
  }

  /** Soft-deletes an attachment row and removes the MinIO object. */
  async deleteAttachment(
    trailerId: string,
    attachmentId: string,
  ): Promise<void> {
    const att = await this._loadAttachmentOf(trailerId, attachmentId);
    await this.attachments.softDelete(att.id);
    await this._deleteStorageObject(att.storageKey);
  }

  // ── Internals: persistence ───────────────────────────────

  private _buildUpdatePatch(dto: UpdateTrailerDto): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    const passthrough: (keyof UpdateTrailerDto)[] = [
      'plateNumber',
      'active',
      'trailerTypeId',
      'sideClearanceCm',
      'belts',
      'beltsCount',
      'mats',
      'matsCount',
      'beams',
      'beamsCount',
      'innerLength',
      'innerWidth',
      'innerHeight',
      'capacity',
      'liftingRoof',
      'slidingRoof',
      'edscha',
      'palletBox',
      'certXl',
      'multilock',
      'notes',
    ];
    for (const k of passthrough) {
      if (dto[k] !== undefined) patch[k] = dto[k];
    }
    return patch;
  }

  /**
   * Uploads each file to MinIO then inserts its `TrailerAttachment` row. On any
   * failure everything touched here is removed; when `opts.rollbackTrailer` is
   * set (CREATE path) the trailer row is removed too.
   */
  private async _attachUploadsWithRollback(
    trailer: TrailerRow,
    uploads: CategorizedUpload[],
    createdById: string | null,
    opts: { rollbackTrailer?: boolean } = {},
  ): Promise<TrailerRow> {
    if (uploads.length === 0) {
      const fresh = await this.trailers.findById(trailer.id);
      return fresh ?? trailer;
    }

    const uploadedKeys: string[] = [];
    const insertedAttachmentIds: string[] = [];
    try {
      for (const up of uploads) {
        const key = this._buildStorageKey(trailer.id, up);
        await this.storage.put(key, up.file.buffer, up.file.mimetype);
        uploadedKeys.push(key);
        const row = await this.attachments.create({
          trailerId: trailer.id,
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
      if (opts.rollbackTrailer) {
        try {
          await this.trailers.hardDelete(trailer.id);
        } catch (e) {
          this.logger.error(
            { err: e, trailerId: trailer.id },
            'Rollback: failed to remove trailer row',
          );
        }
      }
      throw err;
    }

    const fresh = await this.trailers.findById(trailer.id);
    return fresh ?? trailer;
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

  /** Best-effort MinIO object delete — logs but never throws (idempotent). */
  private async _deleteStorageObject(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (e) {
      this.logger.error(
        { err: e, key },
        'Failed to remove trailer attachment storage object',
      );
    }
  }

  private _buildStorageKey(trailerId: string, up: CategorizedUpload): string {
    const ext = storageKeyExtension(up.file.mimetype);
    return `trailers/${trailerId}/${up.category}/${randomUUID()}.${ext}`;
  }

  private async _resolveRemovals(
    trailerId: string,
    ids: string[],
  ): Promise<TrailerAttachmentRow[]> {
    const rows: TrailerAttachmentRow[] = [];
    for (const id of ids) {
      const row = await this.attachments.findById(id);
      if (!row || row.trailerId !== trailerId) {
        throw new NotFoundException(
          `Załącznik ${id} nie należy do tej naczepy`,
        );
      }
      rows.push(row);
    }
    return rows;
  }

  private async _loadAttachmentOf(
    trailerId: string,
    attachmentId: string,
  ): Promise<TrailerAttachmentRow> {
    const trailer = await this.trailers.findById(trailerId);
    if (!trailer) throw new NotFoundException('Naczepa nie znaleziona');
    const att = await this.attachments.findById(attachmentId);
    if (!att || att.trailerId !== trailerId) {
      throw new NotFoundException('Załącznik nie znaleziony');
    }
    return att;
  }

  // ── Internals: required-attachment + cross-field rules ───

  private _assertTrailerRulesOnCreate(
    dto: CreateTrailerDto,
    uploads: CategorizedUpload[],
  ): void {
    const present = this._categoriesPresent(uploads);
    const violations = [
      ...this._attachmentViolations(dto.certXl ?? false, present),
      ...this._crossFieldViolations({
        belts: dto.belts ?? null,
        beltsCount: dto.beltsCount ?? null,
        mats: dto.mats ?? null,
        matsCount: dto.matsCount ?? null,
        beams: dto.beams ?? null,
        beamsCount: dto.beamsCount ?? null,
        slidingRoof: dto.slidingRoof ?? null,
        edscha: dto.edscha ?? null,
      }),
    ];
    if (violations.length > 0) {
      throw new UnprocessableEntityException({ violations });
    }
  }

  private _assertTrailerRulesOnUpdate(
    existing: TrailerRow,
    dto: UpdateTrailerDto,
    uploads: CategorizedUpload[],
    removedIds: Set<string>,
  ): void {
    const pick = <T>(next: T | undefined, prev: T): T =>
      next !== undefined ? next : prev;
    const effectiveCertXl = pick(dto.certXl, existing.certXl) === true;
    const survivingExisting = existing.attachments.filter(
      (a) => !removedIds.has(a.id),
    );
    const present = new Set<TrailerAttachmentCategory>([
      ...survivingExisting.map((a) => a.category),
      ...this._categoriesPresent(uploads),
    ]);
    const violations = [
      ...this._attachmentViolations(effectiveCertXl, present),
      ...this._crossFieldViolations({
        belts: pick(dto.belts, existing.belts),
        beltsCount: pick(dto.beltsCount, existing.beltsCount),
        mats: pick(dto.mats, existing.mats),
        matsCount: pick(dto.matsCount, existing.matsCount),
        beams: pick(dto.beams, existing.beams),
        beamsCount: pick(dto.beamsCount, existing.beamsCount),
        slidingRoof: pick(dto.slidingRoof, existing.slidingRoof),
        edscha: pick(dto.edscha, existing.edscha),
      }),
    ];
    if (violations.length > 0) {
      throw new UnprocessableEntityException({ violations });
    }
  }

  private _categoriesPresent(
    uploads: CategorizedUpload[],
  ): Set<TrailerAttachmentCategory> {
    return new Set(uploads.map((u) => u.category));
  }

  private _attachmentViolations(
    certXl: boolean,
    present: Set<TrailerAttachmentCategory>,
  ): string[] {
    if (certXl && !present.has('cert_xl')) {
      return ['Wymagany skan certyfikatu XL (PDF) gdy certXl=true'];
    }
    return [];
  }

  private _crossFieldViolations(eff: {
    belts: boolean | null;
    beltsCount: number | null;
    mats: boolean | null;
    matsCount: number | null;
    beams: boolean | null;
    beamsCount: number | null;
    slidingRoof: boolean | null;
    edscha: boolean | null;
  }): string[] {
    const v: string[] = [];
    const assertMin = (
      flag: boolean | null,
      count: number | null,
      label: string,
    ): void => {
      if (flag !== true) return;
      if (count === null || count === undefined) {
        v.push(`${label}Count wymagany gdy ${label}=true`);
      } else if (count < MIN_SECURING_COUNT) {
        v.push(`${label}Count musi być ≥${MIN_SECURING_COUNT}`);
      }
    };
    assertMin(eff.belts, eff.beltsCount, 'belts');
    assertMin(eff.mats, eff.matsCount, 'mats');
    assertMin(eff.beams, eff.beamsCount, 'beams');
    if (eff.slidingRoof === true && (eff.edscha === null || eff.edscha === undefined)) {
      v.push('edscha wymagany gdy slidingRoof=true');
    }
    return v;
  }

  // ── Internals: scoping / role checks ─────────────────────

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
      belts: row.belts,
      beltsCount: row.beltsCount,
      mats: row.mats,
      matsCount: row.matsCount,
      beams: row.beams,
      beamsCount: row.beamsCount,
      innerLength: row.innerLength,
      innerWidth: row.innerWidth,
      innerHeight: row.innerHeight,
      capacity: row.capacity,
      sideClearanceCm: row.sideClearanceCm,
      liftingRoof: row.liftingRoof,
      slidingRoof: row.slidingRoof,
      edscha: row.edscha,
      palletBox: row.palletBox,
      certXl: row.certXl,
      multilock: row.multilock,
      notes: row.notes,
      carrier: row.carrier,
      attachments: row.attachments.map((a) => trailerRowAttachmentToDto(a)),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

/** Maps a standalone attachment repo row to the public DTO (no storageKey). */
function attachmentRowToDto(row: TrailerAttachmentRow): TrailerAttachmentDto {
  return {
    id: row.id,
    trailerId: row.trailerId,
    category: row.category,
    fileName: row.fileName,
    mimeType: row.mimeType,
    size: row.size,
    uploadedById: row.uploadedById,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Maps an included trailer-row attachment to the public DTO (no storageKey). */
function trailerRowAttachmentToDto(
  row: TrailerRowAttachment,
): TrailerAttachmentDto {
  return {
    id: row.id,
    trailerId: row.trailerId,
    category: row.category,
    fileName: row.fileName,
    mimeType: row.mimeType,
    size: row.size,
    uploadedById: row.uploadedById,
    createdAt: row.createdAt.toISOString(),
  };
}
