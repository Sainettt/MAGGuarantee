import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type { CarrierRow } from '../carriers/carriers.repository';
import { CarriersRepository } from '../carriers/carriers.repository';
import { TeamsRepository, type TeamRow } from '../teams/teams.repository';
import { UsersRepository, type UserRow } from '../users/users.repository';
import type { CategorizedUpload } from './attachment-validation';
import {
  VehicleAttachmentsRepository,
  type VehicleAttachmentRow,
} from './vehicle-attachments.repository';
import {
  VehiclesRepository,
  type VehicleRow,
  type VehicleRowAttachment,
} from './vehicles.repository';
import { VehiclesService } from './vehicles.service';
import { StorageService } from '../storage/storage.service';
import { collectAndValidateUploads } from './attachment-validation';

const NOW = new Date('2026-05-01T10:00:00.000Z');

function makeVehicle(overrides: Partial<VehicleRow> = {}): VehicleRow {
  return {
    id: 'v-1',
    carrierId: 'c-1',
    plateNumber: 'WA0001',
    active: true,
    notes: null,
    // Required post-phase3_blocks. `certificateL` was collapsed enum→boolean
    // in 20260515130307_vehicle_certificate_l_to_boolean.
    certificateL: true,
    // EuroNorm is now a single value { VI } — legacy III/IV/V removed.
    euro: 'VI',
    fuelCard: false,
    fuelCardNumber: null,
    fuelCardExpiry: null,
    fuelCardPin: null,
    type: 'STD',
    // min-2-of-{gb,it,fr} invariant satisfied by default (gb + it true).
    gb: true,
    it: true,
    fr: false,
    agreement: null,
    // Legacy `contract` boolean dropped — umowa is now a VehicleAttachment.
    rateDe: 0.5,
    rateUe: 0.5,
    rateExport: 0.5,
    rateImport: 0.5,
    wasteAllowed: false,
    wasteCountries: [],
    cabotageDe: false,
    cabotageFr: false,
    adr: false,
    adrClasses: [],
    gpsMobilePhone: null,
    sideNumber: null,
    lastDroveAt: null,
    plannerId: null,
    planner: null,
    dispatchTeamId: null,
    dispatchTeam: null,
    carrier: { id: 'c-1', login: 'pwz1', name: 'Pwz One' },
    opiekun: null,
    attachments: [],
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function makeRowAttachment(
  overrides: Partial<VehicleRowAttachment> = {},
): VehicleRowAttachment {
  return {
    id: 'att-1',
    vehicleId: 'v-1',
    category: 'contract',
    storageKey: 'vehicles/v-1/contract/file.pdf',
    fileName: 'umowa.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    uploadedById: 'u-actor',
    createdAt: NOW,
    ...overrides,
  };
}

function makeCarrier(overrides: Partial<CarrierRow> = {}): CarrierRow {
  return {
    id: 'c-1',
    userId: 'u-c-1',
    login: 'pwz1',
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

function makeUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'u-pl-1',
    login: 'plan',
    email: 'plan@magtrans.eu',
    passwordHash: 'hash',
    role: 'planista',
    name: 'Plan',
    active: true,
    liderEmail: null,
    teamId: null,
    mustChangePassword: false,
    passwordChangedAt: null,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
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

function makeVehiclesRepo(seed: VehicleRow[] = []): VehiclesRepository {
  const rows = new Map<string, VehicleRow>();
  for (const r of seed) rows.set(r.id, r);
  return {
    findById: jest.fn(async (id: string) => rows.get(id) ?? null),
    list: jest.fn(
      async (filters: {
        limit: number;
        carrierId?: string;
        carrierIds?: string[];
      }) => {
        let arr = [...rows.values()];
        if (filters.carrierId) {
          arr = arr.filter((r) => r.carrierId === filters.carrierId);
        } else if (filters.carrierIds) {
          if (filters.carrierIds.length === 0) {
            arr = [];
          } else {
            const set = new Set(filters.carrierIds);
            arr = arr.filter((r) => set.has(r.carrierId));
          }
        }
        return arr.slice(0, filters.limit + 1);
      },
    ),
    create: jest.fn(async (data) => {
      // Composite unique (carrierId, plateNumber).
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
      const row = makeVehicle({
        id: `v-${rows.size + 1}`,
        carrierId: data.carrierId,
        plateNumber: data.plateNumber,
        plannerId: data.plannerId ?? null,
        dispatchTeamId: data.dispatchTeamId ?? null,
        gpsMobilePhone: data.gpsMobilePhone ?? null,
        cabotageDe: data.cabotageDe ?? false,
        cabotageFr: data.cabotageFr ?? false,
        adr: data.adr ?? false,
      });
      rows.set(row.id, row);
      return row;
    }),
    update: jest.fn(async (id: string, patch: Record<string, unknown>) => {
      const cur = rows.get(id);
      if (!cur) throw new Error('not found');
      const next: VehicleRow = { ...cur, ...(patch as Partial<VehicleRow>) };
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
  } as unknown as VehiclesRepository;
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

function makeUsersRepo(seed: UserRow[] = []): UsersRepository {
  const map = new Map<string, UserRow>();
  for (const u of seed) map.set(u.id, u);
  return {
    findById: jest.fn(async (id: string) => map.get(id) ?? null),
  } as unknown as UsersRepository;
}

function makeTeam(overrides: Partial<TeamRow> = {}): TeamRow {
  return {
    id: 't-1',
    code: '1.1.13',
    name: 'Zespół 1.1.13',
    active: true,
    dispatchers: [],
    vehicleCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeTeamsRepo(seed: TeamRow[] = [makeTeam()]): TeamsRepository {
  const map = new Map<string, TeamRow>();
  for (const t of seed) map.set(t.id, t);
  return {
    findById: jest.fn(async (id: string) => map.get(id) ?? null),
  } as unknown as TeamsRepository;
}

function makeAttachmentsRepo(
  seed: VehicleAttachmentRow[] = [],
): VehicleAttachmentsRepository {
  const rows = new Map<string, VehicleAttachmentRow>();
  for (const r of seed) rows.set(r.id, r);
  let counter = rows.size;
  return {
    listByVehicle: jest.fn(async (vehicleId: string) =>
      [...rows.values()].filter(
        (r) => r.vehicleId === vehicleId && r.deletedAt === null,
      ),
    ),
    findById: jest.fn(
      async (id: string) => {
        const r = rows.get(id);
        return r && r.deletedAt === null ? r : null;
      },
    ),
    create: jest.fn(async (input) => {
      counter += 1;
      const row: VehicleAttachmentRow = makeAttachmentRow({
        id: `att-new-${counter}`,
        vehicleId: input.vehicleId,
        category: input.category,
        storageKey: input.storageKey,
        fileName: input.fileName,
        mimeType: input.mimeType,
        size: input.size,
        uploadedById: input.uploadedById,
      });
      rows.set(row.id, row);
      return row;
    }),
    softDelete: jest.fn(async (id: string) => {
      const r = rows.get(id);
      if (r) rows.set(id, { ...r, deletedAt: NOW });
    }),
    hardDelete: jest.fn(async (id: string) => {
      rows.delete(id);
    }),
  } as unknown as VehicleAttachmentsRepository;
}

function makeAttachmentRow(
  overrides: Partial<VehicleAttachmentRow> = {},
): VehicleAttachmentRow {
  return {
    id: 'att-1',
    vehicleId: 'v-1',
    category: 'contract',
    storageKey: 'vehicles/v-1/contract/file.pdf',
    fileName: 'umowa.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    uploadedById: 'u-actor',
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function makeStorage(): StorageService {
  return {
    put: jest.fn(async () => undefined),
    getObject: jest.fn(async () => ({
      body: undefined as never,
      contentType: 'application/pdf',
      contentLength: 1024,
    })),
    delete: jest.fn(async () => undefined),
  } as unknown as StorageService;
}

/** A valid in-memory uploaded file of the given category. */
function makeUpload(
  category: CategorizedUpload['category'],
  overrides: Partial<CategorizedUpload['file']> = {},
): CategorizedUpload {
  return {
    category,
    file: {
      fieldname: category,
      originalname: 'scan.pdf',
      mimetype: 'application/pdf',
      size: 2048,
      buffer: Buffer.from('pdf-bytes'),
      ...overrides,
    },
  };
}

function buildService(opts: {
  vehicles?: VehicleRow[];
  carriers?: CarrierRow[];
  users?: UserRow[];
  attachments?: VehicleAttachmentRow[];
  storage?: StorageService;
  teams?: TeamRow[];
}): {
  svc: VehiclesService;
  storage: StorageService;
  attachmentsRepo: VehicleAttachmentsRepository;
} {
  const storage = opts.storage ?? makeStorage();
  const attachmentsRepo = makeAttachmentsRepo(opts.attachments ?? []);
  const svc = new VehiclesService(
    makeVehiclesRepo(opts.vehicles ?? []),
    makeUsersRepo(opts.users ?? []),
    makeCarriersRepo(opts.carriers ?? []),
    attachmentsRepo,
    storage,
    makeTeamsRepo(opts.teams ?? [makeTeam()]),
  );
  return { svc, storage, attachmentsRepo };
}

/** Minimal payload required by the post-phase3_blocks schema. */
const REQUIRED_VEHICLE_FIELDS = {
  certificateL: true,
  euro: 'VI' as const,
  type: 'STD' as const,
  plannerId: 'u-pl',
  // Phase 11 — vehicle is assigned to a dispatch Team (default fixture t-1).
  dispatchTeamId: 't-1',
  // gpsMobilePhone deliberately OMITTED — it is now optional; omitting it means
  // no `gps` attachment is required (keeps the create tests focused on the
  // contract/cabotage rules). min-2-of-{gb,it,fr} satisfied via gb+it below.
  gb: true,
  it: true,
  rateDe: 0.5,
  rateUe: 0.5,
  rateExport: 0.5,
  rateImport: 0.5,
};

/** Base scalar DTO for create — no attachments / flags requiring files. */
function createDto(overrides: Record<string, unknown> = {}) {
  return {
    carrierId: 'c-1',
    plateNumber: 'WA0002',
    fuelCard: false,
    wasteAllowed: false,
    cabotageDe: false,
    cabotageFr: false,
    adr: false,
    ...REQUIRED_VEHICLE_FIELDS,
    ...overrides,
  } as Parameters<VehiclesService['create']>[1];
}

function makeValidPeople(): UserRow[] {
  return [makeUser({ id: 'u-pl', role: 'planista' })];
}

describe('VehiclesService', () => {
  // ── Create — scalar / role / conflict (existing coverage) ──

  it('admin can create with valid plannerId/dispatchTeamId', async () => {
    const { svc } = buildService({
      carriers: [makeCarrier()],
      users: makeValidPeople(),
    });
    const out = await svc.create(makeAuth('admin', 'a-1'), createDto(), [
      makeUpload('contract'),
    ]);
    expect(out.plateNumber).toBe('WA0002');
    expect(out.plannerId).toBe('u-pl');
  });

  it('rejects wrong role for plannerId (422)', async () => {
    const { svc } = buildService({
      carriers: [makeCarrier()],
      users: [
        makeUser({ id: 'u-x', role: 'opiekun' }),
        makeUser({ id: 'u-dy', role: 'dyspozytor' }),
      ],
    });
    await expect(
      svc.create(makeAuth('admin', 'a-1'), createDto({ plannerId: 'u-x' }), []),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('rejects a non-existent dispatchTeamId (422)', async () => {
    const { svc } = buildService({
      carriers: [makeCarrier()],
      users: makeValidPeople(),
      teams: [makeTeam({ id: 't-1' })],
    });
    await expect(
      svc.create(
        makeAuth('admin', 'a-1'),
        createDto({ dispatchTeamId: 't-missing' }),
        [],
      ),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('rejects an inactive dispatchTeamId (422)', async () => {
    const { svc } = buildService({
      carriers: [makeCarrier()],
      users: makeValidPeople(),
      teams: [makeTeam({ id: 't-1', active: false })],
    });
    await expect(
      svc.create(
        makeAuth('admin', 'a-1'),
        createDto({ dispatchTeamId: 't-1' }),
        [],
      ),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('translates duplicate (carrierId, plateNumber) into 409', async () => {
    const { svc } = buildService({
      vehicles: [makeVehicle({ carrierId: 'c-1', plateNumber: 'WA0001' })],
      carriers: [makeCarrier()],
      users: makeValidPeople(),
    });
    await expect(
      svc.create(
        makeAuth('admin', 'a-1'),
        createDto({ plateNumber: 'WA0001' }),
        // Provide the contract so we reach the duplicate-detection step (which
        // runs after the required-attachment assert) and get a 409, not 422.
        [makeUpload('contract')],
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('opiekun cannot write to a carrier they do not own', async () => {
    const { svc } = buildService({
      carriers: [makeCarrier({ id: 'c-other', opiekunId: 'op-2' })],
      users: makeValidPeople(),
    });
    await expect(
      svc.create(
        makeAuth('opiekun', 'op-1'),
        createDto({ carrierId: 'c-other' }),
        [],
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('przewoznik can create only on their own carrier', async () => {
    const { svc } = buildService({
      carriers: [makeCarrier({ id: 'c-mine', userId: 'u-self' })],
      users: makeValidPeople(),
    });
    await expect(
      svc.create(
        makeAuth('przewoznik', 'u-self'),
        createDto({ carrierId: 'c-mine' }),
        [makeUpload('contract')],
      ),
    ).resolves.toMatchObject({ plateNumber: 'WA0002' });
  });

  // ── Create — HARD fuelCard ⇒ agreement cross-field rule ────
  // A fuel card mandates the porozumienie FLAG (save-blocking, 422). This is
  // the HARD gate on the FLAG only — UNRELATED to the soft, derived
  // `fuelCardBlocked` badge (missing porozumienie SCAN), which is left
  // untouched. Keep the Zod refine message and the service message aligned:
  // 'Karta paliwowa wymaga zaznaczenia porozumienia'.

  it('create with fuelCard=true and agreement=false → 422 (karta paliwowa wymaga porozumienia)', async () => {
    const { svc } = buildService({
      carriers: [makeCarrier()],
      users: makeValidPeople(),
    });
    await expect(
      svc.create(
        makeAuth('admin', 'a-1'),
        createDto({
          fuelCard: true,
          fuelCardNumber: '1234567890123456',
          fuelCardExpiry: '2030-01-01',
          fuelCardPin: '1234',
          agreement: false,
        }),
        [makeUpload('contract')],
      ),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('create with fuelCard=true and agreement omitted → 422 (absent counts as false)', async () => {
    const { svc } = buildService({
      carriers: [makeCarrier()],
      users: makeValidPeople(),
    });
    await expect(
      svc.create(
        makeAuth('admin', 'a-1'),
        createDto({
          fuelCard: true,
          fuelCardNumber: '1234567890123456',
          fuelCardExpiry: '2030-01-01',
          fuelCardPin: '1234',
        }),
        [makeUpload('contract')],
      ),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('create with fuelCard=true and agreement=true succeeds', async () => {
    const { svc } = buildService({
      carriers: [makeCarrier()],
      users: makeValidPeople(),
    });
    await expect(
      svc.create(
        makeAuth('admin', 'a-1'),
        createDto({
          fuelCard: true,
          fuelCardNumber: '1234567890123456',
          fuelCardExpiry: '2030-01-01',
          fuelCardPin: '1234',
          agreement: true,
        }),
        [makeUpload('contract')],
      ),
      // The create passing (no throw) is the assertion — the in-memory mock
      // repo echoes a fixed fixture row and doesn't round-trip fuelCard, so we
      // assert on plateNumber only (mirrors the neighboring create tests).
    ).resolves.toMatchObject({ plateNumber: 'WA0002' });
  });

  // ── Update — HARD fuelCard ⇒ agreement over the effective post-patch state ──

  it('update setting fuelCard=true on an agreement=false vehicle → 422 (agreement absent from payload)', async () => {
    const { svc } = buildService({
      vehicles: [
        makeVehicle({ id: 'v-1', fuelCard: false, agreement: false }),
      ],
      carriers: [makeCarrier()],
      users: makeValidPeople(),
    });
    await expect(
      svc.update(
        'v-1',
        {
          fuelCard: true,
          fuelCardNumber: '1234567890123456',
          fuelCardExpiry: '2030-01-01',
          fuelCardPin: '1234',
        },
        [],
      ),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('update setting fuelCard=true on an agreement=null vehicle → 422 (null counts as false)', async () => {
    const { svc } = buildService({
      vehicles: [makeVehicle({ id: 'v-1', fuelCard: false, agreement: null })],
      carriers: [makeCarrier()],
      users: makeValidPeople(),
    });
    await expect(
      svc.update(
        'v-1',
        {
          fuelCard: true,
          fuelCardNumber: '1234567890123456',
          fuelCardExpiry: '2030-01-01',
          fuelCardPin: '1234',
        },
        [],
      ),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('update setting agreement=false on a fuelCard=true vehicle → 422 (inverse edit, fuelCard absent)', async () => {
    const { svc } = buildService({
      vehicles: [
        makeVehicle({
          id: 'v-1',
          fuelCard: true,
          fuelCardNumber: '1234567890123456',
          fuelCardExpiry: NOW,
          fuelCardPin: '1234',
          agreement: true,
        }),
      ],
      carriers: [makeCarrier()],
      users: makeValidPeople(),
    });
    await expect(
      svc.update('v-1', { agreement: false }, []),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('update setting fuelCard=false on an agreement=false vehicle → ok (no card, no porozumienie needed)', async () => {
    const { svc } = buildService({
      vehicles: [
        makeVehicle({
          id: 'v-1',
          fuelCard: true,
          fuelCardNumber: '1234567890123456',
          fuelCardExpiry: NOW,
          fuelCardPin: '1234',
          agreement: false,
        }),
      ],
      carriers: [makeCarrier()],
      users: makeValidPeople(),
    });
    await expect(
      svc.update('v-1', { fuelCard: false }, []),
    ).resolves.toMatchObject({ id: 'v-1', fuelCard: false });
  });

  // ── Create — required-attachment rule ──────────────────────

  // NOTE (2026-06-17, resolved): the `contract` (umowa) attachment is now
  // UNCONDITIONALLY required on create (every vehicle has an umowa). It used to
  // be gated on the legacy `gps=true` toggle and was temporarily dropped when
  // that boolean was removed; it is now mandatory for every create regardless
  // of any flag. Cabotage attachments stay conditional on their flags.

  it('create with a contract attachment uploads it to storage', async () => {
    const { svc, storage, attachmentsRepo } = buildService({
      carriers: [makeCarrier()],
      users: makeValidPeople(),
    });
    const out = await svc.create(
      makeAuth('admin', 'a-1'),
      createDto(),
      [makeUpload('contract')],
    );
    expect(out.plateNumber).toBe('WA0002');
    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(attachmentsRepo.create).toHaveBeenCalledTimes(1);
  });

  it('create WITHOUT a contract attachment → 422 (umowa is unconditionally required)', async () => {
    const { svc } = buildService({
      carriers: [makeCarrier()],
      users: makeValidPeople(),
    });
    await expect(
      svc.create(makeAuth('admin', 'a-1'), createDto(), []),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('cabotageDe=true requires contract + cabotage_de + cabotage_de_insurance (422 when cabotage_de missing)', async () => {
    const { svc } = buildService({
      carriers: [makeCarrier()],
      users: makeValidPeople(),
    });
    // Provide contract + insurance so the failure is the missing cabotage_de.
    await expect(
      svc.create(
        makeAuth('admin', 'a-1'),
        createDto({ cabotageDe: true }),
        [makeUpload('contract'), makeUpload('cabotage_de_insurance')],
      ),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('cabotageDe=true requires the cabotage_de_insurance scan too (422 when insurance missing)', async () => {
    const { svc } = buildService({
      carriers: [makeCarrier()],
      users: makeValidPeople(),
    });
    await expect(
      svc.create(
        makeAuth('admin', 'a-1'),
        createDto({ cabotageDe: true }),
        [makeUpload('contract'), makeUpload('cabotage_de')],
      ),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('gpsMobilePhone set ⇒ requires a gps attachment (422 when missing)', async () => {
    const { svc } = buildService({
      carriers: [makeCarrier()],
      users: makeValidPeople(),
    });
    await expect(
      svc.create(
        makeAuth('admin', 'a-1'),
        createDto({ gpsMobilePhone: '+48600100200' }),
        [makeUpload('contract')],
      ),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('create with contract + cabotage_de + cabotage_de_insurance (cabotageDe true) succeeds', async () => {
    const { svc } = buildService({
      carriers: [makeCarrier()],
      users: makeValidPeople(),
    });
    await expect(
      svc.create(
        makeAuth('admin', 'a-1'),
        createDto({ cabotageDe: true, cabotageFr: true }),
        [
          makeUpload('contract'),
          makeUpload('cabotage_de'),
          makeUpload('cabotage_de_insurance'),
        ],
      ),
    ).resolves.toMatchObject({ plateNumber: 'WA0002' });
  });

  it('required-attachment rule is checked BEFORE the vehicle is created', async () => {
    const vehiclesRepo = makeVehiclesRepo([]);
    const svc = new VehiclesService(
      vehiclesRepo,
      makeUsersRepo(makeValidPeople()),
      makeCarriersRepo([makeCarrier()]),
      makeAttachmentsRepo([]),
      makeStorage(),
      makeTeamsRepo(),
    );
    // No contract attachment → must 422 before any vehicle row is created.
    await expect(
      svc.create(makeAuth('admin', 'a-1'), createDto(), []),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(vehiclesRepo.create).not.toHaveBeenCalled();
  });

  it('rolls back the vehicle + uploaded objects when an attachment insert fails', async () => {
    const storage = makeStorage();
    const vehiclesRepo = makeVehiclesRepo([]);
    const attachmentsRepo = makeAttachmentsRepo([]);
    (attachmentsRepo.create as jest.Mock).mockRejectedValueOnce(
      new Error('db down'),
    );
    const svc = new VehiclesService(
      vehiclesRepo,
      makeUsersRepo(makeValidPeople()),
      makeCarriersRepo([makeCarrier()]),
      attachmentsRepo,
      storage,
      makeTeamsRepo(),
    );
    await expect(
      svc.create(
        makeAuth('admin', 'a-1'),
        createDto({ cabotageDe: true }),
        // contract + cabotage_de + insurance: passes the required-attachment
        // assert so we reach the attachment-insert step that the mock rejects.
        [
          makeUpload('contract'),
          makeUpload('cabotage_de'),
          makeUpload('cabotage_de_insurance'),
        ],
      ),
    ).rejects.toThrow('db down');
    // first upload's object cleaned up, vehicle row removed.
    expect(storage.delete).toHaveBeenCalledTimes(1);
    expect(vehiclesRepo.hardDelete).toHaveBeenCalledTimes(1);
  });

  // ── File-type / size validation (collectAndValidateUploads) ──

  it('rejects a disallowed MIME type with 422', () => {
    expect(() =>
      collectAndValidateUploads({
        contract: [
          {
            fieldname: 'contract',
            originalname: 'evil.exe',
            mimetype: 'application/x-msdownload',
            size: 10,
            buffer: Buffer.from('x'),
          },
        ],
      }),
    ).toThrow(UnprocessableEntityException);
  });

  it('rejects an oversized file (>10 MB) with 422', () => {
    expect(() =>
      collectAndValidateUploads({
        contract: [
          {
            fieldname: 'contract',
            originalname: 'huge.pdf',
            mimetype: 'application/pdf',
            size: 11 * 1024 * 1024,
            buffer: Buffer.alloc(0),
          },
        ],
      }),
    ).toThrow(UnprocessableEntityException);
  });

  it('accepts jpeg / png / webp / pdf and tags them by category', () => {
    const uploads = collectAndValidateUploads({
      contract: [
        {
          fieldname: 'contract',
          originalname: 'a.jpg',
          mimetype: 'image/jpeg',
          size: 10,
          buffer: Buffer.from('x'),
        },
      ],
      cabotageDe: [
        {
          fieldname: 'cabotageDe',
          originalname: 'b.png',
          mimetype: 'image/png',
          size: 10,
          buffer: Buffer.from('x'),
        },
      ],
      cabotageDeInsurance: [
        {
          fieldname: 'cabotageDeInsurance',
          originalname: 'c.webp',
          mimetype: 'image/webp',
          size: 10,
          buffer: Buffer.from('x'),
        },
      ],
    });
    expect(uploads.map((u) => u.category).sort()).toEqual([
      'cabotage_de',
      'cabotage_de_insurance',
      'contract',
    ]);
  });

  // ── Update — required-attachment rule over the post-update set ──

  // NOTE: the unconditional `contract` requirement applies only at CREATE.
  // On update, only the cabotage flags trigger a required attachment — editing
  // an existing vehicle never re-blocks on the umowa scan. The remaining update
  // tests exercise the cabotage rule and the soft-delete + re-upload mechanics.

  it('update flipping cabotageDe→true with no existing/new cabotage_de → 422', async () => {
    const { svc } = buildService({
      vehicles: [makeVehicle({ id: 'v-1', cabotageDe: false })],
      carriers: [makeCarrier()],
      users: makeValidPeople(),
    });
    await expect(
      svc.update('v-1', { cabotageDe: true }, []),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('update flipping cabotageDe→true is satisfied by existing cabotage_de + insurance attachments', async () => {
    const attDe = makeRowAttachment({ id: 'att-1', category: 'cabotage_de' });
    const attIns = makeRowAttachment({
      id: 'att-2',
      category: 'cabotage_de_insurance',
    });
    const { svc } = buildService({
      vehicles: [
        makeVehicle({
          id: 'v-1',
          cabotageDe: false,
          attachments: [attDe, attIns],
        }),
      ],
      carriers: [makeCarrier()],
      users: makeValidPeople(),
      attachments: [
        makeAttachmentRow({ id: 'att-1', category: 'cabotage_de' }),
        makeAttachmentRow({ id: 'att-2', category: 'cabotage_de_insurance' }),
      ],
    });
    await expect(
      svc.update('v-1', { cabotageDe: true }, []),
    ).resolves.toMatchObject({ id: 'v-1', cabotageDe: true });
  });

  it('update rejects removing the only cabotage_de while cabotageDe stays true (422)', async () => {
    const att = makeRowAttachment({ id: 'att-1', category: 'cabotage_de' });
    const { svc } = buildService({
      vehicles: [
        makeVehicle({ id: 'v-1', cabotageDe: true, attachments: [att] }),
      ],
      carriers: [makeCarrier()],
      users: makeValidPeople(),
      attachments: [
        makeAttachmentRow({ id: 'att-1', category: 'cabotage_de' }),
      ],
    });
    await expect(
      svc.update('v-1', { removeAttachmentIds: ['att-1'] }, []),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('update allows removing a contract when a new one is uploaded in the same request', async () => {
    const att = makeRowAttachment({ id: 'att-1', category: 'contract' });
    const { svc, attachmentsRepo } = buildService({
      vehicles: [makeVehicle({ id: 'v-1', attachments: [att] })],
      carriers: [makeCarrier()],
      users: makeValidPeople(),
      attachments: [makeAttachmentRow({ id: 'att-1', category: 'contract' })],
    });
    await expect(
      svc.update('v-1', { removeAttachmentIds: ['att-1'] }, [
        makeUpload('contract'),
      ]),
    ).resolves.toMatchObject({ id: 'v-1' });
    expect(attachmentsRepo.softDelete).toHaveBeenCalledWith('att-1');
    expect(attachmentsRepo.create).toHaveBeenCalledTimes(1);
  });

  it('update rejects a removeAttachmentId that is not on this vehicle (404)', async () => {
    const { svc } = buildService({
      vehicles: [makeVehicle({ id: 'v-1' })],
      carriers: [makeCarrier()],
      users: makeValidPeople(),
      attachments: [
        makeAttachmentRow({ id: 'att-other', vehicleId: 'v-OTHER' }),
      ],
    });
    await expect(
      svc.update('v-1', { removeAttachmentIds: ['att-other'] }, []),
    ).rejects.toThrow(NotFoundException);
  });

  // ── Attachment endpoints ──────────────────────────────────

  it('listAttachments returns DTOs without the internal storageKey', async () => {
    const { svc } = buildService({
      vehicles: [makeVehicle({ id: 'v-1' })],
      attachments: [makeAttachmentRow({ id: 'att-1', vehicleId: 'v-1' })],
    });
    const list = await svc.listAttachments('v-1');
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('storageKey');
    expect(list[0]?.id).toBe('att-1');
  });

  it('downloadAttachment streams via storage and rejects a foreign attachment', async () => {
    const storage = makeStorage();
    const { svc } = buildService({
      vehicles: [makeVehicle({ id: 'v-1' })],
      attachments: [makeAttachmentRow({ id: 'att-1', vehicleId: 'v-1' })],
      storage,
    });
    const res = await svc.downloadAttachment('v-1', 'att-1');
    expect(res.fileName).toBe('umowa.pdf');
    expect(storage.getObject).toHaveBeenCalledWith(
      'vehicles/v-1/contract/file.pdf',
    );
    await expect(
      svc.downloadAttachment('v-1', 'att-missing'),
    ).rejects.toThrow(NotFoundException);
  });

  it('deleteAttachment soft-deletes the row and leaves the storage object', async () => {
    const storage = makeStorage();
    const { svc, attachmentsRepo } = buildService({
      vehicles: [makeVehicle({ id: 'v-1' })],
      attachments: [makeAttachmentRow({ id: 'att-1', vehicleId: 'v-1' })],
      storage,
    });
    await svc.deleteAttachment('v-1', 'att-1');
    expect(attachmentsRepo.softDelete).toHaveBeenCalledWith('att-1');
    expect(storage.delete).not.toHaveBeenCalled();
  });

  // ── List / read / lifecycle (existing coverage) ────────────

  it('list for przewoznik forces carrierId=their own', async () => {
    const { svc } = buildService({
      vehicles: [
        makeVehicle({ id: 'v-1', carrierId: 'c-mine' }),
        makeVehicle({ id: 'v-2', carrierId: 'c-other' }),
      ],
      carriers: [makeCarrier({ id: 'c-mine', userId: 'u-self' })],
    });
    const out = await svc.list(makeAuth('przewoznik', 'u-self'), { limit: 50 });
    expect(out.items).toHaveLength(1);
    expect(out.items[0]?.id).toBe('v-1');
  });

  // ── Phase 5.1 — opiekun list scoping ────────────────────────
  // Per docs/03-roles.md#opiekun an opiekun sees vehicles of carriers they
  // own. Before Phase 5.1 we required them to pass `carrierId` explicitly
  // (422 stub). The fix: narrow by the union of their owned carriers.

  it('opiekun list without carrierId returns vehicles of all their carriers (no 422)', async () => {
    const cA = makeCarrier({ id: 'c-A', login: 'a', opiekunId: 'op-1' });
    const cB = makeCarrier({ id: 'c-B', login: 'b', opiekunId: 'op-1' });
    const cX = makeCarrier({ id: 'c-X', login: 'x', opiekunId: 'op-other' });
    const { svc } = buildService({
      vehicles: [
        makeVehicle({ id: 'v-A1', carrierId: 'c-A' }),
        makeVehicle({ id: 'v-B1', carrierId: 'c-B' }),
        makeVehicle({ id: 'v-X1', carrierId: 'c-X' }),
      ],
      carriers: [cA, cB, cX],
    });
    const out = await svc.list(makeAuth('opiekun', 'op-1'), { limit: 50 });
    const ids = out.items.map((v) => v.id).sort();
    expect(ids).toEqual(['v-A1', 'v-B1']);
  });

  it('opiekun list with carrierId in their set keeps the narrow filter', async () => {
    const cA = makeCarrier({ id: 'c-A', login: 'a', opiekunId: 'op-1' });
    const cB = makeCarrier({ id: 'c-B', login: 'b', opiekunId: 'op-1' });
    const { svc } = buildService({
      vehicles: [
        makeVehicle({ id: 'v-A1', carrierId: 'c-A' }),
        makeVehicle({ id: 'v-B1', carrierId: 'c-B' }),
      ],
      carriers: [cA, cB],
    });
    const out = await svc.list(makeAuth('opiekun', 'op-1'), {
      limit: 50,
      carrierId: 'c-A',
    });
    expect(out.items.map((v) => v.id)).toEqual(['v-A1']);
  });

  it('opiekun list with carrierId NOT in their set → 403', async () => {
    const cA = makeCarrier({ id: 'c-A', login: 'a', opiekunId: 'op-1' });
    const cX = makeCarrier({ id: 'c-X', login: 'x', opiekunId: 'op-other' });
    const { svc } = buildService({
      vehicles: [
        makeVehicle({ id: 'v-A1', carrierId: 'c-A' }),
        makeVehicle({ id: 'v-X1', carrierId: 'c-X' }),
      ],
      carriers: [cA, cX],
    });
    await expect(
      svc.list(makeAuth('opiekun', 'op-1'), { limit: 50, carrierId: 'c-X' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('opiekun with zero owned carriers gets an empty list (not 422)', async () => {
    const { svc } = buildService({
      vehicles: [makeVehicle({ id: 'v-X1', carrierId: 'c-X' })],
      carriers: [
        makeCarrier({ id: 'c-X', login: 'x', opiekunId: 'op-other' }),
      ],
    });
    const out = await svc.list(makeAuth('opiekun', 'op-1'), { limit: 50 });
    expect(out.items).toEqual([]);
    expect(out.nextCursor).toBeNull();
  });

  it('getById 404 for missing vehicle', async () => {
    const { svc } = buildService({});
    await expect(svc.getById('missing')).rejects.toThrow(NotFoundException);
  });

  it('deactivate flips active=false and rejects double-deactivate', async () => {
    const { svc } = buildService({
      vehicles: [makeVehicle({ active: true })],
    });
    const out = await svc.deactivate('v-1');
    expect(out.active).toBe(false);
    await expect(svc.deactivate('v-1')).rejects.toThrow(ConflictException);
  });
});
