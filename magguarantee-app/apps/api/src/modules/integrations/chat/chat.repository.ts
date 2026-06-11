import { Injectable } from '@nestjs/common';

import { Role as PrismaRole } from '@magguarantee/database';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * The delegation projection the chat notifier needs: departure / return fields
 * plus the team names (planista / dyspozytor via the vehicle, opiekun via the
 * carrier). Kept distinct from `DelegationRow` so the existing delegations
 * repository shape stays untouched — we only select what the 4-line message
 * consumes.
 */
export interface ChatWyjazdRow {
  id: string;
  departureAt: Date;
  departureCountry: string;
  departurePostalCode: string;
  plannedReturnAt: Date;
  returnCountry: string;
  returnPostalCode: string;
  /** `Vehicle.planner.name` — null when no planner assigned or name unset. */
  planistaName: string | null;
  /** `Vehicle.dispatcher.name` — null when no dispatcher assigned or name unset. */
  dyspozytorName: string | null;
  /** `Carrier.opiekun.name` — null when name unset (opiekun is always present). */
  opiekunName: string | null;
}

/**
 * Read-only repository for the chat wyjazd notification. Owns its Prisma
 * access (repositories own DB access — services/processors never touch
 * `prisma.*`). Two reads: the delegation projection and the single active
 * weryfikator name.
 */
@Injectable()
export class ChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fetch the wyjazd context for one delegation. Pulls planner/dispatcher
   * names off the vehicle relation and the opiekun name off the carrier
   * relation in a single query. Returns `null` if the delegation is gone
   * (the processor treats that as a skip).
   */
  async findWyjazdRow(delegationId: string): Promise<ChatWyjazdRow | null> {
    const row = await this.prisma.tx.delegation.findFirst({
      where: { id: delegationId },
      select: {
        id: true,
        departureAt: true,
        departureCountry: true,
        departurePostalCode: true,
        plannedReturnAt: true,
        returnCountry: true,
        returnPostalCode: true,
        vehicle: {
          select: {
            planner: { select: { name: true } },
            dispatcher: { select: { name: true } },
          },
        },
        carrier: {
          select: {
            opiekun: { select: { name: true } },
          },
        },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      departureAt: row.departureAt,
      departureCountry: row.departureCountry,
      departurePostalCode: row.departurePostalCode,
      plannedReturnAt: row.plannedReturnAt,
      returnCountry: row.returnCountry,
      returnPostalCode: row.returnPostalCode,
      planistaName: row.vehicle?.planner?.name ?? null,
      dyspozytorName: row.vehicle?.dispatcher?.name ?? null,
      opiekunName: row.carrier?.opiekun?.name ?? null,
    };
  }

  /**
   * The single active weryfikator name (`role = 'weryfikator' AND active =
   * true`, oldest first). Per the locked brief the weryfikator is NOT
   * per-vehicle — it is a singleton role. The caller (`ChatContextBuilder`)
   * handles the 0 (omit) / >1 (use first + warn) cases; this repo returns at
   * most the first matching row plus a `total` count so the caller can warn.
   *
   * The soft-delete extension already scopes to `deletedAt: null`; `active:
   * true` is added explicitly per the brief.
   */
  async findActiveWeryfikator(): Promise<{
    name: string | null;
    total: number;
  } | null> {
    const [first, total] = await Promise.all([
      this.prisma.tx.user.findFirst({
        where: { role: PrismaRole.weryfikator, active: true },
        orderBy: { createdAt: 'asc' },
        select: { name: true },
      }),
      this.prisma.tx.user.count({
        where: { role: PrismaRole.weryfikator, active: true },
      }),
    ]);
    if (!first) return null;
    return { name: first.name, total };
  }
}
