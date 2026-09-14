'use client';

// `useAuth` — TanStack Query against `GET /auth/me`.
//
// Three outcomes, deliberately kept apart:
//   * authenticated → `user` is the `UserDto`;
//   * anonymous     → the API answered 401 (after `fetchWithRefresh` already
//                     tried one refresh). `isAnonymous === true`, `user === null`.
//                     Only THIS state may redirect to /login;
//   * failure       → network error / 5xx / 429 … `isError === true`. The session
//                     may be perfectly valid — the API just didn't answer — so
//                     consumers must show an error + retry, never bounce to
//                     /login (that looked like a random logout during outages).

import { useQuery } from '@tanstack/react-query';
import type { UserDto } from '@magguarantee/shared';

import { getMe } from '../api/auth';
import { isUnauthorizedError } from '../api/errors';
import { SUPPRESS_GLOBAL_ERROR } from '../query/globalErrors';

export const ME_QUERY_KEY = ['auth', 'me'] as const;

export interface UseAuthResult {
  user: UserDto | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** The API confirmed there is no session (401). Safe to redirect to /login. */
  isAnonymous: boolean;
  /** `/auth/me` failed for a non-auth reason (network / 5xx). */
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
}

export function useAuth(): UseAuthResult {
  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: async (): Promise<UserDto | null> => {
      try {
        return await getMe();
      } catch (err) {
        if (isUnauthorizedError(err)) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
    // The auth shells render their own "session could not be verified" state.
    meta: SUPPRESS_GLOBAL_ERROR,
  });
  return {
    user: data ?? null,
    isLoading,
    isAuthenticated: !!data,
    // `data === null` is the explicit 401 answer; `undefined` means "unknown"
    // (still loading, or the request failed).
    isAnonymous: data === null,
    // A failed background refetch while we still hold the user is not an
    // auth failure worth blocking the UI for — only surface it with no user.
    isError: isError && data === undefined,
    error,
    isFetching,
    refetch,
  };
}
