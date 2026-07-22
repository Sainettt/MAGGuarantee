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
import type {
  MonthlyLimitDto,
  MonthlyLimitListDto,
  UpdateMonthlyLimitDto,
} from '@magguarantee/shared';

import {
  formatYearMonth,
  listMonthlyLimits,
  updateMonthlyLimit,
} from '@/lib/api/limits';

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
