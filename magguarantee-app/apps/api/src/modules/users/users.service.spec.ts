import { ConflictException, NotFoundException } from '@nestjs/common';

import { PasswordService } from '../auth/password.service';
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
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
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

describe('UsersService', () => {
  it('creates a user and returns the temporary password (when none provided)', async () => {
    const repo = makeRepo();
    const svc = new UsersService(repo, makePasswords());
    const out = await svc.create({
      login: 'kasia',
      email: 'kasia@magtrans.eu',
      name: 'Kasia',
      role: 'pracownik',
    });
    expect(out.login).toBe('kasia');
    expect(out.role).toBe('pracownik');
    expect(out.temporaryPassword).toMatch(/.{10,}/);
  });

  it('rejects role=przewoznik (must use POST /carriers)', async () => {
    const svc = new UsersService(makeRepo(), makePasswords());
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
    const repo = makeRepo([makeRow({ id: 'u-1', login: 'admin' })]);
    const svc = new UsersService(repo, makePasswords());
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
    const svc = new UsersService(makeRepo(), makePasswords());
    await expect(svc.getById('missing')).rejects.toThrow(NotFoundException);
  });

  it('list returns DTOs with pagination cursor when more rows exist', async () => {
    const repo = makeRepo(
      Array.from({ length: 3 }, (_, i) =>
        makeRow({ id: `u-${i}`, login: `l${i}` }),
      ),
    );
    const svc = new UsersService(repo, makePasswords());
    const out = await svc.list({ limit: 2 });
    expect(out.items).toHaveLength(2);
    expect(out.nextCursor).toBe('u-1');
  });

  it('deactivate flips active=false and rejects double-deactivate', async () => {
    const row = makeRow({ id: 'u-1', active: true });
    const repo = makeRepo([row]);
    const svc = new UsersService(repo, makePasswords());
    const out = await svc.deactivate('u-1');
    expect(out.active).toBe(false);
    await expect(svc.deactivate('u-1')).rejects.toThrow(ConflictException);
  });

  it('reactivate flips active=true and rejects double-reactivate', async () => {
    const row = makeRow({ id: 'u-1', active: false });
    const repo = makeRepo([row]);
    const svc = new UsersService(repo, makePasswords());
    const out = await svc.reactivate('u-1');
    expect(out.active).toBe(true);
    await expect(svc.reactivate('u-1')).rejects.toThrow(ConflictException);
  });

  it('resetPassword issues a fresh temp password and persists hash', async () => {
    const row = makeRow({ id: 'u-1', passwordHash: 'old' });
    const repo = makeRepo([row]);
    const svc = new UsersService(repo, makePasswords());
    const out = await svc.resetPassword('u-1');
    expect(out.temporaryPassword).toMatch(/.{10,}/);
    expect(repo.update).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({
        passwordHash: expect.stringContaining('hashed:'),
      }),
    );
  });

  it('softDelete throws 404 for unknown id', async () => {
    const svc = new UsersService(makeRepo(), makePasswords());
    await expect(svc.softDelete('missing')).rejects.toThrow(NotFoundException);
  });

  it('update rejects role=przewoznik change', async () => {
    const row = makeRow({ id: 'u-1', role: 'pracownik' });
    const repo = makeRepo([row]);
    const svc = new UsersService(repo, makePasswords());
    await expect(
      svc.update('u-1', {
        role: 'przewoznik' as unknown as 'admin',
      }),
    ).rejects.toThrow();
  });

  it('toDto serializes timestamps as ISO', () => {
    const row = makeRow({
      lastLoginAt: new Date('2026-05-01T10:00:00.000Z'),
    });
    const svc = new UsersService(makeRepo(), makePasswords());
    const dto = svc.toDto(row);
    expect(dto.lastLoginAt).toBe('2026-05-01T10:00:00.000Z');
    expect(dto.createdAt).toBe('2026-05-01T10:00:00.000Z');
  });
});
