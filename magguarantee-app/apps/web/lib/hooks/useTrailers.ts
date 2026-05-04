'use client';

// TanStack Query hooks for /trailers.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import type {
  CreateTrailerDto,
  TrailerDto,
  TrailerFilters,
  UpdateTrailerDto,
} from '@magguarantee/shared';

import {
  createTrailer,
  deactivateTrailer,
  deleteTrailer,
  getTrailer,
  listTrailers,
  reactivateTrailer,
  updateTrailer,
} from '@/lib/api/trailers';

export const TRAILERS_KEY = ['trailers'] as const;

export function useTrailers(filters: TrailerFilters = { limit: 50 }) {
  return useQuery({
    queryKey: [...TRAILERS_KEY, 'list', filters],
    queryFn: () => listTrailers(filters),
  });
}

export function useTrailer(id: string | null | undefined) {
  return useQuery({
    queryKey: [...TRAILERS_KEY, 'detail', id],
    queryFn: () => getTrailer(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateTrailer(
  opts?: UseMutationOptions<TrailerDto, Error, CreateTrailerDto>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTrailer,
    ...opts,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: TRAILERS_KEY });
      opts?.onSuccess?.(...args);
    },
  });
}

export function useUpdateTrailer(
  opts?: UseMutationOptions<
    TrailerDto,
    Error,
    { id: string; body: UpdateTrailerDto }
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => updateTrailer(id, body),
    ...opts,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: TRAILERS_KEY });
      opts?.onSuccess?.(...args);
    },
  });
}

export function useDeactivateTrailer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deactivateTrailer,
    onSuccess: () => qc.invalidateQueries({ queryKey: TRAILERS_KEY }),
  });
}

export function useReactivateTrailer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: reactivateTrailer,
    onSuccess: () => qc.invalidateQueries({ queryKey: TRAILERS_KEY }),
  });
}

export function useDeleteTrailer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteTrailer,
    onSuccess: () => qc.invalidateQueries({ queryKey: TRAILERS_KEY }),
  });
}
