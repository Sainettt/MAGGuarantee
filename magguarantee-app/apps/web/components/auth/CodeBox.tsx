'use client';

// Single 6-digit-code slot. Visually represents one of five states (empty /
// focused / filled / error / locked) per design system. Behavior — auto-
// advance, paste, backspace — lives in <CodeBoxGroup>; this component only
// owns its visual state, focus, and a single-character input.

import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export interface CodeBoxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  filled: boolean;
  error?: boolean;
  locked?: boolean;
  index: number;
  onChangeChar(value: string): void;
}

export const CodeBox = forwardRef<HTMLInputElement, CodeBoxProps>(
  function CodeBox(
    { value, filled, error, locked, index, onChangeChar, className, ...rest },
    ref,
  ) {
    return (
      <input
        {...rest}
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={1}
        value={value}
        disabled={locked || rest.disabled}
        data-filled={filled || undefined}
        data-error={error || undefined}
        data-locked={locked || undefined}
        aria-label={`${index + 1}`}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, '').slice(-1);
          onChangeChar(next);
        }}
        className={cn(
          // size + typography
          'w-11 h-14 text-center text-[22px] font-extrabold text-text',
          'caret-transparent',
          // base background + border
          'bg-input border-2 border-border rounded-[12px]',
          // filled state — input has a digit
          'data-[filled=true]:bg-card data-[filled=true]:border-text',
          // focus state — beats filled
          'focus:bg-card focus:border-brand focus:scale-[1.08]',
          'focus:ring-[3px] focus:ring-brand/15 dark:focus:ring-brand/25',
          // error — group-level shake handled by parent; here just paint
          'data-[error=true]:bg-danger-bg data-[error=true]:border-danger',
          // locked
          'data-[locked=true]:bg-danger-bg/40 data-[locked=true]:border-danger/40 data-[locked=true]:text-danger/60 data-[locked=true]:cursor-not-allowed',
          // placeholder
          'placeholder:text-slate-300 dark:placeholder:text-neutral-600 placeholder:font-normal placeholder:text-[18px]',
          // motion
          'transition-all duration-150 outline-none',
          className,
        )}
      />
    );
  },
);
