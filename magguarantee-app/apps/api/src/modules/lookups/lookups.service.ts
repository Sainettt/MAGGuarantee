import { Injectable } from '@nestjs/common';

import type { LookupUserListDto } from '@magguarantee/shared';

import { UsersRepository } from '../users/users.repository';

/**
 * Lookups for dropdowns per docs/13-api-design.md#lookups.
 *
 * The three people-pickers (`dyspozytor`, `planisci`, `opiekuni`) all return
 * active users with the matching role. The former `certTypes()` static enum
 * echo was removed when `Vehicle.certificateL` was collapsed from the
 * `CertificateL` enum to a Boolean in
 * 20260515130307_vehicle_certificate_l_to_boolean.
 */
@Injectable()
export class LookupsService {
  constructor(private readonly users: UsersRepository) {}

  async dyspozytor(): Promise<LookupUserListDto> {
    return this._listByRole('dyspozytor');
  }

  async planisci(): Promise<LookupUserListDto> {
    return this._listByRole('planista');
  }

  async opiekuni(): Promise<LookupUserListDto> {
    return this._listByRole('opiekun');
  }

  // ── Internals ────────────────────────────────────────────

  private async _listByRole(
    role: 'dyspozytor' | 'planista' | 'opiekun',
  ): Promise<LookupUserListDto> {
    const rows = await this.users.listByRole(role);
    return rows.map((u) => ({ id: u.id, login: u.login, name: u.name }));
  }
}
