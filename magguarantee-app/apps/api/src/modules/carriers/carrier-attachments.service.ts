import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import type {
  CarrierAttachmentCategory,
  CarrierAttachmentDto,
} from '@magguarantee/shared';

import {
  assertUploadAllowed,
  storageKeyExtension,
  type UploadedFile,
} from '../../common/attachments';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { StorageService, type StorageObject } from '../storage/storage.service';
import {
  CarrierAttachmentsRepository,
  type CarrierAttachmentRow,
} from './carrier-attachments.repository';
import { CarriersRepository } from './carriers.repository';

/**
 * Standalone carrier-document management per docs/13-api-design.md#carriers.
 *
 * Carrier documents (OCP insurance / transport license / KREPTD extract /
 * other) are managed from a dedicated "Documents" tab — independent of the
 * carrier create/edit form — so the surface is upload/list/download/delete,
 * one file at a time. Mirrors the vehicle attachment storage conventions
 * (MinIO key `carriers/<carrierId>/<category>/<fileId>.<ext>`, soft-delete,
 * download proxy) but the upload payload is a single `file` part plus a
 * `category` text part.
 *
 * Ownership: admin sees all; opiekun is restricted to their own carriers. The
 * `:id` carrier id is always a route param, so the upstream
 * `OpiekunOwnershipGuard` (`@OpiekunOwns('id','param','carrierId')`) enforces
 * this on every endpoint — including the multipart upload, where the id is in
 * the path (not the body). The `_assertCarrierExists` check below is the
 * existence/404 backstop.
 */
/**
 * The carrier's mandatory ADR document. Unlike the other categories
 * (insurance / license / kreptd / other, which allow multiple uploads), there
 * may be at most ONE active `adr` attachment per carrier — enforced on upload.
 */
const SINGLE_DOC_CATEGORY: CarrierAttachmentCategory = 'adr';

@Injectable()
export class CarrierAttachmentsService {
  private readonly logger = new Logger(CarrierAttachmentsService.name);

  constructor(
    private readonly carriers: CarriersRepository,
    private readonly attachments: CarrierAttachmentsRepository,
    private readonly storage: StorageService,
  ) {}

  /**
   * Uploads one document: validate file (MIME / size) → put bytes to MinIO →
   * insert the `CarrierAttachment` row tagged with the uploader. On a DB
   * failure after the object lands the object is removed so no orphan blob is
   * left behind.
   */
  async upload(
    user: AuthUser,
    carrierId: string,
    category: CarrierAttachmentCategory,
    file: UploadedFile | undefined,
  ): Promise<CarrierAttachmentDto> {
    await this._assertCarrierExists(carrierId);
    if (!file) {
      throw new NotFoundException('Brak pliku w żądaniu');
    }
    assertUploadAllowed(file);
    // Enforce "at most one ADR document per carrier" BEFORE touching MinIO so
    // a rejected duplicate never writes a (then-orphaned) object.
    await this._assertSingleDocCategoryFree(carrierId, category);

    const key = `carriers/${carrierId}/${category}/${randomUUID()}.${storageKeyExtension(
      file.mimetype,
    )}`;
    await this.storage.put(key, file.buffer, file.mimetype);

    try {
      const row = await this.attachments.create({
        carrierId,
        category,
        storageKey: key,
        fileName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        uploadedById: user.sub,
      });
      return attachmentRowToDto(row);
    } catch (err) {
      // The blob landed but the row insert failed — drop the orphan object.
      await this._deleteStorageObject(key);
      throw err;
    }
  }

  /** Lists the non-deleted attachments of a carrier as public DTOs. */
  async list(carrierId: string): Promise<CarrierAttachmentDto[]> {
    await this._assertCarrierExists(carrierId);
    const rows = await this.attachments.listByCarrier(carrierId);
    return rows.map((r) => attachmentRowToDto(r));
  }

  /**
   * Returns the byte stream + metadata so the controller can proxy it to the
   * HTTP response. MinIO is not publicly reachable — downloads go through the
   * API.
   */
  async download(
    carrierId: string,
    attachmentId: string,
  ): Promise<{ object: StorageObject; fileName: string; mimeType: string }> {
    const att = await this._loadAttachmentOf(carrierId, attachmentId);
    const object = await this.storage.getObject(att.storageKey);
    return { object, fileName: att.fileName, mimeType: att.mimeType };
  }

  /**
   * Soft-deletes an attachment row AND removes the MinIO object — a deliberate
   * delete from the Documents tab clears the bytes (mirrors how the vehicle
   * delete handles the object on the explicit DELETE path).
   */
  async delete(carrierId: string, attachmentId: string): Promise<void> {
    const att = await this._loadAttachmentOf(carrierId, attachmentId);
    await this.attachments.softDelete(att.id);
    await this._deleteStorageObject(att.storageKey);
  }

  // ── internals ────────────────────────────────────────────

  private async _assertCarrierExists(carrierId: string): Promise<void> {
    const carrier = await this.carriers.findById(carrierId);
    if (!carrier) throw new NotFoundException('Przewoźnik nie znaleziony');
  }

  /**
   * Guards the single-document categories (currently only `adr`): if the
   * carrier already has a live attachment in such a category, reject with 409
   * so the user knows to delete the existing one first. No-op for the
   * multi-upload categories (insurance / license / kreptd / other).
   */
  private async _assertSingleDocCategoryFree(
    carrierId: string,
    category: CarrierAttachmentCategory,
  ): Promise<void> {
    if (category !== SINGLE_DOC_CATEGORY) return;
    const existing = await this.attachments.countActiveByCategory(
      carrierId,
      category,
    );
    if (existing > 0) {
      throw new ConflictException(
        'Dokument ADR już istnieje dla tego przewoźnika',
      );
    }
  }

  private async _loadAttachmentOf(
    carrierId: string,
    attachmentId: string,
  ): Promise<CarrierAttachmentRow> {
    await this._assertCarrierExists(carrierId);
    const att = await this.attachments.findById(attachmentId);
    if (!att || att.carrierId !== carrierId) {
      throw new NotFoundException('Załącznik nie znaleziony');
    }
    return att;
  }

  /** Best-effort MinIO object delete — logs but never throws (idempotent). */
  private async _deleteStorageObject(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (e) {
      this.logger.error(
        { err: e, key },
        'Failed to remove carrier attachment storage object',
      );
    }
  }
}

/** Maps a repo row to the public DTO (no storageKey). */
function attachmentRowToDto(row: CarrierAttachmentRow): CarrierAttachmentDto {
  return {
    id: row.id,
    carrierId: row.carrierId,
    category: row.category,
    fileName: row.fileName,
    mimeType: row.mimeType,
    size: row.size,
    uploadedById: row.uploadedById,
    createdAt: row.createdAt.toISOString(),
  };
}
