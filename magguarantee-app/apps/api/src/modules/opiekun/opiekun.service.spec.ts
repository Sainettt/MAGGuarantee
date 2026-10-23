import { ForbiddenException } from '@nestjs/common';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import {
  CarriersRepository,
  type OpiekunAggregateCarrierRow,
} from '../carriers/carriers.repository';
import { OpiekunService } from './opiekun.service';
import { makeAuthUser } from '../../common/testing/make-auth-user';

function makeAuth(role: AuthUser['role'], sub = 'op-self'): AuthUser {
  return makeAuthUser(role, {
    sub,
    login: 'actor',
    email: 'actor@magtrans.eu',
    name: 'Actor',
    mustChangePassword: false,
  });
}

function ownedBy(
  opiekunId: string,
  overrides: Partial<OpiekunAggregateCarrierRow> = {},
): OpiekunAggregateCarrierRow {
  return Object.assign(
    {
      id: 'c-1',
      login: 'pwz1',
      name: 'Pwz One',
      company: null,
      nip: '0000000000',
      active: true,
      numberOfVehicle: null,
      vehicles: [],
      counts: { vehicles: 0, drivers: 0, trailers: 0 },
      ...overrides,
    },
    { opiekunId },
  );
}

function makeCarriersRepo(
  seed: OpiekunAggregateCarrierRow[] = [],
  captured?: { value?: { opiekunId?: string } },
): CarriersRepository {
  return {
    listForOpiekunAggregate: jest.fn(
      async (filters: { opiekunId?: string }) => {
        if (captured) captured.value = filters;
        if (filters.opiekunId !== undefined) {
          return seed.filter(
            (r) =>
              (r as { opiekunId?: string }).opiekunId === filters.opiekunId,
          );
        }
        return [...seed];
      },
    ),
  } as unknown as CarriersRepository;
}

describe('OpiekunService.listMyCarriers', () => {
  it('returns only carriers owned by the calling opiekun', async () => {
    const captured: { value?: { opiekunId?: string } } = {};
    const svc = new OpiekunService(
      makeCarriersRepo(
        [
          ownedBy('op-self', { id: 'c-mine-1', login: 'mine1' }),
          ownedBy('op-self', { id: 'c-mine-2', login: 'mine2' }),
          ownedBy('op-other', { id: 'c-not-mine', login: 'other' }),
        ],
        captured,
      ),
    );
    const out = await svc.listMyCarriers(makeAuth('opiekun', 'op-self'));
    expect(captured.value).toEqual({ opiekunId: 'op-self' });
    expect(out.map((r) => r.carrierId)).toEqual(['c-mine-1', 'c-mine-2']);
  });

  it('admin sees every carrier (no opiekunId scope)', async () => {
    const captured: { value?: { opiekunId?: string } } = {};
    const svc = new OpiekunService(
      makeCarriersRepo(
        [
          ownedBy('op-1', { id: 'c-1' }),
          ownedBy('op-2', { id: 'c-2' }),
          ownedBy('op-3', { id: 'c-3' }),
        ],
        captured,
      ),
    );
    const out = await svc.listMyCarriers(makeAuth('admin', 'a-1'));
    expect(captured.value).toEqual({});
    expect(out.map((r) => r.carrierId)).toEqual(['c-1', 'c-2', 'c-3']);
  });

  it('returns an empty array when the opiekun has zero carriers', async () => {
    const svc = new OpiekunService(
      makeCarriersRepo([ownedBy('op-other', { id: 'c-other' })]),
    );
    const out = await svc.listMyCarriers(makeAuth('opiekun', 'op-empty'));
    expect(out).toEqual([]);
  });

  it.each(['przewoznik', 'planista', 'dyspozytor', 'eksport', 'weryfikator', 'pracownik'] as const)(
    'rejects role=%s with 403',
    async (role) => {
      const svc = new OpiekunService(makeCarriersRepo([]));
      await expect(
        svc.listMyCarriers(makeAuth(role)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it('maps row fields straight onto the lighter list-item DTO (no vehicle classification)', async () => {
    const svc = new OpiekunService(
      makeCarriersRepo([
        ownedBy('op-self', {
          id: 'c-zzz',
          login: 'zzz-trans',
          name: 'Zzz Sp.',
          company: 'Zzz Logistics',
          nip: '9999999999',
          active: false,
          counts: { vehicles: 4, drivers: 2, trailers: 3 },
        }),
      ]),
    );
    const out = await svc.listMyCarriers(makeAuth('opiekun', 'op-self'));
    expect(out).toEqual([
      {
        carrierId: 'c-zzz',
        login: 'zzz-trans',
        nazwa: 'Zzz Sp.',
        firma: 'Zzz Logistics',
        nip: '9999999999',
        aktywny: false,
        counts: { vehicles: 4, drivers: 2, trailers: 3 },
      },
    ]);
  });
});
