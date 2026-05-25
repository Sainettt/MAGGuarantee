import { ForbiddenException } from '@nestjs/common';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import {
  CarriersRepository,
  type CarrierListFilters,
  type CarrierRow,
} from '../carriers/carriers.repository';
import { UsersRepository, type UserRow } from '../users/users.repository';
import { LookupsService } from './lookups.service';

const NOW = new Date('2026-05-01T10:00:00.000Z');

function makeUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'u-1',
    login: 'user',
    email: 'u@example.com',
    passwordHash: 'hash',
    role: 'opiekun',
    name: 'Name',
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
    vatId: null,
    contactPerson: 'Jan Kontakt',
    phone: '+48000000000',
    ordersEmail: 'zlecenia@example.com',
    accountEur: 'PL00',
    accountPln: null,
    paymentTerms: 30,
    insuranceValue: 100000,
    insuranceExpiry: NOW,
    licenseExpiry: NOW,
    numberOfVehicle: null,
    companyAddress: 'ul. Testowa 1',
    counts: { vehicles: 1, trailers: 1, drivers: 1 },
    opiekunId: 'op-1',
    opiekun: { id: 'op-1', login: 'op', name: null },
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function makeUsersRepo(
  byRole: Record<UserRow['role'], UserRow[]>,
): UsersRepository {
  return {
    listByRole: jest.fn(async (role: UserRow['role']) => byRole[role] ?? []),
  } as unknown as UsersRepository;
}

function makeEmptyUsersRepo(): UsersRepository {
  return makeUsersRepo({
    admin: [],
    pracownik: [],
    opiekun: [],
    planista: [],
    dyspozytor: [],
    przewoznik: [],
    eksport: [],
    weryfikator: [],
  });
}

function makeCarriersRepo(
  rows: CarrierRow[] = [],
  capturedFilters?: { value?: CarrierListFilters },
): CarriersRepository {
  return {
    list: jest.fn(async (filters: CarrierListFilters) => {
      if (capturedFilters) capturedFilters.value = filters;
      let out = [...rows];
      if (filters.opiekunId) {
        out = out.filter((r) => r.opiekunId === filters.opiekunId);
      }
      if (filters.q) {
        const q = filters.q.toLowerCase();
        out = out.filter(
          (r) =>
            r.login.toLowerCase().includes(q) ||
            (r.name ?? '').toLowerCase().includes(q),
        );
      }
      return out.slice(0, filters.limit);
    }),
  } as unknown as CarriersRepository;
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

describe('LookupsService — people pickers', () => {
  it('returns dyspozytor users with id/login/name', async () => {
    const users = [
      makeUser({ id: 'u-d-1', role: 'dyspozytor', login: 'd1', name: 'D1' }),
      makeUser({ id: 'u-d-2', role: 'dyspozytor', login: 'd2', name: 'D2' }),
    ];
    const svc = new LookupsService(
      makeUsersRepo({
        dyspozytor: users,
        admin: [],
        pracownik: [],
        opiekun: [],
        planista: [],
        przewoznik: [],
        eksport: [],
        weryfikator: [],
      }),
      makeCarriersRepo(),
    );
    const out = await svc.dyspozytor();
    expect(out).toEqual([
      { id: 'u-d-1', login: 'd1', name: 'D1' },
      { id: 'u-d-2', login: 'd2', name: 'D2' },
    ]);
  });

  it('returns planisci by role=planista', async () => {
    const u = makeUser({ id: 'u-p-1', role: 'planista', login: 'p1' });
    const svc = new LookupsService(
      makeUsersRepo({
        planista: [u],
        admin: [],
        pracownik: [],
        opiekun: [],
        dyspozytor: [],
        przewoznik: [],
        eksport: [],
        weryfikator: [],
      }),
      makeCarriersRepo(),
    );
    const out = await svc.planisci();
    expect(out).toEqual([{ id: 'u-p-1', login: 'p1', name: 'Name' }]);
  });

  it('returns opiekuni by role=opiekun', async () => {
    const u = makeUser({ id: 'u-o-1', role: 'opiekun' });
    const svc = new LookupsService(
      makeUsersRepo({
        opiekun: [u],
        admin: [],
        pracownik: [],
        planista: [],
        dyspozytor: [],
        przewoznik: [],
        eksport: [],
        weryfikator: [],
      }),
      makeCarriersRepo(),
    );
    const out = await svc.opiekuni();
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('u-o-1');
  });
});

describe('LookupsService — carriers picker (Phase 4.4)', () => {
  it('admin sees all carriers (q omitted)', async () => {
    const all = [
      makeCarrier({ id: 'c-1', login: 'a' }),
      makeCarrier({ id: 'c-2', login: 'b', opiekunId: 'other' }),
    ];
    const captured: { value?: CarrierListFilters } = {};
    const svc = new LookupsService(
      makeEmptyUsersRepo(),
      makeCarriersRepo(all, captured),
    );
    const out = await svc.carriersList(makeAuth('admin'), {});
    expect(out.map((r) => r.id)).toEqual(['c-1', 'c-2']);
    // No opiekunId scope leaked into the repo filter.
    expect(captured.value?.opiekunId).toBeUndefined();
    // Cap is forwarded.
    expect(captured.value?.limit).toBe(100);
  });

  it('pracownik sees all carriers', async () => {
    const all = [makeCarrier({ id: 'c-1' }), makeCarrier({ id: 'c-2', opiekunId: 'x' })];
    const svc = new LookupsService(
      makeEmptyUsersRepo(),
      makeCarriersRepo(all),
    );
    const out = await svc.carriersList(makeAuth('pracownik'), {});
    expect(out).toHaveLength(2);
  });

  it('opiekun sees only carriers under their own ownership', async () => {
    const all = [
      makeCarrier({ id: 'c-1', login: 'mine', opiekunId: 'op-self' }),
      makeCarrier({ id: 'c-2', login: 'not-mine', opiekunId: 'op-other' }),
    ];
    const captured: { value?: CarrierListFilters } = {};
    const svc = new LookupsService(
      makeEmptyUsersRepo(),
      makeCarriersRepo(all, captured),
    );
    const out = await svc.carriersList(makeAuth('opiekun', 'op-self'), {});
    expect(out.map((r) => r.id)).toEqual(['c-1']);
    // opiekunId filter is wired to the caller's sub.
    expect(captured.value?.opiekunId).toBe('op-self');
  });

  it.each(['planista', 'dyspozytor', 'przewoznik', 'eksport', 'weryfikator'] as const)(
    'rejects role=%s with 403',
    async (role) => {
      const svc = new LookupsService(
        makeEmptyUsersRepo(),
        makeCarriersRepo([]),
      );
      await expect(
        svc.carriersList(makeAuth(role), {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it('forwards q to the repo (substring match)', async () => {
    const all = [
      makeCarrier({ id: 'c-1', login: 'transport-foo', name: 'Foo Sp.' }),
      makeCarrier({ id: 'c-2', login: 'transport-bar', name: 'Bar Sp.' }),
    ];
    const captured: { value?: CarrierListFilters } = {};
    const svc = new LookupsService(
      makeEmptyUsersRepo(),
      makeCarriersRepo(all, captured),
    );
    const out = await svc.carriersList(makeAuth('admin'), { q: 'foo' });
    expect(captured.value?.q).toBe('foo');
    expect(out.map((r) => r.id)).toEqual(['c-1']);
  });

  it('maps repo rows to compact dto with active flag', async () => {
    const all = [
      makeCarrier({ id: 'c-1', login: 'live', name: 'Live', active: true }),
      makeCarrier({ id: 'c-2', login: 'dead', name: 'Dead', active: false }),
    ];
    const svc = new LookupsService(
      makeEmptyUsersRepo(),
      makeCarriersRepo(all),
    );
    const out = await svc.carriersList(makeAuth('admin'), {});
    expect(out).toEqual([
      { id: 'c-1', login: 'live', name: 'Live', active: true },
      { id: 'c-2', login: 'dead', name: 'Dead', active: false },
    ]);
  });
});
