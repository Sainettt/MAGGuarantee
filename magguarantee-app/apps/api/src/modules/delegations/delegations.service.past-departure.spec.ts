import { UnprocessableEntityException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { SubmitDelegationDto } from '@magguarantee/shared';

import type { Env } from '../../config/env.schema';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import {
  CarrierReadinessService,
  type CarrierReadiness,
} from '../carriers/carrier-readiness.service';
import { CarriersRepository } from '../carriers/carriers.repository';
import { DriversRepository } from '../drivers/drivers.repository';
import { ChatNotifierService } from '../integrations/chat/chat-notifier.service';
import { TrailersRepository } from '../trailers/trailers.repository';
import { VehiclesRepository } from '../vehicles/vehicles.repository';
import {
  DelegationsRepository,
  type DelegationRow,
} from './delegations.repository';
import { DelegationsService } from './delegations.service';

const CARRIER_ID = 'carrier-1';
const CARRIER_USER = 'user-1';
const VEHICLE_ID = 'veh-1';

// Wall-clock-safe fixtures: far past / far future so the `< now` comparison is
// deterministic regardless of when the suite runs.
const PAST_DEPARTURE = '2020-01-01T08:00:00.000Z';
const FUTURE_DEPARTURE = '2999-01-01T08:00:00.000Z';

function authCarrier(): AuthUser {
  return {
    sub: CARRIER_USER,
    login: 'pwz',
    email: 'pwz@magtrans.eu',
    name: 'Carrier',
    role: 'przewoznik',
    mustChangePassword: false,
  };
}

function submitDto(departureAt: string): SubmitDelegationDto {
  return {
    vehicleId: VEHICLE_ID,
    trailerId: 'trl-1',
    driverId: 'drv-1',
    departureAt,
    departureCountry: 'PL',
    departurePostalCode: '00-001',
    plannedReturnAt: '2999-01-05',
    returnCountry: 'PL',
    returnPostalCode: '00-001',
    comment: undefined,
  } as SubmitDelegationDto;
}

function readyState(): CarrierReadiness {
  return {
    hasVehicle: true,
    hasTrailer: true,
    hasDriver: true,
    hasAdrVehicle: false,
    hasAdrDoc: false,
    incompleteFleet: false,
    adrDocMissing: false,
    ready: true,
  };
}

/**
 * Builds a DelegationsService whose earlier guards (readiness, ownership,
 * active-trip) all pass — the ONLY variable under test is the past-departure
 * date guard. `withConfig` controls the optional positional `configService`
 * slot (11th): pass `undefined` to exercise the bypass-when-absent path, or a
 * minimal fake reading `ALLOW_PAST_DEPARTURE`.
 *
 * Constructor order (positional): delegations, carriers, vehicles, drivers,
 * trailers, readiness, chat, claimsService?, mailService?, prisma?,
 * configService? — so slots 8/9/10 are `undefined`, config goes in slot 11.
 */
function makeService(withConfig: ConfigService<Env, true> | undefined) {
  const createSpy = jest.fn(async (data: Record<string, unknown>) => ({
    id: 'deleg-new',
    ...data,
    vehicle: null,
    trailer: null,
    driver: null,
    carrier: null,
    reportedBy: null,
    verifiedBy: null,
    verifiedById: null,
    verifiedAt: null,
    readyById: null,
    readyBy: null,
    readyAt: null,
    actualReturnAt: null,
    status: 'zgloszony',
    reportedAt: new Date('2026-05-29T00:00:00.000Z'),
    createdAt: new Date('2026-05-29T00:00:00.000Z'),
    updatedAt: new Date('2026-05-29T00:00:00.000Z'),
    deletedAt: null,
  }));

  // Vehicle has no active trip → guard passes.
  const findActiveSpy = jest.fn(
    async (): Promise<DelegationRow | null> => null,
  );

  const delegations = {
    create: createSpy,
    findActiveByVehicle: findActiveSpy,
  } as unknown as DelegationsRepository;

  const carriers = {
    list: jest.fn(async () => [{ id: CARRIER_ID, userId: CARRIER_USER }]),
  } as unknown as CarriersRepository;

  const vehicles = {
    findById: jest.fn(async () => ({
      id: VEHICLE_ID,
      carrierId: CARRIER_ID,
      plateNumber: 'PL123',
      active: true,
    })),
  } as unknown as VehiclesRepository;

  const drivers = {
    findById: jest.fn(async () => ({
      id: 'drv-1',
      carrierId: CARRIER_ID,
      firstName: 'Jan',
      lastName: 'Kowalski',
      phone: '111',
      active: true,
    })),
  } as unknown as DriversRepository;

  const trailers = {
    findById: jest.fn(async () => ({
      id: 'trl-1',
      carrierId: CARRIER_ID,
      plateNumber: 'TR1',
    })),
  } as unknown as TrailersRepository;

  const readinessSvc = {
    forCarrier: jest.fn(async () => readyState()),
  } as unknown as CarrierReadinessService;

  const chat = {
    notifyWyjazd: jest.fn(async () => undefined),
  } as unknown as ChatNotifierService;

  const service = new DelegationsService(
    delegations,
    carriers,
    vehicles,
    drivers,
    trailers,
    readinessSvc,
    chat,
    undefined, // claimsService (slot 8)
    undefined, // mailService (slot 9)
    undefined, // prisma (slot 10)
    withConfig, // configService (slot 11)
  );
  return { service, createSpy };
}

/** Minimal typed ConfigService fake returning a fixed flag for the env key. */
function configFake(allowPastDeparture: boolean): ConfigService<Env, true> {
  return {
    get: (key: string) =>
      key === 'ALLOW_PAST_DEPARTURE' ? allowPastDeparture : undefined,
  } as unknown as ConfigService<Env, true>;
}

describe('DelegationsService.add — past-departure guard (ALLOW_PAST_DEPARTURE)', () => {
  it('flag OFF + PAST departureAt → rejects 422 DEPARTURE_IN_PAST, no row created', async () => {
    const { service, createSpy } = makeService(configFake(false));
    let caught: unknown;
    try {
      await service.add(authCarrier(), submitDto(PAST_DEPARTURE));
      throw new Error('expected to throw');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(UnprocessableEntityException);
    const ex = caught as UnprocessableEntityException;
    expect(ex.getStatus()).toBe(422);
    const response = ex.getResponse() as {
      extensions?: { code?: string };
    };
    expect(response.extensions?.code).toBe('DEPARTURE_IN_PAST');
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('flag ON + PAST departureAt → resolves (create called)', async () => {
    const { service, createSpy } = makeService(configFake(true));
    const out = await service.add(authCarrier(), submitDto(PAST_DEPARTURE));
    expect(out.id).toBe('deleg-new');
    expect(createSpy).toHaveBeenCalledTimes(1);
  });

  it('flag OFF + FUTURE departureAt → resolves (create called)', async () => {
    const { service, createSpy } = makeService(configFake(false));
    const out = await service.add(authCarrier(), submitDto(FUTURE_DEPARTURE));
    expect(out.id).toBe('deleg-new');
    expect(createSpy).toHaveBeenCalledTimes(1);
  });

  it('flag OFF + departure WITHIN the grace window (5 min ago) → resolves', async () => {
    // The 10-min grace absorbs form fill-in time: a "now"-ish departure stays
    // valid even though it is technically a few minutes in the past.
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { service, createSpy } = makeService(configFake(false));
    const out = await service.add(authCarrier(), submitDto(fiveMinAgo));
    expect(out.id).toBe('deleg-new');
    expect(createSpy).toHaveBeenCalledTimes(1);
  });

  it('flag OFF + departure BEYOND the grace window (20 min ago) → rejects 422', async () => {
    const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const { service, createSpy } = makeService(configFake(false));
    await expect(
      service.add(authCarrier(), submitDto(twentyMinAgo)),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('NO config (positional arg omitted) + PAST departureAt → resolves (bypass-when-absent)', async () => {
    // Documents the deliberate bypass: pure unit fakes that omit ConfigService
    // must not have the guard fire (the existing add() suite uses past fixture
    // dates). In production ConfigService is always wired by ConfigModule.
    const { service, createSpy } = makeService(undefined);
    const out = await service.add(authCarrier(), submitDto(PAST_DEPARTURE));
    expect(out.id).toBe('deleg-new');
    expect(createSpy).toHaveBeenCalledTimes(1);
  });
});
