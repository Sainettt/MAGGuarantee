import type { VehicleAttachmentCategory } from '@magguarantee/shared';

/**
 * Vehicle-attachment upload constraints and the multipart wiring contract.
 *
 * Kept in one place so the controller (interceptor field config), the service
 * (validation), and the spec all reference identical literals — no magic
 * strings scattered across files.
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

/**
 * Multipart file-field name → attachment category.
 *
 * The Vehicle create/edit modal is `multipart/form-data`. Files are sent in
 * one field per category, each accepting multiple files. Web MUST use these
 * exact field names.
 */
export const ATTACHMENT_FILE_FIELDS: ReadonlyArray<{
  field: string;
  category: VehicleAttachmentCategory;
}> = [
  { field: 'contract', category: 'contract' },
  { field: 'cabotageDe', category: 'cabotage_de' },
  { field: 'cabotageFr', category: 'cabotage_fr' },
];

/** Max files accepted per category field in a single request. */
export const MAX_FILES_PER_FIELD = 10;
