import { Injectable } from '@nestjs/common';

import type { Prisma } from '@magguarantee/database';

import { PrismaService } from '../prisma/prisma.service';
import { INCLUDE_SOFT_DELETED } from '../prisma/soft-delete.extension';

/**
 * Row shape returned by the carrier repository — flattens `user` so the
 * service can map straight to the wire DTO without re-walking the join.
 *
 * `phone` and `opiekunId` are non-nullable since the phase-2 migration; the
 * phase3_blocks migration tightened the rest of the operational fields
 * (`contactPerson`, `ordersEmail`, `accountEur`, `paymentTerms`,
 * `insuranceValue`, `insuranceExpiry`, `licenseExpiry`, `companyAddress`)
 * to NOT NULL — the row shape mirrors that. `insuranceValue` is NOT NULL
 * Decimal(12,2) and surfaces here as `number`.
 *
 * `email` follows the User column which is also NOT NULL post-phase3_blocks.
 *
 * Onboarding state is derived from the live `_count` of active /
 * non-soft-deleted child fleet rows (vehicles / trailers / drivers). The
 * previous `onboardingStatus` enum column was dropped in migration
 * `20260519142043_drop_carrier_onboarding_status` — see
 * `packages/shared/src/schemas/carriers.ts` for the DTO shape this surfaces
 * into.
 */
export interface CarrierRow {
  id: string;
  userId: string;
  login: string;
  email: string;
  name: string | null;
  company: string | null;
  active: boolean;
  // `nip` is NOT NULL since 20260508_carrier_nip_vat_required.
  // `vatId` is nullable again since 20260515112821_carrier_vat_id_optional —
  // some carriers register without an EU VAT number.
  nip: string;
  vatId: string | null;
  contactPerson: string;
  phone: string;
  ordersEmail: string;
  accountEur: string;
  accountPln: string | null;
  paymentTerms: number;
  insuranceValue: number;
  insuranceExpiry: Date | null;
  licenseExpiry: Date | null;
  numberOfVehicle: number | null;
  companyAddress: string;
  /**
   * Live counts of active, non-soft-deleted children. Populated by the
   * `_count.select` in `includeShape()`. The service maps these to the
   * `onboarding.{hasVehicle,hasTrailer,hasDriver,isComplete}` DTO block.
   */
  counts: {
    vehicles: number;
    trailers: number;
    drivers: number;
  };
  opiekunId: string;
  opiekun: {
    id: string;
    login: string;
    name: string | null;
  };
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * Slim per-carrier row returned by `listForOpiekunAggregate` — used by the
 * Phase 5 `/fleet/opiekun` and `/opiekun/carriers` services. Avoids the
 * expensive opiekun-join + flatten path of the main CarrierRow shape; we
 * only need identity + per-vehicle `id`/`active`/`createdAt` for the
 * delegation-driven lifecycle classification and the three active-child
 * counts. (`id` + `createdAt` feed the batched delegation-status lookup and
 * the idle-clock fallback anchor; the old `lastDroveAt` km-recency signal is
 * no longer used.)
 */
export interface OpiekunAggregateCarrierRow {
  id: string;
  login: string;
  name: string | null;
  company: string | null;
  nip: string;
  active: boolean;
  /** KREPTD wypisów count — schema column is `Carrier.numberOfVehicle`. */
  numberOfVehicle: number | null;
  vehicles: Array<{
    id: string;
    active: boolean;
    createdAt: Date;
  }>;
  counts: {
    vehicles: number;
    drivers: number;
    trailers: number;
  };
}

export interface CarrierListFilters {
  opiekunId?: string;
  active?: boolean;
  q?: string;
  /**
   * Onboarding-completeness filter — `true` keeps only carriers with at
   * least one active vehicle AND trailer AND driver; `false` keeps only
   * carriers missing at least one of the three; omitted keeps all.
   */
  onboardingComplete?: boolean;
  cursor?: string;
  limit: number;
}

interface CreateCarrierData {
  // user side
  login: string;
  email: string;
  name: string;
  passwordHash: string;
  active?: boolean;
  // carrier-extension side — required fields per phase3_blocks.
  company?: string | null;
  // `nip` is required since carrier_nip_vat_required (20260508).
  // `vatId` is optional again since carrier_vat_id_optional (20260515).
  nip: string;
  vatId?: string | null;
  contactPerson: string;
  phone: string;
  ordersEmail: string;
  accountEur: string;
  accountPln?: string | null;
  paymentTerms?: number;
  insuranceValue: number;
  insuranceExpiry?: Date | null;
  licenseExpiry?: Date | null;
  numberOfVehicle?: number | null;
  companyAddress: string;
  opiekunId: string;
}

interface UpdateCarrierData {
  email?: string;
  name?: string | null;
  company?: string | null;
  active?: boolean;
  passwordHash?: string;
  nip?: string | null;
  vatId?: string | null;
  // PATCH cannot null the post-phase3_blocks NOT NULL columns.
  contactPerson?: string;
  phone?: string;
  ordersEmail?: string;
  accountEur?: string;
  accountPln?: string | null;
  paymentTerms?: number;
  insuranceValue?: number;
  insuranceExpiry?: Date | null;
  licenseExpiry?: Date | null;
  numberOfVehicle?: number | null;
  companyAddress?: string;
  opiekunId?: string;
}

/**
 * Read/write surface for `Carrier` (and the 1:1 `User` shadow). Per
 * docs/04-data-model.md a carrier is always created together with its user
 * row — both inserts share a transaction.
 */
@Injectable()
export class CarriersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<CarrierRow | null> {
    const row = await this.prisma.tx.carrier.findFirst({
      where: { id },
      include: this.includeShape(),
    });
    return row ? this.flatten(row) : null;
  }

  async findByLogin(login: string): Promise<CarrierRow | null> {
    const row = await this.prisma.tx.carrier.findFirst({
      where: { user: { login } },
      include: this.includeShape(),
    });
    return row ? this.flatten(row) : null;
  }

  /**
   * Resolves the (single) Carrier id owned by a przewoznik User — server-side
   * IDOR-safe carrier resolution from the JWT `sub`, never from a client param.
   * Returns `null` when the user has no live Carrier row (mis-provisioned
   * przewoznik account). A focused `findFirst` on the indexed `userId`
   * (soft-delete-aware) — cheaper than the legacy `list({ limit: 200 }).find(...)`
   * scan used elsewhere (drivers/delegations), reused by the vehicles km-report
   * scope.
   */
  async findIdByUserId(userId: string): Promise<string | null> {
    const row = await this.prisma.tx.carrier.findFirst({
      where: { userId, deletedAt: null },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  /**
   * Lists the Carrier ids supervised by an opiekun (`Carrier.opiekunId ===
   * opiekunId`, live rows only). Server-side scope resolution for the opiekun
   * km-report — mirrors the `listForOpiekunAggregate({ opiekunId })` filter but
   * returns only the id set (no per-vehicle / count joins). An opiekun with no
   * supervised carriers yields an empty array, which the caller turns into an
   * empty board (NOT all vehicles).
   */
  async listIdsForOpiekun(opiekunId: string): Promise<string[]> {
    const rows = await this.prisma.tx.carrier.findMany({
      where: { opiekunId, deletedAt: null },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /**
   * Slim row shape for the Phase 5 opiekun fleet aggregate. Includes the
   * minimal per-vehicle fields needed for the delegation-driven lifecycle
   * classification (`id`, `active`, `createdAt`) plus the live `_count` of
   * active children for the lighter `/opiekun/carriers` surface. Soft-deleted
   * rows are excluded by the Prisma soft-delete extension on both the parent
   * Carrier and the nested Vehicle includes.
   */
  async listForOpiekunAggregate(filters: {
    opiekunId?: string;
  }): Promise<OpiekunAggregateCarrierRow[]> {
    const where: Record<string, unknown> = {};
    if (filters.opiekunId) where.opiekunId = filters.opiekunId;
    const rows = await this.prisma.tx.carrier.findMany({
      where,
      include: {
        user: {
          select: { id: true, login: true, name: true, active: true },
        },
        vehicles: {
          // Nested relation reads bypass the soft-delete extension (it only
          // injects `deletedAt: null` on the TOP-LEVEL model — here Carrier),
          // so filter explicitly. Without this, soft-deleted vehicles leak
          // into the opiekun jezdzące/stojące classification (the sibling
          // `_count.vehicles` already filters, so the two would disagree).
          // NOT scoped to `active: true` — the classifier also buckets
          // deactivated vehicles (as `wylaczone`).
          where: { deletedAt: null },
          select: { id: true, active: true, createdAt: true },
        },
        _count: {
          select: {
            vehicles: { where: { active: true, deletedAt: null } },
            drivers: { where: { active: true, deletedAt: null } },
            trailers: { where: { active: true, deletedAt: null } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      login: r.user.login,
      name: r.user.name,
      company: r.company,
      nip: r.nip ?? '',
      active: r.user.active,
      numberOfVehicle: r.numberOfVehicle,
      vehicles: r.vehicles.map((v) => ({
        id: v.id,
        active: v.active,
        createdAt: v.createdAt,
      })),
      counts: {
        vehicles: r._count.vehicles,
        drivers: r._count.drivers,
        trailers: r._count.trailers,
      },
    }));
  }

  async list(filters: CarrierListFilters): Promise<CarrierRow[]> {
    const andClauses: Record<string, unknown>[] = [];
    const where: Record<string, unknown> = {};
    if (filters.opiekunId) where.opiekunId = filters.opiekunId;
    if (filters.q) {
      const q = filters.q;
      where.OR = [
        { user: { login: { contains: q, mode: 'insensitive' } } },
        { user: { name: { contains: q, mode: 'insensitive' } } },
        { nip: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (typeof filters.active === 'boolean') {
      where.user = {
        ...((where.user as Record<string, unknown>) ?? {}),
        active: filters.active,
      };
    }
    // Onboarding-completeness filter. The carrier has no `onboardingStatus`
    // column anymore — we instead require (or forbid) at least one matching
    // child per type via Prisma `some`/`none` relation filters.
    //   complete=true  → vehicles.some && trailers.some && drivers.some
    //   complete=false → NOT(complete=true), i.e. at least one of the three
    //                    is empty. Modelled as an OR-of-`none`s, which is the
    //                    semantic inverse of an AND-of-`some`s.
    if (typeof filters.onboardingComplete === 'boolean') {
      const activeChild = { active: true, deletedAt: null };
      if (filters.onboardingComplete) {
        andClauses.push({ vehicles: { some: activeChild } });
        andClauses.push({ trailers: { some: activeChild } });
        andClauses.push({ drivers: { some: activeChild } });
      } else {
        andClauses.push({
          OR: [
            { vehicles: { none: activeChild } },
            { trailers: { none: activeChild } },
            { drivers: { none: activeChild } },
          ],
        });
      }
    }
    if (andClauses.length > 0) {
      where.AND = andClauses;
    }
    const rows = await this.prisma.tx.carrier.findMany({
      where,
      include: this.includeShape(),
      orderBy: { createdAt: 'desc' },
      take: filters.limit + 1,
      ...(filters.cursor
        ? { skip: 1, cursor: { id: filters.cursor } }
        : {}),
    });
    return rows.map((r) => this.flatten(r));
  }

  async create(data: CreateCarrierData): Promise<CarrierRow> {
    // Atomicity note (pre-Phase-4.4): we no longer open our own
    // `prisma.$transaction(...)`. The `AuditInterceptor` already runs the
    // controller inside an ambient transaction for `@Audit()`-tagged
    // endpoints (POST /carriers carries `@Audit('createCarrier')`), and
    // `this.prisma.tx` resolves to that same tx via `AuditContext`. So the
    // User + Carrier inserts here, plus the audit row written by the
    // interceptor on commit, all land in one atomic step. Outside an audited
    // request (e.g. seed scripts) `tx` falls back to the root client and the
    // two inserts run sequentially without rollback — acceptable for the
    // non-HTTP paths that have no audit invariant to honour.
    const tx = this.prisma.tx;
    const user = await tx.user.create({
      data: {
        login: data.login,
        email: data.email,
        name: data.name,
        role: 'przewoznik',
        passwordHash: data.passwordHash,
        active: data.active ?? true,
      },
    });
    const carrier = await tx.carrier.create({
      data: {
        userId: user.id,
        company: data.company ?? null,
        nip: data.nip,
        vatId: data.vatId ?? null,
        contactPerson: data.contactPerson,
        phone: data.phone,
        ordersEmail: data.ordersEmail,
        accountEur: data.accountEur,
        accountPln: data.accountPln ?? null,
        // DB default is 30 — only forward when caller specified.
        ...(data.paymentTerms !== undefined
          ? { paymentTerms: data.paymentTerms }
          : {}),
        insuranceValue: data.insuranceValue,
        insuranceExpiry: data.insuranceExpiry,
        licenseExpiry: data.licenseExpiry,
        numberOfVehicle: data.numberOfVehicle ?? null,
        companyAddress: data.companyAddress,
        opiekunId: data.opiekunId,
      },
      include: this.includeShape(),
    });
    return this.flatten(carrier);
  }

  async update(id: string, data: UpdateCarrierData): Promise<CarrierRow> {
    const userPatch: Record<string, unknown> = {};
    const carrierPatch: Record<string, unknown> = {};

    if (data.email !== undefined) userPatch.email = data.email;
    if (data.name !== undefined) userPatch.name = data.name;
    if (data.active !== undefined) userPatch.active = data.active;
    if (data.passwordHash !== undefined) userPatch.passwordHash = data.passwordHash;

    const carrierFields: (keyof UpdateCarrierData)[] = [
      'company',
      'nip',
      'vatId',
      'contactPerson',
      'phone',
      'ordersEmail',
      'accountEur',
      'accountPln',
      'paymentTerms',
      'insuranceValue',
      'insuranceExpiry',
      'licenseExpiry',
      'numberOfVehicle',
      'companyAddress',
      'opiekunId',
    ];
    for (const k of carrierFields) {
      if (data[k] !== undefined) {
        carrierPatch[k] = data[k];
      }
    }

    // See `create()` for the atomicity note — ambient tx from the audit
    // interceptor (PATCH /carriers/:id carries `@Audit('updateCarrier')`)
    // covers the User.update + Carrier.update + audit-row write as a single
    // commit.
    const tx = this.prisma.tx;
    const carrier = await tx.carrier.findFirst({ where: { id } });
    if (!carrier) {
      throw new Error('Carrier disappeared mid-update');
    }
    if (Object.keys(userPatch).length > 0) {
      await tx.user.update({
        where: { id: carrier.userId },
        data: userPatch,
      });
    }
    const out = await tx.carrier.update({
      where: { id },
      data: carrierPatch,
      include: this.includeShape(),
    });
    return this.flatten(out);
  }

  async setActive(id: string, active: boolean): Promise<CarrierRow> {
    return this.update(id, { active });
  }

  async softDelete(id: string): Promise<void> {
    // Soft-deleting the carrier must cascade-soft-delete its fleet per
    // docs/04-data-model.md#cascade-при-удалении-carrier. The DELETE
    // /carriers/:id endpoint carries `@Audit('softDeleteCarrier')` so the
    // audit interceptor opens the ambient transaction; we just enrol in it
    // via `this.prisma.tx`. All five updates + the audit row commit as one.
    const tx = this.prisma.tx;
    const carrier = await tx.carrier.findFirst({ where: { id } });
    if (!carrier) return;
    const now = new Date();
    await tx.vehicle.updateMany({
      where: { carrierId: id, deletedAt: null },
      data: { deletedAt: now, active: false },
    });
    await tx.driver.updateMany({
      where: { carrierId: id, deletedAt: null },
      data: { deletedAt: now, active: false },
    });
    await tx.trailer.updateMany({
      where: { carrierId: id, deletedAt: null },
      data: { deletedAt: now, active: false },
    });
    await tx.carrier.update({
      where: { id },
      data: { deletedAt: now },
    });
    // Soft-delete the user too so login is blocked.
    await tx.user.update({
      where: { id: carrier.userId },
      data: { deletedAt: now, active: false },
    });
  }

  /**
   * Hard-deletes a carrier row plus its 1:1 User shadow. Phase 4.4 admin-only
   * flow with an audit-trail `reason` captured upstream via
   * `AuditContext.setMetadata({ reason })`.
   *
   * The soft-delete extension rewrites BOTH `delete` and `deleteMany` into a
   * soft-delete `update`, so each physical removal MUST opt out via the
   * `[INCLUDE_SOFT_DELETED]` escape hatch (else the rows survive as
   * soft-deleted ghosts).
   *
   * RESTRICT, not CASCADE: the business FKs pointing at a carrier
   * (vehicles / drivers / trailers / claims / delegations /
   * guarantee_idle_episodes) are all `ON DELETE RESTRICT`, so Postgres REFUSES
   * this delete (P2003) while any referencing row exists — including
   * soft-deleted ones, which still occupy the physical FK slot. The service
   * runs a pre-flight `countReferencingRows` guard (409 CARRIER_HAS_REFERENCES)
   * and also translates a late P2003 to the same 409. Hard-delete therefore
   * only ever succeeds for an EMPTY carrier (one created by mistake).
   *
   * ORDER MATTERS: the carrier row is removed FIRST, then the User. If the
   * carrier delete throws P2003 the User row is left untouched (the service's
   * P2003→409 translation can rely on this). The User row is removed
   * explicitly so the unique login is freed up for re-use. Runs in the ambient
   * audit transaction so the audit row + deletes commit (or roll back)
   * together.
   */
  async hardDelete(id: string): Promise<void> {
    const tx = this.prisma.tx;
    const carrier = await tx.carrier.findFirst({ where: { id } });
    if (!carrier) return;
    await tx.carrier.deleteMany({
      where: { id },
      [INCLUDE_SOFT_DELETED]: true,
    } as unknown as Prisma.CarrierDeleteManyArgs);
    await tx.user.deleteMany({
      where: { id: carrier.userId },
      [INCLUDE_SOFT_DELETED]: true,
    } as unknown as Prisma.UserDeleteManyArgs);
  }

  /**
   * Counts every row that references this carrier via an `ON DELETE RESTRICT`
   * FK — vehicles / drivers / trailers / claims / delegations (all soft-delete
   * models) plus guarantee_idle_episodes (NOT a soft-delete model). Drives the
   * hard-delete pre-flight guard (409 CARRIER_HAS_REFERENCES).
   *
   * CRITICAL: the soft-delete models MUST be counted with the
   * `[INCLUDE_SOFT_DELETED]` escape hatch. A soft-deleted child is invisible to
   * the extension's read filter yet STILL physically blocks the FK (Postgres
   * does not know about `deletedAt`). Without the flag the count under-reports
   * and the delete would fail late with P2003 → 500. The flag is harmless on
   * the non-soft `guaranteeIdleEpisode` count (the extension no-ops it), kept
   * uniform for clarity.
   */
  async countReferencingRows(id: string): Promise<number> {
    const tx = this.prisma.tx;
    const [vehicles, drivers, trailers, claims, delegations, episodes] =
      await Promise.all([
        tx.vehicle.count({
          where: { carrierId: id },
          [INCLUDE_SOFT_DELETED]: true,
        } as unknown as Prisma.VehicleCountArgs),
        tx.driver.count({
          where: { carrierId: id },
          [INCLUDE_SOFT_DELETED]: true,
        } as unknown as Prisma.DriverCountArgs),
        tx.trailer.count({
          where: { carrierId: id },
          [INCLUDE_SOFT_DELETED]: true,
        } as unknown as Prisma.TrailerCountArgs),
        tx.claim.count({
          where: { carrierId: id },
          [INCLUDE_SOFT_DELETED]: true,
        } as unknown as Prisma.ClaimCountArgs),
        tx.delegation.count({
          where: { carrierId: id },
          [INCLUDE_SOFT_DELETED]: true,
        } as unknown as Prisma.DelegationCountArgs),
        tx.guaranteeIdleEpisode.count({
          where: { carrierId: id },
          [INCLUDE_SOFT_DELETED]: true,
        } as unknown as Prisma.GuaranteeIdleEpisodeCountArgs),
      ]);
    return vehicles + drivers + trailers + claims + delegations + episodes;
  }

  // ── helpers ──────────────────────────────────────────────

  private includeShape() {
    // Counts are filtered to active + non-soft-deleted children only — this
    // mirrors the semantic of the dropped `onboardingStatus` enum (which
    // tracked "is the carrier currently usable"). `_count` with per-relation
    // filters requires Prisma ≥ 4.3 — we're on 5.20.x, so this is supported
    // natively in one query (no N+1 separate counts).
    const activeChild = { active: true, deletedAt: null };
    return {
      user: {
        select: {
          id: true,
          login: true,
          email: true,
          name: true,
          active: true,
        },
      },
      opiekun: {
        select: { id: true, login: true, name: true },
      },
      _count: {
        select: {
          vehicles: { where: activeChild },
          trailers: { where: activeChild },
          drivers: { where: activeChild },
        },
      },
    } as const;
  }

  private flatten(row: {
    id: string;
    userId: string;
    company: string | null;
    // `nip` is NOT NULL since carrier_nip_vat_required (20260508). The wider
    // type surfaced by the soft-delete extension is normalised below to the
    // non-null shape the rest of the service expects.
    // `vatId` is nullable again since carrier_vat_id_optional (20260515) —
    // we surface null straight through.
    nip: string | null;
    vatId: string | null;
    // Prisma's inferred type from `findFirst({include: ...})` post the soft-
    // delete extension surfaces scalar columns as `string | null`, even
    // though the schema marks them NOT NULL. We accept the wider shape
    // and fall back defensively — never observed in practice since the
    // phase3_blocks migration enforces non-null at the column level.
    contactPerson: string | null;
    phone: string | null;
    ordersEmail: string | null;
    accountEur: string | null;
    accountPln: string | null;
    paymentTerms: number | null;
    insuranceValue: { toNumber(): number } | number | null;
    insuranceExpiry: Date | null;
    licenseExpiry: Date | null;
    numberOfVehicle: number | null;
    companyAddress: string | null;
    opiekunId: string | null;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    user: {
      id: string;
      login: string;
      email: string | null;
      name: string | null;
      active: boolean;
    };
    opiekun: { id: string; login: string; name: string | null } | null;
    _count: {
      vehicles: number;
      trailers: number;
      drivers: number;
    };
  }): CarrierRow {
    return {
      id: row.id,
      userId: row.userId,
      login: row.user.login,
      email: row.user.email ?? '',
      name: row.user.name,
      company: row.company,
      active: row.user.active,
      nip: row.nip ?? '',
      vatId: row.vatId,
      contactPerson: row.contactPerson ?? '',
      phone: row.phone ?? '',
      ordersEmail: row.ordersEmail ?? '',
      accountEur: row.accountEur ?? '',
      accountPln: row.accountPln,
      paymentTerms: row.paymentTerms ?? 30,
      // NOT NULL Decimal(12,2) — surface as `number`. Fallback `?? 0` mirrors
      // the same defensive pattern used for NOT NULL Decimal columns in
      // claims.repository.ts; in practice the column never observes null.
      insuranceValue: decimalToNumber(row.insuranceValue) ?? 0,
      insuranceExpiry: row.insuranceExpiry,
      licenseExpiry: row.licenseExpiry,
      numberOfVehicle: row.numberOfVehicle,
      companyAddress: row.companyAddress ?? '',
      counts: {
        vehicles: row._count.vehicles,
        trailers: row._count.trailers,
        drivers: row._count.drivers,
      },
      opiekunId: row.opiekunId ?? '',
      opiekun:
        row.opiekun ?? { id: row.opiekunId ?? '', login: '', name: null },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    };
  }
}

function decimalToNumber(
  v: { toNumber(): number } | number | null | undefined,
): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  if (typeof (v as { toNumber?: () => number }).toNumber === 'function') {
    return (v as { toNumber(): number }).toNumber();
  }
  return null;
}
