import { ForbiddenException, Injectable } from '@nestjs/common';

import type {
  OpiekunCarrierListItem,
  OpiekunCarriersResponse,
} from '@magguarantee/shared';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import {
  CarriersRepository,
  type OpiekunAggregateCarrierRow,
} from '../carriers/carriers.repository';

/**
 * Phase 5 — opiekun-scoped surface.
 *
 * Backs `GET /api/v1/opiekun/carriers`, a lighter sibling of
 * `/fleet/opiekun` — same row filtering (admin → all, opiekun → own), but
 * the response shape is identity + active-child counts only (no per-vehicle
 * classification). Suitable for the dashboard sidebar where the dashboard
 * just needs to render a navigable list.
 */
@Injectable()
export class OpiekunService {
  constructor(private readonly carriers: CarriersRepository) {}

  async listMyCarriers(user: AuthUser): Promise<OpiekunCarriersResponse> {
    // scope: opiekun → own carriers (Carrier.opiekunId), admin → all. Role-keyed
    // on purpose, not can('panel.opiekun'): this check guards the
    // `opiekun ? own : all` ternary below, so a B6 grant of the panel right to
    // another role must not widen it to every carrier (docs/25 §0, R4). The
    // route's `@RequirePermission('panel.opiekun')` is the primary gate.
    if (user.role !== 'admin' && user.role !== 'opiekun') {
      throw new ForbiddenException(
        'Brak uprawnień (wymaga konta opiekuna lub administratora)',
      );
    }
    const rows = await this.carriers.listForOpiekunAggregate(
      user.role === 'opiekun' ? { opiekunId: user.sub } : {},
    );
    return rows.map((r) => this._toListItem(r));
  }

  private _toListItem(
    row: OpiekunAggregateCarrierRow,
  ): OpiekunCarrierListItem {
    return {
      carrierId: row.id,
      login: row.login,
      nazwa: row.name,
      firma: row.company,
      nip: row.nip,
      aktywny: row.active,
      counts: {
        vehicles: row.counts.vehicles,
        drivers: row.counts.drivers,
        trailers: row.counts.trailers,
      },
    };
  }
}
