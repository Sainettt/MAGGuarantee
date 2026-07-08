import type { TrailerAttachmentCategory } from '@magguarantee/shared';

/**
 * Trailer-attachment multipart wiring contract.
 *
 * The generic upload constraints (max bytes, allowed MIME types, extension
 * map, max-files-per-field) live in `common/attachments` and are re-exported
 * here so the controller and service keep a single per-module import path.
 *
 * Single category for now — the XL certificate (certyfikat XL). Its MIME is
 * restricted to `application/pdf` (see `CATEGORY_MIME_OVERRIDES`), unlike the
 * image-or-pdf default the other modules accept.
 */

export {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_FILES_PER_FIELD,
  MIME_TYPE_EXTENSIONS,
  type AllowedAttachmentMimeType,
} from '../../common/attachments';

/**
 * Multipart file-field name → attachment category. Web MUST use this exact
 * field name (`certXl`) for the XL-certificate file part.
 */
export const ATTACHMENT_FILE_FIELDS: ReadonlyArray<{
  field: string;
  category: TrailerAttachmentCategory;
}> = [{ field: 'certXl', category: 'cert_xl' }];

/**
 * Per-category MIME allow-list OVERRIDE. When a category appears here its files
 * must match one of these types (on top of the generic allow-list). `cert_xl`
 * accepts ONLY `application/pdf`.
 */
export const CATEGORY_MIME_OVERRIDES: Partial<
  Record<TrailerAttachmentCategory, readonly string[]>
> = {
  cert_xl: ['application/pdf'],
};
