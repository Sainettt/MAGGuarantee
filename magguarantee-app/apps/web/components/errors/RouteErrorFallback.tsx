'use client';

// Shared UI for every `error.tsx` route boundary. Renders inside the nearest
// layout, so role shells (header / sidebar / tabs) stay usable around it and
// next-intl + theme providers are available.
//
// Never shows the stack or the raw message: in production Next replaces
// Server Component errors with a generic message + `digest` anyway, and client
// errors may carry arbitrary data. The digest IS shown — it's the only handle
// support has to correlate with the web container's server log.
//
// «Spróbuj ponownie» = `router.refresh()` + `reset()` inside a transition:
// `reset()` alone only re-renders the client subtree, so a failed Server
// Component (e.g. `requireRoleAccess` → API unreachable) would fail again from
// the cached RSC payload without a fresh server round-trip.

import { AlertTriangle, Home, Loader2, RotateCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useTransition } from 'react';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export interface RouteErrorFallbackProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** Log tag identifying the boundary, e.g. `employee`. */
  scope: string;
  /** `page` sits inside a role shell; `screen` fills the viewport (root / public). */
  layout?: 'page' | 'screen';
}

export function RouteErrorFallback({
  error,
  reset,
  scope,
  layout = 'page',
}: RouteErrorFallbackProps) {
  const t = useTranslations('errors.boundary');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    // Digest + name + message only — no stack, no component props, no
    // request data (docs: audit 2026-08-14 §12).
    console.error('[route-error]', {
      scope,
      digest: error.digest,
      name: error.name,
      message: error.message,
    });
  }, [error, scope]);

  const onRetry = () => {
    startTransition(() => {
      router.refresh();
      reset();
    });
  };

  return (
    <div
      className={cn(
        'flex items-center justify-center px-4',
        layout === 'screen' ? 'min-h-screen py-12' : 'py-16',
      )}
    >
      <div
        role="alert"
        className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-card sm:p-8"
      >
        <span
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger-bg text-danger dark:bg-danger/15"
          aria-hidden
        >
          <AlertTriangle size={24} />
        </span>
        <h1 className="text-lg font-bold text-text">{t('title')}</h1>
        <p className="mt-2 text-sm text-text-sub">{t('message')}</p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-text-sub">
            {t('reference', { digest: error.digest })}
          </p>
        )}
        <div className="mt-6 flex flex-col-reverse items-stretch justify-center gap-2 sm:flex-row sm:items-center">
          <Link
            href="/"
            className={cn(
              'inline-flex h-9 items-center justify-center gap-2 rounded-[10px] px-3 text-[13px] font-bold text-text',
              'hover:bg-input focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40',
            )}
          >
            <Home size={14} aria-hidden />
            {t('home')}
          </Link>
          <Button
            type="button"
            size="sm"
            onClick={onRetry}
            disabled={isPending}
            aria-busy={isPending || undefined}
          >
            {isPending ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <RotateCw size={14} aria-hidden />
            )}
            {t('retry')}
          </Button>
        </div>
      </div>
    </div>
  );
}
