// Minimal RHF-compatible form primitives. Mirrors the shadcn `<Form>` API
// shape (FormItem / FormLabel / FormControl / FormMessage / FormDescription)
// without pulling shadcn's full template (Radix Slot, FormProvider context).
// Phase 2 forms wire RHF's <FormProvider> directly and use these as styling
// wrappers that forward errors via the `error` prop.

import {
  createContext,
  useContext,
  type ReactNode,
  type LabelHTMLAttributes,
} from 'react';

import { cn } from '@/lib/utils';

// Set true by <FormGrid> so descendant <FormItem>/<FormField> render as a CSS
// subgrid row-pair (label band + control band) instead of a plain flex stack.
const FormGridContext = createContext(false);

// FormItem — two render modes:
//
// • Standalone (default): a plain TOP-ALIGNED flex stack (label → control →
//   helper/error, `gap-1.5`). Single-column forms and standalone usages (ADR
//   <FileUpload> blocks) keep tight label→input spacing; cells with content
//   BELOW the input are never misaligned because nothing tries to align them.
//
// • Inside <FormGrid> (context = true): a 2-row CSS-subgrid cell. The FIRST
//   child is treated as the label (band 1); ALL remaining children are wrapped
//   in a control band (band 2) so input + helper + readout + error live
//   together and grow DOWNWARD without lifting the input. Because every cell's
//   label shares band 1 and every cell's input shares the top of band 2, inputs
//   keep a common baseline regardless of label line-count.
//
// See docs/14-design-system.md § "Grid-form field alignment".
export function FormItem({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  const inGrid = useContext(FormGridContext);

  if (!inGrid) {
    return (
      <div className={cn('flex flex-col gap-1.5', className)}>{children}</div>
    );
  }

  // Subgrid cell. Split: first child = label band, rest = control band.
  const items = childrenToArray(children);
  const [labelChild, ...rest] = items;
  return (
    <div
      data-form-cell
      className={cn(
        // `md:` so single-column (mobile) collapse falls back to the plain
        // stack below — nothing to align across one column.
        'flex flex-col gap-1.5',
        'md:grid md:row-span-2 md:[grid-template-rows:subgrid] md:gap-y-0',
        className,
      )}
    >
      {labelChild}
      {/* Control band — keeps the input top-aligned in band 2; helper/error
          grow downward out of the band. On mobile this is a normal flex child
          and the parent's `gap-1.5` separates it from the label. On md+ it sits
          in band 2; the small label→input gap is restored by `md:mt-1.5`. */}
      <div className="flex flex-col gap-1.5 md:mt-1.5">{rest}</div>
    </div>
  );
}

// Normalises children to a flat array, dropping null/false so the
// first-child = label split is stable even when callers conditionally render.
function childrenToArray(children: ReactNode): ReactNode[] {
  const arr = Array.isArray(children) ? children : [children];
  return arr.filter((c) => c !== null && c !== undefined && c !== false);
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

// FormGrid — the ONLY place grid-cell input alignment is turned on. It lays
// out its <FormField>/<FormItem> children in `cols` columns. `auto-rows-min`
// gives each visual row two auto-sized implicit rows (band 1 = labels,
// band 2 = controls); each cell (via FormGridContext → FormItem) spans those
// two rows with `[grid-template-rows:subgrid]`, so every label aligns and every
// input shares a baseline. Below-input content (helper / <HoursReadout> /
// error) lives in band 2 with the input and grows downward — it never lifts
// the input or misaligns the row.
//
// Mobile (`< md`): columns collapse to 1 and the subgrid spanning is gated to
// `md:` inside FormItem, so cells fall back to plain top-aligned stacks.
//
// `col-span-2` (full-width) cells supplied by callers still work — they remain
// `data-form-cell` subgrid pairs occupying their own row.
//
// See docs/14-design-system.md § "Grid-form field alignment".
export type FormGridCols = 2 | 3 | 4;

const FORM_GRID_COLS: Record<FormGridCols, string> = {
  // base = 1 col on mobile (stacked), expands at md.
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-2 md:grid-cols-3',
  4: 'grid-cols-2 md:grid-cols-4',
};

export function FormGrid({
  cols = 2,
  className,
  children,
}: {
  cols?: FormGridCols;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <FormGridContext.Provider value={true}>
      <div
        className={cn(
          'grid gap-x-4 gap-y-4 md:auto-rows-min',
          FORM_GRID_COLS[cols],
          className,
        )}
      >
        {children}
      </div>
    </FormGridContext.Provider>
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
