// Error classification shared by the global query/mutation toasts
// (`lib/query/globalErrors.ts`), the inline `<ErrorState>` and the auth hooks.
//
// One place decides "what kind of failure is this" so a network outage reads
// the same everywhere (toast copy, inline block copy, whether the auth shell
// may redirect to /login). Framework-free on purpose — covered by
// `errors.test.ts`.

import { ApiResponseError } from './client';

export type ApiErrorKind =
  /** 401 — session is gone; the refresh flow / auth shells own this. */
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'rateLimited'
  /** 5xx — API up but failing, or the proxy can't reach it (502/503/504). */
  | 'server'
  /** `fetch` itself rejected: API down, DNS, offline, CORS. */
  | 'network'
  /** Any other 4xx (validation, conflict…) — the caller's own UX. */
  | 'client'
  | 'unknown';

/**
 * `fetch` rejects with a `TypeError` ("Failed to fetch" / "fetch failed" /
 * "NetworkError when attempting to fetch resource.") when no HTTP response
 * arrived at all. That is the only signal we get for "API unreachable".
 */
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}

export function classifyApiError(err: unknown): ApiErrorKind {
  if (err instanceof ApiResponseError) {
    const { status } = err;
    if (status === 401) return 'unauthorized';
    if (status === 403) return 'forbidden';
    if (status === 404) return 'notFound';
    if (status === 429) return 'rateLimited';
    if (status >= 500) return 'server';
    if (status >= 400) return 'client';
    return 'unknown';
  }
  if (isNetworkError(err)) return 'network';
  return 'unknown';
}

export function isUnauthorizedError(err: unknown): boolean {
  return classifyApiError(err) === 'unauthorized';
}
