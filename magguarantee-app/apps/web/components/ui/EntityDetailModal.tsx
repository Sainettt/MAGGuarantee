'use client';

// Phase 6 — <EntityDetailModal>. A generic, entity-agnostic, read-only entity
// detail surface (docs/14-design-system.md §6.0–§6.14). Composes the existing
// hand-rolled <Dialog> primitive (portal, focus-trap, Escape, scroll-lock).
//
// The component knows nothing about "carrier" — callers pass a title, optional
// subtitle/badges, an ordered list of sections (each an ordered list of
// label/value rows), an optional footer meta node, and an onEdit callback.
//
// Read-only values are <dd> text nodes — NOT disabled <input>s (§6.5, §6.12).
// The «Edytuj» primary action closes this modal, then invokes onEdit so the
// caller can open the edit <Sheet> — the two are never open simultaneously.

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
}

/** An ordered group of rows with a section header and an optional icon. */
export interface EntityDetailSection {
  title: ReactNode;
  /** Optional decorative Lucide icon for the section header. */
  icon?: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  rows: EntityDetailRow[];
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
  /** Primary «Edytuj» action — the modal closes itself, then calls this. */
  onEdit: () => void;
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
}: EntityDetailModalProps) {
  const t = useTranslations('entityDetail');

  // «Edytuj» — close this modal first, then hand off to the caller so the
  // edit <Sheet> opens on a clean stack (§6.0, §6.6, §6.12).
  const handleEdit = () => {
    onOpenChange(false);
    onEdit();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Override the primitive's default `max-w-md` + blanket `p-6`; this
          component owns its own 3-zone padding (§6.2). */}
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0">
        {/* ── Header (fixed) ─────────────────────────────────── */}
        <div className="shrink-0 border-b border-border px-6 pt-6 pb-4 pr-12">
          <DialogTitle className="text-[17px] font-bold leading-tight text-text">
            {title}
          </DialogTitle>
          {subtitle != null && subtitle !== '' ? (
            <DialogDescription className="mt-1 font-mono text-sm text-text-sub">
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
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-5">
            {sections.map((section, sIdx) => {
              const Icon = section.icon;
              return (
                <section
                  key={sIdx}
                  className="rounded-lg border border-border bg-card p-4"
                >
                  <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-text-sub">
                    {Icon ? (
                      <Icon
                        size={14}
                        className="text-text-sub"
                        aria-hidden="true"
                      />
                    ) : null}
                    {section.title}
                  </h3>
                  <dl className="mt-3 divide-y divide-border/60">
                    {section.rows.map((row, rIdx) => (
                      <div
                        key={rIdx}
                        className={cn(
                          'grid gap-x-4 gap-y-1 py-1.5',
                          // Two-column ≥sm; stacks below sm (§6.5, §6.7).
                          'grid-cols-1 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)]',
                        )}
                      >
                        <dt className="self-start text-xs font-medium text-text-sub sm:text-sm">
                          {row.label}
                        </dt>
                        <dd className="self-start break-words text-sm text-text">
                          {row.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              );
            })}
          </div>
        </div>

        {/* ── Footer (fixed) ─────────────────────────────────── */}
        <div className="shrink-0 border-t border-border px-6 py-4">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            {meta != null ? (
              <p className="text-xs text-text-sub">{meta}</p>
            ) : (
              <span />
            )}
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                {t('close')}
              </Button>
              <Button
                type="button"
                size="sm"
                className="min-h-[44px] gap-1.5 sm:min-h-0"
                onClick={handleEdit}
              >
                <Pencil size={14} aria-hidden="true" />
                {t('edit')}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
