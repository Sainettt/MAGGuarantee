import { ForbiddenException } from '@nestjs/common';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import {
  CarriersRepository,
  type CarrierListFilters,
  type CarrierRow,
} from '../carriers/carriers.repository';
import { TeamsService } from '../teams/teams.service';
import { UsersRepository, type UserRow } from '../users/users.repository';
import type { VehiclesRepository } from '../vehicles/vehicles.repository';
import { LookupsService } from './lookups.service';
import { makeAuthUser, withoutPermission } from '../../common/testing/make-auth-user';

/** TeamsService stub — only `lookup()` is exercised by LookupsService. */
function makeTeamsService(
  teams: Awaited<ReturnType<TeamsService['lookup']>> = [],
): TeamsService {
  return { lookup: jest.fn(async () => teams) } as unknown as TeamsService;
}

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
  return makeAuthUser(role, {
    sub,
    login: 'actor',
    email: 'actor@magtrans.eu',
    name: 'Actor',
    mustChangePassword: false,
  });
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
      makeTeamsService(),
    );
    const out = await svc.dyspozytor();
    expect(out).toEqual([
      { id: 'u-d-1', login: 'd1', name: 'D1', lider: false },
      { id: 'u-d-2', login: 'd2', name: 'D2', lider: false },
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
      makeTeamsService(),
    );
    const out = await svc.planisci();
    expect(out).toEqual([{ id: 'u-p-1', login: 'p1', name: 'Name', lider: false }]);
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
      makeTeamsService(),
    );
    const out = await svc.opiekuni();
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('u-o-1');
  });

  it('lists a leader as its base role and flags it (docs/28)', async () => {
    const plain = makeUser({ id: 'u-p-1', role: 'planista', login: 'p1', name: 'P1' });
    const lead = makeUser({ id: 'u-p-2', role: 'planista', login: 'plead', name: 'Lead', lider: true });
    const svc = new LookupsService(
      makeUsersRepo({
        planista: [plain, lead],
        admin: [],
        pracownik: [],
        opiekun: [],
        dyspozytor: [],
        przewoznik: [],
        eksport: [],
        weryfikator: [],
      }),
      makeCarriersRepo(),
      makeTeamsService(),
    );
    await expect(svc.planisci()).resolves.toEqual([
      { id: 'u-p-1', login: 'p1', name: 'P1', lider: false },
      { id: 'u-p-2', login: 'plead', name: 'Lead', lider: true },
    ]);
  });
});

describe('LookupsService — admin users picker', () => {
  it('maps rows to the compact admin DTO, leader flag included', async () => {
    const rows = [
      makeUser({ id: 'u-1', login: 'eksplead', role: 'eksport', lider: true }),
      makeUser({ id: 'u-2', login: 'wer', role: 'weryfikator', active: false }),
    ];
    const users = {
      searchAdmin: jest.fn(async () => rows),
    } as unknown as UsersRepository;
    const svc = new LookupsService(users, makeCarriersRepo(), makeTeamsService());

    const out = await svc.usersListAdmin(makeAuth('admin'), { q: 'e' });

    expect(users.searchAdmin).toHaveBeenCalledWith({ q: 'e', limit: 100 });
    expect(out).toEqual([
      { id: 'u-1', login: 'eksplead', name: 'Name', role: 'eksport', lider: true, active: true },
      { id: 'u-2', login: 'wer', name: 'Name', role: 'weryfikator', lider: false, active: false },
    ]);
  });

  it('403 for a non-admin caller', async () => {
    const svc = new LookupsService(makeEmptyUsersRepo(), makeCarriersRepo(), makeTeamsService());
    await expect(svc.usersListAdmin(makeAuth('planista'), {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('is decided by users.manage, not by the role: an admin without it gets 403', async () => {
    const svc = new LookupsService(makeEmptyUsersRepo(), makeCarriersRepo(), makeTeamsService());
    await expect(
      svc.usersListAdmin(withoutPermission(makeAuth('admin'), 'users.manage'), {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
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
      makeTeamsService(),
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
      makeTeamsService(),
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
      makeTeamsService(),
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
        makeTeamsService(),
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
      makeTeamsService(),
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
      makeTeamsService(),
    );
    const out = await svc.carriersList(makeAuth('admin'), {});
    expect(out).toEqual([
      { id: 'c-1', login: 'live', name: 'Live', active: true },
      { id: 'c-2', login: 'dead', name: 'Dead', active: false },
    ]);
  });
});

// ── docs/29 — planista pickers ──────────────────────────────

describe('LookupsService — transfer targets + lider picker (docs/29)', () => {
  const planisci = [
    makeUser({ id: 'p-1', login: 'p1', role: 'planista' }),
    makeUser({ id: 'p-2', login: 'p2', role: 'planista', lider: true }),
    makeUser({ id: 'p-3', login: 'p3', role: 'planista' }),
  ];
  const users = (): UsersRepository =>
    ({
      listByRole: jest.fn(async (role: UserRow['role']) => (role === 'planista' ? planisci : [])),
      listActiveLiderPlanisci: jest.fn(async () => planisci.filter((p) => p.lider)),
    }) as unknown as UsersRepository;
  const vehicles = (plannerId: string | null): VehiclesRepository =>
    ({
      findById: jest.fn(async (id: string) => (id === 'v-1' ? { id, plannerId } : null)),
    }) as unknown as VehiclesRepository;

  it('transfer targets = active planisci minus the vehicle’s current planista (U2)', async () => {
    const svc = new LookupsService(users(), makeCarriersRepo(), makeTeamsService(), vehicles('p-2'));
    const out = await svc.plannerTransferTargets('v-1');
    expect(out.map((u) => u.id)).toEqual(['p-1', 'p-3']);
  });

  it('without a vehicle (or an unknown one) nobody is excluded', async () => {
    const svc = new LookupsService(users(), makeCarriersRepo(), makeTeamsService(), vehicles('p-2'));
    expect((await svc.plannerTransferTargets()).map((u) => u.id)).toEqual(['p-1', 'p-2', 'p-3']);
    expect((await svc.plannerTransferTargets('v-unknown')).map((u) => u.id)).toEqual([
      'p-1',
      'p-2',
      'p-3',
    ]);
  });

  it('lider picker = active planisci with lider=true (U9)', async () => {
    const svc = new LookupsService(users(), makeCarriersRepo(), makeTeamsService());
    expect(await svc.planistaLiders()).toEqual([
      { id: 'p-2', login: 'p2', name: 'Name', lider: true },
    ]);
  });
});
