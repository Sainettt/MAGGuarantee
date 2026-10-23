import type { DelegationFilters } from '@magguarantee/shared';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CarrierReadinessService } from '../carriers/carrier-readiness.service';
import { CarriersRepository } from '../carriers/carriers.repository';
import { DriversRepository } from '../drivers/drivers.repository';
import { TrailersRepository } from '../trailers/trailers.repository';
import { VehiclesRepository } from '../vehicles/vehicles.repository';
import {
  DelegationsRepository,
  type DelegationListFilters,
} from './delegations.repository';
import { DelegationsService } from './delegations.service';
import { makeAuthUser } from '../../common/testing/make-auth-user';

const CARRIER_ID = 'carrier-1';
const CARRIER_USER = 'user-1';

function auth(
  role: AuthUser['role'],
  sub: string,
  teamId: string | null = 'team-1',
): AuthUser {
  return makeAuthUser(role, {
    sub,
    login: 'actor',
    email: 'actor@magtrans.eu',
    name: 'Actor',
    mustChangePassword: false,
    teamId,
  });
}

function baseFilters(
  overrides: Partial<DelegationFilters> = {},
): DelegationFilters {
  return { limit: 50, ...overrides } as DelegationFilters;
}

/**
 * Service wired with a `delegations.list` spy that records the
 * `DelegationListFilters` it received, so each test can assert exactly what
 * status restriction (if any) reached the repository.
 */
function makeService() {
  const listSpy = jest.fn(async (_filters: DelegationListFilters) => []);
  const delegations = {
    list: listSpy,
  } as unknown as DelegationsRepository;
  const carriers = {
    list: jest.fn(async () => [{ id: CARRIER_ID, userId: CARRIER_USER }]),
  } as unknown as CarriersRepository;

  const service = new DelegationsService(
    delegations,
    carriers,
    {} as unknown as VehiclesRepository,
    {} as unknown as DriversRepository,
    {} as unknown as TrailersRepository,
    {} as unknown as CarrierReadinessService,
  );
  return { service, listSpy };
}

function passedFilters(
  listSpy: jest.Mock,
): DelegationListFilters {
  return listSpy.mock.calls[0]![0] as DelegationListFilters;
}

describe('DelegationsService.list — includeHistory (eksport)', () => {
  it('eksport: history OFF (default) → active-only floor statusIn=[zgloszony, gotowy, w_trasie]', async () => {
    const { service, listSpy } = makeService();
    await service.list(auth('eksport', 'eksport-1'), baseFilters());
    const passed = passedFilters(listSpy);
    // Phase 7 REWORK (2026-06-20 #4) — `gotowy` joined the active board.
    expect(passed.statusIn).toEqual(['zgloszony', 'gotowy', 'w_trasie']);
    expect(passed.status).toBeUndefined();
  });

  it('eksport: history ON → no status floor (all statuses)', async () => {
    const { service, listSpy } = makeService();
    await service.list(
      auth('eksport', 'eksport-1'),
      baseFilters({ includeHistory: true }),
    );
    const passed = passedFilters(listSpy);
    expect(passed.statusIn).toBeUndefined();
    expect(passed.status).toBeUndefined();
    // `includeHistory` must NOT leak into the repo filter object.
    expect('includeHistory' in passed).toBe(false);
  });

  it('eksport: explicit status narrows further and wins over the floor (even with history off)', async () => {
    const { service, listSpy } = makeService();
    await service.list(
      auth('eksport', 'eksport-1'),
      baseFilters({ status: 'zjechal' }),
    );
    const passed = passedFilters(listSpy);
    // Explicit status is honoured; the active floor is NOT injected.
    expect(passed.status).toBe('zjechal');
    expect(passed.statusIn).toBeUndefined();
  });

  it('eksport: explicit status + includeHistory still narrows to that status', async () => {
    const { service, listSpy } = makeService();
    await service.list(
      auth('eksport', 'eksport-1'),
      baseFilters({ status: 'anulowany', includeHistory: true }),
    );
    const passed = passedFilters(listSpy);
    expect(passed.status).toBe('anulowany');
    expect(passed.statusIn).toBeUndefined();
  });

  it('weryfikator: REWORK 2026-06-20 #4 — sees the active board like eksport (floor injected)', async () => {
    const { service, listSpy } = makeService();
    await service.list(auth('weryfikator', 'wer-1'), baseFilters());
    const passed = passedFilters(listSpy);
    expect(passed.statusIn).toEqual(['zgloszony', 'gotowy', 'w_trasie']);
    expect(passed.status).toBeUndefined();
  });

  it('weryfikator: history ON → no status floor (all statuses, like eksport)', async () => {
    const { service, listSpy } = makeService();
    await service.list(
      auth('weryfikator', 'wer-1'),
      baseFilters({ includeHistory: true }),
    );
    const passed = passedFilters(listSpy);
    expect(passed.statusIn).toBeUndefined();
    expect(passed.status).toBeUndefined();
  });
});

describe('DelegationsService.list — regression: other roles unaffected by history floor', () => {
  it('admin: never gets a status floor (all statuses), includeHistory ignored & stripped', async () => {
    const { service, listSpy } = makeService();
    await service.list(
      auth('admin', 'adm-1'),
      baseFilters({ includeHistory: false }),
    );
    const passed = passedFilters(listSpy);
    expect(passed.statusIn).toBeUndefined();
    expect(passed.status).toBeUndefined();
    expect('includeHistory' in passed).toBe(false);
  });

  it('opiekun: never gets a status floor (all statuses)', async () => {
    const { service, listSpy } = makeService();
    await service.list(auth('opiekun', 'op-1'), baseFilters());
    const passed = passedFilters(listSpy);
    expect(passed.statusIn).toBeUndefined();
    expect(passed.status).toBeUndefined();
  });

  it('przewoznik: scoped to own carrier, NO status floor (sees zjechal/anulowany)', async () => {
    const { service, listSpy } = makeService();
    await service.list(auth('przewoznik', CARRIER_USER), baseFilters());
    const passed = passedFilters(listSpy);
    expect(passed.carrierId).toBe(CARRIER_ID);
    expect(passed.statusIn).toBeUndefined();
    expect(passed.status).toBeUndefined();
    expect('includeHistory' in passed).toBe(false);
  });

  it('planista: scoped to own planned fleet, NO status floor', async () => {
    const { service, listSpy } = makeService();
    await service.list(auth('planista', 'plan-1'), baseFilters());
    const passed = passedFilters(listSpy);
    expect(passed.plannerId).toBe('plan-1');
    expect(passed.statusIn).toBeUndefined();
    expect(passed.status).toBeUndefined();
  });

  it('dyspozytor: scoped to own team (Phase 11), NO status floor', async () => {
    const { service, listSpy } = makeService();
    await service.list(auth('dyspozytor', 'dys-1', 'team-1'), baseFilters());
    const passed = passedFilters(listSpy);
    expect(passed.dispatchTeamId).toBe('team-1');
    expect(passed.statusIn).toBeUndefined();
    expect(passed.status).toBeUndefined();
  });

  it('a client-supplied includeHistory is ignored for non-eksport/weryfikator roles', async () => {
    const { service, listSpy } = makeService();
    // A planista trying to flip the toggle gets no behavioural change — and the
    // flag never reaches the repo filters.
    await service.list(
      auth('planista', 'plan-1'),
      baseFilters({ includeHistory: true }),
    );
    const passed = passedFilters(listSpy);
    expect(passed.plannerId).toBe('plan-1');
    expect(passed.statusIn).toBeUndefined();
    expect('includeHistory' in passed).toBe(false);
  });
});
