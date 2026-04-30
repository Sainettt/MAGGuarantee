// Form-group label — uppercase, 12px, 700 weight, 0.5px tracking per design
// system. Use with native `<input>` via `htmlFor`.

import { forwardRef, type LabelHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  function Label({ className, ...props }, ref) {
    return (
      <label
        ref={ref}
        className={cn(
          'block mb-1.5 text-[12px] font-bold uppercase tracking-[0.5px] text-text-sub',
          className,
        )}
        {...props}
      />
    );
  },
);
