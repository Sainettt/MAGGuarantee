import { UnprocessableEntityException } from '@nestjs/common';

import { CARRIER_NOT_READY_CODE, type SubmitDelegationDto } from '@magguarantee/shared';

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
import { DelegationsRepository } from './delegations.repository';
import { DelegationsService } from './delegations.service';

const CARRIER_ID = 'carrier-1';
const CARRIER_USER = 'user-1';

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

function submitDto(): SubmitDelegationDto {
  return {
    vehicleId: 'veh-1',
    trailerId: 'trl-1',
    driverId: 'drv-1',
    departureAt: '2026-06-01T08:00:00.000Z',
    departureCountry: 'PL',
    departurePostalCode: '00-001',
    plannedReturnAt: '2026-06-05',
    returnCountry: 'PL',
    returnPostalCode: '00-001',
    comment: undefined,
  } as SubmitDelegationDto;
}

function readyState(overrides: Partial<CarrierReadiness> = {}): CarrierReadiness {
  return {
    hasVehicle: true,
    hasTrailer: true,
    hasDriver: true,
    hasAdrVehicle: false,
    hasAdrDoc: false,
    incompleteFleet: false,
    adrDocMissing: false,
    ready: true,
    ...overrides,
  };
}

function notReadyState(reason: 'fleet' | 'adr'): CarrierReadiness {
  if (reason === 'fleet') {
    return readyState({ hasTrailer: false, incompleteFleet: true, ready: false });
  }
  return readyState({
    hasAdrVehicle: true,
    adrDocMissing: true,
    ready: false,
  });
}

/**
 * Builds a DelegationsService with stubbed collaborators. `readiness` returns
 * the supplied `CarrierReadiness`; the create spy records whether a row was
 * persisted so the "no row created on 422" assertion can be made.
 */
function makeService(readiness: CarrierReadiness) {
  const createSpy = jest.fn(async (data: Record<string, unknown>) => ({
    id: 'deleg-1',
    ...data,
    vehicle: null,
    trailer: null,
    driver: null,
    carrier: null,
    reportedBy: null,
    verifiedBy: null,
    verifiedById: null,
    verifiedAt: null,
    actualReturnAt: null,
    status: 'zgloszony',
    reportedAt: new Date('2026-05-29T00:00:00.000Z'),
    createdAt: new Date('2026-05-29T00:00:00.000Z'),
    updatedAt: new Date('2026-05-29T00:00:00.000Z'),
    deletedAt: null,
  }));

  const delegations = {
    create: createSpy,
  } as unknown as DelegationsRepository;

  const carriers = {
    // `_requireCarrierProfile` scans the list for `userId === user.sub`.
    list: jest.fn(async () => [{ id: CARRIER_ID, userId: CARRIER_USER }]),
  } as unknown as CarriersRepository;

  const vehicles = {
    findById: jest.fn(async () => ({
      id: 'veh-1',
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
    forCarrier: jest.fn(async () => readiness),
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
  );
  return { service, createSpy, readinessSvc, chat };
}

async function expectCarrierNotReady(promise: Promise<unknown>) {
  await expect(promise).rejects.toBeInstanceOf(UnprocessableEntityException);
  try {
    await promise;
    throw new Error('expected to throw');
  } catch (err) {
    const body = (err as UnprocessableEntityException).getResponse() as {
      extensions?: { code?: string };
    };
    expect(body.extensions?.code).toBe(CARRIER_NOT_READY_CODE);
  }
}

describe('DelegationsService.add — carrier-readiness hard block', () => {
  it('(a) incomplete fleet → 422 CARRIER_NOT_READY, no row created', async () => {
    const { service, createSpy } = makeService(notReadyState('fleet'));
    await expectCarrierNotReady(service.add(authCarrier(), submitDto()));
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('(b) ADR vehicle without ADR doc → 422 CARRIER_NOT_READY, no row created', async () => {
    const { service, createSpy } = makeService(notReadyState('adr'));
    await expectCarrierNotReady(service.add(authCarrier(), submitDto()));
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('(c) full fleet + ADR vehicle + ADR doc → succeeds', async () => {
    const { service, createSpy } = makeService(
      readyState({ hasAdrVehicle: true, hasAdrDoc: true }),
    );
    const out = await service.add(authCarrier(), submitDto());
    expect(out.id).toBe('deleg-1');
    expect(createSpy).toHaveBeenCalledTimes(1);
  });

  it('(d) full fleet + no ADR vehicle → succeeds', async () => {
    const { service, createSpy } = makeService(readyState());
    const out = await service.add(authCarrier(), submitDto());
    expect(out.id).toBe('deleg-1');
    expect(createSpy).toHaveBeenCalledTimes(1);
  });

  it('readiness is checked BEFORE any persistence (create never runs on 422)', async () => {
    const { service, createSpy, readinessSvc } = makeService(
      notReadyState('fleet'),
    );
    await expectCarrierNotReady(service.add(authCarrier(), submitDto()));
    expect(readinessSvc.forCarrier).toHaveBeenCalledWith(CARRIER_ID);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('the 422 detail does not leak which item is missing (generic message)', async () => {
    const { service } = makeService(notReadyState('adr'));
    try {
      await service.add(authCarrier(), submitDto());
      throw new Error('expected to throw');
    } catch (err) {
      const body = (err as UnprocessableEntityException).getResponse() as {
        message?: string;
        violations?: string[];
      };
      expect(body.message).not.toMatch(/adr/i);
      expect(body.message).not.toMatch(/naczep|kierowc|pojazd/i);
      // No per-item violations array — generic only.
      expect(body.violations).toBeUndefined();
    }
  });
});

describe('DelegationsService.eligibility — carrier portal flag', () => {
  it('canCreate=true when ready', async () => {
    const { service } = makeService(readyState());
    await expect(service.eligibility(authCarrier())).resolves.toEqual({
      canCreate: true,
    });
  });

  it('canCreate=false when not ready (no breakdown exposed)', async () => {
    const { service } = makeService(notReadyState('adr'));
    const out = await service.eligibility(authCarrier());
    expect(out).toEqual({ canCreate: false });
    // The eligibility response carries ONLY the boolean — no reasons.
    expect(Object.keys(out)).toEqual(['canCreate']);
  });
});
