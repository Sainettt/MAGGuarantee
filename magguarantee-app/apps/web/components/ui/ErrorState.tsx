'use client';

// Inline load-failure state — the sibling of <EmptyState> for "the request
// failed" (as opposed to "the request succeeded with zero rows"). Conflating
// the two made an API outage look like "no data yet" on every list screen.
//
// Two shapes:
//   * `block`  (default) — centered, same geometry as <EmptyState>; replaces
//     the content when nothing could be loaded.
//   * `banner` — compact inline strip; used above STALE data when a refetch
//     failed but the previous result is still on screen.
//
// Copy is derived from the error kind (network / 5xx / 403 / other) unless the
// caller overrides `title` / `message`. Raw server messages are never shown.

import { AlertTriangle, Loader2, RotateCw, ShieldAlert, WifiOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/Button';
import { classifyApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils';

export interface ErrorStateProps {
  /** The failure (TanStack `query.error`) — drives icon + default copy. */
  error?: unknown;
  title?: string;
  message?: ReactNode;
  /** Renders «Spróbuj ponownie» when set (typically `() => void q.refetch()`). */
  onRetry?: () => void;
  /** Disables the retry button and spins its icon (`q.isFetching`). */
  isRetrying?: boolean;
  variant?: 'block' | 'banner';
  className?: string;
}

type CopyKind = 'network' | 'server' | 'forbidden' | 'generic';

function copyKind(error: unknown): CopyKind {
  switch (classifyApiError(error)) {
    case 'network':
      return 'network';
    case 'server':
      return 'server';
    case 'forbidden':
      return 'forbidden';
    default:
      return 'generic';
  }
}

export function ErrorState({
  error,
  title,
  message,
  onRetry,
  isRetrying = false,
  variant = 'block',
  className,
}: ErrorStateProps) {
  const t = useTranslations('errors.load');
  const kind = copyKind(error);
  const Icon =
    kind === 'network' ? WifiOff : kind === 'forbidden' ? ShieldAlert : AlertTriangle;

  const retryButton = onRetry ? (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onRetry}
      disabled={isRetrying}
      aria-busy={isRetrying || undefined}
    >
      {isRetrying ? (
        <Loader2 size={14} className="animate-spin" aria-hidden />
      ) : (
        <RotateCw size={14} aria-hidden />
      )}
      {isRetrying ? t('retrying') : t('retry')}
    </Button>
  ) : null;

  if (variant === 'banner') {
    return (
      <div
        role="alert"
        className={cn(
          'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border px-4 py-2.5 text-sm',
          'border-danger/40 bg-danger-bg text-danger-dark dark:bg-danger/15 dark:text-danger',
          className,
        )}
      >
        <Icon size={16} className="shrink-0" aria-hidden />
        <span className="flex-1 min-w-0 font-semibold">
          {message ?? t('stale')}
        </span>
        {retryButton}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center text-center py-12 px-4',
        className,
      )}
    >
      <Icon size={32} className="mb-3 text-danger" aria-hidden />
      <p className="text-[15px] font-bold text-text">
        {title ?? t(`${kind}.title`)}
      </p>
      <p className="mt-1 text-sm text-text-sub max-w-sm">
        {message ?? t(`${kind}.message`)}
      </p>
      {retryButton && <div className="mt-4">{retryButton}</div>}
    </div>
  );
}
