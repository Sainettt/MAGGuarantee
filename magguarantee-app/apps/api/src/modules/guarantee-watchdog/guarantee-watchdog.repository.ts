import { Injectable } from '@nestjs/common';

import {
  DelegationStatus as PrismaDelegationStatus,
  GuaranteeAnchorSource as PrismaAnchorSource,
  GuaranteeEpisodeState as PrismaEpisodeState,
  GuaranteeResolveReason as PrismaResolveReason,
} from '@magguarantee/database';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Delegation statuses that count as an ACTIVE outing — the same "≤1 active per
 * vehicle" set the delegations module uses. While a vehicle holds one of these,
 * the watchdog counter is silenced (`ok_active`). `anulowany` and `zjechal` are
 * terminal and excluded (plan §1).
 */
export const ACTIVE_DELEGATION_STATUSES: readonly PrismaDelegationStatus[] = [
  PrismaDelegationStatus.zgloszony,
  PrismaDelegationStatus.gotowy,
  PrismaDelegationStatus.w_trasie,
];

/**
 * One in-scope guaranteed vehicle plus everything the state computation needs.
 * This ONE row shape feeds both the cron and the `/guarantee-compliance`
 * endpoints — the service is the single source of truth (plan §1).
 */
export interface WatchdogVehicleScopeRow {
  vehicleId: string;
  plateNumber: string;
  sideNumber: string | null;
  /** `Vehicle.agreementSince` (date-only, UTC midnight), or `null`. */
  agreementSince: Date | null;
  /** True while a zgloszony/gotowy/w_trasie delegation exists (non-deleted). */
  hasActiveDelegation: boolean;
  /** `date(actualReturnAt)` of the latest zjechał delegation, or `null`. */
  lastReturnAt: Date | null;
  carrier: {
    id: string;
    name: string;
    opiekunId: string | null;
    /** Carrier login-user id — resolves the carrier-facing recipient email. */
    userId: string;
  };
}

/** Flat row shape for an idle-episode journal row. */
export interface GuaranteeEpisodeRow {
  id: string;
  vehicleId: string;
  carrierId: string;
  anchorAt: Date;
  anchorSource: PrismaAnchorSource;
  deadlineAt: Date;
  state: PrismaEpisodeState;
  reminder3SentAt: Date | null;
  reminder1SentAt: Date | null;
  violationSentAt: Date | null;
  violatedAt: Date | null;
  resolvedAt: Date | null;
  resolvedByDelegationId: string | null;
  resolvedDaysLeft: number | null;
  resolvedReason: PrismaResolveReason | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Vehicle/carrier identity joined onto an episode for the archive list. */
export interface GuaranteeEpisodeListRow extends GuaranteeEpisodeRow {
  plateNumber: string | null;
  sideNumber: string | null;
  carrierName: string | null;
}

/** Fields set when creating a fresh idle-episode row. */
export interface CreateGuaranteeEpisodeData {
  vehicleId: string;
  carrierId: string;
  anchorAt: Date;
  anchorSource: PrismaAnchorSource;
  deadlineAt: Date;
  state: PrismaEpisodeState;
  reminder3SentAt?: Date | null;
  reminder1SentAt?: Date | null;
  violationSentAt?: Date | null;
  violatedAt?: Date | null;
}

/** Partial patch for an existing episode row (escalation / flags / resolve). */
export interface UpdateGuaranteeEpisodeData {
  state?: PrismaEpisodeState;
  anchorAt?: Date;
  anchorSource?: PrismaAnchorSource;
  deadlineAt?: Date;
  reminder3SentAt?: Date | null;
  reminder1SentAt?: Date | null;
  violationSentAt?: Date | null;
  violatedAt?: Date | null;
  resolvedAt?: Date | null;
  resolvedByDelegationId?: string | null;
  resolvedDaysLeft?: number | null;
  resolvedReason?: PrismaResolveReason | null;
}

/**
 * Read/write repository for the Guarantee Watchdog. Owns every Prisma call for
 * the module (service + controller never touch Prisma directly). Runs off the
 * root client for the cron path (`this.prisma.client`) — the cron is not an
 * audited request, and the hooks read/write outside the ambient audit tx.
 */
@Injectable()
export class GuaranteeWatchdogRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * SCOPE QUERY (plan §1). Every guaranteed, alive vehicle of an alive carrier,
   * plus its active-delegation flag and last-return date. This single query
   * feeds BOTH the cron and the board endpoints.
   *
   * Predicate: `agreement = true` (NULL is false → the equality excludes it),
   * `active = true`, `deletedAt IS NULL`, and the carrier not soft-deleted
   * (`carrier.deletedAt IS NULL` — the soft-delete extension already injects
   * the vehicle's own `deletedAt: null`, but the carrier relation needs it
   * explicit). Latest zjechał return and active-delegation existence are read
   * via nested relation queries (bounded: a carrier has a handful of guaranteed
   * vehicles).
   *
   * Runs on the ROOT client (`this.prisma.client`): the cron and read endpoints
   * are not audited requests, so there is no ambient tx to enrol into.
   */
  async findGuaranteedVehiclesInScope(): Promise<WatchdogVehicleScopeRow[]> {
    const rows = await this.prisma.client.vehicle.findMany({
      where: {
        agreement: true,
        active: true,
        deletedAt: null,
        carrier: { deletedAt: null },
      },
      select: {
        id: true,
        plateNumber: true,
        sideNumber: true,
        agreementSince: true,
        carrier: {
          select: {
            id: true,
            opiekunId: true,
            userId: true,
            user: { select: { name: true, login: true } },
          },
        },
        delegations: {
          where: { status: { in: [...ACTIVE_DELEGATION_STATUSES] } },
          select: { id: true },
          take: 1,
        },
      },
      orderBy: { plateNumber: 'asc' },
    });

    // The latest zjechał return per vehicle — one grouped query over all in-scope
    // vehicles, then mapped back. Avoids an N+1 nested `orderBy+take:1`.
    const vehicleIds = rows.map((r) => r.id);
    const lastReturns = await this._latestZjechalReturnByVehicle(vehicleIds);

    return rows.map((r) => ({
      vehicleId: r.id,
      plateNumber: r.plateNumber,
      sideNumber: r.sideNumber ?? null,
      agreementSince: r.agreementSince ?? null,
      hasActiveDelegation: r.delegations.length > 0,
      lastReturnAt: lastReturns.get(r.id) ?? null,
      carrier: {
        id: r.carrier.id,
        name: r.carrier.user.name ?? r.carrier.user.login,
        opiekunId: r.carrier.opiekunId ?? null,
        userId: r.carrier.userId,
      },
    }));
  }

  /**
   * `max(actualReturnAt)` of each vehicle's zjechał, non-deleted delegations.
   * `groupBy` with a `_max` aggregate — one query for the whole scope. Empty
   * map entry (vehicle never returned) is simply absent from the result.
   */
  private async _latestZjechalReturnByVehicle(
    vehicleIds: string[],
  ): Promise<Map<string, Date>> {
    if (vehicleIds.length === 0) return new Map();
    const groups = await this.prisma.client.delegation.groupBy({
      by: ['vehicleId'],
      where: {
        vehicleId: { in: vehicleIds },
        status: PrismaDelegationStatus.zjechal,
        deletedAt: null,
        actualReturnAt: { not: null },
      },
      _max: { actualReturnAt: true },
    });
    const map = new Map<string, Date>();
    for (const g of groups) {
      if (g._max.actualReturnAt) map.set(g.vehicleId, g._max.actualReturnAt);
    }
    return map;
  }

  // ── Episode journal ──────────────────────────────────────

  /** The single OPEN (non-resolved) episode for a vehicle, or `null`. */
  async findOpenEpisodeByVehicle(
    vehicleId: string,
  ): Promise<GuaranteeEpisodeRow | null> {
    const row = await this.prisma.client.guaranteeIdleEpisode.findFirst({
      where: { vehicleId, state: { not: PrismaEpisodeState.resolved } },
    });
    return row ? this._flatten(row) : null;
  }

  /** All OPEN episodes across the whole scope, keyed by vehicleId. */
  async findOpenEpisodes(): Promise<Map<string, GuaranteeEpisodeRow>> {
    const rows = await this.prisma.client.guaranteeIdleEpisode.findMany({
      where: { state: { not: PrismaEpisodeState.resolved } },
    });
    const map = new Map<string, GuaranteeEpisodeRow>();
    for (const r of rows) map.set(r.vehicleId, this._flatten(r));
    return map;
  }

  /**
   * The most recent episode (open OR resolved) for a vehicle at a GIVEN anchor.
   * Used to copy the reminder/violation sent-flags on reopen-after-anulowany so
   * a resolved cycle's already-sent reminders are not re-sent (plan §2/§5).
   */
  async findLatestEpisodeForAnchor(
    vehicleId: string,
    anchorAt: Date,
  ): Promise<GuaranteeEpisodeRow | null> {
    const row = await this.prisma.client.guaranteeIdleEpisode.findFirst({
      where: { vehicleId, anchorAt },
      orderBy: { createdAt: 'desc' },
    });
    return row ? this._flatten(row) : null;
  }

  async createEpisode(
    data: CreateGuaranteeEpisodeData,
  ): Promise<GuaranteeEpisodeRow> {
    const row = await this.prisma.client.guaranteeIdleEpisode.create({
      data: {
        vehicleId: data.vehicleId,
        carrierId: data.carrierId,
        anchorAt: data.anchorAt,
        anchorSource: data.anchorSource,
        deadlineAt: data.deadlineAt,
        state: data.state,
        reminder3SentAt: data.reminder3SentAt ?? null,
        reminder1SentAt: data.reminder1SentAt ?? null,
        violationSentAt: data.violationSentAt ?? null,
        violatedAt: data.violatedAt ?? null,
      },
    });
    return this._flatten(row);
  }

  async updateEpisode(
    id: string,
    data: UpdateGuaranteeEpisodeData,
  ): Promise<GuaranteeEpisodeRow> {
    const row = await this.prisma.client.guaranteeIdleEpisode.update({
      where: { id },
      data,
    });
    return this._flatten(row);
  }

  /**
   * Archive list (`GET /guarantee-episodes`). Newest first, cursor-paginated on
   * `id`. `opiekunScopeId` restricts to episodes whose carrier is supervised by
   * the opiekun (`carrier.opiekunId`); omit for admin (all).
   */
  async listEpisodes(filters: {
    carrierId?: string;
    vehicleId?: string;
    state?: PrismaEpisodeState;
    opiekunScopeId?: string;
    cursor?: string;
    limit: number;
  }): Promise<GuaranteeEpisodeListRow[]> {
    const where: Record<string, unknown> = {};
    if (filters.carrierId) where.carrierId = filters.carrierId;
    if (filters.vehicleId) where.vehicleId = filters.vehicleId;
    if (filters.state) where.state = filters.state;
    if (filters.opiekunScopeId) {
      where.carrier = { opiekunId: filters.opiekunScopeId };
    }

    const rows = await this.prisma.client.guaranteeIdleEpisode.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters.limit + 1,
      ...(filters.cursor
        ? { skip: 1, cursor: { id: filters.cursor } }
        : {}),
      include: {
        vehicle: { select: { plateNumber: true, sideNumber: true } },
        carrier: {
          select: { user: { select: { name: true, login: true } } },
        },
      },
    });

    return rows.map((r) => ({
      ...this._flatten(r),
      plateNumber: r.vehicle?.plateNumber ?? null,
      sideNumber: r.vehicle?.sideNumber ?? null,
      carrierName: r.carrier?.user.name ?? r.carrier?.user.login ?? null,
    }));
  }

  // ── Recipient resolution ─────────────────────────────────

  /**
   * Carrier-facing recipient email — resolved EXACTLY as carrier-submitted /
   * delegation-announced do: the carrier's LOGIN-USER email (`Carrier.user.email`
   * via `User.id = userId`), NOT `ordersEmail`.
   */
  async findUserEmail(userId: string): Promise<string | null> {
    const user = await this.prisma.client.user.findFirst({
      where: { id: userId },
      select: { email: true },
    });
    return user?.email ?? null;
  }

  /** Opiekun recipient — personal `User.email` + display name (NOT a group). */
  async findOpiekunRecipient(
    opiekunId: string,
  ): Promise<{ email: string; name: string } | null> {
    const user = await this.prisma.client.user.findFirst({
      where: { id: opiekunId, deletedAt: null },
      select: { email: true, name: true, login: true },
    });
    if (!user?.email) return null;
    return { email: user.email, name: user.name ?? user.login };
  }

  private _flatten(row: {
    id: string;
    vehicleId: string;
    carrierId: string;
    anchorAt: Date;
    anchorSource: PrismaAnchorSource;
    deadlineAt: Date;
    state: PrismaEpisodeState;
    reminder3SentAt: Date | null;
    reminder1SentAt: Date | null;
    violationSentAt: Date | null;
    violatedAt: Date | null;
    resolvedAt: Date | null;
    resolvedByDelegationId: string | null;
    resolvedDaysLeft: number | null;
    resolvedReason: PrismaResolveReason | null;
    createdAt: Date;
    updatedAt: Date;
  }): GuaranteeEpisodeRow {
    return {
      id: row.id,
      vehicleId: row.vehicleId,
      carrierId: row.carrierId,
      anchorAt: row.anchorAt,
      anchorSource: row.anchorSource,
      deadlineAt: row.deadlineAt,
      state: row.state,
      reminder3SentAt: row.reminder3SentAt,
      reminder1SentAt: row.reminder1SentAt,
      violationSentAt: row.violationSentAt,
      violatedAt: row.violatedAt,
      resolvedAt: row.resolvedAt,
      resolvedByDelegationId: row.resolvedByDelegationId,
      resolvedDaysLeft: row.resolvedDaysLeft,
      resolvedReason: row.resolvedReason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
