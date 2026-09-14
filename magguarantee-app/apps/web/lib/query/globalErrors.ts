// Global TanStack Query error policy — the decision half of the
// `QueryCache.onError` / `MutationCache.onError` handlers wired in
// `components/providers/Providers.tsx`. Kept framework-free (no React, no
// sonner) so the rules are unit-tested in `globalErrors.test.ts`.
//
// Contract
// ────────
// Queries: every failed fetch raises ONE deduplicated toast per error kind
// (network / server / forbidden / rate-limited / generic). The sonner toast id
// is derived from `scope + kind`, so an API outage that fails 12 queries at
// once updates a single toast instead of stacking 12 (no toast storms). The
// screen additionally renders its inline error state (`<DataTable isError>` /
// `<ErrorState>`) — the toast is the "something is off" signal for surfaces
// that are not wired to an inline state.
//
// Mutations: every user-initiated mutation in this app owns specific error UX
// (field errors, 409 copy, rollback toasts). The global toast is only a SAFETY
// NET for a mutation that has none. A mutation opts out when EITHER:
//   1. it declares a hook-level `onError` (`useMutation({ onError })`, which
//      includes `useXxx({ onError })` wrappers that spread `opts`), or
//   2. it carries `meta: SUPPRESS_GLOBAL_ERROR` — required for call sites that
//      `await mutateAsync()` inside try/catch or pass `mutate(vars, { onError })`,
//      because neither is visible to the MutationCache.
//
// Never toasted globally, for either scope:
//   * 401 — the refresh flow (`fetchWithRefresh`) and the auth shells own it; a
//     dead session redirects to /login instead of nagging.
//   * cancellations (`CancelledError`, `AbortError`) — not failures.
//   * anything with `meta.suppressGlobalError` (e.g. the live km-calc preview,
//     whose 422s are expected while the user is still typing).

import { isCancelledError } from '@tanstack/react-query';

import { classifyApiError } from '@/lib/api/errors';

/** Typed `meta` for queries and mutations (registered below). */
export type AppQueryMeta = {
  /** Skip the global error toast — the caller renders its own error UX. */
  suppressGlobalError?: boolean;
};

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: AppQueryMeta;
    mutationMeta: AppQueryMeta;
  }
}

/** Options bag for mutation hooks that take no other options. */
export interface MutationMetaOptions {
  meta?: AppQueryMeta;
}

/** Spread-safe opt-out marker: `useFoo({ meta: SUPPRESS_GLOBAL_ERROR })`. */
export const SUPPRESS_GLOBAL_ERROR: AppQueryMeta = Object.freeze({
  suppressGlobalError: true,
});

export type GlobalErrorScope = 'query' | 'mutation';

export type GlobalErrorToastKind =
  | 'network'
  | 'server'
  | 'forbidden'
  | 'rateLimited'
  | 'generic';

/** Full next-intl key, e.g. `errors.toast.query.network`. */
export type GlobalErrorMessageKey =
  `errors.toast.${GlobalErrorScope}.${GlobalErrorToastKind}`;

function isCancellation(error: unknown): boolean {
  if (isCancelledError(error)) return true;
  return error instanceof Error && error.name === 'AbortError';
}

function isAlwaysSilent(error: unknown): boolean {
  return isCancellation(error) || classifyApiError(error) === 'unauthorized';
}

export function shouldToastQueryError(
  error: unknown,
  query: { meta?: AppQueryMeta | undefined },
): boolean {
  if (isAlwaysSilent(error)) return false;
  return query.meta?.suppressGlobalError !== true;
}

export function shouldToastMutationError(
  error: unknown,
  mutation: {
    meta?: AppQueryMeta | undefined;
    options: { onError?: unknown };
  },
): boolean {
  if (isAlwaysSilent(error)) return false;
  if (mutation.meta?.suppressGlobalError === true) return false;
  // A hook-level onError means the mutation already surfaces its own error.
  return typeof mutation.options.onError !== 'function';
}

export function globalErrorToastKind(error: unknown): GlobalErrorToastKind {
  switch (classifyApiError(error)) {
    case 'network':
      return 'network';
    case 'server':
      return 'server';
    case 'forbidden':
      return 'forbidden';
    case 'rateLimited':
      return 'rateLimited';
    default:
      return 'generic';
  }
}

/**
 * Toast descriptor: a stable sonner `id` (dedupe key — same scope + kind ⇒ the
 * existing toast is updated, not duplicated) and the i18n key for its copy.
 */
export function globalErrorToast(
  scope: GlobalErrorScope,
  error: unknown,
): { id: string; messageKey: GlobalErrorMessageKey } {
  const kind = globalErrorToastKind(error);
  return {
    id: `global-${scope}-error:${kind}`,
    messageKey: `errors.toast.${scope}.${kind}`,
  };
}
