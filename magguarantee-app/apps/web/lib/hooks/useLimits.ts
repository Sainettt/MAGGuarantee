'use client';

// TanStack Query hooks for /limits — km limits per ISO week (docs/14 §18).
// The list query is keyed by ISO year, so the admin can switch years without
// manual invalidation.
//
// Single-week write flow (§18.5.2):
//   1. The panel calls `save(isoYear, isoWeek, body)` — a partial body with
//      only the field that changed.
//   2. The write is queued under its `YYYY-Www` key (`lib/limits/saveQueue`):
//      same-week writes are strictly sequential, other weeks stay parallel.
//   3. `onMutate` patches the cached row optimistically, so the tile updates
//      at once; `onError` rolls back THAT row only (another week's in-flight
//      patch is left alone); `onSuccess` puts the server's row in place.
//   4. The year is re-fetched once the last in-flight write settles (not
//      after each one — a refetch between two queued writes would flash the
//      older value back for a moment).
// Success is silent (159 entries must not mean 159 toasts); the caller toasts
// errors only. A failed week stays marked (`hasFailed`) until its next
// successful write; `retry` re-sends what failed.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  formatIsoWeekKey,
  type BulkUpdateWeeklyLimitsDto,
  type UpdateWeeklyLimitDto,
  type WeeklyLimitDto,
  type WeeklyLimitListDto,
} from '@magguarantee/shared';

import {
  bulkUpdateWeeklyLimits,
  listWeeklyLimits,
  updateWeeklyLimit,
} from '@/lib/api/limits';
import { createSerialQueue, type SerialQueue } from '@/lib/limits/saveQueue';
import { SUPPRESS_GLOBAL_ERROR } from '@/lib/query/globalErrors';

export const LIMITS_KEY = ['limits'] as const;
const UPDATE_MUTATION_KEY = [...LIMITS_KEY, 'update'] as const;

function listKey(isoYear: number) {
  return [...LIMITS_KEY, 'list', isoYear] as const;
}

/** `YYYY-Www`; falls back to the raw pair for a week that does not exist. */
export function weekKeyOf(isoYear: number, isoWeek: number): string {
  return (
    formatIsoWeekKey(isoYear, isoWeek) ??
    `${isoYear}-W${String(isoWeek).padStart(2, '0')}`
  );
}

export function useLimits(isoYear: number) {
  return useQuery({
    queryKey: listKey(isoYear),
    queryFn: () => listWeeklyLimits(isoYear),
    staleTime: 30_000,
  });
}

export interface UpdateLimitVars {
  isoYear: number;
  isoWeek: number;
  body: UpdateWeeklyLimitDto;
}

interface OptimisticCtx {
  /** The row as it was before the patch; `null` = there was no row. */
  previousRow: WeeklyLimitDto | null;
  /** The cache did not hold the year at all — nothing to roll back. */
  hadList: boolean;
}

function replaceRow(
  qc: QueryClient,
  isoYear: number,
  isoWeek: number,
  next: WeeklyLimitDto | null,
): void {
  qc.setQueryData<WeeklyLimitListDto>(listKey(isoYear), (old) => {
    if (!old) return old;
    const rest = old.filter(
      (r) => !(r.isoYear === isoYear && r.isoWeek === isoWeek),
    );
    if (next === null) return rest;
    return [...rest, next].sort((a, b) => a.isoWeek - b.isoWeek);
  });
}

/**
 * Optimistic upsert of one week. The variables carry `{isoYear, isoWeek}` and
 * the hook owns the `YYYY-Www` format, so callers can't drift from the
 * contract.
 */
export function useUpdateLimit() {
  const qc = useQueryClient();
  return useMutation<WeeklyLimitDto, Error, UpdateLimitVars, OptimisticCtx>({
    mutationKey: UPDATE_MUTATION_KEY,
    mutationFn: ({ isoYear, isoWeek, body }) =>
      updateWeeklyLimit(weekKeyOf(isoYear, isoWeek), body),
    onMutate: async ({ isoYear, isoWeek, body }) => {
      const key = listKey(isoYear);
      await qc.cancelQueries({ queryKey: key });
      const list = qc.getQueryData<WeeklyLimitListDto>(key);
      const previousRow =
        list?.find((r) => r.isoYear === isoYear && r.isoWeek === isoWeek) ??
        null;
      const now = new Date().toISOString();
      const patched: WeeklyLimitDto = previousRow
        ? {
            ...previousRow,
            kmPerDay:
              body.kmPerDay !== undefined ? body.kmPerDay : previousRow.kmPerDay,
            ratePerKm:
              body.ratePerKm !== undefined
                ? body.ratePerKm
                : previousRow.ratePerKm,
            kmPerSaturday:
              body.kmPerSaturday !== undefined
                ? body.kmPerSaturday
                : previousRow.kmPerSaturday,
            updatedAt: now,
          }
        : {
            id: `optimistic-${weekKeyOf(isoYear, isoWeek)}`,
            isoYear,
            isoWeek,
            kmPerDay: body.kmPerDay ?? null,
            ratePerKm: body.ratePerKm ?? null,
            kmPerSaturday: body.kmPerSaturday ?? null,
            createdAt: now,
            updatedAt: now,
          };
      replaceRow(qc, isoYear, isoWeek, patched);
      return { previousRow, hadList: list !== undefined };
    },
    onError: (_err, vars, ctx) => {
      if (ctx?.hadList) replaceRow(qc, vars.isoYear, vars.isoWeek, ctx.previousRow);
    },
    onSuccess: (row, vars) => {
      replaceRow(qc, vars.isoYear, vars.isoWeek, row);
    },
    onSettled: (_data, _err, vars) => {
      // The settling mutation still counts itself: 1 ⇒ it is the last one.
      if (qc.isMutating({ mutationKey: UPDATE_MUTATION_KEY }) <= 1) {
        void qc.invalidateQueries({ queryKey: listKey(vars.isoYear) });
      }
    },
  });
}

export interface WeekLimitWriter {
  /** Queue a partial write of one week. Rejects when the write fails. */
  save: (
    isoYear: number,
    isoWeek: number,
    body: UpdateWeeklyLimitDto,
  ) => Promise<WeeklyLimitDto>;
  /** The week has writes queued or in flight (tile spinner, panel «Zapisywanie…»). */
  isPending: (weekKey: string) => boolean;
  /** Anything at all is being written (leave-page guard). */
  anyPending: boolean;
  /** The week's last write failed and nothing succeeded since. */
  hasFailed: (weekKey: string) => boolean;
  /** Re-send what failed for that week. */
  retry: (weekKey: string) => Promise<WeeklyLimitDto> | null;
}

/**
 * Autosave writes SERIALIZED per `YYYY-Www` (docs/14 §16.3, §18.5.2), with
 * per-week pending / failed state for the tiles and the panel status line.
 */
export function useSerializedUpdateLimit(): WeekLimitWriter {
  const { mutateAsync } = useUpdateLimit();
  const queueRef = useRef<SerialQueue | null>(null);
  if (queueRef.current === null) queueRef.current = createSerialQueue();
  const queue = queueRef.current;

  // Re-render whenever a pending count changes.
  useSyncExternalStore(queue.subscribe, queue.getVersion, () => 0);

  type Failed = { isoYear: number; isoWeek: number; body: UpdateWeeklyLimitDto };
  const [failed, setFailed] = useState<ReadonlyMap<string, Failed>>(
    () => new Map(),
  );

  const save = useCallback(
    async (isoYear: number, isoWeek: number, body: UpdateWeeklyLimitDto) => {
      const key = weekKeyOf(isoYear, isoWeek);
      try {
        const row = await queue.run(key, () =>
          mutateAsync({ isoYear, isoWeek, body }),
        );
        setFailed((prev) => {
          if (!prev.has(key)) return prev;
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
        return row;
      } catch (error) {
        setFailed((prev) => {
          const next = new Map(prev);
          const earlier = prev.get(key)?.body ?? {};
          // Merge, so a retry re-sends every field that did not land.
          next.set(key, { isoYear, isoWeek, body: { ...earlier, ...body } });
          return next;
        });
        throw error;
      }
    },
    [mutateAsync, queue],
  );

  const retry = useCallback(
    (weekKey: string) => {
      const entry = failed.get(weekKey);
      return entry ? save(entry.isoYear, entry.isoWeek, entry.body) : null;
    },
    [failed, save],
  );

  return {
    save,
    isPending: (weekKey) => queue.pending(weekKey) > 0,
    anyPending: queue.totalPending() > 0,
    hasFailed: (weekKey) => failed.has(weekKey),
    retry,
  };
}

/**
 * `POST /limits/bulk` — one partial payload applied to N weeks of one ISO
 * year. The endpoint is atomic, so there is no per-row result to reconcile:
 * on success we drop the year's cache and refetch the authoritative rows.
 */
export function useBulkUpdateLimits() {
  const qc = useQueryClient();
  return useMutation<WeeklyLimitListDto, Error, BulkUpdateWeeklyLimitsDto>({
    mutationFn: (body) => bulkUpdateWeeklyLimits(body),
    // The page toasts its own error (`mutate(vars, { onError })`), which the
    // global MutationCache handler cannot see.
    meta: SUPPRESS_GLOBAL_ERROR,
    onSuccess: (rows, vars) => {
      // Show the written rows at once; the refetch confirms them.
      qc.setQueryData<WeeklyLimitListDto>(listKey(vars.isoYear), (old) => {
        if (!old) return old;
        const written = new Set(rows.map((r) => r.isoWeek));
        return [...old.filter((r) => !written.has(r.isoWeek)), ...rows].sort(
          (a, b) => a.isoWeek - b.isoWeek,
        );
      });
      void qc.invalidateQueries({ queryKey: listKey(vars.isoYear) });
    },
  });
}
