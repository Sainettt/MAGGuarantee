import { Injectable } from '@nestjs/common';

import { UsersRepository, type UserRow } from './users.repository';

/**
 * Internal-only in Phase 1 — no controller surface yet (admin CRUD ships in
 * Phase 2 per docs/17-migration-roadmap.md). The auth module is the only
 * caller.
 */
@Injectable()
export class UsersService {
  constructor(private readonly repo: UsersRepository) {}

  findByLogin(login: string): Promise<UserRow | null> {
    return this.repo.findByLogin(login);
  }

  findById(id: string): Promise<UserRow | null> {
    return this.repo.findById(id);
  }

  incrementFailedAttempts(id: string): Promise<number> {
    return this.repo.incrementFailedAttempts(id);
  }

  resetFailedAttempts(id: string): Promise<void> {
    return this.repo.resetFailedAttempts(id);
  }

  lockUntil(id: string, until: Date): Promise<void> {
    return this.repo.lockUntil(id, until);
  }

  updateLastLogin(id: string, at: Date): Promise<void> {
    return this.repo.updateLastLogin(id, at);
  }
}
