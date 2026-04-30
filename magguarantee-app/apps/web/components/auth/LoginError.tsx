'use client';

// Inline error block under the login / verify form. Variants per design
// system "Phase 1 Phase 1 — login & verify components":
//   - idle    : reserved space (`min-h-5`), no content
//   - wrong   : red text + X icon, `aria-live="polite"`
//   - locked  : red block with Lock icon + bold weight, `aria-live="assertive"`
//   - network : warning text + WifiOff icon
// The shake animation lives on <CodeBoxGroup>, not here.

import { Lock, WifiOff, X } from 'lucide-react';

import { cn } from '@/lib/utils';

export type LoginErrorVariant = 'idle' | 'wrong' | 'locked' | 'network';

interface LoginErrorProps {
  variant: LoginErrorVariant;
  message?: string;
  className?: string;
}

export function LoginError({ variant, message, className }: LoginErrorProps) {
  if (variant === 'idle' || !message) {
    return (
      <div
        role="alert"
        aria-live="polite"
        className={cn('min-h-5 mt-3 text-center text-[13px]', className)}
      />
    );
  }

  if (variant === 'locked') {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className={cn(
          'mt-3 px-4 py-3 rounded-[10px] flex items-start gap-2 text-[13px] font-bold',
          'bg-danger-bg border border-danger/40 text-danger-dark dark:text-danger',
          className,
        )}
      >
        <Lock size={16} className="mt-0.5 shrink-0" aria-hidden />
        <span>{message}</span>
      </div>
    );
  }

  if (variant === 'network') {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className={cn(
          'mt-3 flex items-center justify-center gap-1.5 text-[13px] font-semibold text-warning-dark dark:text-warning',
          className,
        )}
      >
        <WifiOff size={14} aria-hidden />
        <span>{message}</span>
      </div>
    );
  }

  // wrong
  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'mt-3 flex items-center justify-center gap-1.5 text-[13px] font-semibold text-danger-dark dark:text-danger',
        className,
      )}
    >
      <X size={14} aria-hidden />
      <span>{message}</span>
    </div>
  );
}
