import type { DriverAttachmentCategory } from '@magguarantee/shared';

import {
  assertUploadAllowed,
  type UploadedFile,
} from '../../common/attachments';
import { ATTACHMENT_FILE_FIELDS } from './driver-attachments.constants';

// Re-export the generic MIME helpers/`UploadedFile` from the shared module so
// the service keeps a single `./attachment-validation` import path.
export {
  extensionForMime,
  isAllowedMimeType,
  type UploadedFile,
} from '../../common/attachments';

/** An uploaded file tagged with the driver attachment category it belongs to. */
export interface CategorizedUpload {
  category: DriverAttachmentCategory;
  file: UploadedFile;
}

/**
 * The shape `FileFieldsInterceptor` produces — a record keyed by the file
 * field name (`adr`).
 */
export type MultipartFiles =
  | Record<string, UploadedFile[] | undefined>
  | undefined;

/**
 * Flattens the per-field multipart file map into a flat, category-tagged
 * list, validating every file's MIME type and size on the way.
 *
 * Throws 422 (`UnprocessableEntityException`) on the first violation — a bad
 * type or an oversized file — mirroring the vehicle attachment rule.
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
      assertUploadAllowed(file);
      result.push({ category, file });
    }
  }
  return result;
}
