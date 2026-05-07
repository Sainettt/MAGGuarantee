import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type { CarrierRow } from '../carriers/carriers.repository';
import { CarriersRepository } from '../carriers/carriers.repository';
import {
  TrailerTypesRepository,
  type TrailerTypeRow,
} from '../trailer-types/trailer-types.repository';
import { TrailersRepository, type TrailerRow } from './trailers.repository';
import { TrailersService } from './trailers.service';

const NOW = new Date('2026-05-01T10:00:00.000Z');

function makeTrailer(overrides: Partial<TrailerRow> = {}): TrailerRow {
  return {
    id: 't-1',
    carrierId: 'c-1',
    plateNumber: 'NA0001',
    active: true,
    trailerTypeId: 'tt-fixture',
    trailerType: {
      id: 'tt-fixture',
      name: 'Firanka',
      shortCode: null,
      active: true,
    },
    brand: null,
    model: null,
    year: null,
    equipment: null,
    nextInspectionDate: null,
    belts: null,
    mats: null,
    innerLength: null,
    innerWidth: null,
    innerHeight: null,
    capacity: null,
    airSuspension: null,
    loadFromBack: null,
    loadFromSide: null,
    loadFromTop: null,
    slidingRoof: null,
    edschaSlidingRoof: null,
    notes: null,
    carrier: { id: 'c-1', login: 'pwz1', name: null },
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
    // Required post-phase3_blocks.
    email: 'carrier@magtrans.eu',
    name: 'Pwz One',
    company: null,
    active: true,
    nip: null,
    vatId: null,
    contactPerson: 'Jan Kontakt',
    phone: '+48000000000',
    ordersEmail: 'zlecenia@example.com',
    accountEur: 'PL00 0000 0000 0000',
    accountPln: null,
    paymentTerms: 30,
    insuranceValue: 0,
    insuranceExpiry: NOW,
    licenseExpiry: NOW,
    numberOfPermits: null,
    companyAddress: 'ul. Testowa 1',
    opiekunId: 'op-fixture',
    opiekun: { id: 'op-fixture', login: 'op', name: null },
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function makeType(overrides: Partial<TrailerTypeRow> = {}): TrailerTypeRow {
  return {
    id: 'tt-1',
    name: 'Firanka',
    shortCode: null,
    description: null,
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
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
  };
}

function makeTrailersRepo(seed: TrailerRow[] = []): TrailersRepository {
  const rows = new Map<string, TrailerRow>();
  for (const r of seed) rows.set(r.id, r);
  return {
    findById: jest.fn(async (id: string) => rows.get(id) ?? null),
    list: jest.fn(async (filters: { limit: number; carrierId?: string }) => {
      let arr = [...rows.values()];
      if (filters.carrierId)
        arr = arr.filter((r) => r.carrierId === filters.carrierId);
      return arr.slice(0, filters.limit + 1);
    }),
    create: jest.fn(async (data) => {
      if (
        [...rows.values()].some(
          (r) =>
            r.carrierId === data.carrierId && r.plateNumber === data.plateNumber,
        )
      ) {
        throw Object.assign(new Error('P2002'), {
          code: 'P2002',
          meta: { target: ['carrierId', 'plateNumber'] },
        });
      }
      const trailerTypeId = data.trailerTypeId ?? 'tt-fixture';
      const row = makeTrailer({
        id: `t-${rows.size + 1}`,
        carrierId: data.carrierId,
        plateNumber: data.plateNumber,
        trailerTypeId,
        trailerType: {
          id: trailerTypeId,
          name: 'Firanka',
          shortCode: null,
          active: true,
        },
      });
      rows.set(row.id, row);
      return row;
    }),
    update: jest.fn(async (id: string, patch: Record<string, unknown>) => {
      const cur = rows.get(id);
      if (!cur) throw new Error('not found');
      const next = { ...cur, ...(patch as Partial<TrailerRow>) };
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
  } as unknown as TrailersRepository;
}

function makeCarriersRepo(seed: CarrierRow[] = []): CarriersRepository {
  const rows = new Map<string, CarrierRow>();
  for (const r of seed) rows.set(r.id, r);
  return {
    findById: jest.fn(async (id: string) => rows.get(id) ?? null),
    list: jest.fn(async (filters: { limit: number; opiekunId?: string }) => {
      let arr = [...rows.values()];
      if (filters.opiekunId)
        arr = arr.filter((r) => r.opiekunId === filters.opiekunId);
      return arr.slice(0, filters.limit + 1);
    }),
  } as unknown as CarriersRepository;
}

function makeTypesRepo(seed: TrailerTypeRow[] = []): TrailerTypesRepository {
  const map = new Map<string, TrailerTypeRow>();
  for (const t of seed) map.set(t.id, t);
  return {
    findById: jest.fn(async (id: string) => map.get(id) ?? null),
  } as unknown as TrailerTypesRepository;
}

describe('TrailersService', () => {
  it('admin creates trailer with valid active trailerTypeId', async () => {
    const t = makeType({ id: 'tt-1', active: true });
    const svc = new TrailersService(
      makeTrailersRepo(),
      makeCarriersRepo([makeCarrier()]),
      makeTypesRepo([t]),
    );
    const out = await svc.create(makeAuth('admin', 'a-1'), {
      carrierId: 'c-1',
      plateNumber: 'NA0002',
      trailerTypeId: 'tt-1',
    });
    expect(out.plateNumber).toBe('NA0002');
    expect(out.trailerTypeId).toBe('tt-1');
  });

  it('rejects creation with inactive trailerTypeId (422)', async () => {
    const t = makeType({ id: 'tt-1', active: false });
    const svc = new TrailersService(
      makeTrailersRepo(),
      makeCarriersRepo([makeCarrier()]),
      makeTypesRepo([t]),
    );
    await expect(
      svc.create(makeAuth('admin', 'a-1'), {
        carrierId: 'c-1',
        plateNumber: 'NA0002',
        trailerTypeId: 'tt-1',
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('rejects creation with missing trailerTypeId (422)', async () => {
    const svc = new TrailersService(
      makeTrailersRepo(),
      makeCarriersRepo([makeCarrier()]),
      makeTypesRepo(),
    );
    await expect(
      svc.create(makeAuth('admin', 'a-1'), {
        carrierId: 'c-1',
        plateNumber: 'NA0002',
        trailerTypeId: 'tt-missing',
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('translates duplicate (carrierId, plateNumber) into 409', async () => {
    const dup = makeTrailer({ carrierId: 'c-1', plateNumber: 'NA0001' });
    const t = makeType({ id: 'tt-1', active: true });
    const svc = new TrailersService(
      makeTrailersRepo([dup]),
      makeCarriersRepo([makeCarrier()]),
      makeTypesRepo([t]),
    );
    await expect(
      svc.create(makeAuth('admin', 'a-1'), {
        carrierId: 'c-1',
        plateNumber: 'NA0001',
        trailerTypeId: 'tt-1',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('opiekun cannot create on non-owned carrier (403)', async () => {
    const carrier = makeCarrier({ id: 'c-other', opiekunId: 'op-2' });
    const t = makeType({ id: 'tt-1', active: true });
    const svc = new TrailersService(
      makeTrailersRepo(),
      makeCarriersRepo([carrier]),
      makeTypesRepo([t]),
    );
    await expect(
      svc.create(makeAuth('opiekun', 'op-1'), {
        carrierId: 'c-other',
        plateNumber: 'NA0009',
        trailerTypeId: 'tt-1',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('getById 404 on missing trailer', async () => {
    const svc = new TrailersService(
      makeTrailersRepo(),
      makeCarriersRepo(),
      makeTypesRepo(),
    );
    await expect(svc.getById('missing')).rejects.toThrow(NotFoundException);
  });
});
