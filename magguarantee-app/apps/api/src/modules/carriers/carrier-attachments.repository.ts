import { Injectable } from '@nestjs/common';

import type { CarrierAttachmentCategory } from '@magguarantee/shared';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Row shape returned by the carrier-attachment repository. `storageKey` is
 * included here because the service needs it (download proxy, delete,
 * cleanup) — it is stripped only at the DTO boundary.
 */
export interface CarrierAttachmentRow {
  id: string;
  carrierId: string;
  category: CarrierAttachmentCategory;
  storageKey: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** Input for inserting one attachment row after the bytes are in MinIO. */
export interface CreateCarrierAttachmentInput {
  carrierId: string;
  category: CarrierAttachmentCategory;
  storageKey: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedById: string | null;
}

/**
 * DB access for `carrier_attachments`. The global soft-delete Prisma
 * extension auto-filters `deletedAt` on reads and turns `delete` into a
 * soft-delete update — so `listByCarrier` already returns live rows only and
 * `softDelete` leaves the MinIO object intact (the bytes are removed
 * separately by the service on the explicit DELETE endpoint). Mirrors
 * `VehicleAttachmentsRepository`.
 */
@Injectable()
export class CarrierAttachmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** All non-deleted attachments for a carrier, oldest first. */
  async listByCarrier(carrierId: string): Promise<CarrierAttachmentRow[]> {
    const rows = await this.prisma.tx.carrierAttachment.findMany({
      where: { carrierId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.flatten(r));
  }

  /** Single attachment by id (live rows only via the soft-delete extension). */
  async findById(id: string): Promise<CarrierAttachmentRow | null> {
    const row = await this.prisma.tx.carrierAttachment.findFirst({
      where: { id },
    });
    return row ? this.flatten(row) : null;
  }

  /**
   * Counts the carrier's non-deleted attachments in a single category. Used by
   * the upload guard that enforces "at most one ADR document per carrier" — a
   * `count` keeps the existence check focused (no full-list fetch). The
   * soft-delete extension already constrains the query to live rows, so the
   * count never includes soft-deleted attachments.
   */
  async countActiveByCategory(
    carrierId: string,
    category: CarrierAttachmentCategory,
  ): Promise<number> {
    return this.prisma.tx.carrierAttachment.count({
      where: { carrierId, category },
    });
  }

  /** Inserts one attachment row. */
  async create(
    input: CreateCarrierAttachmentInput,
  ): Promise<CarrierAttachmentRow> {
    const row = await this.prisma.tx.carrierAttachment.create({
      data: {
        carrierId: input.carrierId,
        category: input.category,
        storageKey: input.storageKey,
        fileName: input.fileName,
        mimeType: input.mimeType,
        size: input.size,
        uploadedById: input.uploadedById,
      },
    });
    return this.flatten(row);
  }

  /**
   * Soft-deletes an attachment row. The soft-delete extension rewrites
   * `delete` into `update { deletedAt: now() }` — the MinIO object is handled
   * separately by the service (deleted on the explicit DELETE endpoint).
   */
  async softDelete(id: string): Promise<void> {
    await this.prisma.tx.carrierAttachment.delete({ where: { id } });
  }

  /**
   * Hard-deletes a freshly-inserted attachment row. Used only by the upload
   * rollback path, where the row was inserted moments ago in the same
   * request and never observed by any client. Bypasses the soft-delete
   * extension via `deleteMany` (the extension only rewrites the singular
   * `delete`).
   */
  async hardDelete(id: string): Promise<void> {
    await this.prisma.tx.carrierAttachment.deleteMany({ where: { id } });
  }

  // ── helpers ──────────────────────────────────────────────

  private flatten(row: CarrierAttachmentPrismaShape): CarrierAttachmentRow {
    return {
      id: row.id,
      carrierId: row.carrierId,
      category: row.category,
      storageKey: row.storageKey,
      fileName: row.fileName,
      mimeType: row.mimeType,
      size: row.size,
      uploadedById: row.uploadedById,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    };
  }
}

interface CarrierAttachmentPrismaShape {
  id: string;
  carrierId: string;
  category: CarrierAttachmentCategory;
  storageKey: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
