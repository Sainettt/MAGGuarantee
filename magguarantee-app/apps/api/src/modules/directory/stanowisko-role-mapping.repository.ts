// Persistence for the stanowisko → role table (docs/24 §A2).
//
// MAGSpace stores stanowiska, never MAGGuarantee roles: each consuming app
// interprets a position itself. This table IS that interpretation, and an admin
// owns it through `/employee/sso`.

import { Injectable } from '@nestjs/common';

import type { AssignableRole } from '@magguarantee/shared';

import { PrismaService } from '../prisma/prisma.service';

export type StanowiskoRoleMappingRow = {
  id: string;
  stanowiskoCode: string;
  stanowiskoName: string;
  role: AssignableRole;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class StanowiskoRoleMappingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<StanowiskoRoleMappingRow[]> {
    const rows = await this.prisma.tx.stanowiskoRoleMapping.findMany({
      orderBy: { stanowiskoCode: 'asc' },
    });
    return rows as unknown as StanowiskoRoleMappingRow[];
  }

  async findByCode(code: string): Promise<StanowiskoRoleMappingRow | null> {
    const row = await this.prisma.tx.stanowiskoRoleMapping.findUnique({
      where: { stanowiskoCode: code },
    });
    return (row as StanowiskoRoleMappingRow | null) ?? null;
  }

  /**
   * Upsert keyed on the code. `stanowiskoName` is refreshed on every write
   * because it is only a cache of MAGSpace's label — the code is the identity.
   */
  async upsert(
    code: string,
    name: string,
    role: AssignableRole,
  ): Promise<StanowiskoRoleMappingRow> {
    const row = await this.prisma.tx.stanowiskoRoleMapping.upsert({
      where: { stanowiskoCode: code },
      create: { stanowiskoCode: code, stanowiskoName: name, role },
      update: { stanowiskoName: name, role },
    });
    return row as unknown as StanowiskoRoleMappingRow;
  }

  /**
   * Hard delete — this table has no `deletedAt` and is not in
   * `SOFT_DELETE_MODELS`. Removing the row means "this stanowisko no longer
   * grants access", which is the intended, observable effect: the next sign-in
   * or reconcile run treats its holders as unmapped.
   *
   * Returns false when there was nothing to delete, so the controller can
   * answer 404 rather than pretending.
   */
  async deleteByCode(code: string): Promise<boolean> {
    const deleted = await this.prisma.tx.stanowiskoRoleMapping.deleteMany({
      where: { stanowiskoCode: code },
    });
    return deleted.count > 0;
  }
}
