'use client';

// TanStack Query hooks for the weekly km-board / read-report + per-vehicle
// daily-km history (Phase 7.7 — docs/14 §7.7, docs/20 §0′).
//
//   • useVehicleKmBoard       — GET /vehicles/km-board?week (editable, weryfikator/admin)
//   • useVehicleKmReport      — GET /vehicles/km-report?week (read-only, role-scoped)
//   • useSetVehicleDailyKm    — PUT /vehicles/:id/daily-km (upsert; optimistic in caller)
//   • useVehicleDailyKmHistory — GET /vehicles/:id/daily-km?from&to (history dialog)
//
// The board edit flow is OPTIMISTIC + silent-on-success (DS §7.7.4): committing
// dozens of cells should not spam toasts. The mutation patches the cached board
// envelope in `onMutate`, rolls back in `onError`, and re-fetches on `onSettled`
// to reconcile the derived Σ / motion-status / lastDroveAt the server computes.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import type {
  KmBoardQuery,
  SetVehicleDailyKmDto,
  VehicleDailyKmDto,
  VehicleDailyKmHistoryQuery,
  VehicleKmBoardDto,
} from '@magguarantee/shared';

import {
  deleteVehicleDailyKm,
  getVehicleDailyKmHistory,
  getVehicleKmBoard,
  getVehicleKmReport,
  setVehicleDailyKm,
} from '@/lib/api/vehicles';

export const VEHICLE_KM_KEY = ['vehicles', 'daily-km'] as const;

/** Stable key for one weekly board/report fetch (keyed by resolved query). */
function boardKey(scope: 'board' | 'report', query: KmBoardQuery) {
  return [...VEHICLE_KM_KEY, scope, query.week ?? query.from ?? 'current'] as const;
}

/**
 * The editable weekly km-board (`GET /vehicles/km-board`). Short stale window
 * so re-stamps / GPS rows propagate quickly; the mutation also reconciles it.
 */
export function useVehicleKmBoard(query: KmBoardQuery) {
  return useQuery({
    queryKey: boardKey('board', query),
    queryFn: () => getVehicleKmBoard(query),
    staleTime: 15_000,
  });
}

/** The read-only weekly km-report (`GET /vehicles/km-report`), role-scoped. */
export function useVehicleKmReport(query: KmBoardQuery) {
  return useQuery({
    queryKey: boardKey('report', query),
    queryFn: () => getVehicleKmReport(query),
    staleTime: 15_000,
  });
}

interface DailyKmVars {
  id: string;
  body: SetVehicleDailyKmDto;
}

/**
 * Upsert one daily-km mark with an OPTIMISTIC cache patch against the currently
 * displayed board envelope. The caller passes the active board query key so we
 * patch exactly the visible week. Success is silent; only `onError` should
 * toast (wired by the caller). `onSettled` invalidates so the server-derived
 * Σ / motion-status reconcile.
 */
export function useSetVehicleDailyKm(
  boardQuery: KmBoardQuery,
  opts?: UseMutationOptions<
    VehicleDailyKmDto,
    Error,
    DailyKmVars,
    { previous: VehicleKmBoardDto | undefined }
  >,
) {
  const qc = useQueryClient();
  const key = boardKey('board', boardQuery);

  return useMutation<
    VehicleDailyKmDto,
    Error,
    DailyKmVars,
    { previous: VehicleKmBoardDto | undefined }
  >({
    mutationFn: ({ id, body }) => setVehicleDailyKm(id, body),
    ...opts,
    onMutate: async (vars, ...rest) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<VehicleKmBoardDto>(key);
      if (previous) {
        qc.setQueryData<VehicleKmBoardDto>(
          key,
          patchBoardCell(previous, vars.id, vars.body.date, {
            date: vars.body.date,
            state: vars.body.state,
            km: vars.body.state === 'drove' ? (vars.body.km ?? 0) : null,
            notes: vars.body.notes ?? null,
          }),
        );
      }
      await opts?.onMutate?.(vars, ...rest);
      return { previous };
    },
    onError: (err, vars, ctx, ...rest) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      opts?.onError?.(err, vars, ctx, ...rest);
    },
    onSettled: (data, err, vars, ...rest) => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({
        queryKey: [...VEHICLE_KM_KEY, 'history', vars.id],
      });
      opts?.onSettled?.(data, err, vars, ...rest);
    },
  });
}

interface ClearDailyKmVars {
  id: string;
  date: string;
}

/**
 * Clears one daily-km mark (`DELETE /vehicles/:id/daily-km?date`). Optimistic
 * mirror of `useSetVehicleDailyKm`: `onMutate` patches the (vehicle, date) cell
 * back to the «not checked» empty state ({ state: null, km: null, notes: null })
 * and recomputes the row Σ km. Rolls back on error; re-fetches board + history
 * on settle so the server-derived Σ / motion-status reconcile. Silent on
 * success — only the caller's `onError` toasts.
 */
export function useClearVehicleDailyKm(
  boardQuery: KmBoardQuery,
  opts?: UseMutationOptions<
    void,
    Error,
    ClearDailyKmVars,
    { previous: VehicleKmBoardDto | undefined }
  >,
) {
  const qc = useQueryClient();
  const key = boardKey('board', boardQuery);

  return useMutation<
    void,
    Error,
    ClearDailyKmVars,
    { previous: VehicleKmBoardDto | undefined }
  >({
    mutationFn: ({ id, date }) => deleteVehicleDailyKm(id, date),
    ...opts,
    onMutate: async (vars, ...rest) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<VehicleKmBoardDto>(key);
      if (previous) {
        qc.setQueryData<VehicleKmBoardDto>(
          key,
          patchBoardCell(previous, vars.id, vars.date, {
            date: vars.date,
            state: null,
            km: null,
            notes: null,
          }),
        );
      }
      await opts?.onMutate?.(vars, ...rest);
      return { previous };
    },
    onError: (err, vars, ctx, ...rest) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      opts?.onError?.(err, vars, ctx, ...rest);
    },
    onSettled: (data, err, vars, ...rest) => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({
        queryKey: [...VEHICLE_KM_KEY, 'history', vars.id],
      });
      opts?.onSettled?.(data, err, vars, ...rest);
    },
  });
}

/**
 * Patches one cell in a cached board envelope: replaces the matching
 * (vehicle, date) cell with `next` and recomputes the row Σ km. Motion-status
 * is left to the server reconcile (`onSettled` re-fetch) — an optimistic guess
 * could diverge from the latest-by-date rule.
 */
function patchBoardCell(
  board: VehicleKmBoardDto,
  id: string,
  date: string,
  next: VehicleKmBoardDto['items'][number]['cells'][number],
): VehicleKmBoardDto {
  return {
    ...board,
    items: board.items.map((item) => {
      if (item.id !== id) return item;
      const cells = item.cells.map((cell) =>
        cell.date === date ? next : cell,
      );
      const kmSum = cells.reduce(
        (sum, c) => sum + (c.state === 'drove' ? (c.km ?? 0) : 0),
        0,
      );
      return { ...item, cells, kmSum };
    }),
  };
}

/**
 * One vehicle's daily-km history, newest-first. Enabled only while the history
 * dialog has a target vehicle.
 */
export function useVehicleDailyKmHistory(
  id: string | null | undefined,
  query: VehicleDailyKmHistoryQuery = {},
) {
  return useQuery({
    queryKey: [...VEHICLE_KM_KEY, 'history', id, query.from ?? null, query.to ?? null],
    queryFn: () => getVehicleDailyKmHistory(id as string, query),
    enabled: Boolean(id),
  });
}
