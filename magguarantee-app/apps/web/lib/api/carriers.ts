// Typed API wrappers for /api/v1/carriers/*. All requests go through apiJson
// so they pick up cookie credentials, refresh-on-401, and ApiResponseError
// shaping.

import type {
  CarrierAttachmentCategory,
  CarrierAttachmentDto,
  CarrierDocumentsOverviewDto,
  CarrierDto,
  CarrierFilters,
  CarrierWithTemporaryPasswordDto,
  CreateCarrierDto,
  DeleteWithReasonDto,
  UpdateCarrierDto,
} from '@magguarantee/shared';

import { apiBlob, apiForm, apiJson } from './client';
import { type Paginated, toQuery } from './query';

export function listCarriers(
  filters: CarrierFilters = { limit: 50 },
): Promise<Paginated<CarrierDto>> {
  return apiJson<Paginated<CarrierDto>>(
    `/carriers${toQuery(filters)}`,
    { method: 'GET' },
  );
}

export function getCarrier(id: string): Promise<CarrierDto> {
  return apiJson<CarrierDto>(`/carriers/${id}`, { method: 'GET' });
}

export function createCarrier(
  body: CreateCarrierDto,
): Promise<CarrierWithTemporaryPasswordDto> {
  return apiJson<CarrierWithTemporaryPasswordDto>('/carriers', {
    method: 'POST',
    json: body,
  });
}

export function updateCarrier(
  id: string,
  body: UpdateCarrierDto,
): Promise<CarrierDto> {
  return apiJson<CarrierDto>(`/carriers/${id}`, {
    method: 'PATCH',
    json: body,
  });
}

export function deactivateCarrier(id: string): Promise<CarrierDto> {
  return apiJson<CarrierDto>(`/carriers/${id}/deactivate`, { method: 'POST' });
}

export function reactivateCarrier(id: string): Promise<CarrierDto> {
  return apiJson<CarrierDto>(`/carriers/${id}/reactivate`, { method: 'POST' });
}

export function deleteCarrier(id: string): Promise<void> {
  return apiJson<void>(`/carriers/${id}`, { method: 'DELETE' });
}

/**
 * Hard-delete — irreversible row removal. Admin-only on the server side;
 * accepts a free-form `reason` (min 3, max 500) that lands in
 * `audit_log.metadata.reason` for forensics.
 */
export function hardDeleteCarrier(
  id: string,
  body: DeleteWithReasonDto,
): Promise<void> {
  return apiJson<void>(`/carriers/${id}/hard`, { method: 'DELETE', json: body });
}

// ─── Attachments (company documents) ─────────────────────
//
// Unlike vehicle/driver attachments (which ride the entity's create/edit
// form), carrier documents are managed independently from a "Documents" tab —
// hence standalone upload/list/download/delete endpoints under
// `/carriers/:id/attachments`. Per docs/13-api-design.md#carriers. `:id` is the
// carrier UUID.

export function listCarrierAttachments(
  carrierId: string,
): Promise<CarrierAttachmentDto[]> {
  return apiJson<CarrierAttachmentDto[]>(
    `/carriers/${carrierId}/attachments`,
    { method: 'GET' },
  );
}

/**
 * Uploads a single carrier document. `multipart/form-data` — the file rides as
 * the `file` part and the document category as the `category` text part (the
 * API field names MUST match exactly).
 */
export function uploadCarrierAttachment(
  carrierId: string,
  category: CarrierAttachmentCategory,
  file: File,
): Promise<CarrierAttachmentDto> {
  const fd = new FormData();
  fd.append('category', category);
  fd.append('file', file);
  return apiForm<CarrierAttachmentDto>(
    `/carriers/${carrierId}/attachments`,
    fd,
    { method: 'POST' },
  );
}

/**
 * Downloads an attachment's bytes. The endpoint is authenticated and streams
 * `Content-Disposition: inline` — it is NOT a public URL, so we fetch it
 * through the auth/refresh-aware client and hand back a `Blob`.
 */
export function downloadCarrierAttachment(
  carrierId: string,
  attachmentId: string,
): Promise<Blob> {
  return apiBlob(
    `/carriers/${carrierId}/attachments/${attachmentId}/download`,
    { method: 'GET' },
  );
}

export function deleteCarrierAttachment(
  carrierId: string,
  attachmentId: string,
): Promise<void> {
  return apiJson<void>(
    `/carriers/${carrierId}/attachments/${attachmentId}`,
    { method: 'DELETE' },
  );
}

// ─── Documents overview (opiekun "Dokumenty" tab) ─────────
//
// Read-only aggregate that gathers EVERY document tied to one carrier — its own
// company docs plus per-vehicle / per-trailer / per-driver files — grouped by
// owning entity, so the opiekun "Dokumenty" tab renders them in one round trip
// (soft-delete filtering is centralised server-side). Roles: admin, opiekun-own.
// Downloads are NOT re-invented — each grouped entry carries the ids the
// existing per-entity `…/attachments/:id/download` routes need.

export function getCarrierDocumentsOverview(
  carrierId: string,
): Promise<CarrierDocumentsOverviewDto> {
  return apiJson<CarrierDocumentsOverviewDto>(
    `/carriers/${carrierId}/documents/overview`,
    { method: 'GET' },
  );
}
