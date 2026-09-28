'use client';

// Phase 6 — <EntityDetailModal>. A generic, entity-agnostic, read-only entity
// detail surface (docs/14-design-system.md §6.0–§6.14). Composes the existing
// hand-rolled <Dialog> primitive (portal, focus-trap, Escape, scroll-lock).
//
// The component knows nothing about "carrier" — callers pass a title, optional
// subtitle/badges, an ordered list of sections (each an ordered list of
// label/value rows), an optional footer meta node, and an optional onEdit
// callback.
//
// Read-only values are <dd> text nodes — NOT disabled <input>s (§6.5, §6.12).
// The «Edytuj» primary action closes this modal, then invokes onEdit so the
// caller can open the edit <Sheet> — the two are never open simultaneously.
// When `onEdit` is omitted (read-only consumer, e.g. a carrier viewing its own
// fleet), the «Edytuj» button is not rendered and the footer shows only
// «Zamknij» alongside the meta line (§6.6).

import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ComponentType, ReactNode, SVGProps } from 'react';

import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/Dialog';
import { cn } from '@/lib/utils';

/** One label/value pair inside a section. `value` is a ReactNode so the
 *  entity wrapper owns formatting (mono spans, em-dash, badges, dates). */
export interface EntityDetailRow {
  label: ReactNode;
  value: ReactNode;
  /** Full-bleed row (§6.20). When `true` the row drops the label gutter and
   *  the `value` spans the ENTIRE section width — the `<dt>` is collapsed to
   *  `sr-only` (kept for a11y, occupies no layout track). Use for embedded
   *  tables / charts / wide blocks (e.g. <BreakdownTable>) that must not be
   *  squeezed into the `1fr` value column after the 11rem label gutter.
   *  The row's `label` should be a screen-reader-only caption. */
  fullWidth?: boolean;
}

/** An ordered group of rows with a section header and an optional icon. */
export interface EntityDetailSection {
  title: ReactNode;
  /** Optional decorative Lucide icon for the section header. */
  icon?: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  rows: EntityDetailRow[];
  /** Grid span on ≥`lg`. Default `'half'` (one column of the 2-col grid);
   *  `'full'` makes the section card span both columns. Used for attachments,
   *  ≥8-row permission grids, and single-multi-line-value sections (§6.4,
   *  §6.19). */
  span?: 'half' | 'full';
}

export interface EntityDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Entity display name — rendered as the modal <DialogTitle>. */
  title: ReactNode;
  /** Optional secondary identifier line under the title (mono if a code). */
  subtitle?: ReactNode;
  /** Header badge row — status + onboarding chips. Built by the wrapper. */
  badges?: ReactNode;
  /** Ordered sections; each section an ordered list of label/value rows. */
  sections: EntityDetailSection[];
  /** Optional footer-left meta line (created / updated). */
  meta?: ReactNode;
  /** Optional primary «Edytuj» action — the modal closes itself, then calls
   *  this. When omitted, the «Edytuj» button is not rendered and the footer
   *  shows only «Zamknij» (read-only consumers, §6.6). */
  onEdit?: () => void;
  /** Optional override merged onto the `<DialogContent>` — used by consumers
   *  to override the geometry (e.g. `max-w-2xl` for the single-column
   *  delegation route view, §6.4.1). Width is set via className per §6.2;
   *  `tailwind-merge` lets a later `max-w-*` win over the default `max-w-5xl`.
   *  This is geometry only — NOT a token change. */
  className?: string;
  /** Optional extra footer action(s) — rendered right of «Zamknij», left of
   *  «Edytuj» (docs/14 §17.6.3: «Przekaż ciągnik» for the vehicle's current
   *  planista). Additive: consumers that omit it render exactly as before.
   *  The node owns its own `<Button>`(s); keep them `size="sm"` + the
   *  mobile `min-h-[44px] sm:min-h-0` touch floor. */
  extraActions?: ReactNode;
}

export function EntityDetailModal({
  open,
  onOpenChange,
  title,
  subtitle,
  badges,
  sections,
  meta,
  onEdit,
  className,
  extraActions,
}: EntityDetailModalProps) {
  const t = useTranslations('entityDetail');

  // «Edytuj» — close this modal first, then hand off to the caller so the
  // edit <Sheet> opens on a clean stack (§6.0, §6.6, §6.12). Only wired when
  // the consumer supplies `onEdit`; read-only consumers omit it entirely.
  const handleEdit = () => {
    onOpenChange(false);
    onEdit?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Override the primitive's default `max-w-md` + blanket `p-6`; this
          component owns its own 3-zone padding (§6.2). A consumer-supplied
          `className` (e.g. `max-w-2xl`) is merged last so it can override the
          default geometry via tailwind-merge (§6.4.1). */}
      <DialogContent
        className={cn('max-w-5xl max-h-[85vh] flex flex-col p-0', className)}
      >
        {/* ── Header (fixed) ─────────────────────────────────── */}
        <div className="shrink-0 border-b border-border px-6 pt-6 pb-4 pr-12 lg:px-8 lg:pt-7">
          <DialogTitle className="text-[17px] font-bold leading-tight text-text">
            {title}
          </DialogTitle>
          {subtitle != null && subtitle !== '' ? (
            <DialogDescription className="mt-1 text-sm text-text-sub">
              {subtitle}
            </DialogDescription>
          ) : (
            // <DialogContent> wires aria-describedby unconditionally; render a
            // hidden description so the id always resolves to a node.
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
          {badges != null ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {badges}
            </div>
          ) : null}
        </div>

        {/* ── Body (scrollable) ──────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 lg:px-8 lg:py-6">
          {/* Sections in a responsive grid: single column < lg, two columns
              on lg+. Sections with `span: 'full'` occupy both columns on lg+
              (§6.4, §6.19). */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {sections.map((section, sIdx) => {
              const Icon = section.icon;
              const isFull = section.span === 'full';
              return (
                <section
                  key={sIdx}
                  className={cn(
                    'rounded-xl border border-border/60 bg-card p-5',
                    isFull && 'lg:col-span-2',
                  )}
                >
                  <h3 className="flex items-center gap-2 pb-3 mb-3 border-b border-border/60 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-sub">
                    {Icon ? (
                      <Icon
                        size={15}
                        className="text-text-sub"
                        aria-hidden="true"
                      />
                    ) : null}
                    {section.title}
                  </h3>
                  <dl className="divide-y divide-border/60">
                    {section.rows.map((row, rIdx) =>
                      row.fullWidth ? (
                        // Full-bleed row (§6.20): no label gutter — the value
                        // spans 100% of the section width. The <dt> stays in
                        // the DOM for a11y but is `sr-only` (no layout track),
                        // so embedded tables/charts get the full modal width.
                        <div key={rIdx} className="py-2">
                          <dt className="sr-only">{row.label}</dt>
                          <dd className="break-words text-sm text-text">
                            {row.value}
                          </dd>
                        </div>
                      ) : (
                        <div
                          key={rIdx}
                          className={cn(
                            'grid gap-x-4 gap-y-1 py-2',
                            // Two-column ≥sm; stacks below sm (§6.5, §6.7).
                            // Widen label column on lg+ since the modal itself
                            // is wider (§6.5, §6.19).
                            'grid-cols-1 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)] lg:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]',
                          )}
                        >
                          <dt className="self-start text-xs font-medium text-text-sub sm:text-sm">
                            {row.label}
                          </dt>
                          <dd className="self-start break-words text-sm text-text">
                            {row.value}
                          </dd>
                        </div>
                      ),
                    )}
                  </dl>
                </section>
              );
            })}
          </div>
        </div>

        {/* ── Footer (fixed) ─────────────────────────────────── */}
        <div className="shrink-0 border-t border-border px-6 py-4 lg:px-8">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            {meta != null ? (
              <p className="text-xs text-text-sub">{meta}</p>
            ) : (
              <span />
            )}
            <div className="flex items-center justify-end gap-2">
              {/* «Zamknij» — always present. When it is the sole footer
                  button (read-only consumer, no «Edytuj»), it keeps the
                  ≥44px touch-target floor on mobile (§6.6). */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(onEdit == null && 'min-h-[44px] sm:min-h-0')}
                onClick={() => onOpenChange(false)}
              >
                {t('close')}
              </Button>
              {extraActions}
              {onEdit != null ? (
                <Button
                  type="button"
                  size="sm"
                  className="min-h-[44px] gap-1.5 sm:min-h-0"
                  onClick={handleEdit}
                >
                  <Pencil size={14} aria-hidden="true" />
                  {t('edit')}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
