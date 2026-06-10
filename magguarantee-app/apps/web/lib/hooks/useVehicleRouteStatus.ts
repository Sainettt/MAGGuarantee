'use client';

// TanStack Query hooks for the weryfikator vehicle route-status board
// (Phase 7.5 — docs/14 §7.5).
//
//   • useVehicleRouteBoard       — GET /vehicles/route-board (the full-fleet board)
//   • useSetVehicleRouteStatus   — POST /vehicles/:id/route-status (re-stampable;
//                                  invalidates the board so the badge + meta refresh)
//   • useVehicleRouteStatusHistory — GET /vehicles/:id/route-status (history dialog)

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import type {
  SetVehicleRouteStatusDto,
  VehicleRouteStatusLogDto,
} from '@magguarantee/shared';

import {
  getVehicleRouteBoard,
  getVehicleRouteStatusHistory,
  setVehicleRouteStatus,
} from '@/lib/api/vehicles';

export const VEHICLE_ROUTE_STATUS_KEY = ['vehicles', 'route-status'] as const;
export const VEHICLE_ROUTE_BOARD_KEY = [
  ...VEHICLE_ROUTE_STATUS_KEY,
  'board',
] as const;

/**
 * The full-fleet board (`GET /vehicles/route-board`). Kept fresh against a
 * short stale window so the verifier's stamps + GPS rows propagate quickly; the
 * mutation below also invalidates it explicitly on success.
 */
export function useVehicleRouteBoard() {
  return useQuery({
    queryKey: VEHICLE_ROUTE_BOARD_KEY,
    queryFn: getVehicleRouteBoard,
    staleTime: 15_000,
  });
}

/**
 * Append a route-status row. Re-stampable — every call writes a new history
 * row. Invalidates both the board (badge + «oznaczono» meta refresh) and the
 * stamped vehicle's history so an open history dialog reflects the new entry.
 */
export function useSetVehicleRouteStatus(
  opts?: UseMutationOptions<
    VehicleRouteStatusLogDto,
    Error,
    { id: string; body: SetVehicleRouteStatusDto }
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => setVehicleRouteStatus(id, body),
    ...opts,
    onSuccess: (data, variables, ...rest) => {
      qc.invalidateQueries({ queryKey: VEHICLE_ROUTE_BOARD_KEY });
      qc.invalidateQueries({
        queryKey: [...VEHICLE_ROUTE_STATUS_KEY, 'history', variables.id],
      });
      opts?.onSuccess?.(data, variables, ...rest);
    },
  });
}

/**
 * One vehicle's append-only route-status history, newest-first. Enabled only
 * while the history dialog has a target vehicle.
 */
export function useVehicleRouteStatusHistory(id: string | null | undefined) {
  return useQuery({
    queryKey: [...VEHICLE_ROUTE_STATUS_KEY, 'history', id],
    queryFn: () => getVehicleRouteStatusHistory(id as string),
    enabled: Boolean(id),
  });
}
