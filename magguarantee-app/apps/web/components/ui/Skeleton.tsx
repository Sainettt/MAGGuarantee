// Loading-placeholder skeleton — shadcn-compatible API. Hand-rolled to keep
// Phase 1's npm dep set unchanged, mirrors shadcn's primitive almost
// verbatim. Per docs/14 Phase 3 § <LivePreviewPanel> requires this.

import { cn } from '@/lib/utils';

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-input/80 dark:bg-input',
        className,
      )}
      {...props}
    />
  );
}
