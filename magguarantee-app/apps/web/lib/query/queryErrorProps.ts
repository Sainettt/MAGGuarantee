// Maps a TanStack query result onto the error props shared by `<DataTable>`
// and `<ErrorState>` so every list screen wires the failure state the same way:
//
//   const q = useVehicles(filters);
//   <DataTable rows={q.data?.items ?? []} isLoading={q.isLoading} {...queryErrorProps(q)} />

export interface QueryErrorSource {
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
}

export interface QueryErrorProps {
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  isRetrying: boolean;
}

export function queryErrorProps(q: QueryErrorSource): QueryErrorProps {
  return {
    isError: q.isError,
    error: q.error,
    onRetry: () => {
      void q.refetch();
    },
    isRetrying: q.isFetching,
  };
}

/**
 * Combines several queries feeding ONE surface (e.g. a panel that needs both
 * vehicles and delegations): errored if any errored, retry refetches only the
 * failed ones.
 */
export function combinedQueryErrorProps(
  queries: readonly QueryErrorSource[],
): QueryErrorProps {
  const failed = queries.filter((q) => q.isError);
  return {
    isError: failed.length > 0,
    error: failed[0]?.error ?? null,
    onRetry: () => {
      for (const q of failed) void q.refetch();
    },
    isRetrying: failed.some((q) => q.isFetching),
  };
}
