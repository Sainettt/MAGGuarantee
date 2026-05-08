import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { PasswordService } from '../auth/password.service';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type { UserRow } from '../users/users.repository';
import { UsersRepository } from '../users/users.repository';
import {
  CarriersRepository,
  type CarrierRow,
} from './carriers.repository';
import { CarriersService } from './carriers.service';

const NOW = new Date('2026-05-01T10:00:00.000Z');

function makeCarrier(overrides: Partial<CarrierRow> = {}): CarrierRow {
  return {
    id: 'c-1',
    userId: 'u-c-1',
    login: 'pwz1',
    email: 'p@example.com',
    name: 'Pwz One',
    company: null,
    active: true,
    nip: '0000000000',
    vatId: 'PL0000000000',
    // Required post-phase3_blocks.
    contactPerson: 'Jan Kontakt',
    phone: '+48000000000',
    ordersEmail: 'zlecenia@example.com',
    accountEur: 'PL00 0000 0000 0000',
    accountPln: null,
    paymentTerms: 30,
    insuranceValue: 0,
    insuranceExpiry: NOW,
    licenseExpiry: NOW,
    numberOfPermits: null,
    companyAddress: 'ul. Testowa 1',
    opiekunId: 'op-fixture',
    opiekun: { id: 'op-fixture', login: 'op', name: null },
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function makeUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'u-1',
    login: 'op1',
    email: 'op1@magtrans.eu',
    passwordHash: 'hash',
    role: 'opiekun',
    name: 'Op One',
    active: true,
    liderEmail: null,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function makeAuth(role: AuthUser['role'], sub = 'u-actor'): AuthUser {
  return {
    sub,
    login: 'actor',
    email: 'actor@magtrans.eu',
    name: 'Actor',
    role,
  };
}

function makeCarriersRepo(seed: CarrierRow[] = []): CarriersRepository {
  const rows = new Map<string, CarrierRow>();
  for (const r of seed) rows.set(r.id, r);
  return {
    findById: jest.fn(async (id: string) => rows.get(id) ?? null),
    findByLogin: jest.fn(async (login: string) =>
      [...rows.values()].find((r) => r.login === login) ?? null,
    ),
    list: jest.fn(
      async (filters: {
        opiekunId?: string;
        active?: boolean;
        q?: string;
        limit: number;
        cursor?: string;
      }) => {
        let arr = [...rows.values()];
        if (filters.opiekunId)
          arr = arr.filter((r) => r.opiekunId === filters.opiekunId);
        if (typeof filters.active === 'boolean')
          arr = arr.filter((r) => r.active === filters.active);
        return arr.slice(0, filters.limit + 1);
      },
    ),
    create: jest.fn(async (data) => {
      if ([...rows.values()].some((r) => r.login === data.login)) {
        throw Object.assign(new Error('P2002'), {
          code: 'P2002',
          meta: { target: ['login'] },
        });
      }
      const opiekunId = data.opiekunId ?? 'op-fixture';
      const row = makeCarrier({
        id: `c-${rows.size + 1}`,
        userId: `u-c-${rows.size + 1}`,
        login: data.login,
        email: data.email ?? null,
        name: data.name,
        company: data.company ?? null,
        phone: data.phone ?? '+48000000000',
        opiekunId,
        opiekun: { id: opiekunId, login: 'op', name: null },
      });
      rows.set(row.id, row);
      return row;
    }),
    update: jest.fn(async (id: string, patch: Record<string, unknown>) => {
      const cur = rows.get(id);
      if (!cur) throw new Error('not found');
      const next: CarrierRow = { ...cur, ...(patch as Partial<CarrierRow>) };
      rows.set(id, next);
      return next;
    }),
    setActive: jest.fn(async (id: string, active: boolean) => {
      const cur = rows.get(id);
      if (!cur) throw new Error('not found');
      const next = { ...cur, active };
      rows.set(id, next);
      return next;
    }),
    softDelete: jest.fn(async (id: string) => {
      const cur = rows.get(id);
      if (cur) rows.set(id, { ...cur, deletedAt: NOW });
    }),
  } as unknown as CarriersRepository;
}

function makeUsersRepo(seed: UserRow[] = []): UsersRepository {
  const map = new Map<string, UserRow>();
  for (const r of seed) map.set(r.id, r);
  return {
    findById: jest.fn(async (id: string) => map.get(id) ?? null),
  } as unknown as UsersRepository;
}

function makePasswords(): PasswordService {
  return {
    hash: jest.fn(async (s: string) => `hashed:${s}`),
    compareConstantTime: jest.fn(async () => true),
  } as unknown as PasswordService;
}

describe('CarriersService', () => {
  it('admin must specify opiekunId — service rejects when omitted (422)', async () => {
    // Phase 2 migration made Carrier.opiekunId NOT NULL. The schema enforces
    // presence; this test exercises the service-side defense-in-depth path.
    const carriers = makeCarriersRepo();
    const users = makeUsersRepo();
    const svc = new CarriersService(carriers, users, makePasswords());
    await expect(
      svc.create(makeAuth('admin', 'a-1'), {
        login: 'pwz-new',
        email: 'p@example.com',
        name: 'Pwz New',
        phone: '+48000000000',
      } as never),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('opiekun caller auto-assigns opiekunId=self', async () => {
    const carriers = makeCarriersRepo();
    const users = makeUsersRepo();
    const svc = new CarriersService(carriers, users, makePasswords());
    const out = await svc.create(makeAuth('opiekun', 'op-1'), {
      login: 'pwz1',
      email: 'p@example.com',
      name: 'Pwz One',
      phone: '+48000000000',
    } as never);
    expect(out.opiekunId).toBe('op-1');
  });

  it('opiekun cannot create a carrier under a different opiekun', async () => {
    const carriers = makeCarriersRepo();
    const users = makeUsersRepo();
    const svc = new CarriersService(carriers, users, makePasswords());
    await expect(
      svc.create(makeAuth('opiekun', 'op-1'), {
        login: 'pwz1',
        email: 'p@example.com',
        name: 'P',
        phone: '+48000000000',
        opiekunId: 'op-2',
      } as never),
    ).rejects.toThrow(ForbiddenException);
  });

  it('admin assigning a non-opiekun user as opiekunId → 422', async () => {
    const wrongRole = makeUser({ id: 'u-x', role: 'planista' });
    const carriers = makeCarriersRepo();
    const users = makeUsersRepo([wrongRole]);
    const svc = new CarriersService(carriers, users, makePasswords());
    await expect(
      svc.create(makeAuth('admin', 'a-1'), {
        login: 'pwz1',
        email: 'p@example.com',
        name: 'P',
        phone: '+48000000000',
        opiekunId: 'u-x',
      } as never),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('admin assigning a missing user as opiekunId → 422', async () => {
    const carriers = makeCarriersRepo();
    const users = makeUsersRepo();
    const svc = new CarriersService(carriers, users, makePasswords());
    await expect(
      svc.create(makeAuth('admin', 'a-1'), {
        login: 'pwz1',
        email: 'p@example.com',
        name: 'P',
        phone: '+48000000000',
        opiekunId: 'missing',
      } as never),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('admin assigning an inactive opiekun → 422', async () => {
    const inactive = makeUser({ id: 'u-x', role: 'opiekun', active: false });
    const carriers = makeCarriersRepo();
    const users = makeUsersRepo([inactive]);
    const svc = new CarriersService(carriers, users, makePasswords());
    await expect(
      svc.create(makeAuth('admin', 'a-1'), {
        login: 'pwz1',
        email: 'p@example.com',
        name: 'P',
        phone: '+48000000000',
        opiekunId: 'u-x',
      } as never),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('admin assigning a valid active opiekun succeeds', async () => {
    const opiekun = makeUser({ id: 'op-1', role: 'opiekun', active: true });
    const carriers = makeCarriersRepo();
    const users = makeUsersRepo([opiekun]);
    const svc = new CarriersService(carriers, users, makePasswords());
    const out = await svc.create(makeAuth('admin', 'a-1'), {
      login: 'pwz1',
      email: 'p@example.com',
      name: 'P',
      phone: '+48000000000',
      opiekunId: 'op-1',
    } as never);
    expect(out.opiekunId).toBe('op-1');
  });

  it('list scopes opiekun caller to their own carriers', async () => {
    const c1 = makeCarrier({ id: 'c-mine', login: 'a', opiekunId: 'op-1' });
    const c2 = makeCarrier({ id: 'c-other', login: 'b', opiekunId: 'op-2' });
    const carriers = makeCarriersRepo([c1, c2]);
    const svc = new CarriersService(carriers, makeUsersRepo(), makePasswords());
    const out = await svc.list(makeAuth('opiekun', 'op-1'), { limit: 50 });
    expect(out.items).toHaveLength(1);
    expect(out.items[0]?.id).toBe('c-mine');
  });

  it('list rejects roles outside admin/opiekun', async () => {
    const carriers = makeCarriersRepo();
    const svc = new CarriersService(carriers, makeUsersRepo(), makePasswords());
    await expect(
      svc.list(makeAuth('przewoznik', 'p-1'), { limit: 50 }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('list rejects pracownik (narrow claims-only role)', async () => {
    // Per docs/03-roles.md#pracownik the pracownik role has no carrier
    // visibility — only claims verification + dashboard.
    const carriers = makeCarriersRepo();
    const svc = new CarriersService(carriers, makeUsersRepo(), makePasswords());
    await expect(
      svc.list(makeAuth('pracownik', 'pr-1'), { limit: 50 }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('duplicate login on create → ConflictException', async () => {
    const dup = makeCarrier({ login: 'taken' });
    const opiekun = makeUser({ id: 'op-1', role: 'opiekun', active: true });
    const carriers = makeCarriersRepo([dup]);
    const svc = new CarriersService(
      carriers,
      makeUsersRepo([opiekun]),
      makePasswords(),
    );
    await expect(
      svc.create(makeAuth('admin', 'a-1'), {
        login: 'taken',
        email: 'b@example.com',
        name: 'B',
        phone: '+48000000000',
        opiekunId: 'op-1',
      } as never),
    ).rejects.toThrow(ConflictException);
  });

  it('getById on missing carrier → 404', async () => {
    const svc = new CarriersService(
      makeCarriersRepo(),
      makeUsersRepo(),
      makePasswords(),
    );
    await expect(svc.getById('missing')).rejects.toThrow(NotFoundException);
  });
});
