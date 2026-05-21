// Typed API wrappers for /api/v1/vehicles/*.
//
// `createVehicle` / `updateVehicle` are `multipart/form-data` since the
// 2026-05 migration: the umowa is a scanned file (VehicleAttachment) rather
// than the legacy `contract` boolean. Scalar fields go in as text parts the
// API coerces; files go in as `contract` / `cabotageDe` / `cabotageFr` parts;
// PATCH may also carry `removeAttachmentIds` (a JSON-encoded id array).

import type {
  CreateVehicleDto,
  UpdateVehicleDto,
  VehicleAttachmentDto,
  VehicleDto,
  VehicleFilters,
} from '@magguarantee/shared';

import { apiBlob, apiForm, apiJson } from './client';
import { type Paginated, toQuery } from './query';

/**
 * Files to upload per attachment category. Each array maps to a multipart
 * file field; the API field names MUST match exactly (see
 * `apps/api/.../vehicle-attachments.constants.ts`).
 */
export interface VehicleAttachmentUploads {
  /** Umowa screenshots — multipart field `contract`. */
  contract?: File[];
  /** DE cabotage permit screenshots — multipart field `cabotageDe`. */
  cabotageDe?: File[];
  /** FR cabotage permit screenshots — multipart field `cabotageFr`. */
  cabotageFr?: File[];
}

/** Scalar fields that must be JSON-encoded as multipart string parts. */
const ARRAY_FIELDS = new Set([
  'adrClasses',
  'wasteCountries',
  'destinationCountries',
  'removeAttachmentIds',
]);

/**
 * Serialises a vehicle DTO into `FormData`. Per the API multipart contract:
 *  - booleans → the literal strings `'true'` / `'false'`
 *  - numbers  → numeric strings
 *  - arrays   → JSON-encoded strings
 *  - strings  → as-is
 *  - `undefined` / `null` → the part is omitted entirely
 */
function toVehicleFormData(
  body: Record<string, unknown>,
  files: VehicleAttachmentUploads,
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

  // File parts — one append per file, all under the category field name.
  for (const file of files.contract ?? []) fd.append('contract', file);
  for (const file of files.cabotageDe ?? []) fd.append('cabotageDe', file);
  for (const file of files.cabotageFr ?? []) fd.append('cabotageFr', file);

  return fd;
}

export function listVehicles(
  filters: VehicleFilters = { limit: 50 },
): Promise<Paginated<VehicleDto>> {
  return apiJson<Paginated<VehicleDto>>(`/vehicles${toQuery(filters)}`, {
    method: 'GET',
  });
}

export function getVehicle(id: string): Promise<VehicleDto> {
  return apiJson<VehicleDto>(`/vehicles/${id}`, { method: 'GET' });
}

export function createVehicle(
  body: CreateVehicleDto,
  files: VehicleAttachmentUploads = {},
): Promise<VehicleDto> {
  return apiForm<VehicleDto>('/vehicles', toVehicleFormData(body, files), {
    method: 'POST',
  });
}

export function updateVehicle(
  id: string,
  body: UpdateVehicleDto,
  files: VehicleAttachmentUploads = {},
): Promise<VehicleDto> {
  return apiForm<VehicleDto>(
    `/vehicles/${id}`,
    toVehicleFormData(body, files),
    { method: 'PATCH' },
  );
}

export function deactivateVehicle(id: string): Promise<VehicleDto> {
  return apiJson<VehicleDto>(`/vehicles/${id}/deactivate`, { method: 'POST' });
}

export function reactivateVehicle(id: string): Promise<VehicleDto> {
  return apiJson<VehicleDto>(`/vehicles/${id}/reactivate`, { method: 'POST' });
}

export function deleteVehicle(id: string): Promise<void> {
  return apiJson<void>(`/vehicles/${id}`, { method: 'DELETE' });
}

// ─── Attachments ─────────────────────────────────────────

export function listVehicleAttachments(
  vehicleId: string,
): Promise<VehicleAttachmentDto[]> {
  return apiJson<VehicleAttachmentDto[]>(
    `/vehicles/${vehicleId}/attachments`,
    { method: 'GET' },
  );
}

/**
 * Downloads an attachment's bytes. The endpoint is authenticated and streams
 * `Content-Disposition: inline` — it is NOT a public URL, so we fetch it
 * through the auth/refresh-aware client and hand back a `Blob`.
 */
export function downloadVehicleAttachment(
  vehicleId: string,
  attachmentId: string,
): Promise<Blob> {
  return apiBlob(
    `/vehicles/${vehicleId}/attachments/${attachmentId}/download`,
    { method: 'GET' },
  );
}

export function deleteVehicleAttachment(
  vehicleId: string,
  attachmentId: string,
): Promise<void> {
  return apiJson<void>(
    `/vehicles/${vehicleId}/attachments/${attachmentId}`,
    { method: 'DELETE' },
  );
}
