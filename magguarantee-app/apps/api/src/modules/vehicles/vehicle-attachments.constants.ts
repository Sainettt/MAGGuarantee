import type { VehicleAttachmentCategory } from '@magguarantee/shared';

/**
 * Vehicle-attachment multipart wiring contract.
 *
 * The generic upload constraints (max bytes, allowed MIME types, extension
 * map, max-files-per-field) now live in `common/attachments` and are shared
 * with the driver / carrier modules — re-exported here so the controller,
 * service, and spec keep their existing import path.
 */

export {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_FILES_PER_FIELD,
  MIME_TYPE_EXTENSIONS,
  type AllowedAttachmentMimeType,
} from '../../common/attachments';

/**
 * Multipart file-field name → attachment category.
 *
 * The Vehicle create/edit modal is `multipart/form-data`. Files are sent in
 * one field per category, each accepting multiple files. Web MUST use these
 * exact field names. `cabotage_fr` was removed 2026-07 (checkbox-only flag);
 * `gps`, `agreement` and `cabotage_de_insurance` were added. The legacy `adr`
 * field was removed 2026-05-29 — the ADR cert scan moved to the Driver.
 */
export const ATTACHMENT_FILE_FIELDS: ReadonlyArray<{
  field: string;
  category: VehicleAttachmentCategory;
}> = [
  { field: 'contract', category: 'contract' },
  { field: 'gps', category: 'gps' },
  { field: 'agreement', category: 'agreement' },
  { field: 'cabotageDe', category: 'cabotage_de' },
  { field: 'cabotageDeInsurance', category: 'cabotage_de_insurance' },
];
