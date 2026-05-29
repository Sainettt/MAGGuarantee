import type { DriverAttachmentCategory } from '@magguarantee/shared';

/**
 * Driver-attachment multipart wiring contract.
 *
 * The generic upload constraints (max bytes, allowed MIME types, extension
 * map, max-files-per-field) live in `common/attachments` and are shared with
 * the vehicle / carrier modules — re-exported here so the controller and
 * service keep a single per-module import path.
 *
 * Single category for now — the driver's scanned ADR certificate (świadectwo
 * ADR). Mirrors the vehicle field-map shape so the pattern stays consistent.
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
 * field name (`adr`) for the ADR-certificate file part.
 */
export const ATTACHMENT_FILE_FIELDS: ReadonlyArray<{
  field: string;
  category: DriverAttachmentCategory;
}> = [{ field: 'adr', category: 'adr' }];
