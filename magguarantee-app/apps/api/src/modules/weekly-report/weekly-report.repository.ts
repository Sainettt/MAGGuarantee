import { Injectable } from '@nestjs/common';

import {
  ClaimStatus as PrismaClaimStatus,
  ReklamacjaResolution as PrismaReklamacjaResolution,
  Role as PrismaRole,
} from '@magguarantee/database';

import { PrismaService } from '../prisma/prisma.service';

/** Counts of what happened inside the reported window. */
export interface WeeklyWindowStats {
  /** Claims submitted (`createdAt`) during the window. */
  submitted: number;
  /** Claims that became `ZAAKCEPTOWANO` during the window. */
  accepted: number;
  /** Claims that became `ODRZUCONO` during the window. */
  rejected: number;
  /** Σ `paymentEur` over the accepted-in-window set. */
  payoutEur: number;
  /** Reklamacje decided `UZNANA` during the window (`reklamacjaDecidedAt`). */
  reklamacjeUznane: number;
  /** Σ `reklamacjaAmount` over that set — the extra money owed this week. */
  reklamacjeUznaneEur: number;
}

/** Counts of what is open right now, regardless of when it arrived. */
export interface WeeklyBacklogStats {
  naWeryfikacji: number;
  oczekujeNaAutoryzacje: number;
  reklamacja: number;
}

/** Active admin recipient of the Monday report. */
export interface WeeklyReportRecipientRow {
  email: string;
  name: string | null;
}

/**
 * Read-only repository for the weekly-report cron. Kept separate from
 * `DiagnosticsRepository` (which backs the admin dashboard HTTP surface) so the
 * cron module carries no dependency on the diagnostics module — same split as
 * `VerificationSlaRepository`.
 *
 * DECISION on the accepted/rejected windows: the predicate is
 * `status = X AND statusChangedAt ∈ window`, NOT an audit-log scan.
 * `statusChangedAt` is re-stamped on every transition, so a claim that was
 * accepted in the window and later moved on (e.g. into REKLAMACJA) drops out of
 * the tally. That is the intended reading: the report describes the CURRENT state
 * of the week's work, and a re-opened claim is no longer an accepted one.
 *
 * REWORK 2026-07-31 — a reklamacja decision now returns the claim to
 * `statusBeforeReklamacja` and re-stamps `statusChangedAt`, so that same
 * predicate would re-count an old decision as a fresh one. `windowStats`
 * therefore excludes rows whose reklamacja was decided inside the window (see the
 * comment there) and reports them separately as «Uznane reklamacje».
 */
@Injectable()
export class WeeklyReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Everything that happened inside `[start, end)`.
   *
   * `Promise.all`, not `$transaction`: `prisma.tx` is typed as the loose
   * `PrismaClient | Prisma.TransactionClient` union (a tx client has no
   * `$transaction`), and a read-only weekly summary does not need a single
   * MVCC snapshot across four aggregates.
   */
  async windowStats(start: Date, end: Date): Promise<WeeklyWindowStats> {
    const inWindow = { gte: start, lt: end };
    // ⚠️ COUPLING with `ClaimsService._buildUpdatePatch` (write site).
    //
    // A reklamacja decision rolls `status` BACK to `statusBeforeReklamacja` and
    // re-stamps `statusChangedAt` — from the SAME `Date` instance it writes to
    // `reklamacjaDecidedAt`. Without this exclusion a wniosek accepted in March
    // whose reklamacja was decided this week would resurface in "Zaakceptowane"
    // (and in the payout sum) as if it were freshly accepted.
    //
    // The exclusion is `reklamacjaDecidedAt ∉ window`, which is equivalent to the
    // exact predicate `NOT (reklamacjaDecidedAt IS NOT NULL AND statusChangedAt =
    // reklamacjaDecidedAt)`: the two columns are written from one instant, and a
    // claim can never be freshly decided AFTER its reklamacja was decided (the
    // reklamacja is one-shot and its outcome is terminal). Expressed as a
    // window filter rather than a column-to-column comparison because Prisma
    // field references would leak the client's `fields` surface into every mock.
    const notReklamacjaRollback = { NOT: { reklamacjaDecidedAt: inWindow } };
    const freshlyAccepted = {
      status: PrismaClaimStatus.ZAAKCEPTOWANO,
      statusChangedAt: inWindow,
      ...notReklamacjaRollback,
    };
    const [submitted, accepted, rejected, payout, uznane] = await Promise.all([
      this.prisma.tx.claim.count({ where: { createdAt: inWindow } }),
      this.prisma.tx.claim.count({ where: freshlyAccepted }),
      this.prisma.tx.claim.count({
        where: {
          status: PrismaClaimStatus.ODRZUCONO,
          statusChangedAt: inWindow,
          ...notReklamacjaRollback,
        },
      }),
      this.prisma.tx.claim.aggregate({
        where: freshlyAccepted,
        _sum: { paymentEur: true },
      }),
      // Uznane reklamacje — keyed on `reklamacjaDecidedAt` (NOT
      // `statusChangedAt`, which the rollback made ambiguous) and on the explicit
      // outcome column, because the resulting status carries the ORIGINAL wniosek
      // verdict and says nothing about the reklamacja.
      this.prisma.tx.claim.aggregate({
        where: {
          reklamacjaResolution: PrismaReklamacjaResolution.UZNANA,
          reklamacjaDecidedAt: inWindow,
        },
        _count: { _all: true },
        _sum: { reklamacjaAmount: true },
      }),
    ]);

    return {
      submitted,
      accepted,
      rejected,
      payoutEur: decimalToNumber(payout._sum.paymentEur) ?? 0,
      reklamacjeUznane: uznane._count._all,
      reklamacjeUznaneEur: decimalToNumber(uznane._sum.reklamacjaAmount) ?? 0,
    };
  }

  /** Open work as of now — the "Stan bieżący" block of the email. */
  async backlogStats(): Promise<WeeklyBacklogStats> {
    const [naWeryfikacji, oczekujeNaAutoryzacje, reklamacja] =
      await Promise.all([
        this.prisma.tx.claim.count({
          where: { status: PrismaClaimStatus.NA_WERYFIKACJI },
        }),
        this.prisma.tx.claim.count({
          where: { status: PrismaClaimStatus.OCZEKUJE_NA_AUTORYZACJE },
        }),
        this.prisma.tx.claim.count({
          where: { status: PrismaClaimStatus.REKLAMACJA },
        }),
      ]);
    return { naWeryfikacji, oczekujeNaAutoryzacje, reklamacja };
  }

  /**
   * Active admin recipients. The legacy GAS job mailed a single hardcoded
   * `CONFIG.ADMIN_EMAIL`; the modern equivalent is "every active admin".
   * pracownik is deliberately NOT included — they already get the daily
   * verification-SLA digest, which is the actionable one for their scope.
   */
  async findActiveAdminRecipients(): Promise<WeeklyReportRecipientRow[]> {
    const rows = await this.prisma.tx.user.findMany({
      where: {
        role: PrismaRole.admin,
        active: true,
        deletedAt: null,
      },
      select: { email: true, name: true },
    });
    return rows.map((r) => ({ email: r.email, name: r.name }));
  }
}

/**
 * Loose Decimal → number coercion. Prisma returns `Decimal` instances for
 * `Decimal(_, _)` columns at runtime; aggregates may surface numeric strings
 * depending on the driver path. Handle all three plus `null` / `undefined`.
 * Module-private per the repository convention in this codebase.
 */
function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (
    typeof value === 'object' &&
    'toNumber' in value &&
    typeof (value as { toNumber: () => number }).toNumber === 'function'
  ) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return null;
}
