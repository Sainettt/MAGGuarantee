import { ConflictException, NotFoundException } from '@nestjs/common';

import { AuditContext, type AuditContextStore } from '../../common/audit';
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
});
