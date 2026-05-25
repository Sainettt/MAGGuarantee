'use client';

// TanStack Query hooks for /carriers. List queries key by filters; mutations
// invalidate the entire `['carriers']` namespace so list + detail re-fetch.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import type {
  CarrierDto,
  CarrierFilters,
  CarrierWithTemporaryPasswordDto,
  CreateCarrierDto,
  DeleteWithReasonDto,
  UpdateCarrierDto,
} from '@magguarantee/shared';

import {
  createCarrier,
  deleteCarrier,
  deactivateCarrier,
  getCarrier,
  hardDeleteCarrier,
  listCarriers,
  reactivateCarrier,
  updateCarrier,
} from '@/lib/api/carriers';

export const CARRIERS_KEY = ['carriers'] as const;

export function useCarriers(filters: CarrierFilters = { limit: 50 }) {
  return useQuery({
    queryKey: [...CARRIERS_KEY, 'list', filters],
    queryFn: () => listCarriers(filters),
  });
}

export function useCarrier(id: string | null | undefined) {
  return useQuery({
    queryKey: [...CARRIERS_KEY, 'detail', id],
    queryFn: () => getCarrier(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateCarrier(
  opts?: UseMutationOptions<
    CarrierWithTemporaryPasswordDto,
    Error,
    CreateCarrierDto
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createCarrier,
    ...opts,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: CARRIERS_KEY });
      opts?.onSuccess?.(...args);
    },
  });
}

export function useUpdateCarrier(
  opts?: UseMutationOptions<
    CarrierDto,
    Error,
    { id: string; body: UpdateCarrierDto }
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => updateCarrier(id, body),
    ...opts,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: CARRIERS_KEY });
      opts?.onSuccess?.(...args);
    },
  });
}

export function useDeactivateCarrier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deactivateCarrier,
    onSuccess: () => qc.invalidateQueries({ queryKey: CARRIERS_KEY }),
  });
}

export function useReactivateCarrier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: reactivateCarrier,
    onSuccess: () => qc.invalidateQueries({ queryKey: CARRIERS_KEY }),
  });
}

export function useDeleteCarrier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteCarrier,
    onSuccess: () => qc.invalidateQueries({ queryKey: CARRIERS_KEY }),
  });
}

/**
 * Hard-delete — irreversible. Admin-only. The mutation expects the
 * confirm-dialog to pass `{ id, body: { reason } }` after the user has
 * filled in the reason textarea.
 */
export function useHardDeleteCarrier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: DeleteWithReasonDto }) =>
      hardDeleteCarrier(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: CARRIERS_KEY }),
  });
}
