// Typed API wrappers for /api/v1/vehicles/*.

import type {
  CreateVehicleDto,
  UpdateVehicleDto,
  VehicleDto,
  VehicleFilters,
} from '@magguarantee/shared';

import { apiJson } from './client';
import { type Paginated, toQuery } from './query';

export function listVehicles(
  filters: VehicleFilters = { limit: 50 },
): Promise<Paginated<VehicleDto>> {
  return apiJson<Paginated<VehicleDto>>(
    `/vehicles${toQuery(filters)}`,
    { method: 'GET' },
  );
}

export function getVehicle(id: string): Promise<VehicleDto> {
  return apiJson<VehicleDto>(`/vehicles/${id}`, { method: 'GET' });
}

export function createVehicle(body: CreateVehicleDto): Promise<VehicleDto> {
  return apiJson<VehicleDto>('/vehicles', { method: 'POST', json: body });
}

export function updateVehicle(
  id: string,
  body: UpdateVehicleDto,
): Promise<VehicleDto> {
  return apiJson<VehicleDto>(`/vehicles/${id}`, {
    method: 'PATCH',
    json: body,
  });
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
