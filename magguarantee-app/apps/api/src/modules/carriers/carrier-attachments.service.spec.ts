import { NotFoundException } from '@nestjs/common';

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
 * Service-layer tests for `CarrierAttachmentsService.upload`.
 *
 * The single-ADR-doc rule was REMOVED (2026-07) together with the carrier-level
 * ADR concept — every carrier category (insurance / license / kreptd / other)
 * now allows MULTIPLE uploads and there is no per-category conflict. These
 * tests cover the remaining contract: carrier-exists check, missing-file
 * rejection, and MinIO-put + row-insert ordering. The repos / storage are
 * jest-fn doubles, mirroring `carriers.service.spec.ts`.
 */

const NOW = new Date('2026-07-09T10:00:00.000Z');
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
    originalname: 'ocp-policy.pdf',
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
    fileName: 'ocp-policy.pdf',
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
    create: jest.Mock;
  };
  storage: { put: jest.Mock; delete: jest.Mock };
}

function setup(opts: { carrierExists?: boolean } = {}): Mocks {
  const { carrierExists = true } = opts;

  const carriers = {
    findById: jest.fn(async () => (carrierExists ? { id: CARRIER_ID } : null)),
  };
  const attachments = {
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

describe('CarrierAttachmentsService.upload', () => {
  it('uploads a document: puts to MinIO then inserts the row', async () => {
    const { service, attachments, storage } = setup();

    const dto = await service.upload(
      makeUser(),
      CARRIER_ID,
      'insurance',
      makeFile(),
    );

    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(attachments.create).toHaveBeenCalledTimes(1);
    expect(dto.category).toBe('insurance');
  });

  it('allows MULTIPLE documents in the same category (no single-doc rule)', async () => {
    const { service, attachments, storage } = setup();

    await service.upload(makeUser(), CARRIER_ID, 'insurance', makeFile());
    await service.upload(
      makeUser(),
      CARRIER_ID,
      'insurance',
      makeFile({ originalname: 'ocp-2.pdf' }),
    );

    // No count guard is consulted; both uploads persist.
    expect(storage.put).toHaveBeenCalledTimes(2);
    expect(attachments.create).toHaveBeenCalledTimes(2);
  });

  it.each(['insurance', 'license', 'kreptd', 'other'] as const)(
    'accepts category=%s',
    async (category) => {
      const { service, attachments } = setup();
      const dto = await service.upload(
        makeUser(),
        CARRIER_ID,
        category,
        makeFile(),
      );
      expect(attachments.create).toHaveBeenCalledTimes(1);
      expect(dto.category).toBe(category);
    },
  );

  it('404 when the carrier does not exist (before any MinIO write)', async () => {
    const { service, storage } = setup({ carrierExists: false });

    await expect(
      service.upload(makeUser(), CARRIER_ID, 'insurance', makeFile()),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(storage.put).not.toHaveBeenCalled();
  });

  it('rejects a missing file with 404 and no MinIO write', async () => {
    const { service, storage, attachments } = setup();

    await expect(
      service.upload(makeUser(), CARRIER_ID, 'insurance', undefined),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(storage.put).not.toHaveBeenCalled();
    expect(attachments.create).not.toHaveBeenCalled();
  });

  it('removes the orphan object when the row insert fails', async () => {
    const { service, attachments, storage } = setup();
    attachments.create.mockRejectedValueOnce(new Error('db down'));

    await expect(
      service.upload(makeUser(), CARRIER_ID, 'insurance', makeFile()),
    ).rejects.toThrow('db down');

    expect(storage.put).toHaveBeenCalledTimes(1);
    // Compensating delete of the just-uploaded object.
    expect(storage.delete).toHaveBeenCalledTimes(1);
  });
});
