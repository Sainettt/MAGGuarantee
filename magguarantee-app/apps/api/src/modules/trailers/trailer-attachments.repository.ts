import { Injectable } from '@nestjs/common';

import type { Prisma } from '@magguarantee/database';

import type { TrailerAttachmentCategory } from '@magguarantee/shared';

import { PrismaService } from '../prisma/prisma.service';
import { INCLUDE_SOFT_DELETED } from '../prisma/soft-delete.extension';

/**
 * Row shape returned by the trailer-attachment repository. `storageKey` is
 * included here because the service needs it (download proxy, rollback,
 * cleanup) — it is stripped only at the DTO boundary. Mirrors
 * `DriverAttachmentsRepository`.
 */
export interface TrailerAttachmentRow {
  id: string;
  trailerId: string;
  category: TrailerAttachmentCategory;
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
export interface CreateTrailerAttachmentInput {
  trailerId: string;
  category: TrailerAttachmentCategory;
  storageKey: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedById: string | null;
}

/**
 * DB access for `trailer_attachments`. The global soft-delete Prisma extension
 * auto-filters `deletedAt` on reads and turns `delete` into a soft-delete
 * update. Mirrors `DriverAttachmentsRepository`.
 */
@Injectable()
export class TrailerAttachmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** All non-deleted attachments for a trailer, oldest first. */
  async listByTrailer(trailerId: string): Promise<TrailerAttachmentRow[]> {
    const rows = await this.prisma.tx.trailerAttachment.findMany({
      where: { trailerId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.flatten(r));
  }

  /** Single attachment by id (live rows only via the soft-delete extension). */
  async findById(id: string): Promise<TrailerAttachmentRow | null> {
    const row = await this.prisma.tx.trailerAttachment.findFirst({
      where: { id },
    });
    return row ? this.flatten(row) : null;
  }

  /** Inserts one attachment row. */
  async create(
    input: CreateTrailerAttachmentInput,
  ): Promise<TrailerAttachmentRow> {
    const row = await this.prisma.tx.trailerAttachment.create({
      data: {
        trailerId: input.trailerId,
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
   * separately by the service.
   */
  async softDelete(id: string): Promise<void> {
    await this.prisma.tx.trailerAttachment.delete({ where: { id } });
  }

  /**
   * Hard-deletes a freshly-inserted attachment row (create rollback path). Opts
   * out of the soft-delete rewrite via the `INCLUDE_SOFT_DELETED` escape hatch.
   */
  async hardDelete(id: string): Promise<void> {
    await this.prisma.tx.trailerAttachment.deleteMany({
      where: { id },
      [INCLUDE_SOFT_DELETED]: true,
    } as unknown as Prisma.TrailerAttachmentDeleteManyArgs);
  }

  // ── helpers ──────────────────────────────────────────────

  private flatten(row: TrailerAttachmentPrismaShape): TrailerAttachmentRow {
    return {
      id: row.id,
      trailerId: row.trailerId,
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

interface TrailerAttachmentPrismaShape {
  id: string;
  trailerId: string;
  category: TrailerAttachmentCategory;
  storageKey: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
