// Typed API wrappers for /api/v1/trailers/*.

import type {
  CreateTrailerDto,
  DeleteWithReasonDto,
  TrailerDto,
  TrailerFilters,
  UpdateTrailerDto,
} from '@magguarantee/shared';

import { apiJson } from './client';
import { type Paginated, toQuery } from './query';

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

export function createTrailer(body: CreateTrailerDto): Promise<TrailerDto> {
  return apiJson<TrailerDto>('/trailers', { method: 'POST', json: body });
}

export function updateTrailer(
  id: string,
  body: UpdateTrailerDto,
): Promise<TrailerDto> {
  return apiJson<TrailerDto>(`/trailers/${id}`, {
    method: 'PATCH',
    json: body,
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
