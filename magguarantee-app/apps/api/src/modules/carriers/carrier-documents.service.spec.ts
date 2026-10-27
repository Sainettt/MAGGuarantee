import { NotFoundException } from '@nestjs/common';

import {
  permissionsFor,
  type CarrierAttachmentDto,
  type CarrierDocumentsOverviewDto,
  type CarrierDocVehicleEntry,
} from '@magguarantee/shared';

import { makeAuthUser } from '../../common/testing/make-auth-user';
import type { CarrierAttachmentsService } from './carrier-attachments.service';
import type {
  CarrierAdrVehicleRow,
  CarrierDocumentsRepository,
  CarrierDriverAttachmentRow,
  CarrierTrailerAttachmentRow,
  CarrierVehicleAttachmentRow,
} from './carrier-documents.repository';
import { CarrierDocumentsService } from './carrier-documents.service';
import type { CarriersRepository } from './carriers.repository';

const CARRIER_ID = 'c-1';
const NOW = new Date('2026-07-09T10:00:00.000Z');

/** Default viewer — the opiekun of the "Dokumenty" tab (role holder). */
const OPIEKUN = makeAuthUser('opiekun');
const ADMIN = makeAuthUser('admin');
/**
 * A przewoznik as he actually reaches the route: role permissions plus the B6
 * per-user grant of `carrier_documents.read` (without it the route is 403).
 */
const CARRIER_VIEWER = makeAuthUser('przewoznik', {
  permissions: new Set([
    ...permissionsFor('przewoznik', false),
    'carrier_documents.read',
  ]),
});

/** Every vehicle-document entry across the three category buckets. */
function allVehicleEntries(
  out: CarrierDocumentsOverviewDto,
): CarrierDocVehicleEntry[] {
  return [
    ...out.vehicleDocs.gps,
    ...out.vehicleDocs.agreement,
    ...out.vehicleDocs.cabotage_de_insurance,
  ];
}

function carrierDoc(
  overrides: Partial<CarrierAttachmentDto> = {},
): CarrierAttachmentDto {
  return {
    id: 'ca-1',
    carrierId: CARRIER_ID,
    category: 'insurance',
    fileName: 'ocp.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    uploadedById: 'u-1',
    createdAt: NOW.toISOString(),
    ...overrides,
  };
}

function vehicleRow(
  overrides: Partial<CarrierVehicleAttachmentRow> = {},
): CarrierVehicleAttachmentRow {
  return {
    attachmentId: 'va-1',
    category: 'agreement',
    fileName: 'porozumienie.pdf',
    size: 2048,
    createdAt: NOW,
    vehicleId: 'v-1',
    registration: 'PL1234',
    sideNumber: '101',
    ...overrides,
  };
}

function adrVehicle(
  overrides: Partial<CarrierAdrVehicleRow> = {},
): CarrierAdrVehicleRow {
  return {
    vehicleId: 'v-adr',
    plate: 'PL9999',
    adrClasses: ['3', '8'],
    ...overrides,
  };
}

function trailerRow(
  overrides: Partial<CarrierTrailerAttachmentRow> = {},
): CarrierTrailerAttachmentRow {
  return {
    attachmentId: 'ta-1',
    category: 'cert_xl',
    fileName: 'xl.pdf',
    size: 512,
    createdAt: NOW,
    trailerId: 't-1',
    registration: 'PLTR01',
    ...overrides,
  };
}

function driverRow(
  overrides: Partial<CarrierDriverAttachmentRow> = {},
): CarrierDriverAttachmentRow {
  return {
    attachmentId: 'da-1',
    category: 'adr',
    fileName: 'swiadectwo.pdf',
    size: 256,
    createdAt: NOW,
    driverId: 'd-1',
    fullName: 'Jan Kowalski',
    ...overrides,
  };
}

interface Seed {
  carrierExists?: boolean;
  carrierDocs?: CarrierAttachmentDto[];
  vehicleRows?: CarrierVehicleAttachmentRow[];
  adrVehicles?: CarrierAdrVehicleRow[];
  trailerRows?: CarrierTrailerAttachmentRow[];
  driverRows?: CarrierDriverAttachmentRow[];
}

function setup(seed: Seed = {}) {
  const {
    carrierExists = true,
    carrierDocs = [],
    vehicleRows = [],
    adrVehicles = [],
    trailerRows = [],
    driverRows = [],
  } = seed;

  const carriers = {
    findById: jest.fn(async () => (carrierExists ? { id: CARRIER_ID } : null)),
  } as unknown as CarriersRepository;

  const listVehicleAttachments = jest.fn(async () => vehicleRows);
  const listAdrVehicles = jest.fn(async () => adrVehicles);
  const listTrailerAttachments = jest.fn(async () => trailerRows);
  const listDriverAttachments = jest.fn(async () => driverRows);
  const documents = {
    listVehicleAttachments,
    listAdrVehicles,
    listTrailerAttachments,
    listDriverAttachments,
  } as unknown as CarrierDocumentsRepository;

  const list = jest.fn(async () => carrierDocs);
  const carrierAttachments = { list } as unknown as CarrierAttachmentsService;

  const service = new CarrierDocumentsService(
    carriers,
    documents,
    carrierAttachments,
  );

  return {
    service,
    carriers,
    documents,
    carrierAttachments,
    spies: {
      listVehicleAttachments,
      listAdrVehicles,
      listTrailerAttachments,
      listDriverAttachments,
      listCarrierDocs: list,
    },
  };
}

describe('CarrierDocumentsService.overview', () => {
  it('404 when the carrier does not exist (no group reads)', async () => {
    const { service, spies } = setup({ carrierExists: false });
    await expect(service.overview(OPIEKUN, CARRIER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(spies.listCarrierDocs).not.toHaveBeenCalled();
    expect(spies.listVehicleAttachments).not.toHaveBeenCalled();
  });

  it('returns the carrierId and a stable empty grouping for a bare carrier', async () => {
    const { service } = setup();
    const out = await service.overview(OPIEKUN, CARRIER_ID);
    expect(out.carrierId).toBe(CARRIER_ID);
    expect(out.carrierDocs).toEqual([]);
    // Every vehicle-doc category key is always present.
    expect(out.vehicleDocs).toEqual({
      gps: [],
      agreement: [],
      cabotage_de_insurance: [],
    });
    expect(out.vehicleAdr).toEqual([]);
    expect(out.trailerDocs).toEqual([]);
    expect(out.driverDocs).toEqual([]);
  });

  it('passes through the carrier company documents from the attachments service', async () => {
    const docs = [
      carrierDoc({ id: 'ca-a', category: 'insurance' }),
      carrierDoc({ id: 'ca-b', category: 'license' }),
    ];
    const { service } = setup({ carrierDocs: docs });
    const out = await service.overview(OPIEKUN, CARRIER_ID);
    expect(out.carrierDocs).toEqual(docs);
  });

  it('groups vehicle documents by category', async () => {
    const { service } = setup({
      vehicleRows: [
        vehicleRow({ attachmentId: 'va-g1', category: 'gps' }),
        vehicleRow({ attachmentId: 'va-g2', category: 'gps', vehicleId: 'v-2' }),
        vehicleRow({ attachmentId: 'va-a', category: 'agreement' }),
        vehicleRow({
          attachmentId: 'va-dei',
          category: 'cabotage_de_insurance',
        }),
      ],
    });
    const out = await service.overview(OPIEKUN, CARRIER_ID);
    expect(out.vehicleDocs.gps.map((e) => e.attachmentId)).toEqual([
      'va-g1',
      'va-g2',
    ]);
    expect(out.vehicleDocs.agreement.map((e) => e.attachmentId)).toEqual([
      'va-a',
    ]);
    expect(
      out.vehicleDocs.cabotage_de_insurance.map((e) => e.attachmentId),
    ).toEqual(['va-dei']);
  });

  it('carries the vehicle identity and download id on each vehicle entry', async () => {
    const { service } = setup({
      vehicleRows: [
        vehicleRow({
          attachmentId: 'va-x',
          vehicleId: 'v-42',
          registration: 'PL4242',
          sideNumber: '42',
          fileName: 'porozumienie-42.pdf',
          size: 4242,
        }),
      ],
    });
    const out = await service.overview(OPIEKUN, CARRIER_ID);
    expect(out.vehicleDocs.agreement[0]).toEqual({
      attachmentId: 'va-x',
      fileName: 'porozumienie-42.pdf',
      size: 4242,
      createdAt: NOW.toISOString(),
      vehicle: { id: 'v-42', registration: 'PL4242', sideNumber: '42' },
    });
  });

  it('requests every vehicle document category (agreement included)', async () => {
    const { service, spies } = setup();
    await service.overview(OPIEKUN, CARRIER_ID);
    expect(spies.listVehicleAttachments).toHaveBeenCalledWith(CARRIER_ID, [
      'gps',
      'agreement',
      'cabotage_de_insurance',
    ]);
  });

  it('surfaces ADR-flagged vehicles with classes and NO file', async () => {
    const { service } = setup({
      adrVehicles: [
        adrVehicle({ vehicleId: 'v-a1', plate: 'PL0001', adrClasses: ['3'] }),
        adrVehicle({ vehicleId: 'v-a2', plate: 'PL0002', adrClasses: [] }),
      ],
    });
    const out = await service.overview(OPIEKUN, CARRIER_ID);
    expect(out.vehicleAdr).toEqual([
      { vehicleId: 'v-a1', plate: 'PL0001', adrClasses: ['3'] },
      { vehicleId: 'v-a2', plate: 'PL0002', adrClasses: [] },
    ]);
    // No `attachmentId`/`fileName` keys — ADR-per-vehicle is flag-only.
    expect(out.vehicleAdr[0]).not.toHaveProperty('attachmentId');
  });

  it('maps trailer XL certificates with the trailer registration + download id', async () => {
    const { service } = setup({
      trailerRows: [
        trailerRow({
          attachmentId: 'ta-9',
          trailerId: 't-9',
          registration: 'PLTR99',
        }),
      ],
    });
    const out = await service.overview(OPIEKUN, CARRIER_ID);
    expect(out.trailerDocs).toEqual([
      {
        attachmentId: 'ta-9',
        fileName: 'xl.pdf',
        size: 512,
        createdAt: NOW.toISOString(),
        trailerId: 't-9',
        registration: 'PLTR99',
      },
    ]);
  });

  it('maps driver ADR świadectwa with the driver full name + download id', async () => {
    const { service } = setup({
      driverRows: [
        driverRow({
          attachmentId: 'da-7',
          driverId: 'd-7',
          fullName: 'Anna Nowak',
        }),
      ],
    });
    const out = await service.overview(OPIEKUN, CARRIER_ID);
    expect(out.driverDocs).toEqual([
      {
        attachmentId: 'da-7',
        fileName: 'swiadectwo.pdf',
        size: 256,
        createdAt: NOW.toISOString(),
        driverId: 'd-7',
        fullName: 'Anna Nowak',
      },
    ]);
  });

  it('assembles a full multi-group overview', async () => {
    const { service } = setup({
      carrierDocs: [carrierDoc()],
      vehicleRows: [vehicleRow()],
      adrVehicles: [adrVehicle()],
      trailerRows: [trailerRow()],
      driverRows: [driverRow()],
    });
    const out = await service.overview(OPIEKUN, CARRIER_ID);
    expect(out.carrierDocs).toHaveLength(1);
    expect(out.vehicleDocs.agreement).toHaveLength(1);
    expect(out.vehicleAdr).toHaveLength(1);
    expect(out.trailerDocs).toHaveLength(1);
    expect(out.driverDocs).toHaveLength(1);
  });
});

describe('CarrierDocumentsService.overview — sideNumber scrub by viewer role (docs/14 B.5)', () => {
  /** One file per category, on three vehicles that all have a side number. */
  const VEHICLE_ROWS = [
    vehicleRow({ attachmentId: 'va-g', category: 'gps', vehicleId: 'v-1', sideNumber: '101' }),
    vehicleRow({ attachmentId: 'va-a', category: 'agreement', vehicleId: 'v-2', sideNumber: '102' }),
    vehicleRow({
      attachmentId: 'va-d',
      category: 'cabotage_de_insurance',
      vehicleId: 'v-3',
      sideNumber: '103',
    }),
  ];

  it('przewoznik viewer: sideNumber is null on every vehicle ref, in every category', async () => {
    const { service } = setup({ vehicleRows: VEHICLE_ROWS });
    const out = await service.overview(CARRIER_VIEWER, CARRIER_ID);

    const entries = allVehicleEntries(out);
    expect(entries).toHaveLength(3);
    for (const entry of entries) {
      expect(entry.vehicle.sideNumber).toBeNull();
    }
  });

  it('przewoznik viewer: only sideNumber is scrubbed — ids, plates, files and other groups intact', async () => {
    const { service } = setup({
      carrierDocs: [carrierDoc()],
      vehicleRows: [vehicleRow({ attachmentId: 'va-x', vehicleId: 'v-42', registration: 'PL4242', sideNumber: '42' })],
      adrVehicles: [adrVehicle()],
      trailerRows: [trailerRow()],
      driverRows: [driverRow()],
    });
    const asCarrier = await service.overview(CARRIER_VIEWER, CARRIER_ID);
    const asOpiekun = await service.overview(OPIEKUN, CARRIER_ID);

    expect(asCarrier.vehicleDocs.agreement[0]).toEqual({
      attachmentId: 'va-x',
      fileName: 'porozumienie.pdf',
      size: 2048,
      createdAt: NOW.toISOString(),
      vehicle: { id: 'v-42', registration: 'PL4242', sideNumber: null },
    });
    // Everything outside vehicleDocs is identical to the opiekun's view.
    expect({ ...asCarrier, vehicleDocs: null }).toEqual({
      ...asOpiekun,
      vehicleDocs: null,
    });
  });

  it('przewoznik viewer: an unset sideNumber stays null', async () => {
    const { service } = setup({
      vehicleRows: [vehicleRow({ category: 'gps', sideNumber: null })],
    });
    const out = await service.overview(CARRIER_VIEWER, CARRIER_ID);
    expect(out.vehicleDocs.gps[0]?.vehicle.sideNumber).toBeNull();
  });

  it.each([
    ['admin', ADMIN],
    ['opiekun', OPIEKUN],
  ] as const)('%s viewer keeps the stored sideNumber on every vehicle ref', async (_role, viewer) => {
    const { service } = setup({ vehicleRows: VEHICLE_ROWS });
    const out = await service.overview(viewer, CARRIER_ID);

    expect(allVehicleEntries(out).map((e) => [e.vehicle.id, e.vehicle.sideNumber])).toEqual([
      ['v-1', '101'],
      ['v-2', '102'],
      ['v-3', '103'],
    ]);
  });

  it('is keyed on the role, not on a permission — the documents grant does not reveal it', async () => {
    // The przewoznik holds exactly the right that opens the route for admin /
    // opiekun; the scrub must still apply (no catalog right gates sideNumber).
    expect(CARRIER_VIEWER.permissions.has('carrier_documents.read')).toBe(true);
    expect(OPIEKUN.permissions.has('carrier_documents.read')).toBe(true);

    const { service } = setup({ vehicleRows: VEHICLE_ROWS });
    const out = await service.overview(CARRIER_VIEWER, CARRIER_ID);
    expect(allVehicleEntries(out).every((e) => e.vehicle.sideNumber === null)).toBe(true);
  });
});
