// Branded text input. Plain native `<input>` with shadcn-style classes —
// we don't pull in the full shadcn CLI for Phase 1 (one form, one input
// shape). Phase 2+ will swap to shadcn `<Input>` if more variants emerge.

import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type = 'text', ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-11 w-full rounded-[10px] bg-input px-3.5 py-2 text-[14px] text-text',
        'border border-border placeholder:text-text-sub',
        'transition-colors outline-none',
        'focus:border-brand focus:ring-[3px] focus:ring-brand/15 dark:focus:ring-brand/25',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
});
