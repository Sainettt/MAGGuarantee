import { ConflictException, NotFoundException } from '@nestjs/common';

import { AuditContext, type AuditContextStore } from '../../common/audit';
import { PasswordService } from '../auth/password.service';
import { RefreshTokenRepository } from '../auth/refresh-token.repository';
import {
  UsersRepository,
  type UserLiderMiniRow,
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
    liderId: null,
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
    // docs/25 B6 — no per-user overrides.
    extraPermissions: [],
    deniedPermissions: [],
    lider: false,
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
    // docs/29 — leader minis (soft-deleted included, reported inactive).
    findLiderMinis: jest.fn(async (ids: readonly string[]) => {
      const out = new Map<string, UserLiderMiniRow>();
      for (const id of ids) {
        const r = rows.get(id);
        if (r) {
          out.set(id, {
            id: r.id,
            login: r.login,
            name: r.name,
            active: r.active && r.deletedAt === null,
            lider: r.lider,
          });
        }
      }
      return out;
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

    it('handing the account back to local clears roleOverride and keeps the role', async () => {
      // Once local, nothing consults the override; leaving it would let it win
      // again the day someone flips the account back to `magspace`.
      const { svc, repo } = makeService([
        managed({ role: 'weryfikator', roleOverride: 'weryfikator' }),
      ]);

      const out = await svc.update('u-mag', { managedBy: 'local' });

      expect(out.managedBy).toBe('local');
      expect(out.roleOverride).toBeNull();
      expect(out.role).toBe('weryfikator');
      expect(repo.update).toHaveBeenCalledWith(
        'u-mag',
        expect.objectContaining({ managedBy: 'local', roleOverride: null }),
      );
    });

    it('the hand-back wins over a roleOverride sent in the same body', async () => {
      const { svc } = makeService([managed({ roleOverride: 'weryfikator' })]);

      const out = await svc.update('u-mag', { managedBy: 'local', roleOverride: 'eksport' });

      expect(out.roleOverride).toBeNull();
    });

    it('leaves roleOverride alone when managedBy does not actually flip', async () => {
      // `managedBy: 'local'` restated on an already-local row is not a hand-back.
      const { svc, repo } = makeService([
        makeRow({ id: 'u-loc', managedBy: 'local', role: 'pracownik' }),
      ]);

      await svc.update('u-loc', { managedBy: 'local', name: 'Nowa Nazwa' });

      expect(repo.update).toHaveBeenCalledWith(
        'u-loc',
        expect.not.objectContaining({ roleOverride: expect.anything() }),
      );
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

  // ── Leader flag (docs/28) ────────────────────────────────

  describe('leader flag', () => {
    const LIDER = { response: { extensions: { code: 'USER_LIDER_REQUIRES_LIDER_ROLE' } } };
    const MANAGED = (fields: string[]) => ({
      response: { extensions: { code: 'USER_MANAGED_BY_MAGSPACE', fields } },
    });

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
    const local = (over: Partial<UserRow> = {}): UserRow =>
      makeRow({ id: 'u-loc', login: 'anna', role: 'planista', managedBy: 'local', ...over });

    // ── create ──

    it('create persists the flag for a leader role and echoes it', async () => {
      const { svc, repo } = makeService();
      const out = await svc.create({
        login: 'lead',
        email: 'lead@magtrans.eu',
        name: 'Lead',
        role: 'eksport',
        lider: true,
      });
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ role: 'eksport', lider: true }));
      expect(out.lider).toBe(true);
    });

    it('create defaults the flag to false', async () => {
      const { svc, repo } = makeService();
      await svc.create({ login: 'x', email: 'x@magtrans.eu', name: 'X', role: 'planista' });
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ lider: false }));
    });

    it.each(['admin', 'weryfikator'] as const)(
      'create refuses lider on %s with 422 USER_LIDER_REQUIRES_LIDER_ROLE (pipe bypassed)',
      async (role) => {
        const { svc, repo } = makeService();
        await expect(
          svc.create({ login: 'x', email: 'x@magtrans.eu', name: 'X', role, lider: true }),
        ).rejects.toMatchObject(LIDER);
        expect(repo.create).not.toHaveBeenCalled();
      },
    );

    // ── list / toDto ──

    it('list forwards the lider filter to the repository', async () => {
      const { svc, repo } = makeService();
      await svc.list({ limit: 50, lider: true });
      expect(repo.list).toHaveBeenCalledWith(expect.objectContaining({ lider: true, limit: 50 }));
      await svc.list({ limit: 50, lider: false });
      expect(repo.list).toHaveBeenLastCalledWith(expect.objectContaining({ lider: false }));
    });

    it('list without the filter leaves it unset', async () => {
      const { svc, repo } = makeService();
      await svc.list({ limit: 50 });
      expect((repo.list as jest.Mock).mock.calls[0][0].lider).toBeUndefined();
    });

    it('toDto surfaces lider', () => {
      const { svc } = makeService();
      expect(svc.toDto(local({ lider: true })).lider).toBe(true);
      expect(svc.toDto(local()).lider).toBe(false);
    });

    // ── update: the (role, lider) pair on the merged row (rule D.2 / D.4) ──

    it('a locally-managed leader role can be made a leader', async () => {
      const { svc, repo } = makeService([local()]);
      await expect(svc.update('u-loc', { lider: true })).resolves.toMatchObject({ lider: true });
      expect(repo.update).toHaveBeenCalledWith('u-loc', { lider: true });
    });

    it('partial PATCH { role: weryfikator } on a leader is 422 — never a CHECK-violation 500', async () => {
      const { svc, repo } = makeService([local({ lider: true })]);
      await expect(svc.update('u-loc', { role: 'weryfikator' })).rejects.toMatchObject({
        response: { extensions: { code: 'USER_LIDER_REQUIRES_LIDER_ROLE', field: 'role' } },
      });
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('the same PATCH with lider: false passes, role and flag in ONE update', async () => {
      const { svc, repo } = makeService([local({ lider: true })]);
      await expect(
        svc.update('u-loc', { role: 'weryfikator', lider: false }),
      ).resolves.toMatchObject({ role: 'weryfikator', lider: false });
      expect(repo.update).toHaveBeenCalledTimes(1);
      expect(repo.update).toHaveBeenCalledWith(
        'u-loc',
        expect.objectContaining({ role: 'weryfikator', lider: false }),
      );
    });

    it('lider: true on a stored non-leader role is 422', async () => {
      const { svc } = makeService([local({ role: 'weryfikator' })]);
      await expect(svc.update('u-loc', { lider: true })).rejects.toMatchObject(LIDER);
    });

    it('moving a leader between leader roles keeps the flag', async () => {
      const { svc } = makeService([local({ role: 'planista', lider: true })]);
      await expect(svc.update('u-loc', { role: 'opiekun' })).resolves.toMatchObject({
        role: 'opiekun',
        lider: true,
      });
    });

    it('a no-op PATCH on a leader passes (the stored pair is valid by CHECK)', async () => {
      const { svc } = makeService([local({ lider: true })]);
      await expect(svc.update('u-loc', { name: 'Nowa' })).resolves.toMatchObject({ lider: true });
    });

    it('a roleOverride the next sync would pair with the flag is checked too (R2)', async () => {
      // role stays planista (valid), but the sync would write weryfikator + lider.
      const { svc, repo } = makeService([managed({ lider: true })]);
      await expect(svc.update('u-mag', { roleOverride: 'weryfikator' })).rejects.toMatchObject({
        response: { extensions: { code: 'USER_LIDER_REQUIRES_LIDER_ROLE', field: 'roleOverride' } },
      });
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('…and passes when the same body drops the flag', async () => {
      const { svc, repo } = makeService([managed({ lider: true })]);
      await expect(
        svc.update('u-mag', { roleOverride: 'weryfikator', lider: false }),
      ).resolves.toMatchObject({ roleOverride: 'weryfikator', lider: false });
      expect(repo.update).toHaveBeenCalledWith('u-mag', { roleOverride: 'weryfikator', lider: false });
    });

    it('variant A: { roleOverride: planista, lider: true } on a magspace weryfikator is 422 — role is not rewritten', async () => {
      const { svc, repo } = makeService([managed({ role: 'weryfikator' })]);
      await expect(
        svc.update('u-mag', { roleOverride: 'planista', lider: true }),
      ).rejects.toMatchObject({
        response: { extensions: { code: 'USER_LIDER_REQUIRES_LIDER_ROLE', field: 'role' } },
      });
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('{ roleOverride, lider } is fine when the stored role already is that leader role', async () => {
      const { svc, repo } = makeService([managed({ role: 'planista' })]);
      await expect(
        svc.update('u-mag', { roleOverride: 'planista', lider: true }),
      ).resolves.toMatchObject({ role: 'planista', roleOverride: 'planista', lider: true });
      // `role` is left to the next sign-in, as for every override (docs/24).
      expect(repo.update).toHaveBeenCalledWith('u-mag', { roleOverride: 'planista', lider: true });
    });

    // ── update: who owns the flag on a magspace account (rule D.3) ──

    it('magspace without an override: the flag belongs to the mapping — 422 USER_MANAGED_BY_MAGSPACE [lider]', async () => {
      const { svc, repo } = makeService([managed()]);
      await expect(svc.update('u-mag', { lider: true })).rejects.toMatchObject(MANAGED(['lider']));
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('lists lider next to role when both are refused', async () => {
      const { svc } = makeService([managed()]);
      await expect(
        svc.update('u-mag', { role: 'opiekun', lider: true }),
      ).rejects.toMatchObject(MANAGED(['role', 'lider']));
    });

    it('restating the current flag is not a change', async () => {
      const { svc } = makeService([managed({ lider: true })]);
      await expect(svc.update('u-mag', { lider: true, name: 'Jan K.' })).resolves.toMatchObject({
        name: 'Jan K.',
      });
    });

    it('magspace with a stored override: the admin owns the flag', async () => {
      // A DAF leader — MAGSpace has no DAF_LIDER.
      const { svc, repo } = makeService([managed({ role: 'opiekun', roleOverride: 'opiekun' })]);
      await expect(svc.update('u-mag', { lider: true })).resolves.toMatchObject({ lider: true });
      expect(repo.update).toHaveBeenCalledWith('u-mag', { lider: true });
    });

    it('clearing the override in the same body gives the flag back to the mapping → 422', async () => {
      const { svc } = makeService([managed({ role: 'opiekun', roleOverride: 'opiekun' })]);
      await expect(
        svc.update('u-mag', { roleOverride: null, lider: true }),
      ).rejects.toMatchObject(MANAGED(['lider']));
    });

    it('hand-back to local allows the flag change', async () => {
      const { svc, repo } = makeService([managed()]);
      await expect(
        svc.update('u-mag', { managedBy: 'local', lider: true }),
      ).resolves.toMatchObject({ managedBy: 'local', lider: true, roleOverride: null });
      expect(repo.update).toHaveBeenCalledWith(
        'u-mag',
        expect.objectContaining({ managedBy: 'local', lider: true, roleOverride: null }),
      );
    });

    it('hand-back clears roleOverride BEFORE the pair check (rule D.1)', async () => {
      // The stale override (weryfikator) would fail the (roleOverride, lider)
      // pair — but the hand-back discards it, so only (planista, lider) counts.
      const { svc } = makeService([managed({ role: 'planista', roleOverride: 'weryfikator' })]);
      await expect(
        svc.update('u-mag', { managedBy: 'local', lider: true }),
      ).resolves.toMatchObject({ role: 'planista', roleOverride: null, lider: true });
    });

    // ── audit ──

    it('stashes the pre-image for the updateUser audit row, flag included', async () => {
      const existing = local({ lider: false });
      const { svc } = makeService([existing]);
      const store: AuditContextStore = {
        actor: { userId: 'admin-1', userRole: 'admin' } as AuditContextStore['actor'],
        ipAddress: null,
      };

      const out = await AuditContext.run(store, () => svc.update('u-loc', { lider: true }));

      expect(store.before).toEqual(svc.toDto(existing));
      expect(store.before).toMatchObject({ lider: false });
      expect(out.lider).toBe(true);
    });

    it('stashes nothing when the update is refused', async () => {
      const { svc } = makeService([local({ lider: true })]);
      const store: AuditContextStore = {
        actor: { userId: 'admin-1', userRole: 'admin' } as AuditContextStore['actor'],
        ipAddress: null,
      };

      await expect(
        AuditContext.run(store, () => svc.update('u-loc', { role: 'weryfikator' })),
      ).rejects.toMatchObject(LIDER);
      expect(store.before).toBeUndefined();
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

  // ── docs/29 R8 / U9 / U10 — the planista → lider link ──────
  describe('liderId (docs/29)', () => {
    const INVALID = (reason: string) => ({
      status: 422,
      response: { extensions: { code: 'USER_LIDER_ID_INVALID', reason } },
    });
    const lead = (over: Partial<UserRow> = {}): UserRow =>
      makeRow({ id: 'u-lead', login: 'lead', role: 'planista', lider: true, ...over });
    const plan = (over: Partial<UserRow> = {}): UserRow =>
      makeRow({ id: 'u-plan', login: 'plan', role: 'planista', ...over });

    it('create links a planista to an active planista-lider and returns the mini', async () => {
      const { svc, repo } = makeService([lead()]);
      const out = await svc.create({
        login: 'nowy',
        email: 'nowy@magtrans.eu',
        name: 'Nowy',
        role: 'planista',
        liderId: 'u-lead',
      });
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ liderId: 'u-lead' }));
      expect(out.liderId).toBe('u-lead');
      expect(out.liderUser).toEqual({
        id: 'u-lead',
        login: 'lead',
        name: 'Admin',
        active: true,
        lider: true,
      });
    });

    it('create refuses a leader link on a non-planista (pipe bypassed)', async () => {
      const { svc, repo } = makeService([lead()]);
      await expect(
        svc.create({ login: 'x', email: 'x@magtrans.eu', name: 'X', role: 'opiekun', liderId: 'u-lead' }),
      ).rejects.toMatchObject(INVALID('role_not_planista'));
      expect(repo.create).not.toHaveBeenCalled();
    });

    it.each([
      ['not_found', 'u-missing', [] as UserRow[]],
      ['not_planista', 'u-lead', [lead({ role: 'opiekun' })]],
      ['inactive', 'u-lead', [lead({ active: false })]],
      ['not_lider', 'u-lead', [lead({ lider: false })]],
    ] as const)('update refuses a %s target with 422', async (reason, target, extra) => {
      const { svc, repo } = makeService([plan(), ...extra]);
      await expect(svc.update('u-plan', { liderId: target })).rejects.toMatchObject(
        INVALID(reason),
      );
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('update refuses the user as his own leader', async () => {
      const { svc } = makeService([plan({ lider: true })]);
      await expect(svc.update('u-plan', { liderId: 'u-plan' })).rejects.toMatchObject(
        INVALID('self'),
      );
    });

    it('update sets a valid leader and clears it with null', async () => {
      const { svc, repo } = makeService([plan(), lead()]);
      await expect(svc.update('u-plan', { liderId: 'u-lead' })).resolves.toMatchObject({
        liderId: 'u-lead',
        liderUser: { id: 'u-lead', lider: true },
      });
      expect(repo.update).toHaveBeenLastCalledWith('u-plan', { liderId: 'u-lead' });
      await expect(svc.update('u-plan', { liderId: null })).resolves.toMatchObject({
        liderId: null,
        liderUser: null,
      });
      expect(repo.update).toHaveBeenLastCalledWith('u-plan', { liderId: null });
    });

    it('re-sending a STALE stored link is a no-op, not a 422 (U10)', async () => {
      // The leader lost his flag after the link was made — the form re-saves it.
      const { svc, repo } = makeService([plan({ liderId: 'u-lead' }), lead({ lider: false })]);
      const out = await svc.update('u-plan', { name: 'Plan Renamed', liderId: 'u-lead' });
      expect(repo.update).toHaveBeenCalledWith('u-plan', { name: 'Plan Renamed' });
      // The DTO shows the link as stale (the leader's CURRENT flag).
      expect(out.liderUser).toMatchObject({ id: 'u-lead', lider: false, active: true });
    });

    it('changing the role away from planista clears the link', async () => {
      const { svc, repo } = makeService([plan({ liderId: 'u-lead' }), lead()]);
      await svc.update('u-plan', { role: 'opiekun' });
      expect(repo.update).toHaveBeenCalledWith('u-plan', { role: 'opiekun', liderId: null });
    });

    it('a roleOverride away from planista on a MAGSpace account clears the link too', async () => {
      const { svc, repo } = makeService([
        plan({ liderId: 'u-lead', managedBy: 'magspace', authProvider: 'google' }),
        lead(),
      ]);
      await svc.update('u-plan', { roleOverride: 'opiekun' });
      expect(repo.update).toHaveBeenCalledWith('u-plan', { roleOverride: 'opiekun', liderId: null });
    });

    it('an explicit leader next to a role change away from planista is refused', async () => {
      const { svc } = makeService([plan(), lead()]);
      await expect(
        svc.update('u-plan', { role: 'opiekun', liderId: 'u-lead' }),
      ).rejects.toMatchObject(INVALID('role_not_planista'));
    });

    it('stays editable on a MAGSpace-managed planista (the directory never owns it)', async () => {
      const { svc, repo } = makeService([
        plan({ managedBy: 'magspace', authProvider: 'google', magspaceEmployeeId: 'e-1' }),
        lead(),
      ]);
      await svc.update('u-plan', { liderId: 'u-lead' });
      expect(repo.update).toHaveBeenCalledWith('u-plan', { liderId: 'u-lead' });
    });

    it("removing a leader's flag does NOT clear his planisci's links (U10)", async () => {
      const { svc, repo } = makeService([plan({ liderId: 'u-lead' }), lead()]);
      await svc.update('u-lead', { lider: false });
      expect(repo.update).toHaveBeenCalledTimes(1);
      expect(repo.update).toHaveBeenCalledWith('u-lead', { lider: false });
      await expect(svc.getById('u-plan')).resolves.toMatchObject({ liderId: 'u-lead' });
    });

    it('list resolves every leader in one batch and forwards the liderId filter', async () => {
      const { svc, repo } = makeService([
        plan({ id: 'u-p1', login: 'p1', liderId: 'u-lead' }),
        plan({ id: 'u-p2', login: 'p2', liderId: 'u-lead' }),
        lead(),
      ]);
      const out = await svc.list({ limit: 50, liderId: 'u-lead' });
      expect(repo.list).toHaveBeenCalledWith(expect.objectContaining({ liderId: 'u-lead' }));
      expect(repo.findLiderMinis).toHaveBeenCalledTimes(1);
      expect(repo.findLiderMinis).toHaveBeenCalledWith(['u-lead']);
      const p1 = out.items.find((i) => i.id === 'u-p1');
      expect(p1?.liderUser?.id).toBe('u-lead');
    });
  });

  // ── docs/25 §3 B6 — per-user permission overrides ──────────
  describe('permission overrides (docs/25 B6)', () => {
    const READ = 'carrier_documents.read' as const;
    const ADD = 'carrier_documents.add' as const;
    const DELETE = 'carrier_documents.delete' as const;
    const DECIDE = 'vehicles.planner_transfer.decide' as const;

    const refused = (code: string, permissions: string[]) => ({
      status: 422,
      response: { extensions: { code, permissions } },
    });
    const carrier = (over: Partial<UserRow> = {}): UserRow =>
      makeRow({ id: 'u-car', login: 'przewoznik2', email: 'p2@example.com', role: 'przewoznik', ...over });
    const opiekun = (over: Partial<UserRow> = {}): UserRow =>
      makeRow({ id: 'u-op', login: 'op', email: 'op@magtrans.eu', role: 'opiekun', ...over });
    const planista = (over: Partial<UserRow> = {}): UserRow =>
      makeRow({ id: 'u-pl', login: 'pl', email: 'pl@magtrans.eu', role: 'planista', ...over });

    // ── grant / revoke ──

    it('grants carrier_documents.read/.add to a przewoznik — stored in catalog order', async () => {
      const { svc, repo } = makeService([carrier()]);

      const out = await svc.update('u-car', { extraPermissions: [ADD, READ] });

      expect(repo.update).toHaveBeenCalledWith('u-car', { extraPermissions: [READ, ADD] });
      expect(out).toMatchObject({ extraPermissions: [READ, ADD], deniedPermissions: [] });
    });

    it('[] clears the stored list', async () => {
      const { svc, repo } = makeService([carrier({ extraPermissions: [READ, ADD] })]);

      await expect(svc.update('u-car', { extraPermissions: [] })).resolves.toMatchObject({
        extraPermissions: [],
      });
      expect(repo.update).toHaveBeenCalledWith('u-car', { extraPermissions: [] });
    });

    it('revokes a right the role grants', async () => {
      const { svc, repo } = makeService([opiekun()]);

      await expect(svc.update('u-op', { deniedPermissions: [DELETE] })).resolves.toMatchObject({
        deniedPermissions: [DELETE],
      });
      expect(repo.update).toHaveBeenCalledWith('u-op', { deniedPermissions: [DELETE] });
    });

    // ── 422s ──

    it('422 USER_PERMISSION_NOT_GRANTABLE: carrier_documents.delete to a przewoznik', async () => {
      const { svc, repo } = makeService([carrier()]);

      await expect(svc.update('u-car', { extraPermissions: [READ, DELETE] })).rejects.toMatchObject(
        refused('USER_PERMISSION_NOT_GRANTABLE', [DELETE]),
      );
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('422 USER_PERMISSION_NOT_GRANTABLE: any extra on a role without grantable rights', async () => {
      const { svc } = makeService([planista()]);

      await expect(svc.update('u-pl', { extraPermissions: ['claims.verify', READ] })).rejects.toMatchObject(
        refused('USER_PERMISSION_NOT_GRANTABLE', ['claims.verify', READ]),
      );
    });

    it('422 USER_PERMISSION_NOT_REVOCABLE: a right the role does not have', async () => {
      const { svc, repo } = makeService([planista()]);

      await expect(
        svc.update('u-pl', { deniedPermissions: ['vehicles.read', 'claims.verify'] }),
      ).rejects.toMatchObject(refused('USER_PERMISSION_NOT_REVOCABLE', ['claims.verify']));
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('the leader flag counts: decide is revocable only from a lider planista', async () => {
      const plain = makeService([planista({ lider: false })]);
      await expect(plain.svc.update('u-pl', { deniedPermissions: [DECIDE] })).rejects.toMatchObject(
        refused('USER_PERMISSION_NOT_REVOCABLE', [DECIDE]),
      );

      const lead = makeService([planista({ lider: true })]);
      await expect(lead.svc.update('u-pl', { deniedPermissions: [DECIDE] })).resolves.toMatchObject({
        deniedPermissions: [DECIDE],
      });
    });

    it('422 USER_ADMIN_CANNOT_BE_DENIED: no denial on an admin (decision Q4)', async () => {
      const { svc, repo } = makeService([makeRow({ id: 'u-adm', role: 'admin' })]);

      await expect(svc.update('u-adm', { deniedPermissions: ['users.manage'] })).rejects.toMatchObject(
        refused('USER_ADMIN_CANNOT_BE_DENIED', ['users.manage']),
      );
      expect(repo.update).not.toHaveBeenCalled();
      // An empty list is not a denial.
      await expect(svc.update('u-adm', { deniedPermissions: [] })).resolves.toMatchObject({
        deniedPermissions: [],
      });
    });

    it('judged on the MERGED row: the role of the same body, not the stored one', async () => {
      const toPlanista = makeService([opiekun()]);
      await expect(
        toPlanista.svc.update('u-op', { role: 'planista', deniedPermissions: [DELETE] }),
      ).rejects.toMatchObject(refused('USER_PERMISSION_NOT_REVOCABLE', [DELETE]));

      const toAdmin = makeService([opiekun()]);
      await expect(
        toAdmin.svc.update('u-op', { role: 'admin', deniedPermissions: ['vehicles.read'] }),
      ).rejects.toMatchObject(refused('USER_ADMIN_CANNOT_BE_DENIED', ['vehicles.read']));

      const ok = makeService([opiekun()]);
      await expect(
        ok.svc.update('u-op', { role: 'planista', deniedPermissions: ['vehicles.read'] }),
      ).resolves.toMatchObject({ role: 'planista', deniedPermissions: ['vehicles.read'] });
    });

    // ── prune on a role / leader change ──

    it('a role change prunes the stored denials the new role does not have', async () => {
      const { svc, repo } = makeService([opiekun({ deniedPermissions: [DELETE, 'vehicles.read'] })]);

      const out = await svc.update('u-op', { role: 'planista' });

      expect(repo.update).toHaveBeenCalledWith('u-op', {
        role: 'planista',
        extraPermissions: [],
        deniedPermissions: ['vehicles.read'],
      });
      expect(out.deniedPermissions).toEqual(['vehicles.read']);
    });

    it('a role change to admin drops every stored denial', async () => {
      const { svc } = makeService([opiekun({ deniedPermissions: ['vehicles.read'] })]);

      await expect(svc.update('u-op', { role: 'admin' })).resolves.toMatchObject({
        role: 'admin',
        deniedPermissions: [],
      });
    });

    it('a leader change prunes a denied leader right', async () => {
      const { svc, repo } = makeService([planista({ lider: true, deniedPermissions: [DECIDE] })]);

      await expect(svc.update('u-pl', { lider: false })).resolves.toMatchObject({
        lider: false,
        deniedPermissions: [],
      });
      expect(repo.update).toHaveBeenCalledWith('u-pl', {
        lider: false,
        extraPermissions: [],
        deniedPermissions: [],
      });
    });

    it('nothing to prune → the UPDATE is exactly what it was before B6', async () => {
      const { svc, repo } = makeService([opiekun({ deniedPermissions: ['vehicles.read'] })]);

      await svc.update('u-op', { role: 'planista' });

      expect(repo.update).toHaveBeenCalledWith('u-op', { role: 'planista' });
    });

    it('no role / leader change → stored lists are left alone, even inert entries', async () => {
      const { svc, repo } = makeService([opiekun({ deniedPermissions: ['gone.permission'] })]);

      await svc.update('u-op', { name: 'Nowa nazwa' });

      expect(repo.update).toHaveBeenCalledWith('u-op', { name: 'Nowa nazwa' });
    });

    it('the updateUser audit row covers the prune: before has the old list, the response the new one', async () => {
      const existing = opiekun({ deniedPermissions: [DELETE] });
      const { svc } = makeService([existing]);
      const store: AuditContextStore = {
        actor: { userId: 'admin-1', userRole: 'admin' } as AuditContextStore['actor'],
        ipAddress: null,
      };

      const out = await AuditContext.run(store, () => svc.update('u-op', { role: 'planista' }));

      expect(store.before).toMatchObject({ role: 'opiekun', deniedPermissions: [DELETE] });
      expect(out).toMatchObject({ role: 'planista', deniedPermissions: [] });
    });

    // ── directory-managed accounts ──

    it('both lists are editable on a managedBy = magspace account', async () => {
      const { svc, repo } = makeService([
        planista({ managedBy: 'magspace', authProvider: 'google', magspaceEmployeeId: 'e-1' }),
      ]);

      await expect(svc.update('u-pl', { deniedPermissions: ['gps.read'] })).resolves.toMatchObject({
        deniedPermissions: ['gps.read'],
      });
      expect(repo.update).toHaveBeenCalledWith('u-pl', { deniedPermissions: ['gps.read'] });
    });

    // ── decision Q5: a carrier keeps its role ──

    it('422 USER_CARRIER_ROLE_LOCKED: a role in the body of a przewoznik row (bug fix Q5)', async () => {
      const { svc, repo } = makeService([carrier()]);

      await expect(svc.update('u-car', { role: 'pracownik', name: 'X' })).rejects.toMatchObject({
        status: 422,
        response: { extensions: { code: 'USER_CARRIER_ROLE_LOCKED' } },
      });
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('a przewoznik row without a role in the body is edited as before', async () => {
      const { svc } = makeService([carrier()]);

      await expect(
        svc.update('u-car', { name: 'Firma X', extraPermissions: [READ] }),
      ).resolves.toMatchObject({ role: 'przewoznik', name: 'Firma X', extraPermissions: [READ] });
    });

    it('the refusal is specific to przewoznik rows — other roles still change role', async () => {
      const { svc } = makeService([opiekun()]);

      await expect(svc.update('u-op', { role: 'pracownik' })).resolves.toMatchObject({ role: 'pracownik' });
    });

    // ── DTO ──

    it('toDto: both lists, unknown stored ids removed, catalog order', () => {
      const { svc } = makeService();

      const dto = svc.toDto(
        carrier({ extraPermissions: [ADD, 'gone.permission', READ], deniedPermissions: ['x.y'] }),
      );

      expect(dto.extraPermissions).toEqual([READ, ADD]);
      expect(dto.deniedPermissions).toEqual([]);
    });
  });
});
