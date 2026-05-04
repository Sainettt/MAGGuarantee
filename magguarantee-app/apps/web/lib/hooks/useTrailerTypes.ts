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
  TrailerTypeDto,
  TrailerTypeFilters,
  UpdateTrailerTypeDto,
} from '@magguarantee/shared';

import {
  createTrailerType,
  deactivateTrailerType,
  getTrailerType,
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
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: TRAILER_TYPES_KEY });
      opts?.onSuccess?.(...args);
    },
    ...opts,
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
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: TRAILER_TYPES_KEY });
      opts?.onSuccess?.(...args);
    },
    ...opts,
  });
}

export function useDeactivateTrailerType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deactivateTrailerType,
    onSuccess: () => qc.invalidateQueries({ queryKey: TRAILER_TYPES_KEY }),
  });
}
