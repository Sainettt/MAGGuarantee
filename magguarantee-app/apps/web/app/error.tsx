'use client';

// Root-segment error boundary. Renders inside `app/layout.tsx` (fonts, theme,
// next-intl and TanStack providers are available) and catches what the
// route-group boundaries cannot: errors thrown by the route-group LAYOUTS
// themselves — most importantly `requireRoleAccess()` / `getServerUser()`
// throwing `AuthServiceUnavailableError` when the API is unreachable, which
// must read as "service unavailable, try again", not as a silent logout.

import { RouteErrorFallback } from '@/components/errors/RouteErrorFallback';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorFallback
      error={error}
      reset={reset}
      scope="root"
      layout="screen"
    />
  );
}
