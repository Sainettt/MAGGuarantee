// Centered empty-state placeholder per docs/14-design-system.md Custom catalog.
// Used inside DataTable and list pages when the result set is empty.

import { type LucideIcon, Inbox } from 'lucide-react';
import { type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title?: string;
  message?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Override the icon tone — e.g. `text-success` for a *positive* empty
   *  state (a good actor with no violations, §12.5). Defaults to muted. */
  iconClassName?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  message,
  action,
  className,
  iconClassName,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-12 px-4',
        className,
      )}
    >
      <Icon
        size={32}
        className={cn('mb-3', iconClassName ?? 'text-text-sub')}
        aria-hidden
      />
      {title && (
        <p className="text-[15px] font-bold text-text">{title}</p>
      )}
      {message && (
        <p className="mt-1 text-sm text-text-sub max-w-sm">{message}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
