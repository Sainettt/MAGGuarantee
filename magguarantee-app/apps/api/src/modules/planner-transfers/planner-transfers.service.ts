import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import {
  PLANNER_TRANSFER_ALREADY_PENDING,
  PLANNER_TRANSFER_CANCEL_NOT_AUTHOR,
  PLANNER_TRANSFER_DECIDED_STATUSES,
  PLANNER_TRANSFER_DECIDER_IS_REQUESTER,
  PLANNER_TRANSFER_DECIDER_IS_TARGET,
  PLANNER_TRANSFER_NOT_DECIDER,
  PLANNER_TRANSFER_NOT_PENDING,
  PLANNER_TRANSFER_NO_CURRENT_PLANNER,
  PLANNER_TRANSFER_PLANNER_CHANGED,
  PLANNER_TRANSFER_REQUEST_FORBIDDEN,
  PLANNER_TRANSFER_TARGET_INVALID,
  PLANNER_TRANSFER_VEHICLE_INACTIVE,
  type ApprovePlannerTransferDto,
  type CreatePlannerTransferDto,
  type PlannerTransferDto,
  type PlannerTransferListDto,
  type PlannerTransferListQuery,
  type PlannerTransferStatus,
  type RejectPlannerTransferDto,
  type VehiclePlannerHistoryDto,
} from '@magguarantee/shared';

import { AuditContext } from '../../common/audit';
import { isPrismaUniqueViolation } from '../../common/errors/prisma-error';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { DelegationsRepository } from '../delegations/delegations.repository';
import { UsersRepository } from '../users/users.repository';
import { VehiclePlannerAssignmentsRepository } from '../vehicles/vehicle-planner-assignments.repository';
import {
  VehiclePlannerTransfersRepository,
  type PlannerTransferListFilters,
  type PlannerTransferRow,
} from '../vehicles/vehicle-planner-transfers.repository';
import { VehiclesRepository, type VehicleRow } from '../vehicles/vehicles.repository';
import { toPlannerAssignmentDto, toPlannerTransferDto } from './planner-transfer.mapper';
import {
  TRANSFERABLE_DELEGATION_STATUSES,
  decisionRefusal,
} from './planner-transfer.rules';

/** A vehicle that has a planista — the only kind that can be handed over. */
type VehicleWithPlanner = VehicleRow & { plannerId: string };

/**
 * Vehicle planner transfer — request → approval (docs/29 §3).
 *
 * After creation a vehicle changes its planista ONLY here (R1). An admin (any
 * vehicle), the opiekun of the vehicle's carrier or its current planista files
 * a request (R2, U1 since 2026-10-23); an admin or the CURRENT lider of the
 * current planista decides (R3), never the author nor the target (R4) — so an
 * admin's own request goes to another admin or to that lider. Approval takes
 * effect at once (U5) and re-validates everything under a row lock (U6). No
 * e-mail, no Chat (R9).
 *
 * Every mutation runs inside the ambient `@Audit` transaction (the controller
 * does not opt out), so the vehicle lock, the writes and the audit row commit
 * together. Authorization of the decision is resource-level (`decisionRefusal`)
 * — `@Roles('admin','planista')` only lets the roles reach it.
 */
@Injectable()
export class PlannerTransfersService {
  constructor(
    private readonly transfers: VehiclePlannerTransfersRepository,
    private readonly assignments: VehiclePlannerAssignmentsRepository,
    private readonly vehicles: VehiclesRepository,
    private readonly users: UsersRepository,
    private readonly delegations: DelegationsRepository,
  ) {}

  // ── File a request ──────────────────────────────────────

  /**
   * `POST /vehicles/:id/planner-transfers`. Order of refusals: 404 vehicle →
   * 403 who may file → 422 vehicle off / without planista → 422 target → 409
   * already pending. The partial unique index backs the 409 under a race.
   */
  async request(
    user: AuthUser,
    vehicleId: string,
    dto: CreatePlannerTransferDto,
  ): Promise<PlannerTransferDto> {
    const vehicle = await this._requireVehicle(vehicleId);
    this._assertMayRequest(user, vehicle);
    const transferable = this._assertTransferable(vehicle);
    await this._assertTarget(dto.toPlannerId, transferable.plannerId);
    const pending = await this.transfers.findPendingByVehicle(vehicleId);
    if (pending) throw this._alreadyPending();
    const row = await this._insertRequest({
      vehicleId,
      fromPlannerId: transferable.plannerId,
      toPlannerId: dto.toPlannerId,
      requestedById: user.sub,
      reason: dto.reason,
    });
    AuditContext.setMetadata({
      vehicleId,
      fromPlannerId: row.fromPlannerId,
      toPlannerId: row.toPlannerId,
      requestedByRole: user.role,
    });
    return toPlannerTransferDto(row, user);
  }

  // ── Decide ──────────────────────────────────────────────

  /**
   * `POST /planner-transfers/:id/approve` — the transaction of docs/29 §3.2:
   * lock the vehicle row, re-read and re-validate (U6), close the request,
   * move the vehicle, the journal and the not-yet-departed trips (R6) — all
   * with ONE `now`.
   */
  async approve(
    user: AuthUser,
    id: string,
    dto: ApprovePlannerTransferDto,
  ): Promise<PlannerTransferDto> {
    const initial = await this._requireTransfer(id);
    this._assertMayDecide(user, initial);
    // Serialises concurrent approvals / deactivations / edits of the vehicle.
    await this.vehicles.lockForUpdate(initial.vehicleId);
    const t = await this._requireTransfer(id);
    this._assertMayDecide(user, t);
    this._assertPending(t);
    await this._assertStillApplicable(t);
    AuditContext.setBefore(toPlannerTransferDto(t, user));

    const now = new Date();
    await this._close(t.id, {
      status: 'approved',
      decidedById: user.sub,
      decidedAt: now,
      decisionComment: dto.comment ?? null,
    });
    const movedDelegations = await this._handOver(t, user.sub, now);
    AuditContext.setMetadata({
      vehicleId: t.vehicleId,
      fromPlannerId: t.fromPlannerId,
      toPlannerId: t.toPlannerId,
      movedDelegations,
    });
    return toPlannerTransferDto(await this._requireTransfer(id), user);
  }

  /**
   * `POST /planner-transfers/:id/reject` — the reason is required (U3). No
   * vehicle lock and no U6 re-validation: a stale request (planista changed,
   * vehicle off, target gone) can and should still be rejected.
   */
  async reject(
    user: AuthUser,
    id: string,
    dto: RejectPlannerTransferDto,
  ): Promise<PlannerTransferDto> {
    const t = await this._requireTransfer(id);
    this._assertMayDecide(user, t);
    this._assertPending(t);
    AuditContext.setBefore(toPlannerTransferDto(t, user));
    await this._close(t.id, {
      status: 'rejected',
      decidedById: user.sub,
      decidedAt: new Date(),
      decisionComment: dto.reason,
    });
    AuditContext.setMetadata({ vehicleId: t.vehicleId });
    return toPlannerTransferDto(await this._requireTransfer(id), user);
  }

  /**
   * `POST /planner-transfers/:id/cancel` — the author withdraws his own
   * `pending` request (U4). `decidedById` = the author (CHECK: every close
   * stamps `decidedAt`).
   */
  async cancel(user: AuthUser, id: string): Promise<PlannerTransferDto> {
    const t = await this._requireTransfer(id);
    if (t.requestedById !== user.sub) {
      throw new ForbiddenException({
        message: 'Wniosek może anulować tylko jego autor.',
        extensions: { code: PLANNER_TRANSFER_CANCEL_NOT_AUTHOR },
      });
    }
    this._assertPending(t);
    AuditContext.setBefore(toPlannerTransferDto(t, user));
    await this._close(
      t.id,
      { status: 'cancelled', decidedById: user.sub, decidedAt: new Date(), decisionComment: null },
      user.sub,
    );
    AuditContext.setMetadata({ vehicleId: t.vehicleId });
    return toPlannerTransferDto(await this._requireTransfer(id), user);
  }

  // ── Read ────────────────────────────────────────────────

  /**
   * `GET /planner-transfers` — `scope=decide`: an admin sees every request, a
   * planista-lider the requests of his planisci (`fromPlanner.liderId = me`,
   * including rows he may not decide — flagged `viewerBlockedReason`), anyone
   * else 403. `scope=mine`: the caller's own requests. The target planista
   * does not see a request before it is approved (U11) — it is in none of
   * his scopes.
   */
  async list(user: AuthUser, query: PlannerTransferListQuery): Promise<PlannerTransferListDto> {
    const filters = this._listFilters(user, query);
    const rows = await this.transfers.list(filters);
    const hasNext = rows.length > filters.limit;
    const page = hasNext ? rows.slice(0, filters.limit) : rows;
    return {
      items: page.map((r) => toPlannerTransferDto(r, user)),
      nextCursor: hasNext ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  /**
   * `GET /vehicles/:id/planner-history` — the planista journal + every
   * request of the vehicle (U11: admin, the opiekun of its carrier, its
   * current planista, that planista's current lider; nobody else — the
   * previous planista loses the vehicle at once, U7).
   */
  async history(user: AuthUser, vehicleId: string): Promise<VehiclePlannerHistoryDto> {
    const vehicle = await this._requireVehicle(vehicleId);
    await this._assertMayReadHistory(user, vehicle);
    const [assignments, transfers] = await Promise.all([
      this.assignments.listByVehicle(vehicleId),
      this.transfers.listByVehicle(vehicleId),
    ]);
    return {
      vehicleId,
      currentPlannerId: vehicle.plannerId,
      assignments: assignments.map(toPlannerAssignmentDto),
      transfers: transfers.map((t) => toPlannerTransferDto(t, user)),
    };
  }

  // ── Internals: request ──────────────────────────────────

  private async _requireVehicle(vehicleId: string): Promise<VehicleRow> {
    const vehicle = await this.vehicles.findById(vehicleId);
    if (!vehicle) throw new NotFoundException('Pojazd nie znaleziony');
    return vehicle;
  }

  /**
   * R2 / U1 — who may file: an admin (any vehicle, U1 reversed 2026-10-23),
   * the opiekun of the vehicle's carrier (the route's `OpiekunOwnershipGuard`
   * checks it first; repeated here as defence in depth) or the vehicle's
   * CURRENT planista. The admin still passes every later check (422 / 409);
   * R4 (`decisionRefusal` → `requester`) stops him deciding his own request.
   */
  private _assertMayRequest(user: AuthUser, vehicle: VehicleRow): void {
    const allowed =
      user.role === 'admin' ||
      (user.role === 'opiekun' && vehicle.opiekun?.id === user.sub) ||
      (user.role === 'planista' && vehicle.plannerId === user.sub);
    if (allowed) return;
    throw new ForbiddenException({
      message: 'Wniosek może złożyć administrator, opiekun przewoźnika lub obecny planista pojazdu.',
      extensions: { code: PLANNER_TRANSFER_REQUEST_FORBIDDEN },
    });
  }

  /** The vehicle must be switched on (A5) and have a planista to hand over from. */
  private _assertTransferable(vehicle: VehicleRow): VehicleWithPlanner {
    if (!vehicle.active) throw this._vehicleInactive();
    const plannerId = vehicle.plannerId;
    if (!plannerId) {
      throw new UnprocessableEntityException({
        message: 'Pojazd nie ma przypisanego planisty.',
        extensions: { code: PLANNER_TRANSFER_NO_CURRENT_PLANNER },
      });
    }
    return { ...vehicle, plannerId };
  }

  /** U2 — any ACTIVE planista except the vehicle's current one. */
  private async _assertTarget(toPlannerId: string, currentPlannerId: string): Promise<void> {
    const target =
      toPlannerId === currentPlannerId ? null : await this.users.findById(toPlannerId);
    if (target && target.role === 'planista' && target.active) return;
    throw new UnprocessableEntityException({
      message: 'Wskazany planista jest nieaktywny lub jest obecnym planistą pojazdu.',
      extensions: { code: PLANNER_TRANSFER_TARGET_INVALID },
    });
  }

  private async _insertRequest(
    data: Parameters<VehiclePlannerTransfersRepository['create']>[0],
  ): Promise<PlannerTransferRow> {
    try {
      return await this.transfers.create(data);
    } catch (err) {
      // `VehiclePlannerTransfer_pending_vehicle_key` — a concurrent filing won.
      if (isPrismaUniqueViolation(err)) throw this._alreadyPending();
      throw err;
    }
  }

  // ── Internals: decide ───────────────────────────────────

  private async _requireTransfer(id: string): Promise<PlannerTransferRow> {
    const row = await this.transfers.findById(id);
    if (!row) throw new NotFoundException('Wniosek o przekazanie nie znaleziony');
    return row;
  }

  /** R3 / R4 / U10 — see `decisionRefusal`. Each refusal has its own code. */
  private _assertMayDecide(user: AuthUser, t: PlannerTransferRow): void {
    const refusal = decisionRefusal(user, t);
    if (refusal === null) return;
    const byRefusal = {
      not_decider: {
        code: PLANNER_TRANSFER_NOT_DECIDER,
        message: 'Decyzję podejmuje administrator lub lider obecnego planisty.',
      },
      requester: {
        code: PLANNER_TRANSFER_DECIDER_IS_REQUESTER,
        message:
          'Autor wniosku nie może go rozpatrzyć — decyzję podejmuje inny administrator lub lider obecnego planisty.',
      },
      target: {
        code: PLANNER_TRANSFER_DECIDER_IS_TARGET,
        message: 'Jesteś planistą docelowym tego wniosku — decyzję podejmuje administrator.',
      },
    } as const;
    const { code, message } = byRefusal[refusal];
    throw new ForbiddenException({ message, extensions: { code } });
  }

  private _assertPending(t: PlannerTransferRow): void {
    if (t.status !== 'pending') throw this._notPending();
  }

  /**
   * U6, under the vehicle lock: the vehicle still exists, is on, is still led
   * by `fromPlanner` (else the request is stale — 409), and the target is
   * still an active planista.
   */
  private async _assertStillApplicable(t: PlannerTransferRow): Promise<void> {
    const vehicle = await this.vehicles.findById(t.vehicleId);
    if (!vehicle || !vehicle.active) throw this._vehicleInactive();
    if (vehicle.plannerId !== t.fromPlannerId) {
      throw new ConflictException({
        message: 'Wniosek jest nieaktualny — planista pojazdu zmienił się w międzyczasie.',
        extensions: { code: PLANNER_TRANSFER_PLANNER_CHANGED },
      });
    }
    await this._assertTarget(t.toPlannerId, t.fromPlannerId);
  }

  /** Compare-and-set close; `0` rows = closed concurrently → 409. */
  private async _close(
    id: string,
    data: Parameters<VehiclePlannerTransfersRepository['closeIfPending']>[1],
    onlyRequestedById?: string,
  ): Promise<void> {
    const closed = await this.transfers.closeIfPending(id, data, onlyRequestedById);
    if (closed === 0) throw this._notPending();
  }

  /**
   * The hand-over itself (docs/29 §3.2 p.3–4), with the approval's `now`:
   * close the open journal row at `now`, open the `transfer` row from `now`
   * (actor = the decider), point the vehicle at the new planista, and move
   * the trips that have not left yet (R6). Returns how many trips moved.
   */
  private async _handOver(
    t: PlannerTransferRow,
    deciderId: string,
    now: Date,
  ): Promise<number> {
    await this.assignments.closeOpen(t.vehicleId, now);
    await this.assignments.openFromTransfer({
      vehicleId: t.vehicleId,
      plannerId: t.toPlannerId,
      validFrom: now,
      transferId: t.id,
      actorId: deciderId,
    });
    await this.vehicles.setPlanner(t.vehicleId, t.toPlannerId);
    return this.delegations.reassignPlannerSnapshot({
      vehicleId: t.vehicleId,
      fromPlannerId: t.fromPlannerId,
      toPlannerId: t.toPlannerId,
      statuses: TRANSFERABLE_DELEGATION_STATUSES,
    });
  }

  // ── Internals: read ─────────────────────────────────────

  private _listFilters(
    user: AuthUser,
    query: PlannerTransferListQuery,
  ): PlannerTransferListFilters {
    const statuses: readonly PlannerTransferStatus[] =
      query.status === 'decided' ? PLANNER_TRANSFER_DECIDED_STATUSES : [query.status];
    const base: PlannerTransferListFilters = {
      statuses,
      order: query.status === 'pending' ? 'queue' : 'decided',
      vehicleId: query.vehicleId,
      cursor: query.cursor,
      limit: query.limit,
    };
    if (query.scope === 'mine') return { ...base, requestedById: user.sub };
    if (user.role === 'admin') return base;
    if (user.role === 'planista' && user.lider === true) {
      return { ...base, fromPlannerLiderId: user.sub };
    }
    throw new ForbiddenException({
      message: 'Skrzynka decyzji jest dostępna dla administratora i liderów planistów.',
      extensions: { code: PLANNER_TRANSFER_NOT_DECIDER },
    });
  }

  /** U11 — who may read a vehicle's planista journal. */
  private async _assertMayReadHistory(user: AuthUser, vehicle: VehicleRow): Promise<void> {
    if (user.role === 'admin') return;
    // The route's OpiekunOwnershipGuard already checked the carrier; repeated.
    if (user.role === 'opiekun' && vehicle.opiekun?.id === user.sub) return;
    if (user.role === 'planista' && vehicle.plannerId) {
      if (vehicle.plannerId === user.sub) return;
      if (user.lider === true) {
        const current = await this.users.findById(vehicle.plannerId);
        if (current?.liderId === user.sub) return;
      }
    }
    throw new ForbiddenException('Brak uprawnień do historii planistów tego pojazdu');
  }

  // ── Errors ──────────────────────────────────────────────

  private _alreadyPending(): ConflictException {
    return new ConflictException({
      message: 'Dla tego pojazdu istnieje już oczekujący wniosek o przekazanie.',
      extensions: { code: PLANNER_TRANSFER_ALREADY_PENDING },
    });
  }

  private _notPending(): ConflictException {
    return new ConflictException({
      message: 'Wniosek nie oczekuje już na decyzję.',
      extensions: { code: PLANNER_TRANSFER_NOT_PENDING },
    });
  }

  private _vehicleInactive(): UnprocessableEntityException {
    return new UnprocessableEntityException({
      message: 'Pojazd jest wyłączony.',
      extensions: { code: PLANNER_TRANSFER_VEHICLE_INACTIVE },
    });
  }
}
