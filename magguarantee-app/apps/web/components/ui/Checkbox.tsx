// Native <input type="checkbox"> styled with brand colors. Forwarded ref so
// React Hook Form's `register` can wire validation refs.

import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export type CheckboxProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type'
>;

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        type="checkbox"
        className={cn(
          'h-4 w-4 rounded border-border bg-input text-brand',
          'accent-brand cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40',
          'disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
        {...props}
      />
    );
  },
);
