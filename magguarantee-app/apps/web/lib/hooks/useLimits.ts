'use client';

// TanStack Query hooks for /limits. List queries key by year so admin can
// switch between past/future calendars without manual invalidation; the
// mutation invalidates the active year's cache on settle.
//
// Mutation flow per DS L819 `<LimitsRow>` spec:
//   1. Caller fires `mutate({ year, month, body })`.
//   2. We optimistically patch the cached row so the input keeps the new
//      value on blur — without waiting for the network round-trip.
//   3. On error: rollback to the cached snapshot + bubble the error so the
//      caller can toast.
//   4. On settle: invalidate so we pick up the server's resolved row
//      (including `updatedAt`).

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import type {
  BulkUpdateMonthlyLimitsDto,
  MonthlyLimitDto,
  MonthlyLimitListDto,
  UpdateMonthlyLimitDto,
} from '@magguarantee/shared';

import {
  bulkUpdateMonthlyLimits,
  formatYearMonth,
  listMonthlyLimits,
  updateMonthlyLimit,
} from '@/lib/api/limits';
import { createSerialQueue, type SerialQueue } from '@/lib/limits/saveQueue';

export const LIMITS_KEY = ['limits'] as const;

export function useLimits(year: number) {
  return useQuery({
    queryKey: [...LIMITS_KEY, 'list', year],
    queryFn: () => listMonthlyLimits(year),
    staleTime: 30_000,
  });
}

export interface UpdateLimitVars {
  year: number;
  month: number;
  body: UpdateMonthlyLimitDto;
}

interface OptimisticCtx {
  previous?: MonthlyLimitListDto;
}

/**
 * Optimistic upsert. The mutation variable carries the structured
 * `{year, month, body}` rather than a pre-formatted yearMonth — the hook
 * owns the format so callers can't drift from the contract.
 */
export function useUpdateLimit() {
  const qc = useQueryClient();
  return useMutation<MonthlyLimitDto, Error, UpdateLimitVars, OptimisticCtx>({
    mutationFn: ({ year, month, body }) =>
      updateMonthlyLimit(formatYearMonth(year, month), body),
    onMutate: async ({ year, month, body }) => {
      const key = [...LIMITS_KEY, 'list', year] as const;
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<MonthlyLimitListDto>(key);

      qc.setQueryData<MonthlyLimitListDto>(key, (old) => {
        const rows = old ?? [];
        const idx = rows.findIndex(
          (r) => r.year === year && r.month === month,
        );
        if (idx === -1) {
          const phantom: MonthlyLimitDto = {
            id: `optimistic-${year}-${month}`,
            year,
            month,
            kmPerDay: body.kmPerDay ?? null,
            ratePerKm: body.ratePerKm ?? null,
            kmPerSaturday: body.kmPerSaturday ?? null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          return [...rows, phantom];
        }
        const current = rows[idx]!;
        const patched: MonthlyLimitDto = {
          ...current,
          kmPerDay:
            body.kmPerDay !== undefined ? body.kmPerDay : current.kmPerDay,
          ratePerKm:
            body.ratePerKm !== undefined ? body.ratePerKm : current.ratePerKm,
          kmPerSaturday:
            body.kmPerSaturday !== undefined
              ? body.kmPerSaturday
              : current.kmPerSaturday,
          updatedAt: new Date().toISOString(),
        };
        const next = [...rows];
        next[idx] = patched;
        return next;
      });

      return { previous };
    },
    onError: (_err, vars, ctx) => {
      // Roll back the snapshot if we have one.
      if (ctx?.previous) {
        const key = [...LIMITS_KEY, 'list', vars.year] as const;
        qc.setQueryData(key, ctx.previous);
      }
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: [...LIMITS_KEY, 'list', vars.year] });
    },
  });
}

/**
 * Save-on-blur + checkbox writes SERIALIZED per `yearMonth` (docs/14 §16.3).
 *
 * One gesture can produce two writes to the same month: clicking a row's
 * checkbox blurs the input that was being edited, so the blur commit and the
 * toggle commit both fire. Unserialized, their responses — and their
 * optimistic patches — can land in either order and the row keeps the loser.
 * The queue makes same-month writes strictly sequential in call order (blur
 * before click) while different months stay parallel.
 */
export function useSerializedUpdateLimit() {
  const updateM = useUpdateLimit();
  const queueRef = useRef<SerialQueue | null>(null);
  if (queueRef.current === null) queueRef.current = createSerialQueue();
  const { mutateAsync } = updateM;

  const save = useCallback(
    (year: number, month: number, body: UpdateMonthlyLimitDto) => {
      const queue = queueRef.current as SerialQueue;
      return queue.run(formatYearMonth(year, month), () =>
        mutateAsync({ year, month, body }),
      );
    },
    [mutateAsync],
  );

  return { save };
}

/**
 * `POST /limits/bulk` — one partial payload applied to N months of one year.
 * The endpoint is atomic, so there is no per-row result to reconcile: on
 * success we drop the year's cache and refetch the authoritative rows.
 */
export function useBulkUpdateLimits() {
  const qc = useQueryClient();
  return useMutation<
    MonthlyLimitListDto,
    Error,
    BulkUpdateMonthlyLimitsDto
  >({
    mutationFn: (body) => bulkUpdateMonthlyLimits(body),
    onSuccess: (_rows, vars) => {
      qc.invalidateQueries({ queryKey: [...LIMITS_KEY, 'list', vars.year] });
    },
  });
}
