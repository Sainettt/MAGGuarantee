// Typed API wrappers for /api/v1/vehicles/*.
//
// `createVehicle` / `updateVehicle` are `multipart/form-data` since the
// 2026-05 migration: the umowa is a scanned file (VehicleAttachment) rather
// than the legacy `contract` boolean. Scalar fields go in as text parts the
// API coerces; files go in as `contract` / `cabotageDe` / `cabotageFr` parts;
// PATCH may also carry `removeAttachmentIds` (a JSON-encoded id array).
//
// NOTE: the ADR certificate scan moved to the Driver (2026-05-29) — the
// vehicle keeps only the `adr` boolean checkbox and no longer uploads a file.

import type {
  CreateVehicleDto,
  DeleteWithReasonDto,
  KmBoardQuery,
  SetVehicleDailyKmDto,
  UpdateVehicleDto,
  VehicleAttachmentDto,
  VehicleDailyKmDto,
  VehicleDailyKmHistoryQuery,
  VehicleDto,
  VehicleFilters,
  VehicleKmBoardDto,
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
const ARRAY_FIELDS = new Set(['wasteCountries', 'removeAttachmentIds']);

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

/** Hard-delete — see hardDeleteCarrier doc. */
export function hardDeleteVehicle(
  id: string,
  body: DeleteWithReasonDto,
): Promise<void> {
  return apiJson<void>(`/vehicles/${id}/hard`, { method: 'DELETE', json: body });
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

// ─── Daily km — weryfikator board + read-report (Phase 7.7) ──
//
// REWORK 2026-06-12 #3 (docs/14 §7.7, docs/20 §0′): the former route-status
// board is absorbed into a DAILY km list. The weryfikator records, per
// (vehicle, day), either `drove` (km>0) or `idle` («nie jeździ»); the absence
// of a row is «not checked». Roles weryfikator | admin for the editable board;
// the read-report (`/km-report`) is role-scoped server-side.

/**
 * GET /vehicles/km-board — the editable weekly km-board (all active vehicles +
 * 7 day-cells + Σ km + derived motion status). Resolved to a Monday-anchored
 * 7-day window. Pass `?week=YYYY-Www` or `?from=<Mon ISO>`; absent → current
 * ISO week. Roles weryfikator | admin.
 */
export function getVehicleKmBoard(
  query: KmBoardQuery = {},
): Promise<VehicleKmBoardDto> {
  return apiJson<VehicleKmBoardDto>(`/vehicles/km-board${toQuery(query)}`, {
    method: 'GET',
  });
}

/**
 * GET /vehicles/km-report — the read-only weekly km-report. Same envelope as
 * the board but server-scoped to the caller's own vehicles (planista→plannerId,
 * dyspozytor→team, eksport/admin/weryfikator→all) and limited to vehicles that
 * actually drove in the window.
 */
export function getVehicleKmReport(
  query: KmBoardQuery = {},
): Promise<VehicleKmBoardDto> {
  return apiJson<VehicleKmBoardDto>(`/vehicles/km-report${toQuery(query)}`, {
    method: 'GET',
  });
}

/**
 * PUT /vehicles/:id/daily-km — UPSERT one (vehicle, day) mark. The server
 * records `source='manual'`, `notedById=caller`; when `state='drove'` it bumps
 * `Vehicle.lastDroveAt = max(lastDroveAt, date)`. Returns the saved row.
 */
export function setVehicleDailyKm(
  id: string,
  body: SetVehicleDailyKmDto,
): Promise<VehicleDailyKmDto> {
  return apiJson<VehicleDailyKmDto>(`/vehicles/${id}/daily-km`, {
    method: 'PUT',
    json: body,
  });
}

/**
 * DELETE /vehicles/:id/daily-km?date=YYYY-MM-DD — clears ONE (vehicle, day)
 * mark so the cell returns to «not checked» (row absence). Idempotent: clearing
 * an already-absent cell still succeeds (204). Roles weryfikator | admin.
 */
export function deleteVehicleDailyKm(id: string, date: string): Promise<void> {
  return apiJson<void>(
    `/vehicles/${id}/daily-km?date=${encodeURIComponent(date)}`,
    { method: 'DELETE' },
  );
}

/**
 * GET /vehicles/:id/daily-km — per-vehicle daily-km history, newest-first.
 * Optional `from`/`to` (date-only) bounds. Powers the read-only history dialog.
 */
export function getVehicleDailyKmHistory(
  id: string,
  query: VehicleDailyKmHistoryQuery = {},
): Promise<VehicleDailyKmDto[]> {
  return apiJson<VehicleDailyKmDto[]>(
    `/vehicles/${id}/daily-km${toQuery(query)}`,
    { method: 'GET' },
  );
}
