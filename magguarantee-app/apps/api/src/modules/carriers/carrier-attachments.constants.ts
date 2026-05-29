/**
 * Carrier-attachment multipart wiring contract.
 *
 * Unlike vehicle/driver attachments (one file field per category), the
 * carrier "Documents" tab uploads ONE file at a time with the category passed
 * as a separate text part. So there is a single multipart file field, `file`,
 * plus a `category` text part validated by `UploadCarrierAttachmentSchema`.
 *
 * The generic upload constraints (max bytes, allowed MIME types, extension
 * map) live in `common/attachments` and are shared with the vehicle / driver
 * modules — re-exported here so the controller/service keep a single
 * per-module import path.
 */

export {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
  MIME_TYPE_EXTENSIONS,
  type AllowedAttachmentMimeType,
} from '../../common/attachments';

/** The single multipart file field name. Web MUST use this exact name. */
export const ATTACHMENT_FILE_FIELD = 'file';
