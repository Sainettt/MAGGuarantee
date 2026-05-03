// Minimal RHF-compatible form primitives. Mirrors the shadcn `<Form>` API
// shape (FormItem / FormLabel / FormControl / FormMessage / FormDescription)
// without pulling shadcn's full template (Radix Slot, FormProvider context).
// Phase 2 forms wire RHF's <FormProvider> directly and use these as styling
// wrappers that forward errors via the `error` prop.

import { type ReactNode, type LabelHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export function FormItem({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return <div className={cn('space-y-1.5', className)}>{children}</div>;
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
      <FormLabel htmlFor={htmlFor} required={required}>
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
