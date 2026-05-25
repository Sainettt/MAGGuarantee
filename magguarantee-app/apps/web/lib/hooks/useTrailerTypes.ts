'use client';

// TanStack Query hooks for /trailer-types. Used by both the admin CRUD page
// and the trailer-form `<Select>` (so a fresh type appears immediately after
// creation).

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import type {
  CreateTrailerTypeDto,
  DeleteWithReasonDto,
  TrailerTypeDto,
  TrailerTypeFilters,
  UpdateTrailerTypeDto,
} from '@magguarantee/shared';

import {
  createTrailerType,
  deactivateTrailerType,
  getTrailerType,
  hardDeleteTrailerType,
  listTrailerTypes,
  updateTrailerType,
} from '@/lib/api/trailerTypes';

export const TRAILER_TYPES_KEY = ['trailer-types'] as const;

export function useTrailerTypes(filters: TrailerTypeFilters = {}) {
  return useQuery({
    queryKey: [...TRAILER_TYPES_KEY, 'list', filters],
    queryFn: () => listTrailerTypes(filters),
  });
}

export function useTrailerType(id: string | null | undefined) {
  return useQuery({
    queryKey: [...TRAILER_TYPES_KEY, 'detail', id],
    queryFn: () => getTrailerType(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateTrailerType(
  opts?: UseMutationOptions<TrailerTypeDto, Error, CreateTrailerTypeDto>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTrailerType,
    ...opts,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: TRAILER_TYPES_KEY });
      opts?.onSuccess?.(...args);
    },
  });
}

export function useUpdateTrailerType(
  opts?: UseMutationOptions<
    TrailerTypeDto,
    Error,
    { id: string; body: UpdateTrailerTypeDto }
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => updateTrailerType(id, body),
    ...opts,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: TRAILER_TYPES_KEY });
      opts?.onSuccess?.(...args);
    },
  });
}

export function useDeactivateTrailerType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deactivateTrailerType,
    onSuccess: () => qc.invalidateQueries({ queryKey: TRAILER_TYPES_KEY }),
  });
}

/** Hard-delete — admin only. See useHardDeleteCarrier doc. */
export function useHardDeleteTrailerType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: DeleteWithReasonDto }) =>
      hardDeleteTrailerType(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: TRAILER_TYPES_KEY }),
  });
}
