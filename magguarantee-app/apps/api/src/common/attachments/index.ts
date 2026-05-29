// Public surface of the shared attachment primitives. Feature modules import
// the entity-agnostic MIME/size validation, `UploadedFile` shape, and the
// storage-key extension helper from here; each module keeps its own
// category-typed `collect…Uploads` logic next to its constants.

export {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_FILES_PER_FIELD,
  MIME_TYPE_EXTENSIONS,
  assertMimeAllowed,
  assertSizeAllowed,
  assertUploadAllowed,
  extensionForMime,
  isAllowedMimeType,
  storageKeyExtension,
  type AllowedAttachmentMimeType,
  type UploadedFile,
} from './attachment-validation';
