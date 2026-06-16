'use client';

// Phase 9 §9.0 — reusable password input with a per-field eye-toggle.
//
// A thin wrapper around <Input type={shown ? 'text' : 'password'}> + a trailing
// icon-button. NOT a new shadcn primitive — used by screens 2/3/4 so the
// eye-toggle behaviour is identical everywhere.
//
//   * Show-state is PER FIELD (independent useState) — toggling the new-password
//     eye does NOT reveal the confirm field. Matching-by-eye is the feature.
//   * Eye button: aria-label show/hide + aria-pressed, icon aria-hidden, ≥44×44
//     hit area, never a tab-stop competitor for screen flow (it is focusable so
//     keyboard users can reveal, but the input is the primary control).
//   * `register`-friendly: spreads RHF's field props onto the <input> via
//     `...field` while owning the `type` + padding for the eye.

import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { forwardRef, useId, useState, type InputHTMLAttributes } from 'react';

import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { cn } from '@/lib/utils';

export interface PasswordFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  /** Inline RHF error message — rendered as a role="alert" FormMessage below. */
  error?: string;
  /** Wrapper className override (e.g. spacing between stacked fields). */
  wrapperClassName?: string;
}

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField(
    { label, error, wrapperClassName, id, className, ...inputProps },
    ref,
  ) {
    const t = useTranslations('common');
    const [shown, setShown] = useState(false);
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;

    return (
      <div className={cn(wrapperClassName)}>
        <Label htmlFor={inputId}>{label}</Label>
        <div className="relative">
          <Input
            ref={ref}
            id={inputId}
            type={shown ? 'text' : 'password'}
            // Text never slides under the eye-button hit area.
            className={cn('pr-11', className)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            {...inputProps}
          />
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-label={t(shown ? 'hidePassword' : 'showPassword')}
            aria-pressed={shown}
            tabIndex={-1}
            className={cn(
              'absolute right-1 top-1/2 -translate-y-1/2',
              'inline-flex h-9 w-9 items-center justify-center rounded-md',
              'text-text-sub hover:text-text transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
            )}
          >
            {shown ? (
              <EyeOff className="h-4 w-4" aria-hidden />
            ) : (
              <Eye className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>
        {error && (
          <p
            id={errorId}
            role="alert"
            className="mt-1.5 text-[13px] font-semibold text-danger-dark dark:text-danger"
          >
            {error}
          </p>
        )}
      </div>
    );
  },
);
