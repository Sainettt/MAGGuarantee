// Typed API wrappers for /api/v1/drivers/*.

import type {
  CreateDriverDto,
  DeleteWithReasonDto,
  DriverDto,
  DriverFilters,
  UpdateDriverDto,
} from '@magguarantee/shared';

import { apiJson } from './client';
import { type Paginated, toQuery } from './query';

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

export function createDriver(body: CreateDriverDto): Promise<DriverDto> {
  return apiJson<DriverDto>('/drivers', { method: 'POST', json: body });
}

export function updateDriver(
  id: string,
  body: UpdateDriverDto,
): Promise<DriverDto> {
  return apiJson<DriverDto>(`/drivers/${id}`, {
    method: 'PATCH',
    json: body,
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
