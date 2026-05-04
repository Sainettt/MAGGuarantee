// Branded textarea — same look as <Input>, multi-line.

import { forwardRef, type TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, rows = 3, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cn(
          'flex w-full rounded-[10px] bg-input px-3.5 py-2 text-[14px] text-text',
          'border border-border placeholder:text-text-sub',
          'transition-colors outline-none resize-y',
          'focus:border-brand focus:ring-[3px] focus:ring-brand/15 dark:focus:ring-brand/25',
          'disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
        {...props}
      />
    );
  },
);
