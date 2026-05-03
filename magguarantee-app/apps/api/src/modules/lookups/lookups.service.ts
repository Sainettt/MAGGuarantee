import { Injectable } from '@nestjs/common';

import type { LookupUserListDto } from '@magguarantee/shared';

import { UsersRepository } from '../users/users.repository';

/**
 * Lookups for dropdowns per docs/13-api-design.md#lookups.
 *
 * The four people-pickers (`dyspozytor`, `planisci`, `opiekuni`) all return
 * active users with the matching role. Cert-types is a static enum echo.
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

  certTypes(): readonly ('L1' | 'L2' | 'L3')[] {
    return ['L1', 'L2', 'L3'];
  }

  // ── Internals ────────────────────────────────────────────

  private async _listByRole(
    role: 'dyspozytor' | 'planista' | 'opiekun',
  ): Promise<LookupUserListDto> {
    const rows = await this.users.listByRole(role);
    return rows.map((u) => ({ id: u.id, login: u.login, name: u.name }));
  }
}
