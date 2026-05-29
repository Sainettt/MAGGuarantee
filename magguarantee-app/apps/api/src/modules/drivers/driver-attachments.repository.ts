import { Injectable } from '@nestjs/common';

import type { Prisma } from '@magguarantee/database';

import type { DriverAttachmentCategory } from '@magguarantee/shared';

import { PrismaService } from '../prisma/prisma.service';
import { INCLUDE_SOFT_DELETED } from '../prisma/soft-delete.extension';

/**
 * Row shape returned by the driver-attachment repository. `storageKey` is
 * included here because the service needs it (download proxy, rollback,
 * cleanup) — it is stripped only at the DTO boundary.
 */
export interface DriverAttachmentRow {
  id: string;
  driverId: string;
  category: DriverAttachmentCategory;
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
export interface CreateDriverAttachmentInput {
  driverId: string;
  category: DriverAttachmentCategory;
  storageKey: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedById: string | null;
}

/**
 * DB access for `driver_attachments`. The global soft-delete Prisma
 * extension auto-filters `deletedAt` on reads and turns `delete` into a
 * soft-delete update — so `listByDriver` already returns live rows only and
 * `softDelete` leaves the MinIO object intact (the bytes are removed only on
 * an explicit storage cleanup). Mirrors `VehicleAttachmentsRepository`.
 */
@Injectable()
export class DriverAttachmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** All non-deleted attachments for a driver, oldest first. */
  async listByDriver(driverId: string): Promise<DriverAttachmentRow[]> {
    const rows = await this.prisma.tx.driverAttachment.findMany({
      where: { driverId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.flatten(r));
  }

  /** Single attachment by id (live rows only via the soft-delete extension). */
  async findById(id: string): Promise<DriverAttachmentRow | null> {
    const row = await this.prisma.tx.driverAttachment.findFirst({
      where: { id },
    });
    return row ? this.flatten(row) : null;
  }

  /** Inserts one attachment row. */
  async create(
    input: CreateDriverAttachmentInput,
  ): Promise<DriverAttachmentRow> {
    const row = await this.prisma.tx.driverAttachment.create({
      data: {
        driverId: input.driverId,
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
    await this.prisma.tx.driverAttachment.delete({ where: { id } });
  }

  /**
   * Hard-deletes a freshly-inserted attachment row. Used only by the create
   * rollback path, where the row was inserted moments ago in the same request
   * and never observed by any client — a soft-delete would leave a permanent
   * orphan row, so we issue a genuine hard-delete.
   *
   * `DriverAttachment` is now a soft-delete model (its plain `.delete()` /
   * `.deleteMany()` are rewritten to `deletedAt = now()`), so we opt out via
   * the `INCLUDE_SOFT_DELETED` escape hatch — that runs a real `deleteMany`
   * on the underlying client.
   */
  async hardDelete(id: string): Promise<void> {
    await this.prisma.tx.driverAttachment.deleteMany({
      where: { id },
      [INCLUDE_SOFT_DELETED]: true,
    } as unknown as Prisma.DriverAttachmentDeleteManyArgs);
  }

  // ── helpers ──────────────────────────────────────────────

  private flatten(row: DriverAttachmentPrismaShape): DriverAttachmentRow {
    return {
      id: row.id,
      driverId: row.driverId,
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

interface DriverAttachmentPrismaShape {
  id: string;
  driverId: string;
  category: DriverAttachmentCategory;
  storageKey: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
