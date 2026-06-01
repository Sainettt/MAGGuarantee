// Minimal RHF-compatible form primitives. Mirrors the shadcn `<Form>` API
// shape (FormItem / FormLabel / FormControl / FormMessage / FormDescription)
// without pulling shadcn's full template (Radix Slot, FormProvider context).
// Phase 2 forms wire RHF's <FormProvider> directly and use these as styling
// wrappers that forward errors via the `error` prop.

import { type ReactNode, type LabelHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

// FormItem is a full-height flex column so that, inside a CSS-grid row
// (grid-cols-2 / grid-cols-4), the label region absorbs the row's extra
// height and the control + messages stay pinned to the bottom. Result: every
// cell's input shares the same baseline regardless of whether its (PL) label
// wraps to 1 or 2 lines. See docs/14-design-system.md § "Grid-form field
// alignment". `h-full` is inert outside a stretched grid cell (single-column
// forms collapse to content height — no regression). The grow is applied to
// <FormLabel>, not here, so only the label expands.
export function FormItem({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn('flex h-full flex-col space-y-1.5', className)}>
      {children}
    </div>
  );
}

export interface FormLabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export function FormLabel({
  className,
  required,
  children,
  ...props
}: FormLabelProps) {
  return (
    <label
      className={cn('block text-sm font-medium text-text', className)}
      {...props}
    >
      {children}
      {required && (
        <span className="text-danger ml-0.5" aria-hidden>
          *
        </span>
      )}
    </label>
  );
}

export function FormDescription({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  if (!children) return null;
  return (
    <p className={cn('text-xs text-text-sub', className)}>{children}</p>
  );
}

export function FormMessage({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  if (!children) return null;
  return (
    <p className={cn('text-sm text-danger', className)} role="alert">
      {children}
    </p>
  );
}

/** Wraps a single field — label, control, helper text, error. */
export interface FormFieldProps {
  /** Form label. */
  label: ReactNode;
  /** Asterisk when required. */
  required?: boolean;
  /** Inline helper text (rendered below the input). */
  description?: ReactNode;
  /** RHF error message — rendered as <FormMessage>. */
  error?: string;
  /** Optional id used to wire htmlFor / aria-describedby on the input. */
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

export function FormField({
  label,
  required,
  description,
  error,
  htmlFor,
  className,
  children,
}: FormFieldProps) {
  return (
    <FormItem className={className}>
      {/* `flex-1` lets the label absorb a grid row's extra height so the
          control below stays bottom-pinned and shares a baseline with sibling
          cells whose labels wrap differently. `items-end` is NOT needed —
          the label text stays top-aligned within its own grown box; only the
          control is pushed down. Outside a stretched grid cell the label box
          equals its text height, so this is a no-op for single-column forms. */}
      <FormLabel htmlFor={htmlFor} required={required} className="flex-1">
        {label}
      </FormLabel>
      {children}
      {description && !error && <FormDescription>{description}</FormDescription>}
      {error && <FormMessage>{error}</FormMessage>}
    </FormItem>
  );
}

/** Section heading inside a long form. */
export function FormSection({
  title,
  className,
  children,
}: {
  title?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section className={cn('space-y-4', className)}>
      {title && (
        <h4 className="text-xs font-bold uppercase tracking-wider text-text-sub border-b border-border pb-2">
          {title}
        </h4>
      )}
      {children}
    </section>
  );
}
