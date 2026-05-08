'use client';

// Phase 3 — 48-hour countdown banner used inside <ReklamacjaSheet>. Per
// docs/14 Phase 3 § "48-hour countdown indicator": ticks every 60s (not
// every second — burns cycles, not informative), swaps to danger style
// + animated icon when < 1h remains.

import { Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

const TICK_MS = 60_000;
const HOUR_MS = 60 * 60 * 1000;

export interface CountdownBannerProps {
  /** ISO datetime — server-issued deadline (statusChangedAt + 48h). */
  deadline: string | Date;
  /** Optional callback when the deadline passes. */
  onExpire?: () => void;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '0min';
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}min`;
  return `${h}h ${m}min`;
}

export function CountdownBanner({ deadline, onExpire }: CountdownBannerProps) {
  const t = useTranslations('carrier.reklamacja');
  const target =
    typeof deadline === 'string' ? new Date(deadline) : deadline;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // Tick once a minute. Re-render only when something visible changes.
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const remainingMs = target.getTime() - now;
  const expired = remainingMs <= 0;
  const urgent = !expired && remainingMs < HOUR_MS;

  useEffect(() => {
    if (expired) onExpire?.();
  }, [expired, onExpire]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-2 mb-4',
        urgent
          ? 'bg-danger-bg text-danger-dark dark:bg-danger/15 dark:text-danger'
          : 'bg-warning-bg text-warning-dark dark:bg-warning/15 dark:text-warning',
      )}
    >
      <Clock
        size={16}
        className={cn(urgent && 'animate-blink-red')}
        aria-hidden
      />
      <span className="text-sm">
        {expired ? (
          <>{t('countdownExpired')}</>
        ) : (
          <>
            {t('countdownRemainingLabel')} <b>{formatRemaining(remainingMs)}</b>
          </>
        )}
      </span>
    </div>
  );
}
