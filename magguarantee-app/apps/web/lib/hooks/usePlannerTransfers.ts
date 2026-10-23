'use client';

// TanStack Query hooks for the vehicle planner transfer (docs/29, docs/14 §17).
//
// Cache layout
// ────────────
//   ['plannerTransfers', 'list', params]        — inbox (`scope=decide`) / own
//                                                 requests (`scope=mine`: the
//                                                 author lists AND the admin's
//                                                 «Moje wnioski» tab), every tab
//   ['vehicles', 'planner-history', vehicleId]  — journal + requests of one vehicle
//
// The history lives under `VEHICLES_KEY` on purpose: every vehicle mutation
// already invalidates `['vehicles']` (a deactivation cancels the pending
// request server-side), so the pending notice in the vehicle form / detail
// modal can never outlive the request it shows.
//
// The nav counter (`usePendingDecideCount`) reads the SAME query as the «Do
// decyzji» tab (`scope=decide&status=pending&limit=200`), so the badge and the
// list cannot disagree and opening the page costs no extra request.
//
// Invalidation (docs/14 §17.9) — every mutation refreshes the lists + counter
// (one PREFIX invalidation of `PLANNER_TRANSFERS_KEY` covers both scopes and
// every status filter, so an admin filing / cancelling from the vehicle form
// also refreshes his «Moje wnioski» tab — no per-scope key to keep in sync),
// the vehicle's history and its detail; an approval additionally refreshes
// everything that reads the vehicle's planista LIVE (U7): vehicle lists / km
// report (all under `['vehicles']`), the planista fleet, delegations (a
// `zgloszony`/`gotowy` trip moved to the new planista, R6), the opiekun fleet
// and the planista pickers (the transfer targets exclude the current one).
//
// All four mutations carry `meta: SUPPRESS_GLOBAL_ERROR`: every call site
// renders its own error UX (inline alert inside the open dialog, §17.3 /
// §17.5.5), so the global toast would only duplicate it.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  PlannerTransferDto,
  VehiclePlannerHistoryDto,
} from '@magguarantee/shared';

import {
  approvePlannerTransfer,
  cancelPlannerTransfer,
  getVehiclePlannerHistory,
  listPlannerTransfers,
  rejectPlannerTransfer,
  requestPlannerTransfer,
  type PlannerTransferListParams,
  type RequestPlannerTransferBody,
} from '@/lib/api/plannerTransfers';
import { PLANNER_TRANSFERS_KEY } from '@/lib/hooks/plannerTransferKeys';
import { DELEGATIONS_KEY } from '@/lib/hooks/useDelegations';
import { PLANISCI_LOOKUP_KEY } from '@/lib/hooks/useLookups';
import { OPIEKUN_KEY } from '@/lib/hooks/useOpiekunFleet';
import { PLANISTA_FLEET_KEY } from '@/lib/hooks/usePlanistaFleet';
import { VEHICLES_KEY } from '@/lib/hooks/useVehicles';
import { SUPPRESS_GLOBAL_ERROR } from '@/lib/query/globalErrors';
import { decidableCount } from '@/lib/transfers/transferUi';

export { PLANNER_TRANSFERS_KEY };

/** The pending queue is short by nature — one page of 200 covers it. */
export const PENDING_PAGE_LIMIT = 200;
/** Page size of the «Rozpatrzone» tab (cursor-paginated). */
export const DECIDED_PAGE_LIMIT = 50;

export function plannerHistoryKey(vehicleId: string | null | undefined) {
  return [...VEHICLES_KEY, 'planner-history', vehicleId ?? null] as const;
}

function vehicleDetailKey(vehicleId: string) {
  return [...VEHICLES_KEY, 'detail', vehicleId] as const;
}

/** The exact params of the decider «Do decyzji» tab — shared with the nav counter. */
export const DECIDE_PENDING_PARAMS: PlannerTransferListParams = {
  scope: 'decide',
  status: 'pending',
  limit: PENDING_PAGE_LIMIT,
};

// ─── Queries ─────────────────────────────────────────────

export function usePlannerTransfers(
  params: PlannerTransferListParams,
  opts: { enabled?: boolean; refetchOnWindowFocus?: boolean } = {},
) {
  const isDecidePending = params.scope === 'decide' && params.status === 'pending';
  return useQuery({
    queryKey: [...PLANNER_TRANSFERS_KEY, 'list', params],
    queryFn: () => listPlannerTransfers(params),
    enabled: opts.enabled ?? true,
    refetchOnWindowFocus: opts.refetchOnWindowFocus,
    // The decider queue also feeds the nav counter, which has no error UI of
    // its own: a lider whose flag was just removed (U10) gets a 403 there,
    // and a toast on every page would be noise. The inbox page renders its
    // own inline error state for the same query.
    meta: isDecidePending ? SUPPRESS_GLOBAL_ERROR : undefined,
  });
}

/**
 * Nav counter (docs/14 §17.4.3): pending requests the viewer can decide
 * (`viewerCanDecide`) — a lider's blocked rows (he is the author / target) do
 * not count, or the badge would never reach zero. `undefined` while loading or
 * when disabled, so the caller renders no phantom badge. Refetches on window
 * focus (the only freshness signal besides mutations — no polling, R9).
 */
export function usePendingDecideCount(opts: { enabled: boolean }): number | undefined {
  const q = usePlannerTransfers(DECIDE_PENDING_PARAMS, {
    enabled: opts.enabled,
    refetchOnWindowFocus: true,
  });
  if (!opts.enabled || !q.data) return undefined;
  return decidableCount(q.data.items);
}

/**
 * `GET /vehicles/:id/planner-history`. A 403 is an EXPECTED answer for viewers
 * outside U11 (the section is then silently omitted), so the global error
 * toast is suppressed — callers render their own states.
 */
export function useVehiclePlannerHistory(
  vehicleId: string | null | undefined,
  opts: { enabled?: boolean } = {},
) {
  return useQuery<VehiclePlannerHistoryDto>({
    queryKey: plannerHistoryKey(vehicleId),
    queryFn: () => getVehiclePlannerHistory(vehicleId as string),
    enabled: Boolean(vehicleId) && (opts.enabled ?? true),
    meta: SUPPRESS_GLOBAL_ERROR,
  });
}

// ─── Invalidation ────────────────────────────────────────

/** Lists + counter, the vehicle's history and its detail (every mutation). */
export function invalidateTransferViews(
  qc: QueryClient,
  vehicleId: string | null | undefined,
): void {
  void qc.invalidateQueries({ queryKey: PLANNER_TRANSFERS_KEY });
  if (vehicleId) {
    void qc.invalidateQueries({ queryKey: plannerHistoryKey(vehicleId) });
    void qc.invalidateQueries({ queryKey: vehicleDetailKey(vehicleId) });
  }
}

/** After an approval: everything that reads the vehicle's planista live (U7, R6). */
export function invalidateAfterApproval(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: PLANNER_TRANSFERS_KEY });
  void qc.invalidateQueries({ queryKey: VEHICLES_KEY });
  void qc.invalidateQueries({ queryKey: PLANISTA_FLEET_KEY });
  void qc.invalidateQueries({ queryKey: DELEGATIONS_KEY });
  void qc.invalidateQueries({ queryKey: OPIEKUN_KEY });
  void qc.invalidateQueries({ queryKey: PLANISCI_LOOKUP_KEY });
}

/** For error paths (409 «stale» / «already pending»): refresh what the dialog showed. */
export function useInvalidateTransferViews(): (vehicleId?: string | null) => void {
  const qc = useQueryClient();
  return (vehicleId) => invalidateTransferViews(qc, vehicleId);
}

// ─── Mutations ───────────────────────────────────────────

export interface RequestPlannerTransferVars {
  vehicleId: string;
  body: RequestPlannerTransferBody;
}

export function useRequestPlannerTransfer() {
  const qc = useQueryClient();
  return useMutation<PlannerTransferDto, Error, RequestPlannerTransferVars>({
    meta: SUPPRESS_GLOBAL_ERROR,
    mutationFn: ({ vehicleId, body }) => requestPlannerTransfer(vehicleId, body),
    onSuccess: (_res, { vehicleId }) => invalidateTransferViews(qc, vehicleId),
  });
}

export interface DecideVars {
  transfer: PlannerTransferDto;
}

export function useApprovePlannerTransfer() {
  const qc = useQueryClient();
  return useMutation<PlannerTransferDto, Error, DecideVars & { comment?: string }>({
    meta: SUPPRESS_GLOBAL_ERROR,
    mutationFn: ({ transfer, comment }) =>
      approvePlannerTransfer(transfer.id, comment),
    onSuccess: () => invalidateAfterApproval(qc),
  });
}

export function useRejectPlannerTransfer() {
  const qc = useQueryClient();
  return useMutation<PlannerTransferDto, Error, DecideVars & { reason: string }>({
    meta: SUPPRESS_GLOBAL_ERROR,
    mutationFn: ({ transfer, reason }) =>
      rejectPlannerTransfer(transfer.id, reason),
    onSuccess: (_res, { transfer }) =>
      invalidateTransferViews(qc, transfer.vehicle.id),
  });
}

export function useCancelPlannerTransfer() {
  const qc = useQueryClient();
  return useMutation<PlannerTransferDto, Error, DecideVars>({
    meta: SUPPRESS_GLOBAL_ERROR,
    mutationFn: ({ transfer }) => cancelPlannerTransfer(transfer.id),
    onSuccess: (_res, { transfer }) =>
      invalidateTransferViews(qc, transfer.vehicle.id),
  });
}
