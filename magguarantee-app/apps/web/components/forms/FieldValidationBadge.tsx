// FieldValidationBadge — inline VIES / Biała Lista feedback badge per
// docs/14-design-system.md. Five states (idle/loading/valid/invalid/error).
// `idle` doesn't render at all so callers can drop the component into a
// FormDescription slot without thinking about gaps.

import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type FieldValidationState =
  | 'idle'
  | 'loading'
  | 'valid'
  | 'invalid'
  | 'error';

export interface FieldValidationBadgeProps {
  state: FieldValidationState;
  /** Optional override of the default per-state copy. */
  message?: ReactNode;
  className?: string;
}

const STATE_CLASSES: Record<Exclude<FieldValidationState, 'idle'>, string> = {
  loading: 'text-text-sub',
  valid: 'text-success',
  invalid: 'text-danger',
  error: 'text-warning',
};

const DEFAULT_MESSAGE: Record<Exclude<FieldValidationState, 'idle'>, string> = {
  loading: 'Sprawdzam…',
  valid: 'Zweryfikowano',
  invalid: 'Nie znaleziono',
  error: 'Usługa niedostępna — spróbuj później',
};

export function FieldValidationBadge({
  state,
  message,
  className,
}: FieldValidationBadgeProps) {
  if (state === 'idle') return null;

  const Icon =
    state === 'loading'
      ? Loader2
      : state === 'valid'
        ? CheckCircle2
        : state === 'invalid'
          ? XCircle
          : AlertTriangle;

  return (
    <span
      role={state === 'invalid' || state === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-1.5 text-sm',
        STATE_CLASSES[state],
        className,
      )}
    >
      <Icon
        size={14}
        className={state === 'loading' ? 'animate-spin' : undefined}
        aria-hidden
      />
      <span>{message ?? DEFAULT_MESSAGE[state]}</span>
    </span>
  );
}
