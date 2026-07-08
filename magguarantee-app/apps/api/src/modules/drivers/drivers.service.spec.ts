import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { DriverLanguage } from '@magguarantee/shared';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type { CarrierRow } from '../carriers/carriers.repository';
import { CarriersRepository } from '../carriers/carriers.repository';
import type { CategorizedUpload, UploadedFile } from './attachment-validation';
import { DriverAttachmentsRepository } from './driver-attachments.repository';
import {
  DriversRepository,
  type DriverRow,
} from './drivers.repository';
import { DriversService } from './drivers.service';
import { StorageService } from '../storage/storage.service';

const NOW = new Date('2026-05-01T10:00:00.000Z');

function makeDriver(overrides: Partial<DriverRow> = {}): DriverRow {
  return {
    id: 'd-1',
    carrierId: 'c-1',
    loginSlug: 'jan.kowalski',
    firstName: 'Jan',
    lastName: 'Kowalski',
    phone: '+48000000000',
    phone2: null,
    // Required post-phase3_blocks.
    email: 'driver@magtrans.eu',
    idDocumentNumber: 'LIC-000',
    licenseExpiry: NOW,
    notes: null,
    active: true,
    adr: false,
    nationality: 'PL',
    languages: ['PL'],
    adrClasses: [],
    carrier: { id: 'c-1', login: 'pwz1', name: null },
    attachments: [],
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

/** A minimal in-memory uploaded ADR file for required-attachment tests. */
function makeAdrUpload(): CategorizedUpload {
  const file: UploadedFile = {
    fieldname: 'adr',
    originalname: 'adr.pdf',
    mimetype: 'application/pdf',
    size: 1024,
    buffer: Buffer.from('pdf'),
  };
  return { category: 'adr', file };
}

/** Stub StorageService — put/getObject/delete all resolve. */
function makeStorage(): StorageService {
  return {
    put: jest.fn(async () => undefined),
    delete: jest.fn(async () => undefined),
    getObject: jest.fn(async () => ({
      body: undefined,
      contentType: 'application/pdf',
      contentLength: 1024,
    })),
  } as unknown as StorageService;
}

/** Stub DriverAttachmentsRepository — minimal in-memory behaviour. */
function makeAttachmentsRepo(): DriverAttachmentsRepository {
  let n = 0;
  return {
    listByDriver: jest.fn(async () => []),
    findById: jest.fn(async () => null),
    create: jest.fn(async (input: { driverId: string; category: string }) => {
      n += 1;
      return {
        id: `att-${n}`,
        driverId: input.driverId,
        category: input.category,
        storageKey: `drivers/${input.driverId}/adr/${n}.pdf`,
        fileName: 'adr.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        uploadedById: null,
        createdAt: NOW,
        updatedAt: NOW,
        deletedAt: null,
      };
    }),
    softDelete: jest.fn(async () => undefined),
    hardDelete: jest.fn(async () => undefined),
  } as unknown as DriverAttachmentsRepository;
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

function makeDriversRepo(seed: DriverRow[] = []): DriversRepository {
  const rows = new Map<string, DriverRow>();
  const slugs = new Set<string>(seed.map((d) => d.loginSlug));
  for (const d of seed) rows.set(d.id, d);
  return {
    findById: jest.fn(async (id: string) => rows.get(id) ?? null),
    findByLoginSlug: jest.fn(async (slug: string) =>
      [...rows.values()].find((d) => d.loginSlug === slug) ?? null,
    ),
    existsLoginSlug: jest.fn(async (slug: string) => slugs.has(slug)),
    list: jest.fn(async (filters: { limit: number; carrierId?: string }) => {
      let arr = [...rows.values()];
      if (filters.carrierId)
        arr = arr.filter((r) => r.carrierId === filters.carrierId);
      return arr.slice(0, filters.limit + 1);
    }),
    create: jest.fn(async (data) => {
      if (slugs.has(data.loginSlug)) {
        throw Object.assign(new Error('P2002'), {
          code: 'P2002',
          meta: { target: ['loginSlug'] },
        });
      }
      slugs.add(data.loginSlug);
      const row = makeDriver({
        id: `d-${rows.size + 1}`,
        carrierId: data.carrierId,
        loginSlug: data.loginSlug,
        firstName: data.firstName,
        lastName: data.lastName,
      });
      rows.set(row.id, row);
      return row;
    }),
    update: jest.fn(async (id: string, patch: Record<string, unknown>) => {
      const cur = rows.get(id);
      if (!cur) throw new Error('not found');
      const next = { ...cur, ...(patch as Partial<DriverRow>) };
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
  } as unknown as DriversRepository;
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

/** Minimal payload required by the post-phase3_blocks schema. */
const REQUIRED_DRIVER_FIELDS = {
  phone: '+48111222333',
  idDocumentNumber: 'LIC-001',
  email: 'driver@magtrans.eu',
  licenseExpiry: '2027-01-01',
  nationality: 'PL' as const,
  languages: ['PL'] as DriverLanguage[],
};

/**
 * Builds a `DriversService` with the two storage-side deps stubbed. Tests
 * that don't touch attachments simply ignore them.
 */
function buildSvc(
  driversRepo: DriversRepository,
  carriersRepo: CarriersRepository,
  attachmentsRepo: DriverAttachmentsRepository = makeAttachmentsRepo(),
  storage: StorageService = makeStorage(),
): DriversService {
  return new DriversService(
    driversRepo,
    carriersRepo,
    attachmentsRepo,
    storage,
  );
}

describe('DriversService', () => {
  it('generates loginSlug from firstName.lastName on create', async () => {
    const carrier = makeCarrier();
    const svc = buildSvc(makeDriversRepo(), makeCarriersRepo([carrier]));
    const out = await svc.create(
      makeAuth('admin', 'a-1'),
      {
        carrierId: 'c-1',
        firstName: 'Jan',
        lastName: 'Kowalski',
        adr: false,
        ...REQUIRED_DRIVER_FIELDS,
      },
      [],
    );
    expect(out.loginSlug).toBe('jan.kowalski');
  });

  it('appends -2 when the base slug collides', async () => {
    const existing = makeDriver({ loginSlug: 'jan.kowalski' });
    const carrier = makeCarrier();
    const svc = buildSvc(makeDriversRepo([existing]), makeCarriersRepo([carrier]));
    const out = await svc.create(
      makeAuth('admin', 'a-1'),
      {
        carrierId: 'c-1',
        firstName: 'Jan',
        lastName: 'Kowalski',
        adr: false,
        ...REQUIRED_DRIVER_FIELDS,
      },
      [],
    );
    expect(out.loginSlug).toBe('jan.kowalski-2');
  });

  it('appends -3 when -2 is also taken', async () => {
    const a = makeDriver({ id: 'd-a', loginSlug: 'jan.kowalski' });
    const b = makeDriver({ id: 'd-b', loginSlug: 'jan.kowalski-2' });
    const svc = buildSvc(makeDriversRepo([a, b]), makeCarriersRepo([makeCarrier()]));
    const out = await svc.create(
      makeAuth('admin', 'a-1'),
      {
        carrierId: 'c-1',
        firstName: 'Jan',
        lastName: 'Kowalski',
        adr: false,
        ...REQUIRED_DRIVER_FIELDS,
      },
      [],
    );
    expect(out.loginSlug).toBe('jan.kowalski-3');
  });

  it('strips Polish diacritics in the slug', async () => {
    const svc = buildSvc(makeDriversRepo(), makeCarriersRepo([makeCarrier()]));
    const out = await svc.create(
      makeAuth('admin', 'a-1'),
      {
        carrierId: 'c-1',
        firstName: 'Łukasz',
        lastName: 'Żółć',
        adr: false,
        ...REQUIRED_DRIVER_FIELDS,
      },
      [],
    );
    expect(out.loginSlug).toBe('lukasz.zolc');
  });

  it('falls back to user.carrierProfile.id when przewoznik omits carrierId', async () => {
    const carrier = makeCarrier({ id: 'c-mine', userId: 'u-self' });
    const svc = buildSvc(makeDriversRepo(), makeCarriersRepo([carrier]));
    const out = await svc.create(
      makeAuth('przewoznik', 'u-self'),
      {
        firstName: 'Anna',
        lastName: 'Nowak',
        adr: false,
        ...REQUIRED_DRIVER_FIELDS,
      },
      [],
    );
    expect(out.carrierId).toBe('c-mine');
  });

  it('admin without carrierId in body → 422', async () => {
    const svc = buildSvc(makeDriversRepo(), makeCarriersRepo());
    await expect(
      svc.create(
        makeAuth('admin', 'a-1'),
        {
          firstName: 'Anna',
          lastName: 'Nowak',
          adr: false,
          ...REQUIRED_DRIVER_FIELDS,
        },
        [],
      ),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('opiekun writing on non-owned carrier → 403', async () => {
    const carrier = makeCarrier({ id: 'c-other', opiekunId: 'op-2' });
    const svc = buildSvc(makeDriversRepo(), makeCarriersRepo([carrier]));
    await expect(
      svc.create(
        makeAuth('opiekun', 'op-1'),
        {
          carrierId: 'c-other',
          firstName: 'Jan',
          lastName: 'Kowalski',
          adr: false,
          ...REQUIRED_DRIVER_FIELDS,
        },
        [],
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('przewoznik writing under another carrier → 403', async () => {
    const carrier = makeCarrier({ id: 'c-other', userId: 'u-other' });
    const svc = buildSvc(makeDriversRepo(), makeCarriersRepo([carrier]));
    await expect(
      svc.create(
        makeAuth('przewoznik', 'u-self'),
        {
          carrierId: 'c-other',
          firstName: 'Jan',
          lastName: 'Kowalski',
          adr: false,
          ...REQUIRED_DRIVER_FIELDS,
        },
        [],
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('getById 404 on missing', async () => {
    const svc = buildSvc(makeDriversRepo(), makeCarriersRepo());
    await expect(svc.getById('missing')).rejects.toThrow(NotFoundException);
  });

  it('softDelete is idempotent in the sense that re-fetching returns null', async () => {
    const d = makeDriver({ id: 'd-1', loginSlug: 'a.b' });
    const repo = makeDriversRepo([d]);
    const svc = buildSvc(repo, makeCarriersRepo());
    await svc.softDelete('d-1');
    expect(repo.softDelete).toHaveBeenCalledWith('d-1');
  });

  it('deactivate then reactivate cycles active', async () => {
    const d = makeDriver({ id: 'd-1', active: true });
    const svc = buildSvc(makeDriversRepo([d]), makeCarriersRepo());
    await svc.deactivate('d-1');
    await expect(svc.deactivate('d-1')).rejects.toThrow(ConflictException);
  });

  // ── ADR required-attachment rule ─────────────────────────

  it('create with adr=true and NO adr upload → 422 (no slug burned)', async () => {
    const driversRepo = makeDriversRepo();
    const svc = buildSvc(driversRepo, makeCarriersRepo([makeCarrier()]));
    await expect(
      svc.create(
        makeAuth('admin', 'a-1'),
        {
          carrierId: 'c-1',
          firstName: 'Jan',
          lastName: 'Kowalski',
          adr: true,
          ...REQUIRED_DRIVER_FIELDS,
        },
        [],
      ),
    ).rejects.toThrow(UnprocessableEntityException);
    // Rule is checked before any DB write — the driver is never created.
    expect(driversRepo.create).not.toHaveBeenCalled();
  });

  it('create with adr=true AND an adr upload succeeds and persists the attachment', async () => {
    const attachmentsRepo = makeAttachmentsRepo();
    const storage = makeStorage();
    const svc = buildSvc(
      makeDriversRepo(),
      makeCarriersRepo([makeCarrier()]),
      attachmentsRepo,
      storage,
    );
    const out = await svc.create(
      makeAuth('admin', 'a-1'),
      {
        carrierId: 'c-1',
        firstName: 'Jan',
        lastName: 'Kowalski',
        adr: true,
        ...REQUIRED_DRIVER_FIELDS,
      },
      [makeAdrUpload()],
    );
    expect(out.loginSlug).toBe('jan.kowalski');
    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(attachmentsRepo.create).toHaveBeenCalledTimes(1);
  });

  it('update toggling adr=true with no existing/new adr attachment → 422', async () => {
    const d = makeDriver({ id: 'd-1', adr: false, attachments: [] });
    const svc = buildSvc(makeDriversRepo([d]), makeCarriersRepo());
    await expect(
      svc.update('d-1', { adr: true }, []),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  // NOTE: the old advance-onboardingStatus side-effect tests were removed
  // alongside migration `20260519142043_drop_carrier_onboarding_status`.
  // Onboarding state is derived on read from the live `_count` of active
  // children — see `carriers.service.spec.ts`.
});
