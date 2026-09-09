import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { PasswordService } from '../auth/password.service';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { INCLUDE_SOFT_DELETED } from '../prisma/soft-delete.extension';
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
    insuranceValue: 100000,
    insuranceExpiry: NOW,
    licenseExpiry: NOW,
    numberOfVehicle: null,
    companyAddress: 'ul. Testowa 1',
    // Derived onboarding state — non-zero defaults mean fixtures are
    // considered "fully onboarded" out of the box; tests that exercise
    // partial onboarding override `counts` explicitly.
    counts: { vehicles: 1, trailers: 1, drivers: 1 },
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
    mustChangePassword: false,
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
    hardDelete: jest.fn(async (id: string) => {
      rows.delete(id);
    }),
    // Default: no referencing fleet / claims / delegations / episodes —
    // hard-delete is allowed. Reference-guard tests override this per-case.
    countReferencingRows: jest.fn(async () => 0),
  } as unknown as CarriersRepository;
}

/** A fake Prisma P2003 (foreign-key violation) — same shape Prisma throws. */
function makeP2003(): Error {
  return Object.assign(new Error('Foreign key constraint failed'), {
    code: 'P2003',
  });
}

/**
 * Invokes `fn`, asserts it rejected with a `ConflictException`, and returns it
 * so the caller can inspect the RFC-7807 envelope (`code` + `extensions.code`).
 */
async function catchConflict(
  fn: () => Promise<unknown>,
): Promise<ConflictException> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof ConflictException) return e;
    throw e;
  }
  throw new Error('expected ConflictException, but none was thrown');
}

/** Asserts the 409 body carries the machine code both top-level and in extensions. */
function expectReferencesCode(err: ConflictException, code: string): void {
  const body = err.getResponse() as {
    code?: string;
    extensions?: { code?: string };
  };
  expect(body.code).toBe(code);
  expect(body.extensions?.code).toBe(code);
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

  // Phase 5.1 — policy choice: when an opiekun specifies a foreign
  // `opiekunId` on create, we reject 403 (the existing test above) instead
  // of silently overriding to `self`. Rationale documented in the change
  // notes: silent overrides hide intent and make the audit log lie — the
  // opiekun should learn that the field is theirs alone to fill (or omit).
  // The "no-opiekunId on create" branch defaults to self — verified next.
  it('opiekun creating with no opiekunId defaults to self', async () => {
    const carriers = makeCarriersRepo();
    const users = makeUsersRepo();
    const svc = new CarriersService(carriers, users, makePasswords());
    const out = await svc.create(makeAuth('opiekun', 'op-1'), {
      login: 'pwz-no-op',
      email: 'p@example.com',
      name: 'P',
      phone: '+48000000000',
    } as never);
    expect(out.opiekunId).toBe('op-1');
  });

  it('opiekun creating with opiekunId == self is accepted (idempotent)', async () => {
    const carriers = makeCarriersRepo();
    const users = makeUsersRepo();
    const svc = new CarriersService(carriers, users, makePasswords());
    const out = await svc.create(makeAuth('opiekun', 'op-1'), {
      login: 'pwz-self',
      email: 'p@example.com',
      name: 'P',
      phone: '+48000000000',
      opiekunId: 'op-1',
    } as never);
    expect(out.opiekunId).toBe('op-1');
  });

  // Phase 5.1 — opiekun update cannot reassign a carrier to a different
  // opiekun. Setting `opiekunId == self` is OK (no-op); any other value 403.
  it('opiekun update cannot reassign carrier to a different opiekun', async () => {
    const carrier = makeCarrier({
      id: 'c-mine',
      login: 'pwz-mine',
      opiekunId: 'op-1',
    });
    const carriers = makeCarriersRepo([carrier]);
    const svc = new CarriersService(carriers, makeUsersRepo(), makePasswords());
    await expect(
      svc.update(makeAuth('opiekun', 'op-1'), 'c-mine', {
        opiekunId: 'op-2',
      } as never),
    ).rejects.toThrow(ForbiddenException);
  });

  it('opiekun update with opiekunId == self is accepted (no reassignment)', async () => {
    const opiekun = makeUser({ id: 'op-1', role: 'opiekun', active: true });
    const carrier = makeCarrier({
      id: 'c-mine',
      login: 'pwz-mine',
      opiekunId: 'op-1',
    });
    const carriers = makeCarriersRepo([carrier]);
    const svc = new CarriersService(
      carriers,
      makeUsersRepo([opiekun]),
      makePasswords(),
    );
    const out = await svc.update(makeAuth('opiekun', 'op-1'), 'c-mine', {
      opiekunId: 'op-1',
    } as never);
    expect(out.opiekunId).toBe('op-1');
  });

  it('admin update CAN reassign carrier to another opiekun', async () => {
    const op2 = makeUser({ id: 'op-2', role: 'opiekun', active: true });
    const carrier = makeCarrier({
      id: 'c-1',
      login: 'pwz-1',
      opiekunId: 'op-1',
    });
    const carriers = makeCarriersRepo([carrier]);
    const svc = new CarriersService(
      carriers,
      makeUsersRepo([op2]),
      makePasswords(),
    );
    const out = await svc.update(makeAuth('admin', 'a-1'), 'c-1', {
      opiekunId: 'op-2',
    } as never);
    expect(out.opiekunId).toBe('op-2');
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

  // ── Derived onboarding block ─────────────────────────────
  // After dropping the `Carrier.onboardingStatus` enum column, onboarding
  // state is derived on every read from the live `_count` of active children.
  // `toDto` is responsible for computing both the booleans and the composite
  // `isComplete` flag from the row's `counts` (populated by the repo's
  // `_count.select`). These tests pin the mapping in both shapes.

  it('toDto carries the onboarding block — all counts > 0 → isComplete true', async () => {
    const carrier = makeCarrier({
      id: 'c-full',
      login: 'pwz-full',
      counts: { vehicles: 2, trailers: 1, drivers: 3 },
    });
    const carriers = makeCarriersRepo([carrier]);
    const svc = new CarriersService(carriers, makeUsersRepo(), makePasswords());
    const out = await svc.getById('c-full');
    expect(out.onboarding).toEqual({
      hasVehicle: true,
      hasTrailer: true,
      hasDriver: true,
      isComplete: true,
    });
  });

  it('toDto carries the onboarding block — vehicle count = 0 → hasVehicle/isComplete false', async () => {
    const carrier = makeCarrier({
      id: 'c-novehicle',
      login: 'pwz-novehicle',
      counts: { vehicles: 0, trailers: 1, drivers: 1 },
    });
    const carriers = makeCarriersRepo([carrier]);
    const svc = new CarriersService(carriers, makeUsersRepo(), makePasswords());
    const out = await svc.getById('c-novehicle');
    expect(out.onboarding).toEqual({
      hasVehicle: false,
      hasTrailer: true,
      hasDriver: true,
      isComplete: false,
    });
  });

  it('list forwards onboardingComplete filter to the repo', async () => {
    const carriers = makeCarriersRepo();
    const svc = new CarriersService(carriers, makeUsersRepo(), makePasswords());
    await svc.list(makeAuth('admin', 'a-1'), {
      limit: 50,
      onboardingComplete: true,
    });
    expect(carriers.list).toHaveBeenCalledWith(
      expect.objectContaining({ onboardingComplete: true }),
    );
  });

  it('isCarrierOnboardingComplete is the seam for future @RequiresCompleteOnboarding guard', async () => {
    // Three-line helper exposed so a future guard can ask the service "is
    // this carrier fully onboarded?" without re-implementing the rule.
    const complete = makeCarrier({
      id: 'c-complete',
      login: 'a',
      counts: { vehicles: 1, trailers: 1, drivers: 1 },
    });
    const partial = makeCarrier({
      id: 'c-partial',
      login: 'b',
      counts: { vehicles: 1, trailers: 0, drivers: 1 },
    });
    const carriers = makeCarriersRepo([complete, partial]);
    const svc = new CarriersService(carriers, makeUsersRepo(), makePasswords());
    await expect(svc.isCarrierOnboardingComplete('c-complete')).resolves.toBe(
      true,
    );
    await expect(svc.isCarrierOnboardingComplete('c-partial')).resolves.toBe(
      false,
    );
    // Missing carrier → false (defensive — guard must not grant access).
    await expect(svc.isCarrierOnboardingComplete('c-missing')).resolves.toBe(
      false,
    );
  });

  // ── Hard-delete reference guard (409 CARRIER_HAS_REFERENCES) ─
  // All business FKs pointing at a carrier (vehicles / drivers / trailers /
  // claims / delegations / guarantee_idle_episodes) are ON DELETE RESTRICT —
  // incl. soft-deleted rows, which still block the physical FK. Hard-delete
  // must refuse deterministically with a 409, not a bubbling P2003 → 500.

  it('hardDelete with referencing rows → 409 CARRIER_HAS_REFERENCES', async () => {
    const carrier = makeCarrier({ id: 'c-1' });
    const carriers = makeCarriersRepo([carrier]);
    (carriers.countReferencingRows as jest.Mock).mockResolvedValueOnce(5);
    const svc = new CarriersService(carriers, makeUsersRepo(), makePasswords());
    const err = await catchConflict(() => svc.hardDelete('c-1', 'reason'));
    expectReferencesCode(err, 'CARRIER_HAS_REFERENCES');
    // Pre-flight guard fires BEFORE any physical delete.
    expect(carriers.hardDelete).not.toHaveBeenCalled();
  });

  it('hardDelete with ONLY soft-deleted referencing rows → still 409 (count uses INCLUDE_SOFT_DELETED)', async () => {
    const carrier = makeCarrier({ id: 'c-1' });
    const carriers = makeCarriersRepo([carrier]);
    (carriers.countReferencingRows as jest.Mock).mockResolvedValueOnce(1);
    const svc = new CarriersService(carriers, makeUsersRepo(), makePasswords());
    const err = await catchConflict(() => svc.hardDelete('c-1', 'reason'));
    expectReferencesCode(err, 'CARRIER_HAS_REFERENCES');
    expect(carriers.hardDelete).not.toHaveBeenCalled();
  });

  it('hardDelete on an empty carrier succeeds (repo.hardDelete called)', async () => {
    const carrier = makeCarrier({ id: 'c-1' });
    const carriers = makeCarriersRepo([carrier]);
    const svc = new CarriersService(carriers, makeUsersRepo(), makePasswords());
    await expect(svc.hardDelete('c-1', 'reason')).resolves.toBeUndefined();
    expect(carriers.hardDelete).toHaveBeenCalledWith('c-1');
  });

  it('hardDelete translates a late repo P2003 into the same 409 (TOCTOU)', async () => {
    const carrier = makeCarrier({ id: 'c-1' });
    const carriers = makeCarriersRepo([carrier]);
    (carriers.hardDelete as jest.Mock).mockRejectedValueOnce(makeP2003());
    const svc = new CarriersService(carriers, makeUsersRepo(), makePasswords());
    const err = await catchConflict(() => svc.hardDelete('c-1', 'reason'));
    expectReferencesCode(err, 'CARRIER_HAS_REFERENCES');
  });

  it('hardDelete on a missing carrier → 404', async () => {
    const svc = new CarriersService(
      makeCarriersRepo(),
      makeUsersRepo(),
      makePasswords(),
    );
    await expect(svc.hardDelete('missing', 'reason')).rejects.toThrow(
      NotFoundException,
    );
  });
});

// ── Repository-level proof that the reference count passes the escape hatch ──
// A soft-deleted child (vehicle/driver/trailer/claim/delegation) is hidden from
// the soft-delete extension's read filter but STILL physically blocks the
// RESTRICT FK, so the count MUST opt in via `[INCLUDE_SOFT_DELETED]`. The
// non-soft `guaranteeIdleEpisode` carries the flag uniformly (harmless).
describe('CarriersRepository.countReferencingRows', () => {
  it('sums all referencing relations and passes INCLUDE_SOFT_DELETED to every count', async () => {
    const counts = {
      vehicle: jest.fn(async (_args: unknown) => 1),
      driver: jest.fn(async (_args: unknown) => 1),
      trailer: jest.fn(async (_args: unknown) => 1),
      claim: jest.fn(async (_args: unknown) => 1),
      delegation: jest.fn(async (_args: unknown) => 1),
      guaranteeIdleEpisode: jest.fn(async (_args: unknown) => 1),
    };
    const prisma = {
      tx: {
        vehicle: { count: counts.vehicle },
        driver: { count: counts.driver },
        trailer: { count: counts.trailer },
        claim: { count: counts.claim },
        delegation: { count: counts.delegation },
        guaranteeIdleEpisode: { count: counts.guaranteeIdleEpisode },
      },
    } as unknown as PrismaService;
    const repo = new CarriersRepository(prisma);

    const total = await repo.countReferencingRows('c-1');

    expect(total).toBe(6);
    for (const fn of Object.values(counts)) {
      const arg = fn.mock.calls[0]?.[0] as Record<string | symbol, unknown>;
      expect(arg.where).toEqual({ carrierId: 'c-1' });
      expect(arg[INCLUDE_SOFT_DELETED]).toBe(true);
    }
  });
});
