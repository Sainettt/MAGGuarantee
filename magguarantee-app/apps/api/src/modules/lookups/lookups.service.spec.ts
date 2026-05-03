import { UsersRepository, type UserRow } from '../users/users.repository';
import { LookupsService } from './lookups.service';

const NOW = new Date('2026-05-01T10:00:00.000Z');

function makeUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'u-1',
    login: 'user',
    email: 'u@example.com',
    passwordHash: null,
    role: 'opiekun',
    name: 'Name',
    company: null,
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

function makeRepo(byRole: Record<UserRow['role'], UserRow[]>): UsersRepository {
  return {
    listByRole: jest.fn(async (role: UserRow['role']) => byRole[role] ?? []),
  } as unknown as UsersRepository;
}

describe('LookupsService', () => {
  it('returns dyspozytor users with id/login/name', async () => {
    const users = [
      makeUser({ id: 'u-d-1', role: 'dyspozytor', login: 'd1', name: 'D1' }),
      makeUser({ id: 'u-d-2', role: 'dyspozytor', login: 'd2', name: 'D2' }),
    ];
    const svc = new LookupsService(
      makeRepo({
        dyspozytor: users,
        admin: [],
        pracownik: [],
        opiekun: [],
        planista: [],
        przewoznik: [],
        eksport: [],
        weryfikator: [],
      }),
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
      makeRepo({
        planista: [u],
        admin: [],
        pracownik: [],
        opiekun: [],
        dyspozytor: [],
        przewoznik: [],
        eksport: [],
        weryfikator: [],
      }),
    );
    const out = await svc.planisci();
    expect(out).toEqual([{ id: 'u-p-1', login: 'p1', name: 'Name' }]);
  });

  it('returns opiekuni by role=opiekun', async () => {
    const u = makeUser({ id: 'u-o-1', role: 'opiekun' });
    const svc = new LookupsService(
      makeRepo({
        opiekun: [u],
        admin: [],
        pracownik: [],
        planista: [],
        dyspozytor: [],
        przewoznik: [],
        eksport: [],
        weryfikator: [],
      }),
    );
    const out = await svc.opiekuni();
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('u-o-1');
  });

  it('certTypes echoes the static enum', () => {
    const svc = new LookupsService(
      makeRepo({
        admin: [],
        pracownik: [],
        opiekun: [],
        planista: [],
        dyspozytor: [],
        przewoznik: [],
        eksport: [],
        weryfikator: [],
      }),
    );
    expect(svc.certTypes()).toEqual(['L1', 'L2', 'L3']);
  });
});
