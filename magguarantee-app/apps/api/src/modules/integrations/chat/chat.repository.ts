import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * The delegation projection the chat notifier needs: departure / return fields
 * plus the lead-team names (planista + the dispatch TEAM's dispatchers via the
 * vehicle, opiekun via the carrier). Kept distinct from `DelegationRow` so the
 * existing delegations repository shape stays untouched — we only select what
 * the 4-line message consumes.
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
  /**
   * Phase 11 — every dispatcher name on the vehicle's dispatch TEAM
   * (`Vehicle.dispatchTeam.dispatchers[].name`). Empty when the vehicle is
   * unassigned or the team has no members. Individual nulls are preserved here
   * (the formatter drops blanks). Replaces the single `dyspozytorName`.
   */
  dyspozytorNames: (string | null)[];
  /** `Carrier.opiekun.name` — null when name unset (opiekun is always present). */
  opiekunName: string | null;
}

/**
 * Read-only repository for the chat wyjazd notification. Owns its Prisma
 * access (repositories own DB access — services/processors never touch
 * `prisma.*`). A single read: the delegation projection (the weryfikator
 * lookup was removed in the Phase 11 chat rework).
 */
@Injectable()
export class ChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fetch the wyjazd context for one delegation. Pulls the planner name + the
   * dispatch TEAM's dispatcher names off the vehicle relation and the opiekun
   * name off the carrier relation in a single query. Returns `null` if the
   * delegation is gone (the processor treats that as a skip).
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
            dispatchTeam: {
              select: {
                dispatchers: {
                  select: { name: true },
                  orderBy: { login: 'asc' },
                },
              },
            },
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
      dyspozytorNames:
        row.vehicle?.dispatchTeam?.dispatchers.map((d) => d.name) ?? [],
      opiekunName: row.carrier?.opiekun?.name ?? null,
    };
  }
}
