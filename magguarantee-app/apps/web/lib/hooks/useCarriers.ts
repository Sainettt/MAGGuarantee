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
  CarrierAttachmentCategory,
  CarrierAttachmentDto,
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
  deleteCarrierAttachment,
  deactivateCarrier,
  getCarrier,
  hardDeleteCarrier,
  listCarrierAttachments,
  listCarriers,
  reactivateCarrier,
  updateCarrier,
  uploadCarrierAttachment,
} from '@/lib/api/carriers';

export const CARRIERS_KEY = ['carriers'] as const;
/** Query namespace for a carrier's company documents (attachments). */
export const CARRIER_ATTACHMENTS_KEY = ['carrier-attachments'] as const;

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

// ─── Carrier attachments (company documents) ─────────────

/** Lists a carrier's company documents. Enabled only when `id` is set. */
export function useCarrierAttachments(id: string | null | undefined) {
  return useQuery<CarrierAttachmentDto[]>({
    queryKey: [...CARRIER_ATTACHMENTS_KEY, id],
    queryFn: () => listCarrierAttachments(id as string),
    enabled: Boolean(id),
  });
}

export interface UploadCarrierAttachmentVars {
  carrierId: string;
  category: CarrierAttachmentCategory;
  file: File;
}

/** Uploads one company document, then refetches the carrier's document list. */
export function useUploadCarrierAttachment(
  opts?: UseMutationOptions<
    CarrierAttachmentDto,
    Error,
    UploadCarrierAttachmentVars
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ carrierId, category, file }: UploadCarrierAttachmentVars) =>
      uploadCarrierAttachment(carrierId, category, file),
    ...opts,
    onSuccess: (...args) => {
      const [, vars] = args;
      qc.invalidateQueries({
        queryKey: [...CARRIER_ATTACHMENTS_KEY, vars.carrierId],
      });
      opts?.onSuccess?.(...args);
    },
  });
}

export interface DeleteCarrierAttachmentVars {
  carrierId: string;
  attachmentId: string;
}

/** Deletes one company document, then refetches the carrier's document list. */
export function useDeleteCarrierAttachment(
  opts?: UseMutationOptions<void, Error, DeleteCarrierAttachmentVars>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ carrierId, attachmentId }: DeleteCarrierAttachmentVars) =>
      deleteCarrierAttachment(carrierId, attachmentId),
    ...opts,
    onSuccess: (...args) => {
      const [, vars] = args;
      qc.invalidateQueries({
        queryKey: [...CARRIER_ATTACHMENTS_KEY, vars.carrierId],
      });
      opts?.onSuccess?.(...args);
    },
  });
}
