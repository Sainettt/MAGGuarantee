import { ConflictException, NotFoundException } from '@nestjs/common';

import { PasswordService } from '../auth/password.service';
import { RefreshTokenRepository } from '../auth/refresh-token.repository';
import {
  UsersRepository,
  type UserRow,
} from './users.repository';
import { UsersService } from './users.service';

function makeRow(overrides: Partial<UserRow> = {}): UserRow {
  const now = new Date('2026-05-01T10:00:00.000Z');
  return {
    id: 'u-1',
    login: 'admin',
    email: 'admin@magtrans.eu',
    passwordHash: '$2b$12$xxxx',
    role: 'admin',
    name: 'Admin',
    active: true,
    liderEmail: null,
    teamId: null,
    mustChangePassword: false,
    passwordChangedAt: null,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    // SSO defaults — a hand-created, locally managed account (docs/24).
    authProvider: 'local',
    managedBy: 'local',
    googleSub: null,
    magspaceEmployeeId: null,
    directorySyncedAt: null,
    roleOverride: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function makeRepo(initial: UserRow[] = []): UsersRepository {
  const rows = new Map<string, UserRow>();
  for (const r of initial) rows.set(r.id, r);
  return {
    findById: jest.fn(async (id: string) => rows.get(id) ?? null),
    findByLogin: jest.fn(async (login: string) =>
      [...rows.values()].find((r) => r.login === login) ?? null,
    ),
    list: jest.fn(async (filters: { limit: number; role?: UserRow['role'] }) => {
      let arr = [...rows.values()];
      if (filters.role) arr = arr.filter((r) => r.role === filters.role);
      return arr.slice(0, filters.limit + 1);
    }),
    create: jest.fn(async (data: Partial<UserRow> & { login: string }) => {
      const row = makeRow({
        ...data,
        id: data.id ?? `u-${rows.size + 1}`,
        role: (data.role as UserRow['role']) ?? 'admin',
        // Required post-phase3_blocks — fall back to a stub when the
        // create() caller didn't supply (only happens in update tests).
        email: data.email ?? 'stub@example.com',
        name: data.name ?? null,
        passwordHash: data.passwordHash ?? 'stub-hash',
      });
      // Mimic the real DB unique check on login.
      if ([...rows.values()].some((r) => r.login === row.login)) {
        // Throw a Prisma-shaped P2002 so our service translates it.
        const err = Object.assign(new Error('P2002'), {
          code: 'P2002',
          meta: { target: ['login'] },
        });
        throw err;
      }
      rows.set(row.id, row);
      return row;
    }),
    update: jest.fn(async (id: string, patch: Partial<UserRow>) => {
      const cur = rows.get(id);
      if (!cur) throw new Error('not found');
      const next: UserRow = { ...cur, ...patch };
      rows.set(id, next);
      return next;
    }),
    softDelete: jest.fn(async (id: string) => {
      const cur = rows.get(id);
      if (cur) {
        rows.set(id, { ...cur, deletedAt: new Date() });
      }
    }),
  } as unknown as UsersRepository;
}

function makePasswords(): PasswordService {
  return {
    hash: jest.fn(async (s: string) => `hashed:${s}`),
    compareConstantTime: jest.fn(async () => true),
  } as unknown as PasswordService;
}

function makeRefreshTokens(): {
  repo: RefreshTokenRepository;
  revokeAllForUser: jest.Mock;
} {
  const revokeAllForUser = jest.fn(async () => 0);
  const repo = {
    revokeAllForUser,
    revokeAllForUserExcept: jest.fn(async () => 0),
    findByHash: jest.fn(async () => null),
    revokeById: jest.fn(async () => undefined),
  } as unknown as RefreshTokenRepository;
  return { repo, revokeAllForUser };
}

function makeService(initial: UserRow[] = []): {
  svc: UsersService;
  repo: UsersRepository;
  revokeAllForUser: jest.Mock;
} {
  const repo = makeRepo(initial);
  const { repo: rt, revokeAllForUser } = makeRefreshTokens();
  const svc = new UsersService(repo, makePasswords(), rt);
  return { svc, repo, revokeAllForUser };
}

describe('UsersService', () => {
  it('creates a user, forces mustChangePassword, returns the temp password', async () => {
    const { svc, repo } = makeService();
    const out = await svc.create({
      login: 'kasia',
      email: 'kasia@magtrans.eu',
      name: 'Kasia',
      role: 'pracownik',
    });
    expect(out.login).toBe('kasia');
    expect(out.role).toBe('pracownik');
    expect(out.temporaryPassword).toMatch(/.{10,}/);
    // Force is always on — every admin-created user starts gated.
    expect(out.mustChangePassword).toBe(true);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mustChangePassword: true,
        passwordChangedAt: expect.any(Date),
      }),
    );
  });

  it('forces mustChangePassword even when admin supplies a custom password', async () => {
    const { svc } = makeService();
    const out = await svc.create({
      login: 'jan',
      email: 'jan@magtrans.eu',
      name: 'Jan',
      role: 'opiekun',
      password: 'CustomPass123',
    });
    expect(out.temporaryPassword).toBe('CustomPass123');
    expect(out.mustChangePassword).toBe(true);
  });

  it('rejects role=przewoznik (must use POST /carriers)', async () => {
    const { svc } = makeService();
    await expect(
      // Cast-around: the schema would normally exclude 'przewoznik', but the
      // service still defends against bypass.
      svc.create({
        login: 'p',
        email: 'p@magtrans.eu',
        name: 'P',
        role: 'przewoznik' as unknown as 'admin',
      }),
    ).rejects.toThrow();
  });

  it('translates duplicate-login P2002 into ConflictException', async () => {
    const { svc } = makeService([makeRow({ id: 'u-1', login: 'admin' })]);
    await expect(
      svc.create({
        login: 'admin',
        email: 'b@magtrans.eu',
        name: 'B',
        role: 'admin',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('getById throws 404 for unknown user', async () => {
    const { svc } = makeService();
    await expect(svc.getById('missing')).rejects.toThrow(NotFoundException);
  });

  it('list returns DTOs with pagination cursor when more rows exist', async () => {
    const { svc } = makeService(
      Array.from({ length: 3 }, (_, i) =>
        makeRow({ id: `u-${i}`, login: `l${i}` }),
      ),
    );
    const out = await svc.list({ limit: 2 });
    expect(out.items).toHaveLength(2);
    expect(out.nextCursor).toBe('u-1');
  });

  it('deactivate flips active=false and rejects double-deactivate', async () => {
    const { svc } = makeService([makeRow({ id: 'u-1', active: true })]);
    const out = await svc.deactivate('u-1');
    expect(out.active).toBe(false);
    await expect(svc.deactivate('u-1')).rejects.toThrow(ConflictException);
  });

  it('reactivate flips active=true and rejects double-reactivate', async () => {
    const { svc } = makeService([makeRow({ id: 'u-1', active: false })]);
    const out = await svc.reactivate('u-1');
    expect(out.active).toBe(true);
    await expect(svc.reactivate('u-1')).rejects.toThrow(ConflictException);
  });

  describe('resetPassword (admin)', () => {
    it('mode=generate issues a fresh temp password, forces change, revokes sessions', async () => {
      const { svc, repo, revokeAllForUser } = makeService([
        makeRow({ id: 'u-1', passwordHash: 'old' }),
      ]);
      const out = await svc.resetPassword('u-1', { mode: 'generate' });
      expect(out.temporaryPassword).toMatch(/.{10,}/);
      expect(out.mustChangePassword).toBe(true);
      expect(repo.update).toHaveBeenCalledWith(
        'u-1',
        expect.objectContaining({
          passwordHash: expect.stringContaining('hashed:'),
          mustChangePassword: true,
          passwordChangedAt: expect.any(Date),
        }),
      );
      // A reset must kill the victim's existing sessions.
      expect(revokeAllForUser).toHaveBeenCalledWith('u-1');
    });

    it('mode=custom uses the supplied password verbatim', async () => {
      const { svc, revokeAllForUser } = makeService([
        makeRow({ id: 'u-1', passwordHash: 'old' }),
      ]);
      const out = await svc.resetPassword('u-1', {
        mode: 'custom',
        password: 'BrandNew123',
      });
      expect(out.temporaryPassword).toBe('BrandNew123');
      expect(out.mustChangePassword).toBe(true);
      expect(revokeAllForUser).toHaveBeenCalledWith('u-1');
    });

    it('throws 404 for an unknown user', async () => {
      const { svc } = makeService();
      await expect(
        svc.resetPassword('missing', { mode: 'generate' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  it('applyPasswordChange stamps passwordChangedAt and clears the flag', async () => {
    const { svc, repo } = makeService([
      makeRow({ id: 'u-1', mustChangePassword: true }),
    ]);
    await svc.applyPasswordChange('u-1', 'new-hash', {
      mustChangePassword: false,
    });
    expect(repo.update).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({
        passwordHash: 'new-hash',
        mustChangePassword: false,
        passwordChangedAt: expect.any(Date),
      }),
    );
  });

  it('softDelete throws 404 for unknown id', async () => {
    const { svc } = makeService();
    await expect(svc.softDelete('missing')).rejects.toThrow(NotFoundException);
  });

  it('update rejects role=przewoznik change', async () => {
    const { svc } = makeService([makeRow({ id: 'u-1', role: 'pracownik' })]);
    await expect(
      svc.update('u-1', {
        role: 'przewoznik' as unknown as 'admin',
      }),
    ).rejects.toThrow();
  });

  // ── MAGSpace-managed accounts (docs/24 §A2) ─────────────

  describe('directory-managed users', () => {
    const managed = (over: Partial<UserRow> = {}): UserRow =>
      makeRow({
        id: 'u-mag',
        login: 'jan.kowalski',
        email: 'jan.kowalski@magtrans.eu',
        role: 'planista',
        managedBy: 'magspace',
        authProvider: 'google',
        magspaceEmployeeId: 'emp-1',
        ...over,
      });

    it('refuses a role change — the directory would revert it anyway', async () => {
      const { svc } = makeService([managed()]);

      await expect(svc.update('u-mag', { role: 'opiekun' })).rejects.toMatchObject({
        response: { extensions: { code: 'USER_MANAGED_BY_MAGSPACE', fields: ['role'] } },
      });
    });

    it('refuses an active change', async () => {
      const { svc } = makeService([managed()]);

      await expect(svc.update('u-mag', { active: false })).rejects.toMatchObject({
        response: { extensions: { code: 'USER_MANAGED_BY_MAGSPACE' } },
      });
    });

    it('accepts a no-op patch that merely restates the current values', async () => {
      // The admin form submits every field; only an actual CHANGE is refused.
      const { svc } = makeService([managed()]);

      await expect(
        svc.update('u-mag', { role: 'planista', active: true, name: 'Jan K.' }),
      ).resolves.toMatchObject({ name: 'Jan K.' });
    });

    it('allows setting roleOverride — that is the way to grant a role by hand', async () => {
      const { svc } = makeService([managed()]);

      const out = await svc.update('u-mag', { roleOverride: 'weryfikator' });

      expect(out.roleOverride).toBe('weryfikator');
    });

    it('allows taking the account back into local management, role change included', async () => {
      // Switching to `local` in the same patch is the documented escape hatch,
      // so the role edit that accompanies it must go through.
      const { svc } = makeService([managed()]);

      const out = await svc.update('u-mag', { managedBy: 'local', role: 'opiekun' });

      expect(out.managedBy).toBe('local');
      expect(out.role).toBe('opiekun');
    });

    it('leaves locally-managed users completely unaffected', async () => {
      const { svc } = makeService([makeRow({ id: 'u-loc', managedBy: 'local' })]);

      await expect(svc.update('u-loc', { role: 'opiekun', active: false })).resolves.toMatchObject({
        role: 'opiekun',
        active: false,
      });
    });

    it('toDto surfaces the directory fields', () => {
      const { svc } = makeService();
      const dto = svc.toDto(
        managed({
          roleOverride: 'weryfikator',
          directorySyncedAt: new Date('2026-09-01T10:00:00.000Z'),
        }),
      );
      expect(dto.managedBy).toBe('magspace');
      expect(dto.authProvider).toBe('google');
      expect(dto.roleOverride).toBe('weryfikator');
      expect(dto.directorySyncedAt).toBe('2026-09-01T10:00:00.000Z');
    });
  });

  it('toDto serializes timestamps as ISO and surfaces mustChangePassword', () => {
    const { svc } = makeService();
    const dto = svc.toDto(
      makeRow({
        lastLoginAt: new Date('2026-05-01T10:00:00.000Z'),
        mustChangePassword: true,
      }),
    );
    expect(dto.lastLoginAt).toBe('2026-05-01T10:00:00.000Z');
    expect(dto.createdAt).toBe('2026-05-01T10:00:00.000Z');
    expect(dto.mustChangePassword).toBe(true);
  });
});
