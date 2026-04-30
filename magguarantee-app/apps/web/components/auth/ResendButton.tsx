'use client';

// Self-contained resend-code button. Owns its own cooldown countdown so the
// parent only needs to call `start(seconds)` after a successful resend or
// after seeing a 429 with `cooldownSec`.

import { useImperativeHandle, useEffect, useRef, useState, forwardRef } from 'react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

export interface ResendButtonHandle {
  /** Begin a fresh cooldown of `seconds` seconds (overrides any active one). */
  start(seconds: number): void;
}

interface ResendButtonProps {
  onResend(): void;
  busy?: boolean;
  className?: string;
}

export const ResendButton = forwardRef<ResendButtonHandle, ResendButtonProps>(
  function ResendButton({ onResend, busy, className }, ref) {
    const t = useTranslations('verify');
    const [remaining, setRemaining] = useState(0);
    const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const stop = () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };

    useImperativeHandle(ref, () => ({
      start: (seconds: number) => {
        stop();
        setRemaining(Math.max(0, Math.ceil(seconds)));
        tickRef.current = setInterval(() => {
          setRemaining((r) => {
            if (r <= 1) {
              stop();
              return 0;
            }
            return r - 1;
          });
        }, 1000);
      },
    }));

    useEffect(() => () => stop(), []);

    const disabled = busy || remaining > 0;
    const label = busy
      ? t('resending')
      : remaining > 0
        ? t('resendIn', { seconds: remaining })
        : t('resend');

    return (
      <button
        type="button"
        onClick={onResend}
        disabled={disabled}
        className={cn(
          'text-[13px] text-brand underline hover:text-brand-dark transition-colors',
          'disabled:text-text-sub disabled:no-underline disabled:cursor-not-allowed',
          className,
        )}
      >
        {label}
      </button>
    );
  },
);
