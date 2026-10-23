// Role scoping of `ClaimsService.list` (`GET /claims`) —
// `_scopeListFilters`.
//
// Decision 2026-10-22 (docs/03-roles.md#opiekun, docs/13-api-design.md
// `GET /claims` row): `opiekun` has NO claims access at all — neither the list
// nor a single wniosek. It used to be scoped to its supervised carriers via a
// server-injected `carrierOpiekunId` relation filter; that branch is gone and
// opiekun now lands on the same 403 as planista / dyspozytor / eksport /
// weryfikator. The `@Roles` gate on the controller already refuses it
// (`claims.controller.roles.spec.ts`); this spec pins the service-level
// defence-in-depth so a future `@Roles` slip cannot reopen the list.
//
// Style mirrors `claims.service.preview.spec.ts`: hand-rolled fakes, no
// jest-mock-extended.

import { ForbiddenException } from '@nestjs/common';

import type { ClaimFilters, Role } from '@magguarantee/shared';

import type { AuditWriter } from '../audit/audit.service';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type {
  CarrierRow,
  CarriersRepository,
} from '../carriers/carriers.repository';
import type { DriversRepository } from '../drivers/drivers.repository';
import type { KmCalcService } from '../km-calc/km-calc.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TrailersRepository } from '../trailers/trailers.repository';
import type { VehiclesRepository } from '../vehicles/vehicles.repository';
import type {
  ClaimListFilters,
  ClaimRow,
  ClaimsRepository,
} from './claims.repository';
import { ClaimsService } from './claims.service';
import type { NrZglService } from './nr-zgl.service';
import { makeAuthUser } from '../../common/testing/make-auth-user';

// ─── fixtures ────────────────────────────────────────────────

const OPIEKUN_SUB = 'u-opiekun';
const CARRIER_ID = '11111111-1111-4111-8111-111111111111';
const CARRIER_USER = 'u-przewoznik-1';
const FOREIGN_CARRIER_ID = '22222222-2222-4222-8222-222222222222';

function auth(role: AuthUser['role'], sub = `u-${role}`): AuthUser {
  return makeAuthUser(role, {
    sub,
    login: 'actor',
    email: 'actor@magtrans.eu',
    name: 'Actor',
    mustChangePassword: false,
  });
}

function filters(overrides: Partial<ClaimFilters> = {}): ClaimFilters {
  return { limit: 50, ...overrides };
}

/**
 * The carrier the opiekun under test SUPERVISES — so every opiekun refusal
 * below is role-based, not an ownership miss.
 */
function supervisedCarrier(): CarrierRow {
  return {
    id: CARRIER_ID,
    userId: CARRIER_USER,
    opiekunId: OPIEKUN_SUB,
  } as unknown as CarrierRow;
}

// ─── fakes ───────────────────────────────────────────────────

interface Harness {
  service: ClaimsService;
  claimsList: jest.Mock<Promise<ClaimRow[]>, [ClaimListFilters]>;
  carriersList: jest.Mock<Promise<CarrierRow[]>, [unknown]>;
}

function makeService(): Harness {
  const claimsList = jest.fn<Promise<ClaimRow[]>, [ClaimListFilters]>(
    async () => [],
  );
  const carriersList = jest.fn<Promise<CarrierRow[]>, [unknown]>(async () => [
    supervisedCarrier(),
  ]);
  const claimsRepo = { list: claimsList } as unknown as ClaimsRepository;
  const carriersRepo = { list: carriersList } as unknown as CarriersRepository;
  const noop = {} as unknown;
  const service = new ClaimsService(
    claimsRepo,
    carriersRepo,
    noop as VehiclesRepository,
    noop as DriversRepository,
    noop as TrailersRepository,
    noop as KmCalcService,
    noop as NrZglService,
    noop as PrismaService,
    noop as AuditWriter,
  );
  return { service, claimsList, carriersList };
}

// ─── tests ───────────────────────────────────────────────────

describe('ClaimsService.list — opiekun has no claims access (decision 2026-10-22)', () => {
  it('opiekun without filters → 403, the repository is never queried', async () => {
    const { service, claimsList, carriersList } = makeService();

    await expect(
      service.list(auth('opiekun', OPIEKUN_SUB), filters()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(claimsList).not.toHaveBeenCalled();
    // No ownership lookup either — the refusal is purely role-based.
    expect(carriersList).not.toHaveBeenCalled();
  });

  it('opiekun pinning one of ITS OWN carriers → still 403 (no narrowing escape hatch)', async () => {
    const { service, claimsList } = makeService();

    await expect(
      service.list(
        auth('opiekun', OPIEKUN_SUB),
        filters({ carrierId: CARRIER_ID, status: 'NA_WERYFIKACJI' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(claimsList).not.toHaveBeenCalled();
  });
});

describe.each<Role>(['planista', 'dyspozytor', 'eksport', 'weryfikator'])(
  'ClaimsService.list — %s has no claims access',
  (role) => {
    it('→ 403, the repository is never queried', async () => {
      const { service, claimsList } = makeService();

      await expect(service.list(auth(role), filters())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(claimsList).not.toHaveBeenCalled();
    });
  },
);

describe('ClaimsService.list — the roles that DO read claims', () => {
  it.each<Role>(['admin', 'pracownik'])(
    '%s → filters passed through unchanged (no server-injected scope)',
    async (role) => {
      const { service, claimsList } = makeService();
      const query = filters({ carrierId: FOREIGN_CARRIER_ID, q: 'GWA' });

      await service.list(auth(role), query);

      expect(claimsList).toHaveBeenCalledTimes(1);
      expect(claimsList.mock.calls[0]![0]).toEqual(query);
    },
  );

  it('przewoznik → scoped to its own carrier', async () => {
    const { service, claimsList } = makeService();

    await service.list(auth('przewoznik', CARRIER_USER), filters());

    expect(claimsList).toHaveBeenCalledTimes(1);
    expect(claimsList.mock.calls[0]![0]).toEqual(
      filters({ carrierId: CARRIER_ID }),
    );
  });

  it('przewoznik pinning a foreign carrier → 403', async () => {
    const { service, claimsList } = makeService();

    await expect(
      service.list(
        auth('przewoznik', CARRIER_USER),
        filters({ carrierId: FOREIGN_CARRIER_ID }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(claimsList).not.toHaveBeenCalled();
  });
});
