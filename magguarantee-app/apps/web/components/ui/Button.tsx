// Branded button. Variants implemented inline (no `cva`) — Phase 1 only
// needs `default` (brand-red filled) and `ghost`. Phase 2+ can promote this
// to a full shadcn-style component with cva when the variant matrix grows.

import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

type Variant = 'default' | 'ghost' | 'outline';
type Size = 'default' | 'sm' | 'lg';

const VARIANT_CLASSES: Record<Variant, string> = {
  default:
    'bg-brand text-white hover:bg-brand-dark focus-visible:ring-brand/40 disabled:bg-brand/60',
  ghost:
    'bg-transparent text-text hover:bg-input focus-visible:ring-brand/40',
  outline:
    'bg-transparent text-text border border-border hover:bg-input focus-visible:ring-brand/40',
};

const SIZE_CLASSES: Record<Size, string> = {
  default: 'h-11 px-4 text-[14px]',
  sm: 'h-9 px-3 text-[13px]',
  lg: 'h-12 px-5 text-[15px]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', size = 'default', className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[10px] font-bold transition-colors',
        'focus-visible:outline-none focus-visible:ring-[3px]',
        'disabled:cursor-not-allowed disabled:opacity-70',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
