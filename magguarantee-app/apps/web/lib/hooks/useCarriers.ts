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
  CarrierDocumentsOverviewDto,
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
  getCarrierDocumentsOverview,
  hardDeleteCarrier,
  listCarrierAttachments,
  listCarriers,
  reactivateCarrier,
  resetCarrierPassword,
  updateCarrier,
  uploadCarrierAttachment,
} from '@/lib/api/carriers';
import { OPIEKUN_KEY } from '@/lib/hooks/useOpiekunFleet';
import type { MutationMetaOptions } from '@/lib/query/globalErrors';

export const CARRIERS_KEY = ['carriers'] as const;
/** Query namespace for a carrier's company documents (attachments). */
export const CARRIER_ATTACHMENTS_KEY = ['carrier-attachments'] as const;
/**
 * Query namespace for the opiekun "Dokumenty" tab aggregate
 * (`GET /carriers/:id/documents/overview`). Keyed by carrierId. Kept separate
 * from `CARRIER_ATTACHMENTS_KEY` so a company-doc upload/delete can invalidate
 * BOTH the flat list and the fleet-wide overview.
 */
export const CARRIER_DOCUMENTS_OVERVIEW_KEY = [
  'carrier-documents-overview',
] as const;

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

/**
 * Admin/opiekun carrier password reset. No cache invalidation: the reset
 * changes no field the list renders — the caller shows the returned one-time
 * password in a result dialog instead.
 */
export function useResetCarrierPassword(
  opts?: UseMutationOptions<CarrierWithTemporaryPasswordDto, Error, string>,
) {
  return useMutation({
    mutationFn: resetCarrierPassword,
    ...opts,
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
export function useHardDeleteCarrier(opts?: MutationMetaOptions) {
  const qc = useQueryClient();
  return useMutation({
    meta: opts?.meta,
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

/**
 * Fleet-wide document overview for the opiekun "Dokumenty" tab — company docs +
 * per-vehicle / trailer / driver files, grouped by owning entity, in one call.
 * Enabled only when `id` is set.
 */
export function useCarrierDocumentsOverview(id: string | null | undefined) {
  return useQuery<CarrierDocumentsOverviewDto>({
    queryKey: [...CARRIER_DOCUMENTS_OVERVIEW_KEY, id],
    queryFn: () => getCarrierDocumentsOverview(id as string),
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
      // The company-doc set also drives the opiekun "Dokumenty" tab aggregate —
      // invalidate the fleet-wide overview so a freshly uploaded file shows up
      // in its type-card count and Sheet list.
      qc.invalidateQueries({
        queryKey: [...CARRIER_DOCUMENTS_OVERVIEW_KEY, vars.carrierId],
      });
      // The carrier's active-vehicle/trailer/driver count feeds the opiekun
      // readiness view (incompleteFleet) — invalidate so the per-carrier
      // attention exclamation stays fresh.
      qc.invalidateQueries({ queryKey: OPIEKUN_KEY });
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
      // Keep the opiekun "Dokumenty" tab aggregate in sync after a company-doc
      // delete (the file must vanish from its type-card count and Sheet list).
      qc.invalidateQueries({
        queryKey: [...CARRIER_DOCUMENTS_OVERVIEW_KEY, vars.carrierId],
      });
      // The carrier's fleet-count-driven readiness view (incompleteFleet) —
      // invalidate so the per-carrier attention exclamation stays fresh.
      qc.invalidateQueries({ queryKey: OPIEKUN_KEY });
      opts?.onSuccess?.(...args);
    },
  });
}
