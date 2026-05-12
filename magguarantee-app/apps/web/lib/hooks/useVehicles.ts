'use client';

// TanStack Query hooks for /vehicles.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import type {
  CreateVehicleDto,
  UpdateVehicleDto,
  VehicleDto,
  VehicleFilters,
} from '@magguarantee/shared';

import {
  createVehicle,
  deactivateVehicle,
  deleteVehicle,
  getVehicle,
  listVehicles,
  reactivateVehicle,
  updateVehicle,
} from '@/lib/api/vehicles';
import { MY_FLEET_KEY } from '@/lib/hooks/useMyFleet';

export const VEHICLES_KEY = ['vehicles'] as const;

export function useVehicles(filters: VehicleFilters = { limit: 50 }) {
  return useQuery({
    queryKey: [...VEHICLES_KEY, 'list', filters],
    queryFn: () => listVehicles(filters),
  });
}

export function useVehicle(id: string | null | undefined) {
  return useQuery({
    queryKey: [...VEHICLES_KEY, 'detail', id],
    queryFn: () => getVehicle(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateVehicle(
  opts?: UseMutationOptions<VehicleDto, Error, CreateVehicleDto>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createVehicle,
    ...opts,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: VEHICLES_KEY });
      qc.invalidateQueries({ queryKey: MY_FLEET_KEY });
      opts?.onSuccess?.(...args);
    },
  });
}

export function useUpdateVehicle(
  opts?: UseMutationOptions<
    VehicleDto,
    Error,
    { id: string; body: UpdateVehicleDto }
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => updateVehicle(id, body),
    ...opts,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: VEHICLES_KEY });
      qc.invalidateQueries({ queryKey: MY_FLEET_KEY });
      opts?.onSuccess?.(...args);
    },
  });
}

export function useDeactivateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deactivateVehicle,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: VEHICLES_KEY });
      qc.invalidateQueries({ queryKey: MY_FLEET_KEY });
    },
  });
}

export function useReactivateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: reactivateVehicle,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: VEHICLES_KEY });
      qc.invalidateQueries({ queryKey: MY_FLEET_KEY });
    },
  });
}

export function useDeleteVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteVehicle,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: VEHICLES_KEY });
      qc.invalidateQueries({ queryKey: MY_FLEET_KEY });
    },
  });
}
