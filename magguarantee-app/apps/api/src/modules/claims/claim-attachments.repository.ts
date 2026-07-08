import { Injectable } from '@nestjs/common';

import type { ClaimAttachmentCategory } from '@magguarantee/shared';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Flat row shape returned by the claim-attachment repository. `url` holds the
 * MinIO object key (not a public URL — MinIO is not reachable directly; the
 * download endpoint proxies it). It is included here because the download
 * proxy / orphan-cleanup need it; only the DTO boundary keeps it as `url`.
 */
export interface ClaimAttachmentRow {
  id: string;
  claimId: string;
  category: ClaimAttachmentCategory;
  url: string;
  mimeType: string | null;
  size: number | null;
  uploadedById: string | null;
  createdAt: Date;
}

/** Input for inserting one claim attachment row after the bytes are in MinIO. */
export interface CreateClaimAttachmentInput {
  claimId: string;
  category: ClaimAttachmentCategory;
  /** MinIO object key stored in the `url` column. */
  url: string;
  mimeType: string | null;
  size: number | null;
  uploadedById: string | null;
}

/**
 * DB access for `claim_attachments`.
 *
 * `ClaimAttachment` is NOT a soft-delete model (no `deletedAt` column — see
 * `soft-delete.extension.ts`), so `.delete()` is a genuine hard-delete — used
 * only by the upload orphan-cleanup rollback path (the row was inserted moments
 * ago and never observed by any client). All reads/writes route through
 * `prisma.tx`, so when the caller runs inside an ambient `@Audit` transaction
 * (or a manual `$transaction`) the attachment insert + the claim gate-clear
 * stamp commit atomically.
 */
@Injectable()
export class ClaimAttachmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Single attachment by id (used by the download proxy). */
  async findById(id: string): Promise<ClaimAttachmentRow | null> {
    const row = await this.prisma.tx.claimAttachment.findFirst({
      where: { id },
    });
    return row ? this.flatten(row) : null;
  }

  /** Inserts one attachment row (bytes already in MinIO). */
  async create(
    input: CreateClaimAttachmentInput,
  ): Promise<ClaimAttachmentRow> {
    const row = await this.prisma.tx.claimAttachment.create({
      data: {
        claimId: input.claimId,
        category: input.category,
        url: input.url,
        mimeType: input.mimeType,
        size: input.size,
        uploadedById: input.uploadedById,
      },
    });
    return this.flatten(row);
  }

  /**
   * Hard-deletes a freshly-inserted attachment row. Used only by the upload
   * rollback path when the claim gate-clear stamp (or any later step) fails
   * after the row was inserted — a genuine delete keeps no orphan row.
   * `ClaimAttachment` has no `deletedAt`, so `.delete()` is already a real
   * delete (no `INCLUDE_SOFT_DELETED` escape hatch needed).
   */
  async hardDelete(id: string): Promise<void> {
    await this.prisma.tx.claimAttachment.delete({ where: { id } });
  }

  // ── helpers ──────────────────────────────────────────────

  private flatten(row: ClaimAttachmentPrismaShape): ClaimAttachmentRow {
    return {
      id: row.id,
      claimId: row.claimId,
      category: row.category,
      url: row.url,
      mimeType: row.mimeType,
      size: row.size,
      uploadedById: row.uploadedById,
      createdAt: row.createdAt,
    };
  }
}

interface ClaimAttachmentPrismaShape {
  id: string;
  claimId: string;
  category: ClaimAttachmentCategory;
  url: string;
  mimeType: string | null;
  size: number | null;
  uploadedById: string | null;
  createdAt: Date;
}
