// Typed API wrappers for /api/v1/carriers/*. All requests go through apiJson
// so they pick up cookie credentials, refresh-on-401, and ApiResponseError
// shaping.

import type {
  CarrierDto,
  CarrierFilters,
  CarrierWithTemporaryPasswordDto,
  CreateCarrierDto,
  UpdateCarrierDto,
} from '@magguarantee/shared';

import { apiJson } from './client';
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
