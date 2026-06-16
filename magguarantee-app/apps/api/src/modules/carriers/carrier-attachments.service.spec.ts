import { ConflictException, NotFoundException } from '@nestjs/common';

import type { CarrierAttachmentCategory } from '@magguarantee/shared';

import type { UploadedFile } from '../../common/attachments';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type { StorageService } from '../storage/storage.service';
import { CarrierAttachmentsService } from './carrier-attachments.service';
import type {
  CarrierAttachmentRow,
  CarrierAttachmentsRepository,
} from './carrier-attachments.repository';
import type { CarriersRepository } from './carriers.repository';

/**
 * Service-layer tests for `CarrierAttachmentsService.upload`, focused on the
 * "at most one ADR document per carrier" rule (the `adr` single-doc category).
 * The repos / storage are jest-fn doubles, mirroring `carriers.service.spec.ts`.
 */

const NOW = new Date('2026-05-29T10:00:00.000Z');
const CARRIER_ID = 'c-1';

function makeUser(): AuthUser {
  return {
    sub: 'u-actor',
    login: 'op1',
    email: 'op1@magtrans.eu',
    name: 'Op One',
    role: 'opiekun',
    mustChangePassword: false,
  };
}

function makeFile(overrides: Partial<UploadedFile> = {}): UploadedFile {
  return {
    fieldname: 'file',
    originalname: 'adr-doc.pdf',
    mimetype: 'application/pdf',
    size: 1024,
    buffer: Buffer.from('bytes'),
    ...overrides,
  };
}

function makeAttachmentRow(
  category: CarrierAttachmentCategory,
  overrides: Partial<CarrierAttachmentRow> = {},
): CarrierAttachmentRow {
  return {
    id: 'att-1',
    carrierId: CARRIER_ID,
    category,
    storageKey: `carriers/${CARRIER_ID}/${category}/file.pdf`,
    fileName: 'adr-doc.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    uploadedById: 'u-actor',
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

interface Mocks {
  service: CarrierAttachmentsService;
  carriers: { findById: jest.Mock };
  attachments: {
    countActiveByCategory: jest.Mock;
    create: jest.Mock;
  };
  storage: { put: jest.Mock; delete: jest.Mock };
}

function setup(opts: {
  carrierExists?: boolean;
  activeAdrCount?: number;
} = {}): Mocks {
  const { carrierExists = true, activeAdrCount = 0 } = opts;

  const carriers = {
    findById: jest.fn(async () => (carrierExists ? { id: CARRIER_ID } : null)),
  };
  const attachments = {
    countActiveByCategory: jest.fn(async () => activeAdrCount),
    create: jest.fn(async (input: { category: CarrierAttachmentCategory }) =>
      makeAttachmentRow(input.category),
    ),
  };
  const storage = {
    put: jest.fn(async () => undefined),
    delete: jest.fn(async () => undefined),
  };

  const service = new CarrierAttachmentsService(
    carriers as unknown as CarriersRepository,
    attachments as unknown as CarrierAttachmentsRepository,
    storage as unknown as StorageService,
  );

  return { service, carriers, attachments, storage };
}

describe('CarrierAttachmentsService.upload — single-ADR-doc rule', () => {
  it('uploads the FIRST adr document when none exists', async () => {
    const { service, attachments, storage } = setup({ activeAdrCount: 0 });

    const dto = await service.upload(
      makeUser(),
      CARRIER_ID,
      'adr',
      makeFile(),
    );

    expect(attachments.countActiveByCategory).toHaveBeenCalledWith(
      CARRIER_ID,
      'adr',
    );
    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(attachments.create).toHaveBeenCalledTimes(1);
    expect(dto.category).toBe('adr');
  });

  it('rejects a SECOND adr document with 409 and NO MinIO write', async () => {
    const { service, attachments, storage } = setup({ activeAdrCount: 1 });

    await expect(
      service.upload(makeUser(), CARRIER_ID, 'adr', makeFile()),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(attachments.countActiveByCategory).toHaveBeenCalledWith(
      CARRIER_ID,
      'adr',
    );
    expect(storage.put).not.toHaveBeenCalled();
    expect(attachments.create).not.toHaveBeenCalled();
  });

  it('throws the documented PL conflict message for a duplicate adr', async () => {
    const { service } = setup({ activeAdrCount: 1 });

    await expect(
      service.upload(makeUser(), CARRIER_ID, 'adr', makeFile()),
    ).rejects.toThrow('Dokument ADR już istnieje dla tego przewoźnika');
  });

  it('allows a SECOND insurance document even when one already exists', async () => {
    // activeAdrCount is irrelevant here — the count guard must not run for
    // non-adr categories, so multiple insurance docs stay allowed.
    const { service, attachments, storage } = setup({ activeAdrCount: 5 });

    const dto = await service.upload(
      makeUser(),
      CARRIER_ID,
      'insurance',
      makeFile({ originalname: 'ocp-2.pdf' }),
    );

    expect(attachments.countActiveByCategory).not.toHaveBeenCalled();
    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(attachments.create).toHaveBeenCalledTimes(1);
    expect(dto.category).toBe('insurance');
  });

  it('runs the adr guard AFTER the carrier-exists check (404 wins)', async () => {
    const { service, attachments, storage } = setup({
      carrierExists: false,
    });

    await expect(
      service.upload(makeUser(), CARRIER_ID, 'adr', makeFile()),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(attachments.countActiveByCategory).not.toHaveBeenCalled();
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('rejects a missing file before the adr guard', async () => {
    const { service, attachments, storage } = setup({ activeAdrCount: 0 });

    await expect(
      service.upload(makeUser(), CARRIER_ID, 'adr', undefined),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(attachments.countActiveByCategory).not.toHaveBeenCalled();
    expect(storage.put).not.toHaveBeenCalled();
  });
});
