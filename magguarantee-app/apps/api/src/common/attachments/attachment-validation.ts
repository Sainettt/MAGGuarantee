import { UnprocessableEntityException } from '@nestjs/common';

/**
 * Generic, entity-agnostic attachment-upload primitives shared by the
 * vehicle / driver / carrier modules. Each module owns its own
 * category-typed collection logic (field → category mapping); the MIME-type
 * and size constraints, the `UploadedFile` shape, and the storage-key
 * extension lookup live here so all three modules enforce identical limits
 * (no magic literals scattered across files).
 */

/** Max bytes per uploaded file — 10 MB. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Accepted upload MIME types — scans / photos / PDFs only. */
export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type AllowedAttachmentMimeType =
  (typeof ALLOWED_ATTACHMENT_MIME_TYPES)[number];

/** File extension to write into the MinIO object key, keyed by MIME type. */
export const MIME_TYPE_EXTENSIONS: Record<AllowedAttachmentMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/** Max files accepted per category field in a single multipart request. */
export const MAX_FILES_PER_FIELD = 10;

/**
 * A single uploaded file, narrowed from `Express.Multer.File` to just the
 * fields the services need. Keeps the services decoupled from multer typings.
 */
export interface UploadedFile {
  fieldname: string;
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
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

/**
 * Resolves the storage-key extension for any uploaded file. Returns `bin`
 * for the (already-rejected) non-allowed case so a malformed object key is
 * never produced even if the caller skips validation.
 */
export function storageKeyExtension(mime: string): string {
  return isAllowedMimeType(mime) ? extensionForMime(mime) : 'bin';
}

/** Throws 422 when the file's MIME type is not in the allow-list. */
export function assertMimeAllowed(file: UploadedFile): void {
  if (!isAllowedMimeType(file.mimetype)) {
    throw new UnprocessableEntityException(
      `Plik '${file.originalname}' ma niedozwolony typ (${file.mimetype}). ` +
        `Dozwolone: ${ALLOWED_ATTACHMENT_MIME_TYPES.join(', ')}`,
    );
  }
}

/** Throws 422 when the file exceeds the max byte budget. */
export function assertSizeAllowed(file: UploadedFile): void {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    const limitMb = Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024));
    throw new UnprocessableEntityException(
      `Plik '${file.originalname}' przekracza maksymalny rozmiar ${limitMb} MB`,
    );
  }
}

/** Validates one file's MIME type and size; throws 422 on the first issue. */
export function assertUploadAllowed(file: UploadedFile): void {
  assertMimeAllowed(file);
  assertSizeAllowed(file);
}
