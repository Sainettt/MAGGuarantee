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
  VehicleAttachmentDto,
  VehicleDto,
  VehicleFilters,
} from '@magguarantee/shared';

import {
  createVehicle,
  deactivateVehicle,
  deleteVehicle,
  getVehicle,
  listVehicleAttachments,
  listVehicles,
  reactivateVehicle,
  updateVehicle,
  type VehicleAttachmentUploads,
} from '@/lib/api/vehicles';
import { CARRIERS_KEY } from '@/lib/hooks/useCarriers';
import { MY_FLEET_KEY } from '@/lib/hooks/useMyFleet';
import { OPIEKUN_KEY } from '@/lib/hooks/useOpiekunFleet';

export const VEHICLES_KEY = ['vehicles'] as const;

/**
 * Mutation payload for create — the validated scalar DTO plus the umowa /
 * cabotage file uploads, since `POST /vehicles` is `multipart/form-data`.
 */
export interface CreateVehicleVars {
  body: CreateVehicleDto;
  files?: VehicleAttachmentUploads;
}

/** Mutation payload for update — id, scalar patch, and file uploads. */
export interface UpdateVehicleVars {
  id: string;
  body: UpdateVehicleDto;
  files?: VehicleAttachmentUploads;
}

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
  opts?: UseMutationOptions<VehicleDto, Error, CreateVehicleVars>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, files }: CreateVehicleVars) =>
      createVehicle(body, files),
    ...opts,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: VEHICLES_KEY });
      qc.invalidateQueries({ queryKey: MY_FLEET_KEY });
      // `Carrier.onboarding.{hasVehicle,isComplete}` is derived server-side
      // from the live count of active vehicles, so a fresh vehicle changes
      // every carriers list row that touches this carrier. Invalidate to
      // refetch — otherwise the "Brak: Pojazd" chip and the "Dokończ
      // onboarding" button linger after the wizard completes.
      qc.invalidateQueries({ queryKey: CARRIERS_KEY });
      // The carrier's active-vehicle count feeds the opiekun readiness view
      // (incompleteFleet). Invalidate so the per-carrier "needs attention"
      // exclamation stays fresh.
      qc.invalidateQueries({ queryKey: OPIEKUN_KEY });
      opts?.onSuccess?.(...args);
    },
  });
}

export function useUpdateVehicle(
  opts?: UseMutationOptions<VehicleDto, Error, UpdateVehicleVars>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body, files }: UpdateVehicleVars) =>
      updateVehicle(id, body, files),
    ...opts,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: VEHICLES_KEY });
      qc.invalidateQueries({ queryKey: MY_FLEET_KEY });
      // Editing a vehicle can change its active state — refresh the opiekun
      // readiness view so the incompleteFleet attention exclamation stays fresh.
      qc.invalidateQueries({ queryKey: OPIEKUN_KEY });
      opts?.onSuccess?.(...args);
    },
  });
}

/**
 * Lists the non-deleted umowa / cabotage attachments for a vehicle. The
 * `VehicleDto` already embeds `attachments`, so this is only needed where a
 * fresh, standalone read is required (rare). Enabled only when `id` is set.
 */
export function useVehicleAttachments(id: string | null | undefined) {
  return useQuery<VehicleAttachmentDto[]>({
    queryKey: [...VEHICLES_KEY, 'attachments', id],
    queryFn: () => listVehicleAttachments(id as string),
    enabled: Boolean(id),
  });
}

export function useDeactivateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deactivateVehicle,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: VEHICLES_KEY });
      qc.invalidateQueries({ queryKey: MY_FLEET_KEY });
      // Deactivating the last active vehicle flips
      // `Carrier.onboarding.hasVehicle` to false on the next read — refetch.
      qc.invalidateQueries({ queryKey: CARRIERS_KEY });
      // Active-vehicle count + ADR flag feed the opiekun readiness view.
      qc.invalidateQueries({ queryKey: OPIEKUN_KEY });
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
      qc.invalidateQueries({ queryKey: CARRIERS_KEY });
      // Active-vehicle count + ADR flag feed the opiekun readiness view.
      qc.invalidateQueries({ queryKey: OPIEKUN_KEY });
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
      qc.invalidateQueries({ queryKey: CARRIERS_KEY });
      // Active-vehicle count + ADR flag feed the opiekun readiness view.
      qc.invalidateQueries({ queryKey: OPIEKUN_KEY });
    },
  });
}

// NOTE: the admin vehicle hard-delete (`DELETE /vehicles/:id/hard`) was RETIRED
// (Vehicle-status rework) — admin now soft-deletes via `useDeleteVehicle` like
// everyone else. The former `useHardDeleteVehicle` hook was removed.
