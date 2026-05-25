import { ForbiddenException, Injectable } from '@nestjs/common';

import type {
  LookupCarrierDto,
  LookupCarrierFilters,
  LookupCarrierListDto,
  LookupUserListDto,
} from '@magguarantee/shared';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CarriersRepository } from '../carriers/carriers.repository';
import { UsersRepository } from '../users/users.repository';

/** Hard cap for the carriers autocomplete result set per Phase 4.4 brief. */
const LOOKUP_CARRIERS_LIMIT = 100;

/**
 * Lookups for dropdowns per docs/13-api-design.md#lookups.
 *
 * The three people-pickers (`dyspozytor`, `planisci`, `opiekuni`) all return
 * active users with the matching role.
 *
 * Phase 4.4 added `carriers` for the admin/opiekun autocomplete in the
 * claims / vehicles / drivers / trailers admin pages. Role-scoped:
 *  - admin / pracownik see every (non-soft-deleted) carrier;
 *  - opiekun sees only carriers where `Carrier.opiekunId === user.sub`;
 *  - any other role gets a 403 (consistent with the carrier-CRUD surface,
 *    per docs/03-roles.md).
 *
 * The former `certTypes()` static enum echo was removed when
 * `Vehicle.certificateL` was collapsed from the `CertificateL` enum to a
 * Boolean in 20260515130307_vehicle_certificate_l_to_boolean.
 */
@Injectable()
export class LookupsService {
  constructor(
    private readonly users: UsersRepository,
    private readonly carriers: CarriersRepository,
  ) {}

  async dyspozytor(): Promise<LookupUserListDto> {
    return this._listByRole('dyspozytor');
  }

  async planisci(): Promise<LookupUserListDto> {
    return this._listByRole('planista');
  }

  async opiekuni(): Promise<LookupUserListDto> {
    return this._listByRole('opiekun');
  }

  /**
   * Carriers autocomplete per Phase 4.4. Returns up to 100 rows, role-scoped
   * to the caller. No pagination — pickers re-query on every keystroke and
   * 100 rows is plenty for type-ahead.
   */
  async carriersList(
    user: AuthUser,
    filters: LookupCarrierFilters,
  ): Promise<LookupCarrierListDto> {
    if (
      user.role !== 'admin' &&
      user.role !== 'pracownik' &&
      user.role !== 'opiekun'
    ) {
      // Mirror the carriers controller's role gate — pracownik is included
      // here (read-only autocomplete) per the Phase 4.4 brief, even though
      // carriers.controller.ts excludes pracownik from list/CRUD.
      throw new ForbiddenException('Brak uprawnień do listy przewoźników');
    }
    // Opiekun scope: filter to supervised carriers only, mirroring
    // `CarrierOwnsGuard` and the carriers.service list() behaviour. Other
    // roles see the unfiltered set (within the 100-row cap).
    const opiekunId = user.role === 'opiekun' ? user.sub : undefined;
    const rows = await this.carriers.list({
      ...(opiekunId !== undefined ? { opiekunId } : {}),
      ...(filters.q !== undefined ? { q: filters.q } : {}),
      limit: LOOKUP_CARRIERS_LIMIT,
    });
    return rows.map(
      (r): LookupCarrierDto => ({
        id: r.id,
        login: r.login,
        name: r.name,
        active: r.active,
      }),
    );
  }

  // ── Internals ────────────────────────────────────────────

  private async _listByRole(
    role: 'dyspozytor' | 'planista' | 'opiekun',
  ): Promise<LookupUserListDto> {
    const rows = await this.users.listByRole(role);
    return rows.map((u) => ({ id: u.id, login: u.login, name: u.name }));
  }
}
