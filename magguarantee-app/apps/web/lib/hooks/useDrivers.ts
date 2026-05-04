'use client';

// TanStack Query hooks for /drivers.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import type {
  CreateDriverDto,
  DriverDto,
  DriverFilters,
  UpdateDriverDto,
} from '@magguarantee/shared';

import {
  createDriver,
  deactivateDriver,
  deleteDriver,
  getDriver,
  listDrivers,
  reactivateDriver,
  updateDriver,
} from '@/lib/api/drivers';

export const DRIVERS_KEY = ['drivers'] as const;

export function useDrivers(filters: DriverFilters = { limit: 50 }) {
  return useQuery({
    queryKey: [...DRIVERS_KEY, 'list', filters],
    queryFn: () => listDrivers(filters),
  });
}

export function useDriver(id: string | null | undefined) {
  return useQuery({
    queryKey: [...DRIVERS_KEY, 'detail', id],
    queryFn: () => getDriver(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateDriver(
  opts?: UseMutationOptions<DriverDto, Error, CreateDriverDto>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createDriver,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: DRIVERS_KEY });
      opts?.onSuccess?.(...args);
    },
    ...opts,
  });
}

export function useUpdateDriver(
  opts?: UseMutationOptions<
    DriverDto,
    Error,
    { id: string; body: UpdateDriverDto }
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => updateDriver(id, body),
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: DRIVERS_KEY });
      opts?.onSuccess?.(...args);
    },
    ...opts,
  });
}

export function useDeactivateDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deactivateDriver,
    onSuccess: () => qc.invalidateQueries({ queryKey: DRIVERS_KEY }),
  });
}

export function useReactivateDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: reactivateDriver,
    onSuccess: () => qc.invalidateQueries({ queryKey: DRIVERS_KEY }),
  });
}

export function useDeleteDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteDriver,
    onSuccess: () => qc.invalidateQueries({ queryKey: DRIVERS_KEY }),
  });
}
