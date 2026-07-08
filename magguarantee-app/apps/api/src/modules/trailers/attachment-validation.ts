import { UnprocessableEntityException } from '@nestjs/common';

import type { TrailerAttachmentCategory } from '@magguarantee/shared';

import {
  assertUploadAllowed,
  type UploadedFile,
} from '../../common/attachments';
import {
  ATTACHMENT_FILE_FIELDS,
  CATEGORY_MIME_OVERRIDES,
} from './trailer-attachments.constants';

// Re-export the generic MIME helpers/`UploadedFile` from the shared module so
// the service keeps a single `./attachment-validation` import path.
export {
  extensionForMime,
  isAllowedMimeType,
  type UploadedFile,
} from '../../common/attachments';

/** An uploaded file tagged with the trailer attachment category it belongs to. */
export interface CategorizedUpload {
  category: TrailerAttachmentCategory;
  file: UploadedFile;
}

/**
 * The shape `FileFieldsInterceptor` produces — a record keyed by the file
 * field name (`certXl`).
 */
export type MultipartFiles =
  | Record<string, UploadedFile[] | undefined>
  | undefined;

/**
 * Flattens the per-field multipart file map into a flat, category-tagged list,
 * validating every file's MIME type and size on the way. Applies the generic
 * allow-list first, then the per-category MIME override (cert_xl → PDF only).
 *
 * Throws 422 (`UnprocessableEntityException`) on the first violation.
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
      const override = CATEGORY_MIME_OVERRIDES[category];
      if (override && !override.includes(file.mimetype)) {
        throw new UnprocessableEntityException(
          `Plik '${file.originalname}' dla kategorii '${category}' musi być typu ` +
            `${override.join(', ')} (otrzymano ${file.mimetype})`,
        );
      }
      result.push({ category, file });
    }
  }
  return result;
}
