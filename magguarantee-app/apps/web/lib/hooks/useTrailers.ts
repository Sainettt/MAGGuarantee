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
  DeleteWithReasonDto,
  TrailerDto,
  TrailerFilters,
  UpdateTrailerDto,
} from '@magguarantee/shared';

import {
  createTrailer,
  deactivateTrailer,
  deleteTrailer,
  getTrailer,
  hardDeleteTrailer,
  listTrailers,
  reactivateTrailer,
  updateTrailer,
  type TrailerAttachmentUploads,
} from '@/lib/api/trailers';
import { CARRIERS_KEY } from '@/lib/hooks/useCarriers';
import { MY_FLEET_KEY } from '@/lib/hooks/useMyFleet';
import { OPIEKUN_KEY } from '@/lib/hooks/useOpiekunFleet';
import type { MutationMetaOptions } from '@/lib/query/globalErrors';

export const TRAILERS_KEY = ['trailers'] as const;

/**
 * Mutation payload for create — the validated scalar DTO plus the XL-cert file
 * uploads, since `POST /trailers` is `multipart/form-data`.
 */
export interface CreateTrailerVars {
  body: CreateTrailerDto;
  files?: TrailerAttachmentUploads;
}

/** Mutation payload for update — id, scalar patch, and file uploads. */
export interface UpdateTrailerVars {
  id: string;
  body: UpdateTrailerDto;
  files?: TrailerAttachmentUploads;
}

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
  opts?: UseMutationOptions<TrailerDto, Error, CreateTrailerVars>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, files }: CreateTrailerVars) =>
      createTrailer(body, files),
    ...opts,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: TRAILERS_KEY });
      qc.invalidateQueries({ queryKey: MY_FLEET_KEY });
      // Server-derived `Carrier.onboarding.hasTrailer/isComplete` changes
      // when a trailer is created — refetch the carriers list. See
      // useVehicles for the same rationale.
      qc.invalidateQueries({ queryKey: CARRIERS_KEY });
      // Active-trailer count feeds the opiekun readiness view (incompleteFleet)
      // — invalidate so the per-carrier attention exclamation stays fresh.
      qc.invalidateQueries({ queryKey: OPIEKUN_KEY });
      opts?.onSuccess?.(...args);
    },
  });
}

export function useUpdateTrailer(
  opts?: UseMutationOptions<TrailerDto, Error, UpdateTrailerVars>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body, files }: UpdateTrailerVars) =>
      updateTrailer(id, body, files),
    ...opts,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: TRAILERS_KEY });
      qc.invalidateQueries({ queryKey: MY_FLEET_KEY });
      // Active-trailer count feeds the opiekun readiness view (incompleteFleet).
      qc.invalidateQueries({ queryKey: OPIEKUN_KEY });
      opts?.onSuccess?.(...args);
    },
  });
}

export function useDeactivateTrailer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deactivateTrailer,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TRAILERS_KEY });
      qc.invalidateQueries({ queryKey: MY_FLEET_KEY });
      // May flip `Carrier.onboarding.hasTrailer` — see useVehicles.
      qc.invalidateQueries({ queryKey: CARRIERS_KEY });
      // Active-trailer count feeds the opiekun readiness view (incompleteFleet).
      qc.invalidateQueries({ queryKey: OPIEKUN_KEY });
    },
  });
}

export function useReactivateTrailer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: reactivateTrailer,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TRAILERS_KEY });
      qc.invalidateQueries({ queryKey: MY_FLEET_KEY });
      qc.invalidateQueries({ queryKey: CARRIERS_KEY });
      // Active-trailer count feeds the opiekun readiness view (incompleteFleet).
      qc.invalidateQueries({ queryKey: OPIEKUN_KEY });
    },
  });
}

export function useDeleteTrailer(opts?: MutationMetaOptions) {
  const qc = useQueryClient();
  return useMutation({
    meta: opts?.meta,
    mutationFn: deleteTrailer,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TRAILERS_KEY });
      qc.invalidateQueries({ queryKey: MY_FLEET_KEY });
      qc.invalidateQueries({ queryKey: CARRIERS_KEY });
      // Active-trailer count feeds the opiekun readiness view (incompleteFleet).
      qc.invalidateQueries({ queryKey: OPIEKUN_KEY });
    },
  });
}

/** Hard-delete — admin only. See useHardDeleteCarrier doc. */
export function useHardDeleteTrailer(opts?: MutationMetaOptions) {
  const qc = useQueryClient();
  return useMutation({
    meta: opts?.meta,
    mutationFn: ({ id, body }: { id: string; body: DeleteWithReasonDto }) =>
      hardDeleteTrailer(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TRAILERS_KEY });
      qc.invalidateQueries({ queryKey: MY_FLEET_KEY });
      qc.invalidateQueries({ queryKey: CARRIERS_KEY });
      // Active-trailer count feeds the opiekun readiness view (incompleteFleet).
      qc.invalidateQueries({ queryKey: OPIEKUN_KEY });
    },
  });
}
