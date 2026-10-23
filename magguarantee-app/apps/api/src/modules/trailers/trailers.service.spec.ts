import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type { CarrierRow } from '../carriers/carriers.repository';
import { CarriersRepository } from '../carriers/carriers.repository';
import { PrismaService } from '../prisma/prisma.service';
import { INCLUDE_SOFT_DELETED } from '../prisma/soft-delete.extension';
import { StorageService } from '../storage/storage.service';
import {
  TrailerTypesRepository,
  type TrailerTypeRow,
} from '../trailer-types/trailer-types.repository';
import type { CategorizedUpload } from './attachment-validation';
import { TrailerAttachmentsRepository } from './trailer-attachments.repository';
import { TrailersRepository, type TrailerRow } from './trailers.repository';
import { TrailersService } from './trailers.service';
import { makeAuthUser } from '../../common/testing/make-auth-user';

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
    belts: null,
    beltsCount: null,
    mats: null,
    matsCount: null,
    beams: null,
    beamsCount: null,
    innerLength: null,
    innerWidth: null,
    innerHeight: null,
    capacity: null,
    sideClearanceCm: 60,
    liftingRoof: false,
    slidingRoof: false,
    edscha: null,
    palletBox: false,
    certXl: null,
    multilock: null,
    notes: null,
    carrier: { id: 'c-1', login: 'pwz1', name: null },
    attachments: [],
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
    nip: '0000000000',
    vatId: 'PL0000000000',
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
    counts: { vehicles: 1, trailers: 1, drivers: 1 },
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
  return makeAuthUser(role, {
    sub,
    login: 'actor',
    email: 'actor@magtrans.eu',
    name: 'Actor',
    mustChangePassword: false,
  });
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
    hardDelete: jest.fn(async (id: string) => {
      rows.delete(id);
    }),
    // Default: no referencing delegations — hard-delete is allowed. The
    // reference-guard tests override this per-case.
    countReferencingRows: jest.fn(async () => 0),
  } as unknown as TrailersRepository;
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

function makeAttachmentsRepo(): TrailerAttachmentsRepository {
  return {
    listByTrailer: jest.fn(async () => []),
    findById: jest.fn(async () => null),
    create: jest.fn(async (input: { trailerId: string }) => ({
      id: 'att-new',
      trailerId: input.trailerId,
      category: 'cert_xl',
      storageKey: 'trailers/x/cert_xl/f.pdf',
      fileName: 'cert.pdf',
      mimeType: 'application/pdf',
      size: 1,
      uploadedById: null,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    })),
    softDelete: jest.fn(async () => undefined),
    hardDelete: jest.fn(async () => undefined),
  } as unknown as TrailerAttachmentsRepository;
}

function makeStorage(): StorageService {
  return {
    put: jest.fn(async () => undefined),
    delete: jest.fn(async () => undefined),
    getObject: jest.fn(async () => ({
      body: undefined,
      contentType: 'application/pdf',
      contentLength: 1,
    })),
  } as unknown as StorageService;
}

/** Builds a service with the two storage-side deps stubbed. */
function build(
  trailersRepo: TrailersRepository,
  carriersRepo: CarriersRepository,
  typesRepo: TrailerTypesRepository,
  attachmentsRepo: TrailerAttachmentsRepository = makeAttachmentsRepo(),
  storage: StorageService = makeStorage(),
): TrailersService {
  return new TrailersService(
    trailersRepo,
    carriersRepo,
    typesRepo,
    attachmentsRepo,
    storage,
  );
}

/** A valid in-memory cert_xl (PDF) upload. */
function makeCertXlUpload(): CategorizedUpload {
  return {
    category: 'cert_xl',
    file: {
      fieldname: 'certXl',
      originalname: 'cert.pdf',
      mimetype: 'application/pdf',
      size: 2048,
      buffer: Buffer.from('pdf'),
    },
  };
}

/** Base create dto — sideClearanceCm is REQUIRED. */
function createDto(overrides: Record<string, unknown> = {}) {
  return {
    carrierId: 'c-1',
    plateNumber: 'NA0002',
    trailerTypeId: 'tt-1',
    sideClearanceCm: 60,
    ...overrides,
  } as Parameters<TrailersService['create']>[1];
}

describe('TrailersService', () => {
  it('admin creates trailer with valid active trailerTypeId', async () => {
    const t = makeType({ id: 'tt-1', active: true });
    const svc = build(
      makeTrailersRepo(),
      makeCarriersRepo([makeCarrier()]),
      makeTypesRepo([t]),
    );
    const out = await svc.create(makeAuth('admin', 'a-1'), createDto(), []);
    expect(out.plateNumber).toBe('NA0002');
    expect(out.trailerTypeId).toBe('tt-1');
  });

  it('rejects creation with inactive trailerTypeId (422)', async () => {
    const t = makeType({ id: 'tt-1', active: false });
    const svc = build(
      makeTrailersRepo(),
      makeCarriersRepo([makeCarrier()]),
      makeTypesRepo([t]),
    );
    await expect(
      svc.create(makeAuth('admin', 'a-1'), createDto(), []),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('rejects creation with missing trailerTypeId (422)', async () => {
    const svc = build(
      makeTrailersRepo(),
      makeCarriersRepo([makeCarrier()]),
      makeTypesRepo(),
    );
    await expect(
      svc.create(
        makeAuth('admin', 'a-1'),
        createDto({ trailerTypeId: 'tt-missing' }),
        [],
      ),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('translates duplicate (carrierId, plateNumber) into 409', async () => {
    const dup = makeTrailer({ carrierId: 'c-1', plateNumber: 'NA0001' });
    const t = makeType({ id: 'tt-1', active: true });
    const svc = build(
      makeTrailersRepo([dup]),
      makeCarriersRepo([makeCarrier()]),
      makeTypesRepo([t]),
    );
    await expect(
      svc.create(makeAuth('admin', 'a-1'), createDto({ plateNumber: 'NA0001' }), []),
    ).rejects.toThrow(ConflictException);
  });

  it('opiekun cannot create on non-owned carrier (403)', async () => {
    const carrier = makeCarrier({ id: 'c-other', opiekunId: 'op-2' });
    const t = makeType({ id: 'tt-1', active: true });
    const svc = build(
      makeTrailersRepo(),
      makeCarriersRepo([carrier]),
      makeTypesRepo([t]),
    );
    await expect(
      svc.create(
        makeAuth('opiekun', 'op-1'),
        createDto({ carrierId: 'c-other', plateNumber: 'NA0009' }),
        [],
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('getById 404 on missing trailer', async () => {
    const svc = build(makeTrailersRepo(), makeCarriersRepo(), makeTypesRepo());
    await expect(svc.getById('missing')).rejects.toThrow(NotFoundException);
  });

  // ── cert_xl required-attachment rule ──────────────────────

  it('certXl=true without a cert_xl upload → 422', async () => {
    const t = makeType({ id: 'tt-1', active: true });
    const svc = build(
      makeTrailersRepo(),
      makeCarriersRepo([makeCarrier()]),
      makeTypesRepo([t]),
    );
    await expect(
      svc.create(makeAuth('admin', 'a-1'), createDto({ certXl: true }), []),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('certXl=true WITH a cert_xl PDF upload succeeds', async () => {
    const t = makeType({ id: 'tt-1', active: true });
    const svc = build(
      makeTrailersRepo(),
      makeCarriersRepo([makeCarrier()]),
      makeTypesRepo([t]),
    );
    await expect(
      svc.create(makeAuth('admin', 'a-1'), createDto({ certXl: true }), [
        makeCertXlUpload(),
      ]),
    ).resolves.toMatchObject({ plateNumber: 'NA0002' });
  });

  // ── min-3 counts + edscha cross-field rules ───────────────

  it('belts=true with beltsCount<3 → 422', async () => {
    const t = makeType({ id: 'tt-1', active: true });
    const svc = build(
      makeTrailersRepo(),
      makeCarriersRepo([makeCarrier()]),
      makeTypesRepo([t]),
    );
    await expect(
      svc.create(
        makeAuth('admin', 'a-1'),
        createDto({ belts: true, beltsCount: 2 }),
        [],
      ),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('beams=true with beamsCount≥3 succeeds', async () => {
    const t = makeType({ id: 'tt-1', active: true });
    const svc = build(
      makeTrailersRepo(),
      makeCarriersRepo([makeCarrier()]),
      makeTypesRepo([t]),
    );
    await expect(
      svc.create(
        makeAuth('admin', 'a-1'),
        createDto({ beams: true, beamsCount: 3 }),
        [],
      ),
    ).resolves.toMatchObject({ plateNumber: 'NA0002' });
  });

  it('slidingRoof=true without edscha → 422', async () => {
    const t = makeType({ id: 'tt-1', active: true });
    const svc = build(
      makeTrailersRepo(),
      makeCarriersRepo([makeCarrier()]),
      makeTypesRepo([t]),
    );
    await expect(
      svc.create(
        makeAuth('admin', 'a-1'),
        createDto({ slidingRoof: true }),
        [],
      ),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('slidingRoof=true with edscha set succeeds', async () => {
    const t = makeType({ id: 'tt-1', active: true });
    const svc = build(
      makeTrailersRepo(),
      makeCarriersRepo([makeCarrier()]),
      makeTypesRepo([t]),
    );
    await expect(
      svc.create(
        makeAuth('admin', 'a-1'),
        createDto({ slidingRoof: true, edscha: true }),
        [],
      ),
    ).resolves.toMatchObject({ plateNumber: 'NA0002' });
  });

  // ── Hard-delete reference guard (409 TRAILER_HAS_REFERENCES) ─
  // `Delegation.trailerId` is ON DELETE RESTRICT (incl. soft-deleted).
  // Hard-delete must refuse deterministically with a 409, not a P2003 → 500.

  it('hardDelete with referencing rows → 409 TRAILER_HAS_REFERENCES', async () => {
    const repo = makeTrailersRepo([makeTrailer({ id: 't-1' })]);
    (repo.countReferencingRows as jest.Mock).mockResolvedValueOnce(2);
    const svc = build(repo, makeCarriersRepo(), makeTypesRepo());
    const err = await catchConflict(() => svc.hardDelete('t-1', 'reason'));
    expectReferencesCode(err, 'TRAILER_HAS_REFERENCES');
    expect(repo.hardDelete).not.toHaveBeenCalled();
  });

  it('hardDelete with ONLY soft-deleted referencing rows → still 409 (count uses INCLUDE_SOFT_DELETED)', async () => {
    const repo = makeTrailersRepo([makeTrailer({ id: 't-1' })]);
    (repo.countReferencingRows as jest.Mock).mockResolvedValueOnce(1);
    const svc = build(repo, makeCarriersRepo(), makeTypesRepo());
    const err = await catchConflict(() => svc.hardDelete('t-1', 'reason'));
    expectReferencesCode(err, 'TRAILER_HAS_REFERENCES');
    expect(repo.hardDelete).not.toHaveBeenCalled();
  });

  it('hardDelete on an unreferenced trailer succeeds (repo.hardDelete called)', async () => {
    const repo = makeTrailersRepo([makeTrailer({ id: 't-1' })]);
    const svc = build(repo, makeCarriersRepo(), makeTypesRepo());
    await expect(svc.hardDelete('t-1', 'reason')).resolves.toBeUndefined();
    expect(repo.hardDelete).toHaveBeenCalledWith('t-1');
  });

  it('hardDelete translates a late repo P2003 into the same 409 (TOCTOU)', async () => {
    const repo = makeTrailersRepo([makeTrailer({ id: 't-1' })]);
    (repo.hardDelete as jest.Mock).mockRejectedValueOnce(makeP2003());
    const svc = build(repo, makeCarriersRepo(), makeTypesRepo());
    const err = await catchConflict(() => svc.hardDelete('t-1', 'reason'));
    expectReferencesCode(err, 'TRAILER_HAS_REFERENCES');
  });

  it('hardDelete on a missing trailer → 404', async () => {
    const svc = build(makeTrailersRepo(), makeCarriersRepo(), makeTypesRepo());
    await expect(svc.hardDelete('missing', 'reason')).rejects.toThrow(
      NotFoundException,
    );
  });
});

// ── Repository-level proof that the reference count passes the escape hatch ──
// A soft-deleted delegation is hidden from the soft-delete extension's read
// filter but STILL physically blocks the RESTRICT FK, so the count MUST opt in
// via `[INCLUDE_SOFT_DELETED]`.
describe('TrailersRepository.countReferencingRows', () => {
  it('counts delegations by trailerId and passes INCLUDE_SOFT_DELETED', async () => {
    const delegationCount = jest.fn(async (_args: unknown) => 5);
    const prisma = {
      tx: { delegation: { count: delegationCount } },
    } as unknown as PrismaService;
    const repo = new TrailersRepository(prisma);

    const total = await repo.countReferencingRows('t-1');

    expect(total).toBe(5);
    const arg = delegationCount.mock.calls[0]?.[0] as Record<
      string | symbol,
      unknown
    >;
    expect(arg.where).toEqual({ trailerId: 't-1' });
    expect(arg[INCLUDE_SOFT_DELETED]).toBe(true);
  });
});
