'use client';

// Route-group error boundary for (public) — login, 2FA verify, forgot /
// change password. These flows surface expected API failures inline
// (<LoginError>), so this only catches unexpected render errors. Full-screen
// layout: the public group has no shell around it.

import { RouteErrorFallback } from '@/components/errors/RouteErrorFallback';

export default function PublicError({
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
      scope="public"
      layout="screen"
    />
  );
}
