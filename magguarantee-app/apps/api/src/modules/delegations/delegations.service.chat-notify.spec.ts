/**
 * `DelegationsService.add` notification fan-out (restored 2026-08-07).
 *
 * On a carrier `zgłoszenie` exactly two things must happen off the request
 * path:
 *   1. the wyjazd is enqueued to the Google Chat space (INTERNAL heads-up —
 *      planista / dyspozytorzy / opiekun read that space);
 *   2. the CARRIER gets the confirmation email — and nobody else does. The
 *      opiekun email that lived here between 2026-07-28 and 2026-08-07 is gone.
 *
 * Neither may ever break `add()`.
 */
import type { SubmitDelegationDto } from '@magguarantee/shared';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import {
  CarrierReadinessService,
  type CarrierReadiness,
} from '../carriers/carrier-readiness.service';
import { CarriersRepository } from '../carriers/carriers.repository';
import { DriversRepository } from '../drivers/drivers.repository';
import type { ChatNotifierService } from '../integrations/chat/chat-notifier.service';
import type { MailService } from '../mail/mail.service';
import type { PrismaService } from '../prisma/prisma.service';
import { TrailersRepository } from '../trailers/trailers.repository';
import { VehiclesRepository } from '../vehicles/vehicles.repository';
import { DelegationsRepository } from './delegations.repository';
import { DelegationsService } from './delegations.service';
import { makeAuthUser } from '../../common/testing/make-auth-user';

const CARRIER_ID = 'carrier-1';
const CARRIER_USER = 'user-1';
const VEHICLE_ID = 'veh-1';
const NEW_DELEGATION_ID = 'deleg-new';
const CARRIER_EMAIL = 'przewoznik@example.com';

function authCarrier(): AuthUser {
  return makeAuthUser('przewoznik', {
    sub: CARRIER_USER,
    login: 'pwz',
    email: CARRIER_EMAIL,
    name: 'Carrier',
    mustChangePassword: false,
  });
}

function submitDto(): SubmitDelegationDto {
  return {
    vehicleId: VEHICLE_ID,
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

function readyState(): CarrierReadiness {
  return {
    hasVehicle: true,
    hasTrailer: true,
    hasDriver: true,
    incompleteFleet: false,
    ready: true,
  };
}

/**
 * Service wired with the notification-side collaborators (mail + prisma +
 * chat). `configService` is deliberately left OUT so the past-departure guard
 * self-bypasses (see `_assertDepartureNotInPast`) and the fixture dates stay
 * stable over time.
 */
function makeService(opts: { chatThrows?: boolean } = {}) {
  const delegations = {
    create: jest.fn(async (data: Record<string, unknown>) => ({
      id: NEW_DELEGATION_ID,
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
      actualDepartureAt: null,
      actualReturnAt: null,
      status: 'zgloszony',
      reportedAt: new Date('2026-05-29T00:00:00.000Z'),
      createdAt: new Date('2026-05-29T00:00:00.000Z'),
      updatedAt: new Date('2026-05-29T00:00:00.000Z'),
      deletedAt: null,
    })),
    findActiveByVehicle: jest.fn(async () => null),
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

  const announcedSpy = jest.fn(async () => undefined);
  const readySpy = jest.fn(async () => undefined);
  const mail = {
    enqueueDelegationAnnounced: announcedSpy,
    enqueueDelegationReady: readySpy,
  } as unknown as MailService;

  // Root-client read the notifier performs to resolve the carrier address.
  // The arg is typed so the "no opiekun in the select" assertion below can
  // inspect `mock.calls[0][0]`.
  const carrierFindFirst = jest.fn(
    async (_args: { select?: Record<string, unknown> }) => ({
      user: {
        email: CARRIER_EMAIL,
        name: 'Przewoźnik Sp. z o.o.',
        login: 'pwz',
      },
    }),
  );
  const prisma = {
    client: { carrier: { findFirst: carrierFindFirst } },
  } as unknown as PrismaService;

  const notifySpy = jest.fn(async () => {
    if (opts.chatThrows) throw new Error('redis down');
  });
  const chat = { notifyWyjazd: notifySpy } as unknown as ChatNotifierService;

  const service = new DelegationsService(
    delegations,
    carriers,
    vehicles,
    drivers,
    trailers,
    readinessSvc,
    undefined, // claimsService
    mail,
    prisma,
    undefined, // configService — keeps the past-departure guard bypassed
    undefined, // guaranteeWatchdog
    chat,
  );
  return { service, notifySpy, announcedSpy, readySpy, carrierFindFirst };
}

/** Lets the fire-and-forget `_notifyWyjazd` continuation settle. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('DelegationsService.add — wyjazd notifications', () => {
  it('enqueues the Google Chat notification for the new delegation', async () => {
    const { service, notifySpy } = makeService();

    await service.add(authCarrier(), submitDto());

    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(notifySpy).toHaveBeenCalledWith(NEW_DELEGATION_ID);
  });

  it('emails ONLY the carrier (no opiekun copy since 2026-08-07)', async () => {
    const { service, announcedSpy } = makeService();

    await service.add(authCarrier(), submitDto());
    await flushMicrotasks();

    expect(announcedSpy).toHaveBeenCalledTimes(1);
    const [to, props] = announcedSpy.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(to).toBe(CARRIER_EMAIL);
    // Driver comes from the submit-time snapshot; the dates are pre-formatted
    // (the plate falls back to `—` here because the repo fake returns no
    // vehicle relation — not what this test is about).
    expect(props).toMatchObject({ driverName: 'Jan Kowalski' });
    expect(props.departure).toMatch(/01\.06\.2026/);
    expect(props.plannedReturn).toMatch(/05\.06\.2026/);
    // The internal flavour of this template is gone — no props survive that
    // would let it render as "Przewoźnik X zgłosił nowy wyjazd".
    expect(props).not.toHaveProperty('forCarrier');
    expect(props).not.toHaveProperty('carrierName');
  });

  it('does not read the opiekun address at all', async () => {
    const { service, carrierFindFirst } = makeService();

    await service.add(authCarrier(), submitDto());
    await flushMicrotasks();

    const args = carrierFindFirst.mock.calls[0]?.[0];
    expect(args?.select).toBeDefined();
    expect(args?.select).not.toHaveProperty('opiekun');
  });

  it('a chat enqueue failure never breaks add() (and the email still goes out)', async () => {
    const { service, announcedSpy } = makeService({ chatThrows: true });

    const out = await service.add(authCarrier(), submitDto());
    await flushMicrotasks();

    expect(out.id).toBe(NEW_DELEGATION_ID);
    expect(announcedSpy).toHaveBeenCalledTimes(1);
  });

  it('no chat service wired (unit context) → add() still succeeds', async () => {
    const { service } = makeService();
    // Re-create without the trailing `chat` arg — mirrors the positional fakes
    // in the older delegations specs, which omit every optional collaborator.
    const bare = new DelegationsService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).delegations,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).carriers,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).vehicles,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).drivers,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).trailers,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).readiness,
    );

    const out = await bare.add(authCarrier(), submitDto());
    expect(out.id).toBe(NEW_DELEGATION_ID);
  });
});
