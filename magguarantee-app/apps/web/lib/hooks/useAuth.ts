'use client';

// `useAuth` — TanStack Query against `GET /auth/me`. Returns the current
// `UserDto` (or `null` for anonymous). Anonymous is *not* an error — we
// special-case 401 so layouts can redirect without showing a toast.

import { useQuery } from '@tanstack/react-query';
import type { UserDto } from '@magguarantee/shared';

import { ApiResponseError } from '../api/client';
import { getMe } from '../api/auth';

export const ME_QUERY_KEY = ['auth', 'me'] as const;

export function useAuth(): {
  user: UserDto | null;
  isLoading: boolean;
  isAuthenticated: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: async (): Promise<UserDto | null> => {
      try {
        return await getMe();
      } catch (err) {
        if (err instanceof ApiResponseError && err.status === 401) {
          return null;
        }
        throw err;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  return {
    user: data ?? null,
    isLoading,
    isAuthenticated: !!data,
  };
}
