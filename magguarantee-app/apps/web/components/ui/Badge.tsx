// Lightweight badge / chip. Used for active/inactive flags in the admin
// tables. Per docs/14-design-system.md semantic tokens (success/danger/warning).

import { type HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

type Variant = 'success' | 'danger' | 'warning' | 'info' | 'muted';

const VARIANT_CLASSES: Record<Variant, string> = {
  success: 'bg-success-bg text-success-dark dark:bg-success/15 dark:text-success',
  danger: 'bg-danger-bg text-danger-dark dark:bg-danger/15 dark:text-danger',
  warning: 'bg-warning-bg text-warning-dark dark:bg-warning/15 dark:text-warning',
  info: 'bg-info-bg text-info-dark dark:bg-info/15 dark:text-info',
  muted: 'bg-input text-text-sub',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

export function Badge({
  variant = 'muted',
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold',
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
