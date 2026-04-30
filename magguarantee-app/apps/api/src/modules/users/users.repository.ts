import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export type UserRow = {
  id: string;
  login: string;
  email: string | null;
  passwordHash: string | null;
  role:
    | 'admin'
    | 'pracownik'
    | 'opiekun'
    | 'planista'
    | 'dyspozytor'
    | 'przewoznik'
    | 'eksport'
    | 'weryfikator';
  name: string | null;
  active: boolean;
  failedAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  deletedAt: Date | null;
};

/**
 * Read/write surface for the User table. Repositories own all Prisma access
 * per api-agent guidelines — services and controllers must not call
 * `prisma.user.*` directly.
 */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByLogin(login: string): Promise<UserRow | null> {
    const row = await this.prisma.user.findFirst({
      where: { login, deletedAt: null },
    });
    return (row as UserRow | null) ?? null;
  }

  async findById(id: string): Promise<UserRow | null> {
    const row = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
    return (row as UserRow | null) ?? null;
  }

  async incrementFailedAttempts(id: string): Promise<number> {
    const updated = await this.prisma.user.update({
      where: { id },
      data: { failedAttempts: { increment: 1 } },
      select: { failedAttempts: true },
    });
    return updated.failedAttempts;
  }

  async resetFailedAttempts(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { failedAttempts: 0, lockedUntil: null },
    });
  }

  async lockUntil(id: string, until: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { lockedUntil: until },
    });
  }

  async updateLastLogin(id: string, at: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: at },
    });
  }
}
