// Typed API wrappers for /api/v1/drivers/*.
//
// `createDriver` / `updateDriver` are `multipart/form-data` since the
// 2026-05-29 migration: the ADR certificate (świadectwo ADR) is a scanned file
// (DriverAttachment), required when `adr=true`. Scalar fields (including the
// `adr` boolean) go in as text parts the API coerces; files go in as `adr`
// parts; PATCH may also carry `removeAttachmentIds` (a JSON-encoded id array).

import type {
  CreateDriverDto,
  DeleteWithReasonDto,
  DriverAttachmentDto,
  DriverDto,
  DriverFilters,
  UpdateDriverDto,
} from '@magguarantee/shared';

import { apiBlob, apiForm, apiJson } from './client';
import { type Paginated, toQuery } from './query';

/**
 * Files to upload per attachment category. Each array maps to a multipart
 * file field; the API field name MUST match exactly (the ADR certificate part
 * is `adr`).
 */
export interface DriverAttachmentUploads {
  /** ADR certificate scans — multipart field `adr`. */
  adr?: File[];
}

/** Scalar fields that must be JSON-encoded as multipart string parts. */
const ARRAY_FIELDS = new Set(['removeAttachmentIds']);

/**
 * Serialises a driver DTO into `FormData`. Per the API multipart contract:
 *  - booleans → the literal strings `'true'` / `'false'`
 *  - numbers  → numeric strings
 *  - arrays   → JSON-encoded strings
 *  - strings  → as-is
 *  - `undefined` / `null` → the part is omitted entirely
 */
function toDriverFormData(
  body: Record<string, unknown>,
  files: DriverAttachmentUploads,
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

  // File parts — one append per file, under the `adr` field name.
  for (const file of files.adr ?? []) fd.append('adr', file);

  return fd;
}

export function listDrivers(
  filters: DriverFilters = { limit: 50 },
): Promise<Paginated<DriverDto>> {
  return apiJson<Paginated<DriverDto>>(
    `/drivers${toQuery(filters)}`,
    { method: 'GET' },
  );
}

export function getDriver(id: string): Promise<DriverDto> {
  return apiJson<DriverDto>(`/drivers/${id}`, { method: 'GET' });
}

export function createDriver(
  body: CreateDriverDto,
  files: DriverAttachmentUploads = {},
): Promise<DriverDto> {
  return apiForm<DriverDto>('/drivers', toDriverFormData(body, files), {
    method: 'POST',
  });
}

export function updateDriver(
  id: string,
  body: UpdateDriverDto,
  files: DriverAttachmentUploads = {},
): Promise<DriverDto> {
  return apiForm<DriverDto>(`/drivers/${id}`, toDriverFormData(body, files), {
    method: 'PATCH',
  });
}

export function deactivateDriver(id: string): Promise<DriverDto> {
  return apiJson<DriverDto>(`/drivers/${id}/deactivate`, { method: 'POST' });
}

export function reactivateDriver(id: string): Promise<DriverDto> {
  return apiJson<DriverDto>(`/drivers/${id}/reactivate`, { method: 'POST' });
}

export function deleteDriver(id: string): Promise<void> {
  return apiJson<void>(`/drivers/${id}`, { method: 'DELETE' });
}

/** Hard-delete — see hardDeleteCarrier doc. */
export function hardDeleteDriver(
  id: string,
  body: DeleteWithReasonDto,
): Promise<void> {
  return apiJson<void>(`/drivers/${id}/hard`, { method: 'DELETE', json: body });
}

// ─── Attachments ─────────────────────────────────────────

export function listDriverAttachments(
  driverId: string,
): Promise<DriverAttachmentDto[]> {
  return apiJson<DriverAttachmentDto[]>(
    `/drivers/${driverId}/attachments`,
    { method: 'GET' },
  );
}

/**
 * Downloads an attachment's bytes. The endpoint is authenticated and streams
 * `Content-Disposition: inline` — it is NOT a public URL, so we fetch it
 * through the auth/refresh-aware client and hand back a `Blob`.
 */
export function downloadDriverAttachment(
  driverId: string,
  attachmentId: string,
): Promise<Blob> {
  return apiBlob(
    `/drivers/${driverId}/attachments/${attachmentId}/download`,
    { method: 'GET' },
  );
}

export function deleteDriverAttachment(
  driverId: string,
  attachmentId: string,
): Promise<void> {
  return apiJson<void>(
    `/drivers/${driverId}/attachments/${attachmentId}`,
    { method: 'DELETE' },
  );
}
