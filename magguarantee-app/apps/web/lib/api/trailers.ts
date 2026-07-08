// Typed API wrappers for /api/v1/trailers/*.
//
// `createTrailer` / `updateTrailer` are `multipart/form-data` since the XL
// certificate (certyfikat XL) is a scanned file (TrailerAttachment), required
// when `certXl=true`; MIME restricted to PDF. Scalar fields go in as text parts
// the API coerces; files go in as `certXl` parts; PATCH may also carry
// `removeAttachmentIds` (a JSON-encoded id array). Mirrors vehicles/drivers.

import type {
  CreateTrailerDto,
  DeleteWithReasonDto,
  TrailerAttachmentDto,
  TrailerDto,
  TrailerFilters,
  UpdateTrailerDto,
} from '@magguarantee/shared';

import { apiBlob, apiForm, apiJson } from './client';
import { type Paginated, toQuery } from './query';

/**
 * Files to upload per attachment category. Each array maps to a multipart file
 * field; the API field name MUST match exactly (the XL certificate part is
 * `certXl` — see apps/api/.../trailer-attachments.constants.ts).
 */
export interface TrailerAttachmentUploads {
  /** XL certificate scans (PDF only) — multipart field `certXl`. */
  certXl?: File[];
}

/** Scalar fields that must be JSON-encoded as multipart string parts. */
const ARRAY_FIELDS = new Set(['removeAttachmentIds']);

/**
 * Serialises a trailer DTO into `FormData`. Per the API multipart contract:
 *  - booleans → the literal strings `'true'` / `'false'`
 *  - numbers  → numeric strings
 *  - arrays   → JSON-encoded strings
 *  - strings  → as-is
 *  - `undefined` / `null` → the part is omitted entirely
 */
function toTrailerFormData(
  body: Record<string, unknown>,
  files: TrailerAttachmentUploads,
): FormData {
  const fd = new FormData();

  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) continue;
    if (ARRAY_FIELDS.has(key)) {
      fd.append(key, JSON.stringify(value));
    } else if (typeof value === 'boolean') {
      fd.append(key, value ? 'true' : 'false');
    } else if (typeof value === 'number') {
      fd.append(key, String(value));
    } else {
      fd.append(key, String(value));
    }
  }

  // File parts — one append per file, under the `certXl` field name.
  for (const file of files.certXl ?? []) fd.append('certXl', file);

  return fd;
}

export function listTrailers(
  filters: TrailerFilters = { limit: 50 },
): Promise<Paginated<TrailerDto>> {
  return apiJson<Paginated<TrailerDto>>(
    `/trailers${toQuery(filters)}`,
    { method: 'GET' },
  );
}

export function getTrailer(id: string): Promise<TrailerDto> {
  return apiJson<TrailerDto>(`/trailers/${id}`, { method: 'GET' });
}

export function createTrailer(
  body: CreateTrailerDto,
  files: TrailerAttachmentUploads = {},
): Promise<TrailerDto> {
  return apiForm<TrailerDto>('/trailers', toTrailerFormData(body, files), {
    method: 'POST',
  });
}

export function updateTrailer(
  id: string,
  body: UpdateTrailerDto,
  files: TrailerAttachmentUploads = {},
): Promise<TrailerDto> {
  return apiForm<TrailerDto>(`/trailers/${id}`, toTrailerFormData(body, files), {
    method: 'PATCH',
  });
}

export function deactivateTrailer(id: string): Promise<TrailerDto> {
  return apiJson<TrailerDto>(`/trailers/${id}/deactivate`, { method: 'POST' });
}

export function reactivateTrailer(id: string): Promise<TrailerDto> {
  return apiJson<TrailerDto>(`/trailers/${id}/reactivate`, { method: 'POST' });
}

export function deleteTrailer(id: string): Promise<void> {
  return apiJson<void>(`/trailers/${id}`, { method: 'DELETE' });
}

/** Hard-delete — see hardDeleteCarrier doc. */
export function hardDeleteTrailer(
  id: string,
  body: DeleteWithReasonDto,
): Promise<void> {
  return apiJson<void>(`/trailers/${id}/hard`, { method: 'DELETE', json: body });
}

// ─── Attachments ─────────────────────────────────────────

export function listTrailerAttachments(
  trailerId: string,
): Promise<TrailerAttachmentDto[]> {
  return apiJson<TrailerAttachmentDto[]>(
    `/trailers/${trailerId}/attachments`,
    { method: 'GET' },
  );
}

/**
 * Downloads an attachment's bytes. The endpoint is authenticated and streams
 * `Content-Disposition: inline` — it is NOT a public URL, so we fetch it
 * through the auth/refresh-aware client and hand back a `Blob`.
 */
export function downloadTrailerAttachment(
  trailerId: string,
  attachmentId: string,
): Promise<Blob> {
  return apiBlob(
    `/trailers/${trailerId}/attachments/${attachmentId}/download`,
    { method: 'GET' },
  );
}

export function deleteTrailerAttachment(
  trailerId: string,
  attachmentId: string,
): Promise<void> {
  return apiJson<void>(
    `/trailers/${trailerId}/attachments/${attachmentId}`,
    { method: 'DELETE' },
  );
}
