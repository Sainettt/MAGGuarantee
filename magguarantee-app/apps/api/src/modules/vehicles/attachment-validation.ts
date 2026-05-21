import { UnprocessableEntityException } from '@nestjs/common';

import type { VehicleAttachmentCategory } from '@magguarantee/shared';

import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  ATTACHMENT_FILE_FIELDS,
  MAX_ATTACHMENT_BYTES,
  MIME_TYPE_EXTENSIONS,
  type AllowedAttachmentMimeType,
} from './vehicle-attachments.constants';

/**
 * A single uploaded file, narrowed from `Express.Multer.File` to just the
 * fields the service needs. Keeps the service decoupled from multer typings.
 */
export interface UploadedFile {
  fieldname: string;
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** An uploaded file tagged with the attachment category it belongs to. */
export interface CategorizedUpload {
  category: VehicleAttachmentCategory;
  file: UploadedFile;
}

/**
 * The shape `FileFieldsInterceptor` produces — a record keyed by the file
 * field name (`contract`, `cabotageDe`, `cabotageFr`).
 */
export type MultipartFiles =
  | Record<string, UploadedFile[] | undefined>
  | undefined;

/**
 * Flattens the per-field multipart file map into a flat, category-tagged
 * list, validating every file's MIME type and size on the way.
 *
 * Throws 422 (`UnprocessableEntityException`) on the first violation — a bad
 * type or an oversized file — per docs/13-api-design.md#vehicles.
 */
export function collectAndValidateUploads(
  files: MultipartFiles,
): CategorizedUpload[] {
  if (!files) return [];

  const result: CategorizedUpload[] = [];
  for (const { field, category } of ATTACHMENT_FILE_FIELDS) {
    const bucket = files[field];
    if (!bucket) continue;
    for (const file of bucket) {
      assertMimeAllowed(file);
      assertSizeAllowed(file);
      result.push({ category, file });
    }
  }
  return result;
}

/** True when the MIME type is one of the accepted upload types. */
export function isAllowedMimeType(
  mime: string,
): mime is AllowedAttachmentMimeType {
  return (ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(mime);
}

/** Maps a validated MIME type to the file extension used in the storage key. */
export function extensionForMime(mime: AllowedAttachmentMimeType): string {
  return MIME_TYPE_EXTENSIONS[mime];
}

// ── internals ──────────────────────────────────────────────

function assertMimeAllowed(file: UploadedFile): void {
  if (!isAllowedMimeType(file.mimetype)) {
    throw new UnprocessableEntityException(
      `Plik '${file.originalname}' ma niedozwolony typ (${file.mimetype}). ` +
        `Dozwolone: ${ALLOWED_ATTACHMENT_MIME_TYPES.join(', ')}`,
    );
  }
}

function assertSizeAllowed(file: UploadedFile): void {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    const limitMb = Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024));
    throw new UnprocessableEntityException(
      `Plik '${file.originalname}' przekracza maksymalny rozmiar ${limitMb} MB`,
    );
  }
}
