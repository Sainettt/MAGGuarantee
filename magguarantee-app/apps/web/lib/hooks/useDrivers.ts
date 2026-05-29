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
  DeleteWithReasonDto,
  DriverDto,
  DriverFilters,
  UpdateDriverDto,
} from '@magguarantee/shared';

import {
  createDriver,
  deactivateDriver,
  deleteDriver,
  getDriver,
  hardDeleteDriver,
  listDrivers,
  reactivateDriver,
  updateDriver,
  type DriverAttachmentUploads,
} from '@/lib/api/drivers';
import { CARRIERS_KEY } from '@/lib/hooks/useCarriers';
import { MY_FLEET_KEY } from '@/lib/hooks/useMyFleet';

export const DRIVERS_KEY = ['drivers'] as const;

/**
 * Mutation payload for create — the validated scalar DTO plus the ADR
 * certificate uploads, since `POST /drivers` is `multipart/form-data`.
 */
export interface CreateDriverVars {
  body: CreateDriverDto;
  files?: DriverAttachmentUploads;
}

/** Mutation payload for update — id, scalar patch, and file uploads. */
export interface UpdateDriverVars {
  id: string;
  body: UpdateDriverDto;
  files?: DriverAttachmentUploads;
}

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
  opts?: UseMutationOptions<DriverDto, Error, CreateDriverVars>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, files }: CreateDriverVars) =>
      createDriver(body, files),
    ...opts,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: DRIVERS_KEY });
      qc.invalidateQueries({ queryKey: MY_FLEET_KEY });
      // Server-derived `Carrier.onboarding.hasDriver/isComplete` changes
      // when a driver is created — refetch the carriers list. See
      // useVehicles for the same rationale.
      qc.invalidateQueries({ queryKey: CARRIERS_KEY });
      opts?.onSuccess?.(...args);
    },
  });
}

export function useUpdateDriver(
  opts?: UseMutationOptions<DriverDto, Error, UpdateDriverVars>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body, files }: UpdateDriverVars) =>
      updateDriver(id, body, files),
    ...opts,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: DRIVERS_KEY });
      qc.invalidateQueries({ queryKey: MY_FLEET_KEY });
      opts?.onSuccess?.(...args);
    },
  });
}

export function useDeactivateDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deactivateDriver,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DRIVERS_KEY });
      qc.invalidateQueries({ queryKey: MY_FLEET_KEY });
      // May flip `Carrier.onboarding.hasDriver` — see useVehicles.
      qc.invalidateQueries({ queryKey: CARRIERS_KEY });
    },
  });
}

export function useReactivateDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: reactivateDriver,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DRIVERS_KEY });
      qc.invalidateQueries({ queryKey: MY_FLEET_KEY });
      qc.invalidateQueries({ queryKey: CARRIERS_KEY });
    },
  });
}

export function useDeleteDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteDriver,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DRIVERS_KEY });
      qc.invalidateQueries({ queryKey: MY_FLEET_KEY });
      qc.invalidateQueries({ queryKey: CARRIERS_KEY });
    },
  });
}

/** Hard-delete — admin only. See useHardDeleteCarrier doc. */
export function useHardDeleteDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: DeleteWithReasonDto }) =>
      hardDeleteDriver(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DRIVERS_KEY });
      qc.invalidateQueries({ queryKey: MY_FLEET_KEY });
      qc.invalidateQueries({ queryKey: CARRIERS_KEY });
    },
  });
}
