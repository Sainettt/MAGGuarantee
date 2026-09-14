'use client';

// Route-group error boundary for (weryfikator). Catches render/data errors thrown by
// pages below `(weryfikator)/layout.tsx` and renders them INSIDE that layout, so the
// role shell (header / navigation) stays usable. Errors thrown by the layout
// itself (e.g. `requireRoleAccess` when the API is unreachable) bubble up to
// `app/error.tsx`.

import { RouteErrorFallback } from '@/components/errors/RouteErrorFallback';

export default function WeryfikatorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFallback error={error} reset={reset} scope="weryfikator" />;
}
