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
    if (user.role !== 'admin' && user.role !== 'opiekun') {
      // Defence in depth — controller's `@Roles('admin','opiekun')` is the
      // primary gate; this assertion guards direct service callers (tests,
      // scripts) from accidentally bypassing the role check.
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
