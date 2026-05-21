import { Injectable } from '@nestjs/common';

import type { VehicleAttachmentCategory } from '@magguarantee/shared';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Row shape returned by the vehicle-attachment repository. `storageKey` is
 * included here because the service needs it (download proxy, rollback,
 * cleanup) — it is stripped only at the DTO boundary.
 */
export interface VehicleAttachmentRow {
  id: string;
  vehicleId: string;
  category: VehicleAttachmentCategory;
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
export interface CreateVehicleAttachmentInput {
  vehicleId: string;
  category: VehicleAttachmentCategory;
  storageKey: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedById: string | null;
}

/**
 * DB access for `vehicle_attachments`. The global soft-delete Prisma
 * extension auto-filters `deletedAt` on reads and turns `delete` into a
 * soft-delete update — so `listByVehicle` already returns live rows only and
 * `softDelete` leaves the MinIO object intact (the bytes are removed only on
 * an explicit storage cleanup).
 */
@Injectable()
export class VehicleAttachmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** All non-deleted attachments for a vehicle, oldest first. */
  async listByVehicle(vehicleId: string): Promise<VehicleAttachmentRow[]> {
    const rows = await this.prisma.client.vehicleAttachment.findMany({
      where: { vehicleId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.flatten(r));
  }

  /** Single attachment by id (live rows only via the soft-delete extension). */
  async findById(id: string): Promise<VehicleAttachmentRow | null> {
    const row = await this.prisma.client.vehicleAttachment.findFirst({
      where: { id },
    });
    return row ? this.flatten(row) : null;
  }

  /** Inserts one attachment row. */
  async create(
    input: CreateVehicleAttachmentInput,
  ): Promise<VehicleAttachmentRow> {
    const row = await this.prisma.client.vehicleAttachment.create({
      data: {
        vehicleId: input.vehicleId,
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
   * `delete` into `update { deletedAt: now() }` — the MinIO object is left
   * untouched on purpose (per the task brief).
   */
  async softDelete(id: string): Promise<void> {
    await this.prisma.client.vehicleAttachment.delete({ where: { id } });
  }

  /**
   * Hard-deletes a freshly-inserted attachment row. Used only by the create
   * rollback path, where the row was inserted moments ago in the same
   * request and never observed by any client — soft-delete would leave an
   * orphan. Bypasses the soft-delete extension via `deleteMany` on the raw
   * id (the extension only rewrites the singular `delete`).
   */
  async hardDelete(id: string): Promise<void> {
    await this.prisma.client.vehicleAttachment.deleteMany({ where: { id } });
  }

  // ── helpers ──────────────────────────────────────────────

  private flatten(row: VehicleAttachmentPrismaShape): VehicleAttachmentRow {
    return {
      id: row.id,
      vehicleId: row.vehicleId,
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

interface VehicleAttachmentPrismaShape {
  id: string;
  vehicleId: string;
  category: VehicleAttachmentCategory;
  storageKey: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
