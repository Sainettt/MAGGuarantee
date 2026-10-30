import { Injectable } from '@nestjs/common';

import { ClaimStatus as PrismaClaimStatus } from '@magguarantee/database';
import {
  formatIsoWeekKey,
  SLA_CLOCK_STATUSES,
  type ClaimStatus,
  type Role,
} from '@magguarantee/shared';

import { isoWeeksOfPeriod } from '../km-calc/km-calc.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * `SLA_CLOCK_STATUSES` (`NA_WERYFIKACJI` + `REKLAMACJA`, docs/21 §1) as Prisma
 * enum members. Indexing by the shared name keeps the two enums in lock-step at
 * compile time.
 */
const SLA_CLOCK_PRISMA_STATUSES: readonly PrismaClaimStatus[] =
  SLA_CLOCK_STATUSES.map((s) => PrismaClaimStatus[s]);

/**
 * Compact claim row used to bucket the verification-SLA widget
 * (docs/21-pracownik-verification-sla.md §4). We deliberately skip the full
 * `ClaimRow` flatten — the dashboard doesn't render breakdown or attachments,
 * and the cheaper query keeps the endpoint snappy.
 *
 * `anchorDate` is the SLA anchor: `statusChangedAt` falling back to
 * `createdAt` when null (rare legacy/edge rows). The service buckets it via
 * `bucketForAnchor` and drops `onTrack`. `status` is `NA_WERYFIKACJI` or
 * `REKLAMACJA` — passed through so the web can label reklamacja rows.
 */
export interface DashboardSlaCandidateRow {
  id: string;
  nrZgl: string;
  status: ClaimStatus;
  carrierName: string | null;
  vehiclePlate: string | null;
  /** SLA anchor — `statusChangedAt ?? createdAt`. */
  anchorDate: Date;
}

export interface DashboardAuditRow {
  id: string;
  action: string;
  targetType: string | null;
  targetKey: string | null;
  userLogin: string | null;
  createdAt: Date;
}

export interface DashboardCarrierTotal {
  carrierId: string;
  login: string;
  name: string | null;
  totalEur: number;
}

export interface DashboardMonthlyPoint {
  yearMonth: string;
  count: number;
  sumEur: number;
}

export interface ClaimsHealthRow {
  name: string;
  count: number;
  sampleIds: string[];
}

export interface DbTableSize {
  name: string;
  sizeBytes: number;
}

/**
 * Read-only repository backing the diagnostics dashboard and admin views.
 * All queries go through `prisma.tx` for consistency with the rest of the
 * codebase, but none of these endpoints are audited / transactional —
 * `tx` falls back to the root client when no `AuditContext` is active.
 */
@Injectable()
export class DiagnosticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Dashboard ────────────────────────────────────────────

  /** Counts grouped by `status`. Empty buckets are returned with `0`. */
  async countClaimsByStatus(): Promise<Record<ClaimStatus, number>> {
    const groups = await this.prisma.tx.claim.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const out: Record<ClaimStatus, number> = {
      NA_WERYFIKACJI: 0,
      ZAAKCEPTOWANO: 0,
      ODRZUCONO: 0,
      REKLAMACJA: 0,
      OCZEKUJE_NA_AUTORYZACJE: 0,
    };
    for (const g of groups) {
      out[g.status as ClaimStatus] = g._count._all;
    }
    return out;
  }

  /**
   * ALL claims currently in `NA_WERYFIKACJI` or `REKLAMACJA` — the "on the
   * clock" set for the verification-SLA widget (docs/21 §1/§4,
   * `SLA_CLOCK_STATUSES`). Uses the `@@index([status, statusChangedAt])`
   * index. The service buckets these via `bucketForAnchor` (overdue / dueSoon /
   * drop onTrack); we return every on-the-clock row because the bucket depends
   * on the Polish working-day calendar, which can't be expressed as a SQL
   * predicate.
   *
   * The anchor is `statusChangedAt ?? createdAt` — `statusChangedAt` is
   * re-stamped on every status transition (e.g. the `OCZEKUJE_NA_AUTORYZACJE →
   * NA_WERYFIKACJI` rollback when a re-verify drops the dopłata under threshold),
   * so the clock restarts correctly; the `createdAt` fallback covers rare rows
   * where `statusChangedAt` was never set. `submitReklamacja` re-stamps it at
   * filing (same instant as `reklamacjaSubmittedAt`), so a reklamacja runs its
   * own 7-day clock from the day it was filed; the decision (`→ ZAAKCEPTOWANO`
   * / `→ ODRZUCONO`) re-stamps it again and takes the claim off the clock.
   */
  async findOnSlaClock(): Promise<DashboardSlaCandidateRow[]> {
    const rows = await this.prisma.tx.claim.findMany({
      where: { status: { in: [...SLA_CLOCK_PRISMA_STATUSES] } },
      orderBy: { statusChangedAt: 'asc' },
      select: {
        id: true,
        nrZgl: true,
        status: true,
        vehiclePlateSnapshot: true,
        statusChangedAt: true,
        createdAt: true,
        carrier: { select: { user: { select: { name: true, login: true } } } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      nrZgl: r.nrZgl,
      status: r.status as ClaimStatus,
      carrierName: r.carrier?.user.name ?? r.carrier?.user.login ?? null,
      vehiclePlate: r.vehiclePlateSnapshot ?? null,
      anchorDate: r.statusChangedAt ?? r.createdAt,
    }));
  }

  /**
   * Last N audit rows whose `targetType` starts with `claim.` or equals
   * `Claim` (the former is reserved for future event-bus style actions —
   * today's audit writers use `Claim`). The dashboard sidebar surfaces
   * these under "Recent activity".
   */
  async findRecentClaimAudit(limit: number): Promise<DashboardAuditRow[]> {
    const rows = await this.prisma.tx.auditLog.findMany({
      where: {
        OR: [
          { targetType: 'Claim' },
          { targetType: { startsWith: 'claim.' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        action: true,
        targetType: true,
        targetKey: true,
        createdAt: true,
        user: { select: { login: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      targetType: r.targetType,
      targetKey: r.targetKey,
      userLogin: r.user?.login ?? null,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Top N carriers by `SUM(paymentEur)`. Only accepted claims count; rejected
   * and pending claims are excluded so the leaderboard reflects actual
   * compensation paid out.
   */
  async findTopCarriersByPayment(args: {
    limit: number;
  }): Promise<DashboardCarrierTotal[]> {
    const groups = await this.prisma.tx.claim.groupBy({
      by: ['carrierId'],
      where: { status: PrismaClaimStatus.ZAAKCEPTOWANO },
      _sum: { paymentEur: true },
      orderBy: { _sum: { paymentEur: 'desc' } },
      take: args.limit,
    });
    if (groups.length === 0) return [];

    const ids = groups.map((g) => g.carrierId);
    const carriers = await this.prisma.tx.carrier.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        user: { select: { login: true, name: true } },
      },
    });
    const byId = new Map(carriers.map((c) => [c.id, c]));
    return groups
      .map((g) => {
        const c = byId.get(g.carrierId);
        if (!c) return null;
        return {
          carrierId: g.carrierId,
          login: c.user.login,
          name: c.user.name,
          totalEur: decimalToNumber(g._sum.paymentEur) ?? 0,
        };
      })
      .filter((r): r is DashboardCarrierTotal => r !== null);
  }

  /**
   * Rolling 12-month series: `{yearMonth, count, sumEur}` per month, ordered
   * oldest → newest so the dashboard renders left-to-right naturally.
   *
   * Implemented via `$queryRaw` (Prisma's `groupBy` cannot project a derived
   * `to_char(...)` column). The cast to `bigint` → `Number` is safe because
   * any single carrier's monthly count is bounded well below 2^53.
   */
  async findMonthlySeries(args: {
    from: Date;
    to: Date;
  }): Promise<DashboardMonthlyPoint[]> {
    const rows = await this.prisma.tx.$queryRaw<
      { ym: string; cnt: bigint; total: unknown }[]
    >`
      SELECT
        to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM') AS ym,
        COUNT(*)::bigint                                     AS cnt,
        COALESCE(SUM("paymentEur"), 0)                       AS total
      FROM claims
      WHERE "createdAt" >= ${args.from}
        AND "createdAt" <  ${args.to}
        AND "deletedAt" IS NULL
      GROUP BY ym
      ORDER BY ym ASC
    `;
    return rows.map((r) => ({
      yearMonth: r.ym,
      count: Number(r.cnt),
      sumEur: decimalToNumber(r.total) ?? 0,
    }));
  }

  /** Count of claims currently in the `REKLAMACJA` status. */
  async countReklamacje(): Promise<number> {
    return this.prisma.tx.claim.count({
      where: { status: PrismaClaimStatus.REKLAMACJA },
    });
  }

  // ── Claims health (admin) ────────────────────────────────

  /**
   * Aggregates a fixed set of "orphan / suspicious claim" buckets. Each
   * bucket returns `{name, count, sampleIds}` — the sample is a small (≤5)
   * list of UUIDs the admin can spot-check.
   */
  async findClaimsHealth(args: {
    sampleSize: number;
    naWeryfikacjiOlderThan: Date;
  }): Promise<ClaimsHealthRow[]> {
    const buckets: ClaimsHealthRow[] = [];

    // Bucket 1: claims without a vehicle (FK is nullable since
    // vehicle hard-delete keeps claims; the snapshot column carries the plate).
    const missingVehicle = await this._sampleClaims({
      where: { vehicleId: null },
      sampleSize: args.sampleSize,
    });
    buckets.push({
      name: 'Claims without vehicle',
      count: missingVehicle.count,
      sampleIds: missingVehicle.sampleIds,
    });

    // Buckets 2+3: claims stuck in `NA_WERYFIKACJI` > N days with
    // `kmGuaranteed = 0`.
    //
    // ⚠️ SPLIT 2026-09-20 (feature «wyłączane limity gwarancji»). This used to
    // be ONE bucket labelled "missing limits at submit". Since `0` became a
    // legal, deliberate `WeeklyLimit` value, a zero guarantee no longer
    // implies a configuration hole — an admin may simply have switched the
    // week off, and lumping both together would drown the real holes in
    // false positives. We now partition the candidates by whether every ISO
    // week the claim's period touches actually HAS a `weekly_limits` row
    // (per ISO week since 2026-10-29; per month before):
    //   - a missing row  ⇒ nothing configured  ⇒ admin action required;
    //   - all rows present ⇒ the zero is a decision ⇒ informational only.
    const zeroGuarantee = await this._claimsWithZeroGuarantee({
      olderThan: args.naWeryfikacjiOlderThan,
    });
    const split = await this._splitByLimitsConfigured(zeroGuarantee);
    buckets.push({
      name: 'NA_WERYFIKACJI > 7d, kmGuaranteed=0 (missing limits at submit)',
      count: split.missing.length,
      sampleIds: split.missing.slice(0, args.sampleSize),
    });
    buckets.push({
      name: 'NA_WERYFIKACJI > 7d, kmGuaranteed=0 (guarantee switched off for the period)',
      count: split.disabled.length,
      sampleIds: split.disabled.slice(0, args.sampleSize),
    });

    // No "empty carrier" bucket: `carrierId` is a NOT NULL `@db.Uuid` FK, so
    // it can't be empty — and filtering it by `''` makes Prisma throw
    // "Error creating UUID" (500 on this endpoint).

    return buckets;
  }

  /**
   * Candidate rows for the zero-guarantee buckets: stale `NA_WERYFIKACJI`
   * claims that were priced at 0 km. Newest-first, capped — this is a
   * diagnostics widget, not a report, and the cap keeps the follow-up
   * per-claim week check bounded.
   */
  private async _claimsWithZeroGuarantee(args: {
    olderThan: Date;
  }): Promise<Array<{ id: string; dateStart: Date; dateEnd: Date }>> {
    return this.prisma.tx.claim.findMany({
      where: {
        status: PrismaClaimStatus.NA_WERYFIKACJI,
        updatedAt: { lt: args.olderThan },
        kmGuaranteed: 0,
      },
      orderBy: { updatedAt: 'desc' },
      take: ZERO_GUARANTEE_SCAN_CAP,
      select: { id: true, dateStart: true, dateEnd: true },
    });
  }

  /**
   * Partition zero-guarantee claims into "some ISO week of the period has NO
   * `weekly_limits` row" (⇒ unconfigured) and "every week has one" (⇒ the
   * zero is a deliberate switch-off) — the same per-week coverage rule as
   * `KmCalcService.hasConfiguredLimits` behind the submit violation text.
   *
   * One query for the keys of the years the candidates touch: `weekly_limits`
   * holds at most 53 rows per ISO year, so loading the `(isoYear, isoWeek)`
   * keys once and testing in memory beats N per-claim queries.
   */
  private async _splitByLimitsConfigured(
    claims: Array<{ id: string; dateStart: Date; dateEnd: Date }>,
  ): Promise<{ missing: string[]; disabled: string[] }> {
    const missing: string[] = [];
    const disabled: string[] = [];
    if (claims.length === 0) return { missing, disabled };

    const weeksByClaim = claims.map((claim) => ({
      id: claim.id,
      weeks: claimWeekKeys(claim.dateStart, claim.dateEnd),
    }));
    const configured = await this._configuredWeekKeys(
      weeksByClaim.flatMap((c) => c.weeks),
    );

    for (const claim of weeksByClaim) {
      // Inverted / unparseable range (shouldn't happen — CHECK constraint) ⇒
      // no weeks ⇒ `every` is true ⇒ the informational bucket, not a crash.
      const allPresent = claim.weeks.every((key) => configured.has(key));
      if (allPresent) disabled.push(claim.id);
      else missing.push(claim.id);
    }
    return { missing, disabled };
  }

  /**
   * `YYYY-Www` keys of the `weekly_limits` rows in the ISO years of `weeks`.
   * Existence of the row is what counts (docs/04-data-model.md) — the column
   * values are not read.
   */
  private async _configuredWeekKeys(
    weeks: readonly string[],
  ): Promise<Set<string>> {
    const years = [...new Set(weeks.map((key) => Number(key.slice(0, 4))))];
    if (years.length === 0) return new Set();
    const rows = await this.prisma.tx.weeklyLimit.findMany({
      where: { isoYear: { in: years } },
      select: { isoYear: true, isoWeek: true },
    });
    const keys = new Set<string>();
    for (const r of rows) {
      const key = formatIsoWeekKey(r.isoYear, r.isoWeek);
      if (key !== null) keys.add(key);
    }
    return keys;
  }

  private async _sampleClaims(args: {
    where: Record<string, unknown>;
    sampleSize: number;
  }): Promise<{ count: number; sampleIds: string[] }> {
    const [count, rows] = await Promise.all([
      this.prisma.tx.claim.count({ where: args.where as never }),
      this.prisma.tx.claim.findMany({
        where: args.where as never,
        orderBy: { updatedAt: 'desc' },
        take: args.sampleSize,
        select: { id: true },
      }),
    ]);
    return { count, sampleIds: rows.map((r) => r.id) };
  }

  // ── DB health (admin) ────────────────────────────────────

  async pingPostgres(): Promise<void> {
    await this.prisma.tx.$queryRaw`SELECT 1`;
  }

  /**
   * `pg_total_relation_size` for each tracked table. Surfaces in the admin
   * DB health endpoint. Tables are passed in as a literal whitelist (no
   * dynamic SQL) so the query is safe under any future change.
   */
  async getTableSizes(): Promise<DbTableSize[]> {
    const rows = await this.prisma.tx.$queryRaw<
      { name: string; size_bytes: bigint }[]
    >`
      SELECT
        relname               AS name,
        pg_total_relation_size(C.oid) AS size_bytes
      FROM pg_class C
      LEFT JOIN pg_namespace N ON N.oid = C.relnamespace
      WHERE N.nspname = 'public'
        AND relkind = 'r'
        AND relname IN (
          'claims',
          'audit_log',
          'users',
          'carriers',
          'vehicles',
          'drivers',
          'trailers',
          'weekly_limits',
          'delegations'
        )
      ORDER BY pg_total_relation_size(C.oid) DESC
    `;
    return rows.map((r) => ({
      name: r.name,
      sizeBytes: Number(r.size_bytes),
    }));
  }
}

/**
 * Upper bound on the zero-guarantee claims we inspect per diagnostics call.
 * The widget only renders a count + ≤5 sample ids; scanning more than this
 * would turn an admin dashboard tile into a full-table report.
 */
const ZERO_GUARANTEE_SCAN_CAP = 500;

/**
 * `YYYY-Www` keys of every ISO week a claim period touches, inclusive on both
 * ends, ascending. Claim period columns are UTC-midnight `@db.Date` values, so
 * the ISO slice IS the calendar day whatever the process `TZ`; the week walk
 * itself is the shared, zone-independent one (`isoWeeksOfPeriod`).
 *
 * An inverted / unparseable range ⇒ `[]`, which the caller's `every` treats as
 * "all configured" — the claim lands in the informational bucket rather than
 * crashing the widget.
 */
function claimWeekKeys(start: Date, end: Date): string[] {
  const weeks = isoWeeksOfPeriod(
    start.toISOString().slice(0, 10),
    end.toISOString().slice(0, 10),
  );
  if (weeks === null) return [];
  const out: string[] = [];
  for (const { isoYear, isoWeek } of weeks) {
    const key = formatIsoWeekKey(isoYear, isoWeek);
    if (key !== null) out.push(key);
  }
  return out;
}

/**
 * Loose Decimal → number coercion. Prisma returns `Decimal` instances for
 * `Decimal(_, _)` columns at runtime; `$queryRaw` may return numeric strings
 * (pg's behaviour for `numeric`) or numbers depending on the driver path.
 * Handle all three plus `null` / `undefined`.
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
    value !== null &&
    'toNumber' in value &&
    typeof (value as { toNumber: () => number }).toNumber === 'function'
  ) {
    const n = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Re-export role for downstream typing convenience (avoid unused-import).
export type DiagnosticsRole = Role;
