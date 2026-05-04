// Native <select> wrapper styled to match <Input>. Phase 2 ships native; if
// Phase 3+ needs typeahead / virtualized lists we'll swap to Radix Select
// without a contract change (callers pass children <option> elements).

import { forwardRef, type SelectHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-[10px] bg-input px-3 py-2 text-[14px] text-text',
        'border border-border',
        'transition-colors outline-none appearance-none',
        // simple chevron via background-image (cheap, no extra DOM)
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23737373%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><polyline points=%226 9 12 15 18 9%22/></svg>')]",
        'bg-no-repeat bg-[right_12px_center] pr-9',
        'focus:border-brand focus:ring-[3px] focus:ring-brand/15 dark:focus:ring-brand/25',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});
