// Typed API wrappers for /api/v1/trailer-types/*. The trailer-types endpoint
// is a flat list (no pagination — there are ~13 of them) per the API spec.

import type {
  CreateTrailerTypeDto,
  DeleteWithReasonDto,
  TrailerTypeDto,
  TrailerTypeFilters,
  UpdateTrailerTypeDto,
} from '@magguarantee/shared';

import { apiJson } from './client';
import { toQuery } from './query';

export function listTrailerTypes(
  filters: TrailerTypeFilters = {},
): Promise<TrailerTypeDto[]> {
  return apiJson<TrailerTypeDto[]>(
    `/trailer-types${toQuery({
      active: filters.active,
      q: filters.q,
    })}`,
    { method: 'GET' },
  );
}

export function getTrailerType(id: string): Promise<TrailerTypeDto> {
  return apiJson<TrailerTypeDto>(`/trailer-types/${id}`, { method: 'GET' });
}

export function createTrailerType(
  body: CreateTrailerTypeDto,
): Promise<TrailerTypeDto> {
  return apiJson<TrailerTypeDto>('/trailer-types', {
    method: 'POST',
    json: body,
  });
}

export function updateTrailerType(
  id: string,
  body: UpdateTrailerTypeDto,
): Promise<TrailerTypeDto> {
  return apiJson<TrailerTypeDto>(`/trailer-types/${id}`, {
    method: 'PATCH',
    json: body,
  });
}

export function deactivateTrailerType(id: string): Promise<TrailerTypeDto> {
  return apiJson<TrailerTypeDto>(`/trailer-types/${id}/deactivate`, {
    method: 'POST',
  });
}

/** Hard-delete — see hardDeleteCarrier doc. */
export function hardDeleteTrailerType(
  id: string,
  body: DeleteWithReasonDto,
): Promise<void> {
  return apiJson<void>(`/trailer-types/${id}/hard`, {
    method: 'DELETE',
    json: body,
  });
}
