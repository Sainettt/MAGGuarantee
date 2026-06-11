import { Injectable } from '@nestjs/common';

import {
  ClaimStatus as PrismaClaimStatus,
  Role as PrismaRole,
} from '@magguarantee/database';
import type { ClaimStatus } from '@magguarantee/shared';

import { PrismaService } from '../prisma/prisma.service';

/**
 * One `NA_WERYFIKACJI` claim considered by the daily verification-SLA digest
 * (docs/21-pracownik-verification-sla.md §5). Same anchor convention as the
 * dashboard widget: `statusChangedAt ?? createdAt`.
 */
export interface SlaDigestCandidateRow {
  nrZgl: string;
  status: ClaimStatus;
  carrierName: string | null;
  vehiclePlate: string | null;
  /** SLA anchor — `statusChangedAt ?? createdAt`. */
  anchorDate: Date;
}

/** Active-pracownik recipient of the digest. */
export interface DigestRecipientRow {
  email: string;
  name: string | null;
}

/**
 * Read-only repository for the verification-SLA cron/digest. Kept separate
 * from `DiagnosticsRepository` so the cron module has no dependency on the
 * diagnostics HTTP surface (and vice-versa) — the two share only the shared
 * `bucketForAnchor` calendar helper.
 */
@Injectable()
export class VerificationSlaRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ALL claims currently in `NA_WERYFIKACJI` — the "on the clock" set
   * (docs/21 §1). Uses the `@@index([status, statusChangedAt])` index. The
   * service buckets each row via `bucketForAnchor`; the bucket can't be a SQL
   * predicate because it depends on the Polish working-day calendar.
   */
  async findNaWeryfikacjiForSla(): Promise<SlaDigestCandidateRow[]> {
    const rows = await this.prisma.tx.claim.findMany({
      where: { status: PrismaClaimStatus.NA_WERYFIKACJI },
      orderBy: { statusChangedAt: 'asc' },
      select: {
        nrZgl: true,
        status: true,
        vehiclePlateSnapshot: true,
        statusChangedAt: true,
        createdAt: true,
        carrier: { select: { user: { select: { name: true, login: true } } } },
      },
    });
    return rows.map((r) => ({
      nrZgl: r.nrZgl,
      status: r.status as ClaimStatus,
      carrierName: r.carrier?.user.name ?? r.carrier?.user.login ?? null,
      vehiclePlate: r.vehiclePlateSnapshot ?? null,
      anchorDate: r.statusChangedAt ?? r.createdAt,
    }));
  }

  /**
   * Active pracownik recipients: `role = 'pracownik' AND active = true AND
   * deletedAt IS NULL` (docs/21 §5; v1 = pracownik only, not admin). The
   * soft-delete client extension already injects `deletedAt: null`, but we set
   * it explicitly so the predicate is unambiguous and unit-test-safe.
   */
  async findActivePracownikRecipients(): Promise<DigestRecipientRow[]> {
    const rows = await this.prisma.tx.user.findMany({
      where: {
        role: PrismaRole.pracownik,
        active: true,
        deletedAt: null,
      },
      select: { email: true, name: true },
    });
    return rows.map((r) => ({ email: r.email, name: r.name }));
  }
}
